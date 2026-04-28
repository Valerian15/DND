import type { Server, Socket } from 'socket.io';
import { verifyToken, type AuthUser } from './auth/index.js';
import { db } from './db/index.js';
import { broadcastFiltered } from './io.js';
import { canUserSeeToken, hydrateToken, broadcastFogTokenChanges, type TokenRow } from './routes/tokens.js';
import { computeAndSaveFog, getVisibleSet } from './vision.js';

interface OnlineUser {
  user_id: number;
  username: string;
  role: string;
}

interface MapRow {
  id: number;
  campaign_id: number;
  name: string;
  image_url: string;
  grid_size: number;
  grid_offset_x: number;
  grid_offset_y: number;
  created_at: number;
}

interface ChatMessageRow {
  id: number;
  campaign_id: number;
  user_id: number;
  username: string;
  body: string;
  type: string;
  data: string | null;
  created_at: number;
}

interface ChatMessageOut {
  id: number;
  campaign_id: number;
  user_id: number;
  username: string;
  body: string;
  type: 'chat' | 'roll';
  data?: { expression: string; dice: number[]; modifier: number; total: number; label?: string; rollMode?: 'advantage' | 'disadvantage' };
  created_at: number;
}

interface InitiativeEntryRow {
  id: number;
  campaign_id: number;
  token_id: number | null;
  label: string;
  initiative: number;
  dex_score: number;
  created_at: number;
}

interface WallRow { id: number; map_id: number; x1: number; y1: number; x2: number; y2: number; created_at: number }

interface ServerToClientEvents {
  'session:state': (state: {
    online: OnlineUser[];
    active_map: MapRow | null;
    chat_history: ChatMessageOut[];
    initiative: InitiativeEntryRow[];
    walls: WallRow[];
    fog_visible: [number, number][];
    fog_explored: [number, number][];
  }) => void;
  'session:presence': (data: { online: OnlineUser[] }) => void;
  'map:switched': (map: MapRow | null) => void;
  'token:created': (token: unknown) => void;
  'token:moved': (data: { token_id: number; col: number; row: number }) => void;
  'token:deleted': (data: { token_id: number }) => void;
  'token:hp_updated': (data: { token_id: number; hp_current: number }) => void;
  'token:conditions_updated': (data: { token_id: number; conditions: string[] }) => void;
  'chat:message': (msg: ChatMessageOut) => void;
  'initiative:updated': (entries: InitiativeEntryRow[]) => void;
}

interface ClientToServerEvents {
  'session:join': (data: { campaign_id: number }) => void;
  'token:move': (data: { token_id: number; col: number; row: number }) => void;
  'chat:send': (data: { body: string; label?: string }) => void;
  'initiative:roll': () => void;
  'initiative:set': (data: { id: number; initiative: number }) => void;
  'initiative:remove': (data: { id: number }) => void;
  'initiative:add': (data: { label: string; initiative: number }) => void;
  'initiative:clear': () => void;
}

interface SocketData {
  user: AuthUser;
  campaign_id?: number;
}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const presence = new Map<number, Map<string, OnlineUser>>();

function onlineList(campaignId: number): OnlineUser[] {
  const room = presence.get(campaignId);
  if (!room) return [];
  return [...new Map([...room.values()].map((u) => [u.user_id, u])).values()];
}

function getActiveMap(campaignId: number): MapRow | null {
  return db.prepare(`
    SELECT m.* FROM maps m
    JOIN campaigns c ON c.active_map_id = m.id
    WHERE c.id = ?
  `).get(campaignId) as MapRow | undefined ?? null;
}

function getCampaignDm(campaignId: number): number | null {
  const row = db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(campaignId) as { dm_id: number } | undefined;
  return row?.dm_id ?? null;
}

function hydrateMessage(row: ChatMessageRow): ChatMessageOut {
  return {
    ...row,
    type: row.type as 'chat' | 'roll',
    data: row.data ? JSON.parse(row.data) : undefined,
  };
}

function getRecentMessages(campaignId: number): ChatMessageOut[] {
  const rows = db.prepare(
    'SELECT * FROM chat_messages WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 100'
  ).all(campaignId) as ChatMessageRow[];
  return rows.reverse().map(hydrateMessage);
}

function getInitiative(campaignId: number): InitiativeEntryRow[] {
  return db.prepare(
    'SELECT * FROM initiative_entries WHERE campaign_id = ? ORDER BY initiative DESC, dex_score DESC, id ASC'
  ).all(campaignId) as InitiativeEntryRow[];
}

function rollDice(expression: string): { dice: number[]; modifier: number; total: number; rollMode?: 'advantage' | 'disadvantage' } | null {
  const match = expression.match(/^(\d+)d(\d+)(adv|dis)?([+-]\d+)?$/i);
  if (!match) return null;
  const count = Math.min(Math.max(1, parseInt(match[1])), 20);
  const sides = Math.min(Math.max(2, parseInt(match[2])), 1000);
  const mode = match[3]?.toLowerCase() as 'adv' | 'dis' | undefined;
  const modifier = match[4] ? parseInt(match[4]) : 0;

  let dice: number[];
  let rollMode: 'advantage' | 'disadvantage' | undefined;

  if (mode && count === 1 && sides === 20) {
    // Roll 2d20, pick high (advantage) or low (disadvantage)
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    rollMode = mode === 'adv' ? 'advantage' : 'disadvantage';
    const chosen = rollMode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
    dice = [a, b, chosen]; // [roll1, roll2, chosen] — client displays both, uses chosen for total
  } else {
    dice = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  }

  const used = mode && count === 1 && sides === 20 ? dice[2] : dice.reduce((a, b) => a + b, 0);
  const total = used + modifier;
  return { dice, modifier, total, ...(rollMode ? { rollMode } : {}) };
}

function isDmOrAdmin(user: AuthUser, campaignId: number): boolean {
  const dmId = getCampaignDm(campaignId);
  return user.role === 'admin' || user.id === dmId;
}

export function setupSession(io: AppServer) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing token'));
    const user = verifyToken(token);
    if (!user) return next(new Error('Invalid token'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket: AppSocket) => {
    const user = socket.data.user;

    socket.on('session:join', ({ campaign_id }) => {
      const room = `campaign:${campaign_id}`;
      socket.join(room);
      socket.data.campaign_id = campaign_id;

      if (!presence.has(campaign_id)) presence.set(campaign_id, new Map());
      presence.get(campaign_id)!.set(socket.id, {
        user_id: user.id,
        username: user.username,
        role: user.role,
      });

      const activeMapNow = getActiveMap(campaign_id);
      const walls = activeMapNow
        ? db.prepare('SELECT * FROM map_walls WHERE map_id = ? ORDER BY id ASC').all(activeMapNow.id) as WallRow[]
        : [];
      const fog = activeMapNow ? computeAndSaveFog(activeMapNow.id) : { visible: [], explored: [] };

      socket.emit('session:state', {
        online: onlineList(campaign_id),
        active_map: activeMapNow,
        chat_history: getRecentMessages(campaign_id),
        initiative: getInitiative(campaign_id),
        walls,
        fog_visible: fog.visible,
        fog_explored: fog.explored,
      });

      io.to(room).emit('session:presence', { online: onlineList(campaign_id) });
    });

    socket.on('token:move', ({ token_id, col, row }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;

      const token = db.prepare('SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.id = ?')
        .get(token_id) as TokenRow | undefined;
      if (!token) return;

      const dmId = getCampaignDm(campaign_id);
      if (dmId === null) return;

      const isDm = user.role === 'admin' || user.id === dmId;
      let canMove = isDm;
      if (!canMove && token.token_type === 'pc' && token.character_id !== null) {
        const char = db.prepare('SELECT owner_id FROM characters WHERE id = ?')
          .get(token.character_id) as { owner_id: number } | undefined;
        canMove = char?.owner_id === user.id;
      }
      if (!canMove) {
        const controlled = JSON.parse(token.controlled_by) as number[];
        canMove = controlled.includes(user.id);
      }
      if (!canMove) return;

      const mapId = token.map_id;

      if (token.token_type === 'pc') {
        db.prepare('UPDATE tokens SET col = ?, row = ? WHERE id = ?').run(col, row, token_id);

        // PC move: always broadcast move, then recompute fog and send appear/disappear for NPCs
        broadcastFiltered(
          campaign_id,
          'token:moved',
          { token_id, col, row },
          (uid, role) => role === 'admin' || uid === dmId || canUserSeeToken(uid, { ...token, col, row }, dmId),
        );

        const oldVisible = getVisibleSet(mapId);
        const fog = computeAndSaveFog(mapId);
        const newVisible = getVisibleSet(mapId);
        broadcastFiltered(campaign_id, 'fog:update', fog, () => true);
        broadcastFogTokenChanges(campaign_id, mapId, oldVisible, newVisible, dmId);

      } else {
        // NPC move: send appropriate events based on old vs new visibility
        const oldKey = `${token.col},${token.row}`;
        const newKey = `${col},${row}`;
        const vis = getVisibleSet(mapId);
        const wasVisible = vis.has(oldKey);
        const isVisible = vis.has(newKey);

        db.prepare('UPDATE tokens SET col = ?, row = ? WHERE id = ?').run(col, row, token_id);
        const movedToken = { ...token, col, row };

        const playerFilter = (uid: number, role: string) => role !== 'admin' && uid !== dmId;

        if (wasVisible && isVisible) {
          // Stayed visible: send move to everyone
          broadcastFiltered(campaign_id, 'token:moved', { token_id, col, row }, () => true);
        } else if (!wasVisible && isVisible) {
          // Entered visibility: players now see it for the first time
          broadcastFiltered(campaign_id, 'token:moved', { token_id, col, row }, (uid, role) => role === 'admin' || uid === dmId);
          broadcastFiltered(campaign_id, 'token:created', hydrateToken(movedToken), playerFilter);
        } else if (wasVisible && !isVisible) {
          // Left visibility: players lose sight of it
          broadcastFiltered(campaign_id, 'token:deleted', { token_id }, playerFilter);
          broadcastFiltered(campaign_id, 'token:moved', { token_id, col, row }, (uid, role) => role === 'admin' || uid === dmId);
        } else {
          // Neither old nor new cell visible: DM only
          broadcastFiltered(campaign_id, 'token:moved', { token_id, col, row }, (uid, role) => role === 'admin' || uid === dmId);
        }
      }
    });

    socket.on('chat:send', ({ body, label }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null || !body) return;
      const text = String(body).trim().slice(0, 1000);
      if (!text) return;

      let type = 'chat';
      let data: string | null = null;

      const rollMatch = text.match(/^\/roll\s+(\d+d\d+(?:adv|dis)?([+-]\d+)?)$/i);
      if (rollMatch) {
        const expression = rollMatch[1];
        const result = rollDice(expression);
        if (result) {
          type = 'roll';
          const safeLabel = label ? String(label).trim().slice(0, 100) : undefined;
          data = JSON.stringify({ expression, ...result, ...(safeLabel ? { label: safeLabel } : {}) });
        }
      }

      const res = db.prepare(
        'INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(campaign_id, user.id, user.username, text, type, data);

      const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(res.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${campaign_id}`).emit('chat:message', hydrateMessage(row));
    });

    socket.on('initiative:roll', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      const activeMap = getActiveMap(campaign_id);
      if (!activeMap) return;

      const mapTokens = db.prepare(`
        SELECT t.id, t.label, t.character_id, c.abilities
        FROM tokens t
        LEFT JOIN characters c ON c.id = t.character_id
        WHERE t.map_id = ?
      `).all(activeMap.id) as { id: number; label: string; character_id: number | null; abilities: string | null }[];

      db.prepare('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaign_id);

      const insertStmt = db.prepare(
        'INSERT INTO initiative_entries (campaign_id, token_id, label, initiative, dex_score) VALUES (?, ?, ?, ?, ?)'
      );

      for (const token of mapTokens) {
        let dexScore = 10;
        if (token.abilities) {
          try {
            const abilities = JSON.parse(token.abilities) as { dex?: number };
            dexScore = abilities.dex ?? 10;
          } catch { /* ignore bad JSON */ }
        }
        const dexMod = Math.floor((dexScore - 10) / 2);
        const roll = Math.floor(Math.random() * 20) + 1;
        insertStmt.run(campaign_id, token.id, token.label, roll + dexMod, dexScore);
      }

      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiative(campaign_id));
    });

    socket.on('initiative:set', ({ id, initiative }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;
      if (!Number.isInteger(initiative)) return;

      db.prepare('UPDATE initiative_entries SET initiative = ? WHERE id = ? AND campaign_id = ?')
        .run(initiative, id, campaign_id);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiative(campaign_id));
    });

    socket.on('initiative:remove', ({ id }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      db.prepare('DELETE FROM initiative_entries WHERE id = ? AND campaign_id = ?').run(id, campaign_id);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiative(campaign_id));
    });

    socket.on('initiative:add', ({ label, initiative }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;
      if (!label || !Number.isInteger(initiative)) return;

      db.prepare(
        'INSERT INTO initiative_entries (campaign_id, token_id, label, initiative, dex_score) VALUES (?, NULL, ?, ?, 10)'
      ).run(campaign_id, String(label).trim().slice(0, 100), initiative);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiative(campaign_id));
    });

    socket.on('initiative:clear', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      db.prepare('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaign_id);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', []);
    });

    socket.on('disconnect', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;

      const room = presence.get(campaign_id);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) presence.delete(campaign_id);
      }

      io.to(`campaign:${campaign_id}`).emit('session:presence', {
        online: onlineList(campaign_id),
      });
    });
  });
}
