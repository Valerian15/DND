import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';
import { broadcastFiltered } from '../io.js';
import { computeAndSaveFog, getVisibleSet } from '../vision.js';

const router = Router();
router.use(requireAuth);

export interface TokenRow {
  id: number;
  map_id: number;
  token_type: 'pc' | 'npc';
  character_id: number | null;
  campaign_npc_id: number | null;
  category_id: number | null; // derived from campaign_npcs join
  monster_slug: string | null;
  label: string;
  portrait_url: string | null;
  size: string;
  col: number;
  row: number;
  hp_current: number;
  hp_max: number;
  hp_visible: number;
  controlled_by: string;
  conditions: string;
  hidden: number;
  effects: string;
  aura_radius: number | null;
  aura_color: string | null;
  created_at: number;
}

export interface TimedEffect {
  name: string;
  rounds: number;
  indefinite?: boolean;
}

export interface HydratedToken extends Omit<TokenRow, 'hp_visible' | 'controlled_by' | 'conditions' | 'hidden' | 'effects'> {
  hp_visible: boolean;
  controlled_by: number[];
  conditions: string[];
  hidden: boolean;
  effects: TimedEffect[];
  monster_slug: string | null;
  aura_radius: number | null;
  aura_color: string | null;
}

export function hydrateToken(row: TokenRow): HydratedToken {
  let effects: TimedEffect[] = [];
  try {
    const parsed = JSON.parse(row.effects ?? '[]');
    if (Array.isArray(parsed)) effects = parsed
      .filter((e: unknown): e is TimedEffect => !!e && typeof (e as TimedEffect).name === 'string' && typeof (e as TimedEffect).rounds === 'number')
      .map((e) => ({ name: e.name, rounds: e.rounds, ...(e.indefinite ? { indefinite: true } : {}) }));
  } catch { /* default empty */ }
  return {
    ...row,
    hp_visible: row.hp_visible === 1,
    controlled_by: JSON.parse(row.controlled_by),
    conditions: JSON.parse(row.conditions),
    hidden: row.hidden === 1,
    effects,
  };
}

export function canUserSeeToken(userId: number, token: TokenRow, dmId: number): boolean {
  if (userId === dmId) return true;
  if (token.hidden === 1) return false;
  if (token.token_type === 'pc') return true;
  // If fog of war is disabled on this map, all non-hidden tokens are visible.
  const map = db.prepare('SELECT fog_enabled FROM maps WHERE id = ?').get(token.map_id) as { fog_enabled: number } | undefined;
  if (!map?.fog_enabled) return true;
  return getVisibleSet(token.map_id).has(`${token.col},${token.row}`);
}

// Broadcast token appear/disappear events caused by a fog visibility change.
// oldVisible and newVisible are Set<"col,row"> from getVisibleSet() before/after recompute.
export function broadcastFogTokenChanges(
  campaignId: number,
  mapId: number,
  oldVisible: Set<string>,
  newVisible: Set<string>,
  dmId: number,
): void {
  const npcTokens = db.prepare(
    'SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.map_id = ? AND t.token_type = \'npc\''
  ).all(mapId) as TokenRow[];

  const playerFilter = (userId: number, role: string) => role !== 'admin' && userId !== dmId;

  for (const token of npcTokens) {
    if (token.hidden === 1) continue; // hidden tokens never broadcast to players
    const key = `${token.col},${token.row}`;
    const wasVisible = oldVisible.has(key);
    const isVisible = newVisible.has(key);
    if (!wasVisible && isVisible) {
      broadcastFiltered(campaignId, 'token:created', hydrateToken(token), playerFilter);
    } else if (wasVisible && !isVisible) {
      broadcastFiltered(campaignId, 'token:deleted', { token_id: token.id }, playerFilter);
    }
  }
}

interface CampaignContext { id: number; dm_id: number }

function getCampaignForMap(mapId: number): CampaignContext | undefined {
  return db.prepare('SELECT c.id, c.dm_id FROM campaigns c JOIN maps m ON m.campaign_id = c.id WHERE m.id = ?')
    .get(mapId) as CampaignContext | undefined;
}

function tokenFilter(campaign: CampaignContext) {
  return (userId: number, role: string) =>
    role === 'admin' || userId === campaign.dm_id ||
    // need to check visibility per token — done in the route, here we allow DM/admin
    false; // placeholder — actual broadcast uses canUserSeeToken per token
}

// Broadcast a token event to all users in the campaign room who can see that token
function emitToken(campaign: CampaignContext, event: string, payload: unknown, token: TokenRow) {
  broadcastFiltered(
    campaign.id,
    event,
    payload,
    (userId, role) => role === 'admin' || userId === campaign.dm_id || canUserSeeToken(userId, token, campaign.dm_id),
  );
}

const TOKEN_QUERY = `
  SELECT t.*, cnpc.category_id
  FROM tokens t
  LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id
  WHERE t.map_id = ?
  ORDER BY t.created_at ASC
`;
// monster_slug is a native column on tokens — already included via t.*

// GET /api/tokens?map_id=X
router.get('/', (req: AuthRequest, res) => {
  const mapId = Number(req.query.map_id);
  if (!mapId) return res.status(400).json({ error: 'map_id required' });

  const campaign = getCampaignForMap(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  const rows = db.prepare(TOKEN_QUERY).all(mapId) as TokenRow[];
  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  const filtered = isDmOrAdmin ? rows : rows.filter(t => canUserSeeToken(req.user!.id, t, campaign.dm_id));

  res.json({ tokens: filtered.map(hydrateToken) });
});

// POST /api/tokens — create (or move if PC token already exists on map)
router.post('/', (req: AuthRequest, res) => {
  const { map_id, token_type, character_id, campaign_npc_id, col, row } = req.body ?? {};

  const mapId = Number(map_id);
  if (!mapId) return res.status(400).json({ error: 'map_id required' });
  const campaign = getCampaignForMap(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  const colN = Number.isInteger(Number(col)) ? Number(col) : 0;
  const rowN = Number.isInteger(Number(row)) ? Number(row) : 0;

  if (token_type === 'pc') {
    const charId = Number(character_id);
    if (!charId) return res.status(400).json({ error: 'character_id required for pc token' });

    const char = db.prepare('SELECT id, owner_id, name, portrait_url, hp_current, hp_max FROM characters WHERE id = ?')
      .get(charId) as { id: number; owner_id: number; name: string; portrait_url: string | null; hp_current: number; hp_max: number } | undefined;
    if (!char) return res.status(404).json({ error: 'Character not found' });
    if (!isDmOrAdmin && char.owner_id !== req.user!.id) return res.status(403).json({ error: 'Not your character' });

    // If token already exists on this map, move it instead
    const existing = db.prepare('SELECT * FROM tokens WHERE map_id = ? AND character_id = ?')
      .get(mapId, charId) as TokenRow | undefined;
    if (existing) {
      db.prepare('UPDATE tokens SET col = ?, row = ? WHERE id = ?').run(colN, rowN, existing.id);
      const updated = { ...existing, col: colN, row: rowN } as TokenRow;
      emitToken(campaign, 'token:moved', { token_id: existing.id, col: colN, row: rowN }, updated);
      const oldVisible = getVisibleSet(mapId);
      const fog = computeAndSaveFog(mapId);
      const newVisible = getVisibleSet(mapId);
      broadcastFiltered(campaign.id, 'fog:update', fog, () => true);
      broadcastFogTokenChanges(campaign.id, mapId, oldVisible, newVisible, campaign.dm_id);
      return res.json({ token: hydrateToken(updated) });
    }

    const info = db.prepare(
      'INSERT INTO tokens (map_id, token_type, character_id, label, portrait_url, col, row, hp_current, hp_max, hp_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(mapId, 'pc', charId, char.name, char.portrait_url, colN, rowN, char.hp_current, char.hp_max);

    const created = db.prepare('SELECT t.*, NULL as category_id FROM tokens t WHERE t.id = ?').get(info.lastInsertRowid) as TokenRow;
    emitToken(campaign, 'token:created', hydrateToken(created), created);
    const oldVisible = getVisibleSet(mapId);
    const fog = computeAndSaveFog(mapId);
    const newVisible = getVisibleSet(mapId);
    broadcastFiltered(campaign.id, 'fog:update', fog, () => true);
    broadcastFogTokenChanges(campaign.id, mapId, oldVisible, newVisible, campaign.dm_id);
    return res.status(201).json({ token: hydrateToken(created) });

  } else if (token_type === 'npc') {
    if (!isDmOrAdmin) return res.status(403).json({ error: 'DM access required' });

    // Path A: place from library monster slug
    if (req.body.monster_slug) {
      const slug = String(req.body.monster_slug).trim();
      const mrow = db.prepare('SELECT name, data FROM monsters WHERE slug = ?').get(slug) as
        { name: string; data: string } | undefined;
      if (!mrow) return res.status(404).json({ error: 'Monster not found in library' });
      const mdata = JSON.parse(mrow.data) as { hit_points?: number; size?: string };
      const hp = mdata.hit_points ?? 10;
      const size = (mdata.size ?? 'medium').toLowerCase();
      const count = (db.prepare('SELECT COUNT(*) as c FROM tokens WHERE map_id = ? AND monster_slug = ?')
        .get(mapId, slug) as { c: number }).c;
      const label = count > 0 ? `${mrow.name} ${count + 1}` : mrow.name;
      const info = db.prepare(
        'INSERT INTO tokens (map_id, token_type, monster_slug, label, size, col, row, hp_current, hp_max, hp_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
      ).run(mapId, 'npc', slug, label, size, colN, rowN, hp, hp);
      const created = db.prepare('SELECT t.*, NULL as category_id FROM tokens t WHERE t.id = ?')
        .get(info.lastInsertRowid) as TokenRow;
      emitToken(campaign, 'token:created', hydrateToken(created), created);
      return res.status(201).json({ token: hydrateToken(created) });
    }

    // Path B: place from campaign NPC template
    const npcId = Number(campaign_npc_id);
    if (!npcId) return res.status(400).json({ error: 'campaign_npc_id or monster_slug required for npc token' });

    const npc = db.prepare('SELECT * FROM campaign_npcs WHERE id = ? AND campaign_id = ?')
      .get(npcId, campaign.id) as { id: number; label: string; portrait_url: string | null; size: string; hp_max: number; category_id: number | null } | undefined;
    if (!npc) return res.status(404).json({ error: 'NPC template not found' });

    const count = (db.prepare('SELECT COUNT(*) as c FROM tokens WHERE map_id = ? AND campaign_npc_id = ?')
      .get(mapId, npcId) as { c: number }).c;
    const label = `${npc.label} ${count + 1}`;

    const info = db.prepare(
      'INSERT INTO tokens (map_id, token_type, campaign_npc_id, label, portrait_url, size, col, row, hp_current, hp_max, hp_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
    ).run(mapId, 'npc', npcId, label, npc.portrait_url, npc.size, colN, rowN, npc.hp_max, npc.hp_max);

    const created = db.prepare('SELECT t.*, ? as category_id FROM tokens t WHERE t.id = ?')
      .get(npc.category_id, info.lastInsertRowid) as TokenRow;
    emitToken(campaign, 'token:created', hydrateToken(created), created);
    return res.status(201).json({ token: hydrateToken(created) });

  }
  return res.status(400).json({ error: 'token_type must be pc or npc' });
});

// DELETE /api/tokens/:id
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const token = db.prepare('SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.id = ?')
    .get(id) as TokenRow | undefined;
  if (!token) return res.status(404).json({ error: 'Token not found' });

  const campaign = getCampaignForMap(token.map_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  if (!isDmOrAdmin) {
    if (token.token_type === 'pc' && token.character_id) {
      const char = db.prepare('SELECT owner_id FROM characters WHERE id = ?')
        .get(token.character_id) as { owner_id: number } | undefined;
      if (char?.owner_id !== req.user!.id) return res.status(403).json({ error: 'Not allowed' });
    } else {
      return res.status(403).json({ error: 'DM access required' });
    }
  }

  db.prepare('DELETE FROM tokens WHERE id = ?').run(id);
  emitToken(campaign, 'token:deleted', { token_id: id }, token);
  res.json({ ok: true });
});

// PATCH /api/tokens/:id/hp
router.patch('/:id/hp', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const hpCurrent = Number(req.body?.hp_current);
  if (!Number.isInteger(hpCurrent) || hpCurrent < 0) return res.status(400).json({ error: 'hp_current must be a non-negative integer' });

  const token = db.prepare('SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.id = ?')
    .get(id) as TokenRow | undefined;
  if (!token) return res.status(404).json({ error: 'Token not found' });

  const campaign = getCampaignForMap(token.map_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  if (!isDmOrAdmin) {
    if (token.token_type === 'pc' && token.character_id !== null) {
      const char = db.prepare('SELECT owner_id FROM characters WHERE id = ?')
        .get(token.character_id) as { owner_id: number } | undefined;
      if (char?.owner_id !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });
    } else {
      return res.status(403).json({ error: 'DM access required' });
    }
  }

  const clamped = Math.max(0, Math.min(token.hp_max, hpCurrent));
  db.prepare('UPDATE tokens SET hp_current = ? WHERE id = ?').run(clamped, id);

  if (token.token_type === 'pc' && token.character_id !== null) {
    db.prepare("UPDATE characters SET hp_current = ?, updated_at = strftime('%s', 'now') WHERE id = ?")
      .run(clamped, token.character_id);
  }

  broadcastFiltered(campaign.id, 'token:hp_updated', { token_id: id, hp_current: clamped }, () => true);
  res.json({ token_id: id, hp_current: clamped });
});

export const VALID_CONDITIONS = new Set([
  'blinded', 'charmed', 'concentration', 'deafened', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious',
]);

// PATCH /api/tokens/:id/conditions  (DM/admin or token's PC owner)
router.patch('/:id/conditions', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const raw = req.body?.conditions;
  if (!Array.isArray(raw)) return res.status(400).json({ error: 'conditions must be an array' });
  const conditions = (raw as unknown[]).filter((c): c is string => typeof c === 'string' && VALID_CONDITIONS.has(c));

  const token = db.prepare('SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.id = ?')
    .get(id) as TokenRow | undefined;
  if (!token) return res.status(404).json({ error: 'Token not found' });

  const campaign = getCampaignForMap(token.map_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  if (!isDmOrAdmin) {
    const controlled = JSON.parse(token.controlled_by) as number[];
    const ownsChar = token.token_type === 'pc' && token.character_id !== null &&
      !!db.prepare('SELECT id FROM characters WHERE id = ? AND owner_id = ?').get(token.character_id, req.user!.id);
    if (!controlled.includes(req.user!.id) && !ownsChar) {
      return res.status(403).json({ error: 'DM access required' });
    }
  }

  const json = JSON.stringify(conditions);
  db.prepare('UPDATE tokens SET conditions = ? WHERE id = ?').run(json, id);
  broadcastFiltered(campaign.id, 'token:conditions_updated', { token_id: id, conditions }, () => true);
  res.json({ token_id: id, conditions });
});

// Set or clear a token's visual aura (range ring shown on the canvas).
router.patch('/:id/aura', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const token = db.prepare('SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.id = ?')
    .get(id) as TokenRow | undefined;
  if (!token) return res.status(404).json({ error: 'Token not found' });

  const campaign = getCampaignForMap(token.map_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  // PC tokens can be modified by their owner; NPC tokens DM-only.
  if (!isDmOrAdmin) {
    if (token.token_type === 'pc' && token.character_id !== null) {
      const owner = db.prepare('SELECT owner_id FROM characters WHERE id = ?')
        .get(token.character_id) as { owner_id: number } | undefined;
      if (owner?.owner_id !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });
    } else {
      return res.status(403).json({ error: 'DM access required' });
    }
  }

  const { aura_radius, aura_color } = req.body ?? {};
  // Clear when radius is explicitly null/0 — we don't render an aura with no radius.
  let radius: number | null = null;
  let color: string | null = null;
  if (aura_radius != null) {
    const n = Number(aura_radius);
    if (Number.isFinite(n) && n > 0 && n <= 1000) {
      radius = Math.floor(n);
      color = typeof aura_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(aura_color) ? aura_color : '#ffd86b';
    }
  }
  db.prepare('UPDATE tokens SET aura_radius = ?, aura_color = ? WHERE id = ?').run(radius, color, id);
  broadcastFiltered(campaign.id, 'token:aura_updated', { token_id: id, aura_radius: radius, aura_color: color }, () => true);
  res.json({ token_id: id, aura_radius: radius, aura_color: color });
});

router.patch('/:id/hidden', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const hidden = req.body?.hidden ? 1 : 0;

  const token = db.prepare('SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.id = ?')
    .get(id) as TokenRow | undefined;
  if (!token) return res.status(404).json({ error: 'Token not found' });

  const campaign = getCampaignForMap(token.map_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  if (!isDmOrAdmin) return res.status(403).json({ error: 'DM access required' });

  db.prepare('UPDATE tokens SET hidden = ? WHERE id = ?').run(hidden, id);
  const updated = { ...token, hidden };

  // For players: send delete (becoming hidden) or create (becoming visible).
  // Only relevant for tokens players could otherwise see — for NPCs, also need fog visibility.
  const playerFilter = (userId: number, role: string) => role !== 'admin' && userId !== campaign.dm_id;
  if (hidden === 1) {
    broadcastFiltered(campaign.id, 'token:deleted', { token_id: id }, playerFilter);
  } else {
    // Becoming visible — only send to players who could see it (PC always, NPC needs fog cell visible)
    broadcastFiltered(
      campaign.id,
      'token:created',
      hydrateToken(updated),
      (userId, role) => role !== 'admin' && userId !== campaign.dm_id && canUserSeeToken(userId, updated, campaign.dm_id),
    );
  }
  // For DM/admin: just notify of the new hidden state
  broadcastFiltered(
    campaign.id,
    'token:hidden_updated',
    { token_id: id, hidden: hidden === 1 },
    (userId, role) => role === 'admin' || userId === campaign.dm_id,
  );

  res.json({ token_id: id, hidden: hidden === 1 });
});

// Suppress unused export warning
void tokenFilter;

export default router;
