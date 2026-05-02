import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';
import { getIo } from '../io.js';
import type { TokenRow } from './tokens.js';
import { hydrateToken } from './tokens.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

interface CampaignRow { id: number; dm_id: number; active_map_id: number | null }

function getCampaign(campaignId: number): CampaignRow | undefined {
  return db.prepare('SELECT id, dm_id, active_map_id FROM campaigns WHERE id = ?').get(campaignId) as CampaignRow | undefined;
}

function isDmOrAdmin(req: AuthRequest, dmId: number): boolean {
  return req.user!.role === 'admin' || req.user!.id === dmId;
}

interface EncounterRow {
  id: number;
  campaign_id: number;
  name: string;
  tokens_json: string;
  initiative_json: string;
  created_at: number;
}

interface SavedToken {
  // Snapshot of every meaningful token field — recreated verbatim on restore.
  token_type: 'pc' | 'npc';
  character_id: number | null;
  campaign_npc_id: number | null;
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
  spell_slots_used: string;
}

interface SavedInitiative {
  label: string;
  initiative: number;
  dex_score: number;
}

// List encounters for a campaign
router.get('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const c = getCampaign(campaignId);
  if (!c) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, c.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const rows = db.prepare(
    'SELECT id, campaign_id, name, created_at FROM encounters WHERE campaign_id = ? ORDER BY created_at DESC'
  ).all(campaignId);
  res.json({ encounters: rows });
});

// Save a new encounter snapshot from the campaign's active map + current initiative
router.post('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const c = getCampaign(campaignId);
  if (!c) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, c.dm_id)) return res.status(403).json({ error: 'DM access required' });
  if (!c.active_map_id) return res.status(400).json({ error: 'No active map to snapshot' });

  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'name required' });

  const tokens = db.prepare(
    `SELECT token_type, character_id, campaign_npc_id, monster_slug, label, portrait_url, size,
            col, row, hp_current, hp_max, hp_visible, controlled_by, conditions, hidden,
            effects, aura_radius, aura_color, spell_slots_used
     FROM tokens WHERE map_id = ?`
  ).all(c.active_map_id) as SavedToken[];

  const initiative = db.prepare(
    'SELECT label, initiative, dex_score FROM initiative_entries WHERE campaign_id = ?'
  ).all(campaignId) as SavedInitiative[];

  const r = db.prepare(
    'INSERT INTO encounters (campaign_id, name, tokens_json, initiative_json) VALUES (?, ?, ?, ?)'
  ).run(campaignId, name, JSON.stringify(tokens), JSON.stringify(initiative));

  const row = db.prepare(
    'SELECT id, campaign_id, name, created_at FROM encounters WHERE id = ?'
  ).get(r.lastInsertRowid);
  res.status(201).json({ encounter: row });
});

// Delete an encounter
router.delete('/:eid', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const c = getCampaign(campaignId);
  if (!c) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, c.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const eid = Number(req.params.eid);
  db.prepare('DELETE FROM encounters WHERE id = ? AND campaign_id = ?').run(eid, campaignId);
  res.json({ ok: true });
});

// Restore an encounter onto the active map: wipes current tokens and initiative, replays snapshot.
router.post('/:eid/restore', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const c = getCampaign(campaignId);
  if (!c) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, c.dm_id)) return res.status(403).json({ error: 'DM access required' });
  if (!c.active_map_id) return res.status(400).json({ error: 'No active map to restore onto' });

  const eid = Number(req.params.eid);
  const enc = db.prepare(
    'SELECT id, campaign_id, name, tokens_json, initiative_json FROM encounters WHERE id = ? AND campaign_id = ?'
  ).get(eid, campaignId) as EncounterRow | undefined;
  if (!enc) return res.status(404).json({ error: 'Encounter not found' });

  let savedTokens: SavedToken[] = [];
  let savedInitiative: SavedInitiative[] = [];
  try { savedTokens = JSON.parse(enc.tokens_json) ?? []; } catch { /* default */ }
  try { savedInitiative = JSON.parse(enc.initiative_json) ?? []; } catch { /* default */ }

  const insertToken = db.prepare(
    `INSERT INTO tokens (map_id, token_type, character_id, campaign_npc_id, monster_slug, label,
       portrait_url, size, col, row, hp_current, hp_max, hp_visible, controlled_by, conditions,
       hidden, effects, aura_radius, aura_color, spell_slots_used)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertInit = db.prepare(
    'INSERT INTO initiative_entries (campaign_id, token_id, label, initiative, dex_score) VALUES (?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    db.prepare('DELETE FROM tokens WHERE map_id = ?').run(c.active_map_id);
    db.prepare('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaignId);

    const labelToTokenId: Record<string, number> = {};
    for (const t of savedTokens) {
      const r = insertToken.run(
        c.active_map_id, t.token_type, t.character_id, t.campaign_npc_id, t.monster_slug, t.label,
        t.portrait_url, t.size, t.col, t.row, t.hp_current, t.hp_max, t.hp_visible,
        t.controlled_by ?? '[]', t.conditions ?? '[]', t.hidden ?? 0,
        t.effects ?? '[]', t.aura_radius, t.aura_color, t.spell_slots_used ?? '{}'
      );
      labelToTokenId[t.label] = Number(r.lastInsertRowid);
    }
    for (const e of savedInitiative) {
      const tokenId = labelToTokenId[e.label] ?? null;
      insertInit.run(campaignId, tokenId, e.label, e.initiative, e.dex_score);
    }
  })();

  // Broadcast a fresh session:state-equivalent so clients reload tokens + initiative.
  // Clients already listen for token:created and initiative:updated; emit both.
  // We must JOIN with campaign_npcs so category_id is hydrated — without it the "On Map"
  // tab filter (token.category_id === cat.id) drops restored tokens silently.
  const newTokens = db.prepare(
    'SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.map_id = ?'
  ).all(c.active_map_id) as TokenRow[];
  const io = getIo();
  for (const t of newTokens) {
    io.to(`campaign:${campaignId}`).emit('token:created', hydrateToken(t));
  }
  // Reset turn state and broadcast initiative
  db.prepare('UPDATE campaigns SET initiative_current_id = NULL, initiative_round = 0 WHERE id = ?').run(campaignId);
  const initEntries = db.prepare(
    'SELECT id, campaign_id, token_id, label, initiative, dex_score, created_at FROM initiative_entries WHERE campaign_id = ? ORDER BY initiative DESC, dex_score DESC, id ASC'
  ).all(campaignId) as Array<{ id: number; campaign_id: number; token_id: number | null; label: string; initiative: number; dex_score: number; created_at: number }>;
  io.to(`campaign:${campaignId}`).emit('initiative:updated', { entries: initEntries, current_id: null, round: 0 });

  res.json({ ok: true, encounter: { id: enc.id, name: enc.name } });
});

export default router;
