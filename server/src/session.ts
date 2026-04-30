import type { Server, Socket } from 'socket.io';
import { verifyToken, type AuthUser } from './auth/index.js';
import { db } from './db/index.js';
import { broadcastFiltered } from './io.js';
import { canUserSeeToken, hydrateToken, broadcastFogTokenChanges, VALID_CONDITIONS, type TokenRow } from './routes/tokens.js';
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
  type: 'chat' | 'roll' | 'action';
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

interface InitiativeStateOut {
  entries: InitiativeEntryRow[];
  current_id: number | null;
  round: number;
}

interface ServerToClientEvents {
  'session:state': (state: {
    online: OnlineUser[];
    active_map: MapRow | null;
    chat_history: ChatMessageOut[];
    initiative: InitiativeStateOut;
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
  'token:effects_updated': (data: { token_id: number; effects: { name: string; rounds: number; indefinite?: boolean }[] }) => void;
  'chat:message': (msg: ChatMessageOut) => void;
  'initiative:updated': (state: InitiativeStateOut) => void;
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
  'initiative:next_turn': () => void;
  'initiative:end_combat': () => void;
  'token:effect_apply': (data: { token_id: number; name: string; rounds: number; indefinite?: boolean }) => void;
  'token:effect_remove': (data: { token_id: number; name: string }) => void;
  'token:effect_adjust': (data: { token_id: number; name: string; delta: number }) => void;
  'token:conditions_set': (data: { token_id: number; conditions: string[] }) => void;
  'group:roll': (data: { kind: 'skill' | 'save' | 'ability'; key: string }) => void;
  'combat:resolve_spell': (data: {
    caster_token_id: number;
    target_token_ids: number[];
    spell_name: string;
    save_ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    save_dc: number;
    damage_dice: string;
    damage_type: string;
    half_on_save: boolean;
    /** Conditions to apply to targets that fail their save. */
    conditions_on_fail?: string[];
  }) => void;
  /**
   * Attack-vs-AC resolver — used for spell attacks (Fire Bolt etc.) AND weapon attacks.
   * For each target: roll d20+attack_bonus vs AC. On hit: roll damage_dice. On nat 20: double the dice.
   * If roll_mode is 'advantage' / 'disadvantage', the d20 roll is 2d20 pick high / low.
   */
  'combat:resolve_attack': (data: {
    caster_token_id: number;
    target_token_ids: number[];
    attack_name: string;
    attack_bonus: number;
    damage_dice: string;
    damage_type: string;
    /** True for spell attacks (just affects chat label). */
    is_spell?: boolean;
    roll_mode?: 'advantage' | 'normal' | 'disadvantage';
  }) => void;
  /**
   * Auto-hit damage resolver (Magic Missile and similar).
   * `hit_count` instances of `damage_dice` are distributed round-robin across the targets.
   * No attack roll, no save — every hit lands.
   */
  'combat:resolve_auto_hit': (data: {
    caster_token_id: number;
    target_token_ids: number[];
    attack_name: string;
    hit_count: number;
    damage_dice: string;
    damage_type: string;
  }) => void;
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
    type: row.type as 'chat' | 'roll' | 'action',
    data: row.data ? JSON.parse(row.data) : undefined,
  };
}

function getRecentMessages(campaignId: number): ChatMessageOut[] {
  const rows = db.prepare(
    'SELECT * FROM chat_messages WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 100'
  ).all(campaignId) as ChatMessageRow[];
  return rows.reverse().map(hydrateMessage);
}

function getInitiativeEntries(campaignId: number): InitiativeEntryRow[] {
  return db.prepare(
    'SELECT * FROM initiative_entries WHERE campaign_id = ? ORDER BY initiative DESC, dex_score DESC, id ASC'
  ).all(campaignId) as InitiativeEntryRow[];
}

function getInitiativeState(campaignId: number): InitiativeStateOut {
  const entries = getInitiativeEntries(campaignId);
  const turn = db.prepare('SELECT initiative_current_id, initiative_round FROM campaigns WHERE id = ?')
    .get(campaignId) as { initiative_current_id: number | null; initiative_round: number } | undefined;
  return {
    entries,
    current_id: turn?.initiative_current_id ?? null,
    round: turn?.initiative_round ?? 0,
  };
}

function setInitiativeTurn(campaignId: number, currentId: number | null, round: number) {
  db.prepare('UPDATE campaigns SET initiative_current_id = ?, initiative_round = ? WHERE id = ?')
    .run(currentId, round, campaignId);
}

function getNpcDex(token: { character_id: number | null; campaign_npc_id?: number | null; monster_slug?: string | null; abilities?: string | null }): number {
  // PC: from characters.abilities (JSON)
  if (token.character_id !== null && token.abilities) {
    try {
      const a = JSON.parse(token.abilities) as { dex?: number };
      return a.dex ?? 10;
    } catch { /* fall through */ }
  }
  // Library monster: from monsters.data JSON via monster_slug
  if (token.monster_slug) {
    const mrow = db.prepare('SELECT data FROM monsters WHERE slug = ?').get(token.monster_slug) as { data: string } | undefined;
    if (mrow?.data) {
      try {
        const d = JSON.parse(mrow.data) as { dexterity?: number };
        return d.dexterity ?? 10;
      } catch { /* fall through */ }
    }
  }
  // Campaign NPC: from campaign_npcs.abilities (JSON)
  if (token.campaign_npc_id) {
    const nrow = db.prepare('SELECT abilities FROM campaign_npcs WHERE id = ?').get(token.campaign_npc_id) as { abilities: string } | undefined;
    if (nrow?.abilities) {
      try {
        const a = JSON.parse(nrow.abilities) as { dex?: number };
        return a.dex ?? 10;
      } catch { /* fall through */ }
    }
  }
  return 10;
}

/**
 * Roll a damage expression like "8d6", "1d8+3", "2d4+5".
 * Returns the individual dice rolls, the flat modifier, and the total.
 */
function rollDiceExpression(expr: string): { rolls: number[]; modifier: number; total: number } {
  const match = expr.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return { rolls: [], modifier: 0, total: 0 };
  const count = Math.min(50, Math.max(0, parseInt(match[1], 10)));
  const sides = Math.max(1, parseInt(match[2], 10));
  const mod = match[3] ? parseInt(match[3], 10) : 0;
  const rolls: number[] = [];
  let total = mod;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }
  return { rolls, modifier: mod, total };
}

const ABILITY_FULL_NAME: Record<string, string> = {
  str: 'strength', dex: 'dexterity', con: 'constitution',
  int: 'intelligence', wis: 'wisdom', cha: 'charisma',
};

/**
 * Compute the saving-throw modifier for any token (PC / library monster / campaign NPC).
 * Falls back to 0 if data is missing.
 */
function computeSaveModForToken(
  token: { character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null },
  ability: string,
): number {
  // PC
  if (token.character_id) {
    const c = db.prepare('SELECT level, abilities, saves FROM characters WHERE id = ?').get(token.character_id) as { level: number; abilities: string; saves: string } | undefined;
    if (!c) return 0;
    try {
      const abil = JSON.parse(c.abilities) as Record<string, number>;
      const saves = JSON.parse(c.saves) as Record<string, { proficient?: boolean }>;
      const score = abil[ability] ?? 10;
      const mod = Math.floor((score - 10) / 2);
      const profBonus = Math.floor((c.level - 1) / 4) + 2;
      return mod + (saves[ability]?.proficient ? profBonus : 0);
    } catch { return 0; }
  }
  // Library monster: data has explicit `<ability>_save` field (or null) and ability scores
  if (token.monster_slug) {
    const m = db.prepare('SELECT data FROM monsters WHERE slug = ?').get(token.monster_slug) as { data: string } | undefined;
    if (!m) return 0;
    try {
      const d = JSON.parse(m.data) as Record<string, unknown>;
      const fullKey = ABILITY_FULL_NAME[ability];
      const sb = d[`${fullKey}_save`];
      if (typeof sb === 'number') return sb;
      const score = typeof d[fullKey] === 'number' ? d[fullKey] as number : 10;
      return Math.floor((score - 10) / 2);
    } catch { return 0; }
  }
  // Campaign NPC: abilities + saving_throws array
  if (token.campaign_npc_id) {
    const n = db.prepare('SELECT abilities, saving_throws FROM campaign_npcs WHERE id = ?').get(token.campaign_npc_id) as { abilities: string; saving_throws: string } | undefined;
    if (!n) return 0;
    try {
      const abil = JSON.parse(n.abilities) as Record<string, number>;
      const profSaves = JSON.parse(n.saving_throws) as string[];
      const score = abil[ability] ?? 10;
      const mod = Math.floor((score - 10) / 2);
      // NPC prof bonus is hardcoded +2 (matches NpcSheet display).
      return mod + (profSaves.includes(ability) ? 2 : 0);
    } catch { return 0; }
  }
  return 0;
}

/**
 * Returns the damage modifier for a given damage type against a token:
 *   2 = vulnerable (double), 1 = normal, 0.5 = resistant (half), 0 = immune.
 * Library monsters use substring matching on their existing damage_resistances/vulnerabilities/immunities
 * text fields. PCs and campaign NPCs use explicit JSON arrays of damage type names.
 */
function damageModifierForToken(
  token: { character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null },
  damageType: string,
): { multiplier: 0 | 0.5 | 1 | 2; label: '' | 'resisted' | 'vulnerable' | 'immune' } {
  const dt = (damageType || '').toLowerCase().trim();
  if (!dt) return { multiplier: 1, label: '' };

  let resistances: string[] = [];
  let vulnerabilities: string[] = [];
  let immunities: string[] = [];

  if (token.character_id) {
    const c = db.prepare('SELECT resistances, vulnerabilities, immunities FROM characters WHERE id = ?').get(token.character_id) as { resistances: string; vulnerabilities: string; immunities: string } | undefined;
    if (c) {
      try { resistances = JSON.parse(c.resistances || '[]'); } catch { /* default */ }
      try { vulnerabilities = JSON.parse(c.vulnerabilities || '[]'); } catch { /* default */ }
      try { immunities = JSON.parse(c.immunities || '[]'); } catch { /* default */ }
    }
  } else if (token.monster_slug) {
    const m = db.prepare('SELECT data FROM monsters WHERE slug = ?').get(token.monster_slug) as { data: string } | undefined;
    if (m) {
      try {
        const d = JSON.parse(m.data) as { damage_resistances?: string; damage_vulnerabilities?: string; damage_immunities?: string };
        // Open5e fields are comma/semicolon-separated text. Split + lowercase + trim. Substring qualifiers
        // ("nonmagical attacks") aren't honored — caller takes the loose match.
        const parse = (s: string | undefined) => (s ?? '').toLowerCase().split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        resistances = parse(d.damage_resistances);
        vulnerabilities = parse(d.damage_vulnerabilities);
        immunities = parse(d.damage_immunities);
      } catch { /* default */ }
    }
  } else if (token.campaign_npc_id) {
    const n = db.prepare('SELECT resistances, vulnerabilities, immunities FROM campaign_npcs WHERE id = ?').get(token.campaign_npc_id) as { resistances: string; vulnerabilities: string; immunities: string } | undefined;
    if (n) {
      try { resistances = JSON.parse(n.resistances || '[]'); } catch { /* default */ }
      try { vulnerabilities = JSON.parse(n.vulnerabilities || '[]'); } catch { /* default */ }
      try { immunities = JSON.parse(n.immunities || '[]'); } catch { /* default */ }
    }
  }

  // Substring match — covers "fire" inside "fire damage from nonmagical sources" etc.
  const has = (arr: string[]) => arr.some((entry) => entry.includes(dt));
  if (has(immunities)) return { multiplier: 0, label: 'immune' };
  if (has(resistances)) return { multiplier: 0.5, label: 'resisted' };
  if (has(vulnerabilities)) return { multiplier: 2, label: 'vulnerable' };
  return { multiplier: 1, label: '' };
}

/** Read the AC of any token (PC / library monster / campaign NPC). Defaults to 10 if missing. */
function computeAcForToken(token: { character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null }): number {
  if (token.character_id) {
    const c = db.prepare('SELECT ac FROM characters WHERE id = ?').get(token.character_id) as { ac: number } | undefined;
    return c?.ac ?? 10;
  }
  if (token.monster_slug) {
    const m = db.prepare('SELECT data FROM monsters WHERE slug = ?').get(token.monster_slug) as { data: string } | undefined;
    if (!m) return 10;
    try {
      const d = JSON.parse(m.data) as { armor_class?: number };
      return typeof d.armor_class === 'number' ? d.armor_class : 10;
    } catch { return 10; }
  }
  if (token.campaign_npc_id) {
    const n = db.prepare('SELECT ac FROM campaign_npcs WHERE id = ?').get(token.campaign_npc_id) as { ac: number } | undefined;
    return n?.ac ?? 10;
  }
  return 10;
}

/**
 * Roll damage as a crit: doubles the dice count, modifier unchanged.
 * Example: "1d10+3" on crit → 2d10+3.
 */
function rollCritDamage(expr: string): { rolls: number[]; modifier: number; total: number } {
  const match = expr.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return { rolls: [], modifier: 0, total: 0 };
  const baseCount = parseInt(match[1], 10);
  const sides = Math.max(1, parseInt(match[2], 10));
  const mod = match[3] ? parseInt(match[3], 10) : 0;
  const count = Math.min(50, Math.max(0, baseCount * 2));
  const rolls: number[] = [];
  let total = mod;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }
  return { rolls, modifier: mod, total };
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
        initiative: getInitiativeState(campaign_id),
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

      if (text.startsWith('/action ')) {
        type = 'action';
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
        SELECT t.id, t.label, t.character_id, t.campaign_npc_id, t.monster_slug, c.abilities
        FROM tokens t
        LEFT JOIN characters c ON c.id = t.character_id
        WHERE t.map_id = ?
      `).all(activeMap.id) as { id: number; label: string; character_id: number | null; campaign_npc_id: number | null; monster_slug: string | null; abilities: string | null }[];

      db.prepare('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaign_id);

      const insertStmt = db.prepare(
        'INSERT INTO initiative_entries (campaign_id, token_id, label, initiative, dex_score) VALUES (?, ?, ?, ?, ?)'
      );

      for (const token of mapTokens) {
        const dexScore = getNpcDex(token);
        const dexMod = Math.floor((dexScore - 10) / 2);
        const roll = Math.floor(Math.random() * 20) + 1;
        insertStmt.run(campaign_id, token.id, token.label, roll + dexMod, dexScore);
      }

      // Set round 1 and highlight first entry
      const firstEntry = getInitiativeEntries(campaign_id)[0];
      setInitiativeTurn(campaign_id, firstEntry?.id ?? null, firstEntry ? 1 : 0);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:set', ({ id, initiative }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;
      if (!Number.isInteger(initiative)) return;

      db.prepare('UPDATE initiative_entries SET initiative = ? WHERE id = ? AND campaign_id = ?')
        .run(initiative, id, campaign_id);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:remove', ({ id }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      // If we remove the current turn entry, advance the turn first
      const state = getInitiativeState(campaign_id);
      if (state.current_id === id && state.entries.length > 1) {
        const idx = state.entries.findIndex((e) => e.id === id);
        const next = state.entries[(idx + 1) % state.entries.length];
        setInitiativeTurn(campaign_id, next.id, state.round);
      } else if (state.current_id === id) {
        setInitiativeTurn(campaign_id, null, 0);
      }
      db.prepare('DELETE FROM initiative_entries WHERE id = ? AND campaign_id = ?').run(id, campaign_id);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:add', ({ label, initiative }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;
      if (!label || !Number.isInteger(initiative)) return;

      db.prepare(
        'INSERT INTO initiative_entries (campaign_id, token_id, label, initiative, dex_score) VALUES (?, NULL, ?, ?, 10)'
      ).run(campaign_id, String(label).trim().slice(0, 100), initiative);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:clear', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      db.prepare('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaign_id);
      setInitiativeTurn(campaign_id, null, 0);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:next_turn', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      const state = getInitiativeState(campaign_id);
      if (state.entries.length === 0) return;

      const idx = state.current_id !== null ? state.entries.findIndex((e) => e.id === state.current_id) : -1;
      const nextIdx = (idx + 1) % state.entries.length;
      const nextRound = idx === -1 || nextIdx === 0 ? Math.max(1, state.round) + (nextIdx === 0 && idx !== -1 ? 1 : 0) : state.round;
      const roundIncremented = (nextRound > state.round) && state.round > 0;
      setInitiativeTurn(campaign_id, state.entries[nextIdx].id, nextRound || 1);

      // Decrement effect timers on every token in this campaign whose round just advanced
      if (roundIncremented) {
        const tokenRows = db.prepare(
          'SELECT t.id, t.effects FROM tokens t JOIN maps m ON m.id = t.map_id WHERE m.campaign_id = ?'
        ).all(campaign_id) as { id: number; effects: string }[];
        const updateStmt = db.prepare('UPDATE tokens SET effects = ? WHERE id = ?');
        for (const tok of tokenRows) {
          let arr: { name: string; rounds: number; indefinite?: boolean }[];
          try { arr = JSON.parse(tok.effects ?? '[]'); }
          catch { continue; }
          if (!Array.isArray(arr) || arr.length === 0) continue;
          // Indefinite effects are unchanged; timed ones decrement and drop at 0.
          const next = arr
            .map((e) => e.indefinite ? e : { ...e, rounds: e.rounds - 1 })
            .filter((e) => e.indefinite || e.rounds > 0);
          if (next.length !== arr.length || next.some((e, i) => e.rounds !== arr[i].rounds)) {
            updateStmt.run(JSON.stringify(next), tok.id);
            io.to(`campaign:${campaign_id}`).emit('token:effects_updated', { token_id: tok.id, effects: next });
          }
        }
      }

      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:end_combat', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      setInitiativeTurn(campaign_id, null, 0);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    function tokenIsInCampaign(tokenId: number, cid: number): boolean {
      const row = db.prepare(
        'SELECT 1 FROM tokens t JOIN maps m ON m.id = t.map_id WHERE t.id = ? AND m.campaign_id = ?'
      ).get(tokenId, cid);
      return !!row;
    }

    /**
     * 5e concentration save triggered when a concentrating creature takes damage.
     * DC = max(10, floor(damage/2)); on fail, remove the `concentration` condition.
     * No-op if the token isn't concentrating or damage is zero.
     */
    function triggerConcentrationSave(cid: number, tokenId: number, damage: number) {
      if (damage <= 0) return;
      const token = db.prepare('SELECT id, label, conditions, character_id, monster_slug, campaign_npc_id FROM tokens WHERE id = ?')
        .get(tokenId) as { id: number; label: string; conditions: string; character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null } | undefined;
      if (!token) return;
      let conds: string[] = [];
      try { conds = JSON.parse(token.conditions); } catch { return; }
      if (!conds.includes('concentration')) return;

      const dc = Math.max(10, Math.floor(damage / 2));
      const conMod = computeSaveModForToken(token, 'con');
      const roll = Math.floor(Math.random() * 20) + 1;
      const total = roll + conMod;
      const passed = total >= dc;

      const expr = `1d20${conMod >= 0 ? '+' : ''}${conMod}`;
      const label = `${token.label} — Concentration Save (DC ${dc}) ${passed ? '✓ held' : '✗ broken'}`;
      const data = JSON.stringify({ expression: expr, dice: [roll], modifier: conMod, total, label });
      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');
      const r = insertChat.run(cid, user.id, user.username, `/roll ${expr}`, 'roll', data);
      const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));

      if (!passed) {
        const next = conds.filter((c) => c !== 'concentration');
        db.prepare('UPDATE tokens SET conditions = ? WHERE id = ?').run(JSON.stringify(next), tokenId);
        io.to(`campaign:${cid}`).emit('token:conditions_updated', { token_id: tokenId, conditions: next });
        const ar = insertChat.run(cid, user.id, user.username, `/action ${token.label} loses concentration.`, 'action', null);
        const arow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(ar.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(arow));
      }
    }

    function applyEffectMutation(tokenId: number, mutate: (arr: { name: string; rounds: number; indefinite?: boolean }[]) => { name: string; rounds: number; indefinite?: boolean }[]) {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      if (!tokenIsInCampaign(tokenId, cid)) return;
      const row = db.prepare('SELECT effects FROM tokens WHERE id = ?').get(tokenId) as { effects: string } | undefined;
      if (!row) return;
      let arr: { name: string; rounds: number; indefinite?: boolean }[] = [];
      try {
        const parsed = JSON.parse(row.effects ?? '[]');
        if (Array.isArray(parsed)) arr = parsed.filter((e: unknown): e is { name: string; rounds: number; indefinite?: boolean } => !!e && typeof (e as { name: string }).name === 'string' && typeof (e as { rounds: number }).rounds === 'number');
      } catch { /* default empty */ }
      const next = mutate(arr).filter((e) => e.indefinite || e.rounds > 0).slice(0, 32);
      db.prepare('UPDATE tokens SET effects = ? WHERE id = ?').run(JSON.stringify(next), tokenId);
      io.to(`campaign:${cid}`).emit('token:effects_updated', { token_id: tokenId, effects: next });
    }

    socket.on('token:effect_apply', ({ token_id, name, rounds, indefinite }) => {
      if (typeof name !== 'string' || !name.trim()) return;
      if (!indefinite && (!Number.isFinite(rounds) || rounds <= 0)) return;
      const trimmed = name.trim().slice(0, 50);
      const r = indefinite ? 1 : Math.min(600, Math.floor(rounds));
      applyEffectMutation(token_id, (arr) => {
        const without = arr.filter((e) => e.name !== trimmed);
        return [...without, indefinite ? { name: trimmed, rounds: r, indefinite: true } : { name: trimmed, rounds: r }];
      });
    });

    socket.on('token:effect_remove', ({ token_id, name }) => {
      if (typeof name !== 'string') return;
      applyEffectMutation(token_id, (arr) => arr.filter((e) => e.name !== name));
    });

    socket.on('token:effect_adjust', ({ token_id, name, delta }) => {
      if (typeof name !== 'string' || !Number.isFinite(delta)) return;
      const d = Math.floor(delta);
      applyEffectMutation(token_id, (arr) => arr.map((e) => e.name === name ? { ...e, rounds: e.rounds + d } : e));
    });

    socket.on('token:conditions_set', ({ token_id, conditions }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      if (!Array.isArray(conditions)) return;
      if (!tokenIsInCampaign(token_id, cid)) return;
      const filtered = (conditions as unknown[]).filter((c): c is string => typeof c === 'string' && VALID_CONDITIONS.has(c));
      const json = JSON.stringify(filtered);
      db.prepare('UPDATE tokens SET conditions = ? WHERE id = ?').run(json, token_id);
      io.to(`campaign:${cid}`).emit('token:conditions_updated', { token_id, conditions: filtered });
    });

    socket.on('group:roll', ({ kind, key }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      if (!isDmOrAdmin(user, cid)) return;
      if (kind !== 'skill' && kind !== 'save' && kind !== 'ability') return;

      const SKILL_TO_ABILITY: Record<string, string> = {
        'acrobatics': 'dex', 'animal-handling': 'wis', 'arcana': 'int', 'athletics': 'str',
        'deception': 'cha', 'history': 'int', 'insight': 'wis', 'intimidation': 'cha',
        'investigation': 'int', 'medicine': 'wis', 'nature': 'int', 'perception': 'wis',
        'performance': 'cha', 'persuasion': 'cha', 'religion': 'int', 'sleight-of-hand': 'dex',
        'stealth': 'dex', 'survival': 'wis',
      };
      const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

      let abilityKey: string;
      if (kind === 'skill') {
        if (!SKILL_TO_ABILITY[key]) return;
        abilityKey = SKILL_TO_ABILITY[key];
      } else {
        if (!ABILITIES.includes(key)) return;
        abilityKey = key;
      }

      const labelBase = kind === 'skill'
        ? key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
        : kind === 'save'
        ? `${key.toUpperCase()} Save`
        : `${key.toUpperCase()} Check`;

      // Get all PC characters in this campaign (joined via campaign_members)
      const pcs = db.prepare(`
        SELECT c.id, c.name, c.level, c.abilities, c.skills, c.saves
        FROM characters c
        JOIN campaign_members cm ON cm.character_id = c.id
        WHERE cm.campaign_id = ?
        ORDER BY c.name ASC
      `).all(cid) as { id: number; name: string; level: number; abilities: string; skills: string; saves: string }[];

      const insertStmt = db.prepare(
        'INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)'
      );

      for (const pc of pcs) {
        let mod = 0;
        try {
          const abil = JSON.parse(pc.abilities) as Record<string, number>;
          const score = abil[abilityKey] ?? 10;
          const abilMod = Math.floor((score - 10) / 2);
          const prof = Math.floor((pc.level - 1) / 4) + 2; // 5e prof bonus by level
          let isProficient = false;
          if (kind === 'skill') {
            const skills = JSON.parse(pc.skills) as Record<string, { proficient?: boolean }>;
            isProficient = !!skills[key]?.proficient;
          } else if (kind === 'save') {
            const saves = JSON.parse(pc.saves) as Record<string, { proficient?: boolean }>;
            isProficient = !!saves[key]?.proficient;
          }
          mod = abilMod + (isProficient ? prof : 0);
        } catch { /* fall through with mod = 0 */ }

        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + mod;
        const expression = `1d20${mod >= 0 ? '+' : ''}${mod}`;
        const data = JSON.stringify({ expression, dice: [roll], modifier: mod, total, label: `${pc.name} — ${labelBase}` });
        const res = insertStmt.run(cid, user.id, user.username, `/roll ${expression}`, 'roll', data);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(res.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }
    });

    socket.on('combat:resolve_spell', ({ caster_token_id, target_token_ids, spell_name, save_ability, save_dc, damage_dice, damage_type, half_on_save, conditions_on_fail }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;

      // Gate: only resolve if combat automation is on for this campaign
      const campRow = db.prepare('SELECT settings FROM campaigns WHERE id = ?').get(cid) as { settings: string } | undefined;
      if (!campRow) return;
      let settings: { combat_automation?: boolean } = {};
      try { settings = JSON.parse(campRow.settings); } catch { /* default */ }
      if (!settings.combat_automation) return;

      // Validate caster is in this campaign
      if (!tokenIsInCampaign(caster_token_id, cid)) return;
      const validTargets = (target_token_ids ?? []).filter((id) => typeof id === 'number' && tokenIsInCampaign(id, cid));
      if (validTargets.length === 0) return;
      if (typeof spell_name !== 'string' || !spell_name.trim()) return;
      if (!['str','dex','con','int','wis','cha'].includes(save_ability)) return;
      if (!Number.isFinite(save_dc) || save_dc < 1 || save_dc > 40) return;
      if (typeof damage_dice !== 'string' || !damage_dice.trim()) return;

      const casterToken = db.prepare('SELECT label FROM tokens WHERE id = ?').get(caster_token_id) as { label: string } | undefined;
      const casterName = casterToken?.label ?? 'Caster';

      // Roll shared damage once (5e: AOE save spells share one damage roll across all targets)
      const dmg = rollDiceExpression(damage_dice);
      if (dmg.total === 0 && dmg.rolls.length === 0) return;

      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');

      // Post the damage roll once
      {
        const data = JSON.stringify({ expression: damage_dice, dice: dmg.rolls, modifier: dmg.modifier, total: dmg.total, label: `${spell_name} — ${damage_type || 'damage'}` });
        const r = insertChat.run(cid, user.id, user.username, `/roll ${damage_dice}`, 'roll', data);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      // Cast announcement
      {
        const r = insertChat.run(cid, user.id, user.username, `/action ${casterName} casts ${spell_name} (DC ${save_dc} ${save_ability.toUpperCase()}).`, 'action', null);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      // Per-target: roll save, apply damage
      const summaries: string[] = [];
      for (const tid of validTargets) {
        const target = db.prepare('SELECT id, label, hp_current, hp_max, character_id, monster_slug, campaign_npc_id FROM tokens WHERE id = ?').get(tid) as { id: number; label: string; hp_current: number; hp_max: number; character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null } | undefined;
        if (!target) continue;

        const saveMod = computeSaveModForToken(target, save_ability);
        const saveRoll = Math.floor(Math.random() * 20) + 1;
        const saveTotal = saveRoll + saveMod;
        const passed = saveTotal >= save_dc;
        let damageDealt = passed ? (half_on_save ? Math.floor(dmg.total / 2) : 0) : dmg.total;
        const dmgMod = damageModifierForToken(target, damage_type);
        if (damageDealt > 0 && dmgMod.multiplier !== 1) {
          damageDealt = Math.floor(damageDealt * dmgMod.multiplier);
        }

        // Post the save roll
        const saveExpr = `1d20${saveMod >= 0 ? '+' : ''}${saveMod}`;
        const saveLabel = `${target.label} — ${save_ability.toUpperCase()} Save (DC ${save_dc}) ${passed ? '✓ saved' : '✗ failed'}`;
        const saveData = JSON.stringify({ expression: saveExpr, dice: [saveRoll], modifier: saveMod, total: saveTotal, label: saveLabel });
        const sr = insertChat.run(cid, user.id, user.username, `/roll ${saveExpr}`, 'roll', saveData);
        const saveRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sr.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(saveRow));

        // Apply damage
        if (damageDealt > 0) {
          const newHp = Math.max(0, target.hp_current - damageDealt);
          db.prepare('UPDATE tokens SET hp_current = ? WHERE id = ?').run(newHp, tid);
          io.to(`campaign:${cid}`).emit('token:hp_updated', { token_id: tid, hp_current: newHp });
          triggerConcentrationSave(cid, tid, damageDealt);
        }

        // Apply curated conditions only to targets that failed their save
        if (!passed && Array.isArray(conditions_on_fail) && conditions_on_fail.length > 0) {
          const validConds = conditions_on_fail.filter((c) => typeof c === 'string' && VALID_CONDITIONS.has(c));
          if (validConds.length > 0) {
            const tokRow = db.prepare('SELECT conditions FROM tokens WHERE id = ?').get(tid) as { conditions: string } | undefined;
            let existing: string[] = [];
            try { existing = JSON.parse(tokRow?.conditions ?? '[]'); } catch { /* ignore */ }
            const merged = Array.from(new Set([...existing, ...validConds]));
            db.prepare('UPDATE tokens SET conditions = ? WHERE id = ?').run(JSON.stringify(merged), tid);
            io.to(`campaign:${cid}`).emit('token:conditions_updated', { token_id: tid, conditions: merged });
          }
        }

        const modSuffix = dmgMod.label ? ` (${dmgMod.label})` : '';
        summaries.push(`${target.label}: ${passed ? '✓' : '✗'} ${damageDealt}${modSuffix}`);
      }

      // Final summary action
      const summaryText = `${casterName}'s ${spell_name}: ${summaries.join(' · ')}`;
      const sumRes = insertChat.run(cid, user.id, user.username, `/action ${summaryText}`, 'action', null);
      const sumRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sumRes.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(sumRow));
    });

    socket.on('combat:resolve_attack', ({ caster_token_id, target_token_ids, attack_name, attack_bonus, damage_dice, damage_type, is_spell, roll_mode }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;

      // Gate: combat automation must be on
      const campRow = db.prepare('SELECT settings FROM campaigns WHERE id = ?').get(cid) as { settings: string } | undefined;
      if (!campRow) return;
      let settings: { combat_automation?: boolean } = {};
      try { settings = JSON.parse(campRow.settings); } catch { /* default */ }
      if (!settings.combat_automation) return;

      if (!tokenIsInCampaign(caster_token_id, cid)) return;
      const validTargets = (target_token_ids ?? []).filter((id) => typeof id === 'number' && tokenIsInCampaign(id, cid));
      if (validTargets.length === 0) return;
      if (typeof attack_name !== 'string' || !attack_name.trim()) return;
      if (!Number.isFinite(attack_bonus)) return;
      if (typeof damage_dice !== 'string' || !damage_dice.trim()) return;

      const casterToken = db.prepare('SELECT label FROM tokens WHERE id = ?').get(caster_token_id) as { label: string } | undefined;
      const casterName = casterToken?.label ?? 'Caster';
      const verb = is_spell ? 'casts' : 'attacks with';

      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');

      // Cast announcement
      {
        const r = insertChat.run(cid, user.id, user.username, `/action ${casterName} ${verb} ${attack_name}.`, 'action', null);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      // Per-target: roll attack vs AC, on hit roll damage (with crit on nat 20)
      const summaries: string[] = [];
      for (const tid of validTargets) {
        const target = db.prepare('SELECT id, label, hp_current, hp_max, character_id, monster_slug, campaign_npc_id FROM tokens WHERE id = ?').get(tid) as { id: number; label: string; hp_current: number; hp_max: number; character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null } | undefined;
        if (!target) continue;

        const ac = computeAcForToken(target);
        // Advantage / disadvantage: roll 2d20 and pick high/low. Normal: roll 1d20.
        const isAdv = roll_mode === 'advantage';
        const isDis = roll_mode === 'disadvantage';
        const r1 = Math.floor(Math.random() * 20) + 1;
        const r2 = (isAdv || isDis) ? Math.floor(Math.random() * 20) + 1 : null;
        const atkRoll = r2 === null ? r1 : (isAdv ? Math.max(r1, r2) : Math.min(r1, r2));
        const dicePosted = r2 === null ? [r1] : [r1, r2, atkRoll]; // chat client treats [a,b,chosen] as adv/dis display
        const isCrit = atkRoll === 20;
        const isFumble = atkRoll === 1;
        const atkTotal = atkRoll + attack_bonus;
        const hits = isCrit || (!isFumble && atkTotal >= ac);

        // Post the attack roll
        const advSuffix = isAdv ? 'adv' : isDis ? 'dis' : '';
        const atkExpr = `1d20${advSuffix}${attack_bonus >= 0 ? '+' : ''}${attack_bonus}`;
        const hitLabel = isCrit ? '★ CRIT' : isFumble ? '✗ fumble' : hits ? `✓ hit (AC ${ac})` : `✗ miss (AC ${ac})`;
        const rollModeForData = isAdv ? 'advantage' : isDis ? 'disadvantage' : undefined;
        const atkData = JSON.stringify({ expression: atkExpr, dice: dicePosted, modifier: attack_bonus, total: atkTotal, label: `${target.label} — ${attack_name} ${hitLabel}`, rollMode: rollModeForData });
        const ar = insertChat.run(cid, user.id, user.username, `/roll ${atkExpr}`, 'roll', atkData);
        const atkRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(ar.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(atkRow));

        if (!hits) {
          summaries.push(`${target.label}: ${isCrit ? 'CRIT' : 'miss'}`);
          continue;
        }

        // Damage roll (with crit doubling dice)
        const dmg = isCrit ? rollCritDamage(damage_dice) : rollDiceExpression(damage_dice);
        const dmgMod = damageModifierForToken(target, damage_type);
        const adjustedTotal = dmgMod.multiplier === 1 ? dmg.total : Math.floor(dmg.total * dmgMod.multiplier);
        const modSuffix = dmgMod.label ? ` (${dmgMod.label})` : '';
        const dmgLabel = `${target.label} — ${attack_name} ${damage_type || 'damage'}${isCrit ? ' (crit!)' : ''}${modSuffix}`;
        const dmgData = JSON.stringify({ expression: damage_dice, dice: dmg.rolls, modifier: dmg.modifier, total: adjustedTotal, label: dmgLabel });
        const dr = insertChat.run(cid, user.id, user.username, `/roll ${damage_dice}`, 'roll', dmgData);
        const dmgRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(dr.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(dmgRow));

        if (adjustedTotal > 0) {
          const newHp = Math.max(0, target.hp_current - adjustedTotal);
          db.prepare('UPDATE tokens SET hp_current = ? WHERE id = ?').run(newHp, tid);
          io.to(`campaign:${cid}`).emit('token:hp_updated', { token_id: tid, hp_current: newHp });
          triggerConcentrationSave(cid, tid, adjustedTotal);
        }
        summaries.push(`${target.label}: ${isCrit ? '★ CRIT' : '✓'} ${adjustedTotal}${modSuffix}`);
      }

      // Final summary
      const summaryText = `${casterName}'s ${attack_name}: ${summaries.join(' · ')}`;
      const sumRes = insertChat.run(cid, user.id, user.username, `/action ${summaryText}`, 'action', null);
      const sumRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sumRes.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(sumRow));
    });

    socket.on('combat:resolve_auto_hit', ({ caster_token_id, target_token_ids, attack_name, hit_count, damage_dice, damage_type }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;

      const campRow = db.prepare('SELECT settings FROM campaigns WHERE id = ?').get(cid) as { settings: string } | undefined;
      if (!campRow) return;
      let settings: { combat_automation?: boolean } = {};
      try { settings = JSON.parse(campRow.settings); } catch { /* default */ }
      if (!settings.combat_automation) return;

      if (!tokenIsInCampaign(caster_token_id, cid)) return;
      const validTargets = (target_token_ids ?? []).filter((id) => typeof id === 'number' && tokenIsInCampaign(id, cid));
      if (validTargets.length === 0) return;
      if (typeof attack_name !== 'string' || !attack_name.trim()) return;
      if (!Number.isFinite(hit_count) || hit_count < 1) return;
      if (typeof damage_dice !== 'string' || !damage_dice.trim()) return;

      // Parse the per-hit damage dice once (e.g. "1d4+1" → count 1, sides 4, mod 1)
      const m = damage_dice.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
      if (!m) return;
      const baseCount = parseInt(m[1], 10);
      const sides = Math.max(1, parseInt(m[2], 10));
      const baseMod = m[3] ? parseInt(m[3], 10) : 0;
      const totalHits = Math.min(20, Math.max(1, Math.floor(hit_count)));

      const casterToken = db.prepare('SELECT label FROM tokens WHERE id = ?').get(caster_token_id) as { label: string } | undefined;
      const casterName = casterToken?.label ?? 'Caster';

      // Distribute hits round-robin across the targets
      const hitsPerTarget = new Array(validTargets.length).fill(0);
      for (let i = 0; i < totalHits; i++) {
        hitsPerTarget[i % validTargets.length]++;
      }

      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');

      // Cast announcement
      {
        const r = insertChat.run(cid, user.id, user.username, `/action ${casterName} casts ${attack_name} (${totalHits} hits).`, 'action', null);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      const summaries: string[] = [];
      for (let i = 0; i < validTargets.length; i++) {
        const tid = validTargets[i];
        const hits = hitsPerTarget[i];
        if (hits === 0) continue;
        const target = db.prepare('SELECT id, label, hp_current, character_id, monster_slug, campaign_npc_id FROM tokens WHERE id = ?').get(tid) as { id: number; label: string; hp_current: number; character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null } | undefined;
        if (!target) continue;

        // Roll N copies of the per-hit dice expression as a single multi-dice roll
        const rollCount = baseCount * hits;
        const totalMod = baseMod * hits;
        const rolls: number[] = [];
        let dmgTotal = totalMod;
        for (let j = 0; j < rollCount; j++) {
          const r = Math.floor(Math.random() * sides) + 1;
          rolls.push(r);
          dmgTotal += r;
        }

        const dmgMod = damageModifierForToken(target, damage_type);
        const adjustedDmg = dmgMod.multiplier === 1 ? dmgTotal : Math.floor(dmgTotal * dmgMod.multiplier);
        const modSuffix = dmgMod.label ? ` (${dmgMod.label})` : '';

        const expr = `${rollCount}d${sides}${totalMod !== 0 ? (totalMod > 0 ? '+' + totalMod : totalMod) : ''}`;
        const dmgLabel = `${target.label} — ${attack_name} (${hits} hit${hits > 1 ? 's' : ''}) ${damage_type || 'damage'}${modSuffix}`;
        const dmgData = JSON.stringify({ expression: expr, dice: rolls, modifier: totalMod, total: adjustedDmg, label: dmgLabel });
        const dr = insertChat.run(cid, user.id, user.username, `/roll ${expr}`, 'roll', dmgData);
        const dmgRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(dr.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(dmgRow));

        const newHp = Math.max(0, target.hp_current - adjustedDmg);
        db.prepare('UPDATE tokens SET hp_current = ? WHERE id = ?').run(newHp, tid);
        io.to(`campaign:${cid}`).emit('token:hp_updated', { token_id: tid, hp_current: newHp });
        triggerConcentrationSave(cid, tid, adjustedDmg);
        summaries.push(`${target.label}: ${hits}× → ${adjustedDmg}${modSuffix}`);
      }

      const summaryText = `${casterName}'s ${attack_name}: ${summaries.join(' · ')}`;
      const sumRes = insertChat.run(cid, user.id, user.username, `/action ${summaryText}`, 'action', null);
      const sumRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sumRes.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(sumRow));
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
