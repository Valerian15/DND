import type { Server, Socket } from 'socket.io';
import { verifyToken, type AuthUser } from './auth/index.js';
import { db } from './db/index.js';
import { broadcastFiltered } from './io.js';
import { canUserSeeToken, hydrateToken, type TokenRow } from './routes/tokens.js';

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

interface ServerToClientEvents {
  'session:state': (state: { online: OnlineUser[]; active_map: MapRow | null }) => void;
  'session:presence': (data: { online: OnlineUser[] }) => void;
  'map:switched': (map: MapRow | null) => void;
  'token:created': (token: unknown) => void;
  'token:moved': (data: { token_id: number; col: number; row: number }) => void;
  'token:deleted': (data: { token_id: number }) => void;
  'token:hp_updated': (data: { token_id: number; hp_current: number }) => void;
}

interface ClientToServerEvents {
  'session:join': (data: { campaign_id: number }) => void;
  'token:move': (data: { token_id: number; col: number; row: number }) => void;
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

      socket.emit('session:state', {
        online: onlineList(campaign_id),
        active_map: getActiveMap(campaign_id),
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

      // Permission: DM/admin, PC owner, or user in controlled_by
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

      db.prepare('UPDATE tokens SET col = ?, row = ? WHERE id = ?').run(col, row, token_id);

      broadcastFiltered(
        campaign_id,
        'token:moved',
        { token_id, col, row },
        (uid, role) => role === 'admin' || canUserSeeToken(uid, { ...token, col, row }, dmId),
      );
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
