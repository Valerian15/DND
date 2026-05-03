import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireAdmin, type AuthRequest } from '../auth/index.js';

const router = Router();
router.use(requireAuth);

interface CharacterRow {
  id: number;
  owner_id: number;
  name: string;
  level: number;
  class_slug: string | null;
  subclass_slug: string | null;
  race_slug: string | null;
  subrace_slug: string | null;
  background_slug: string | null;
  hp_current: number;
  hp_max: number;
  hp_temp: number;
  ac: number;
  portrait_url: string | null;
  abilities: string;
  skills: string;
  saves: string;
  inventory: string;
  weapons: string;
  spells_known: string;
  spells_prepared: string;
  spell_slots: string;
  spell_slots_used: string;
  hit_dice_used: number;
  resources: string;
  currency: string;
  feats: string;
  personality: string;
  effects: string;
  classes: string;
  languages: string;
  inventory_v2: string;
  resistances: string;
  vulnerabilities: string;
  immunities: string;
  features: string;
  notes: string;
  description: string;
  darkvision: number;
  death_saves_success: number;
  death_saves_failure: number;
  inspiration: number;
  lucky_used: number;
  speed_walk: number;
  action_used: number;
  bonus_used: number;
  reaction_used: number;
  created_at: number;
  updated_at: number;
}

function hydrate(row: CharacterRow) {
  return {
    ...row,
    abilities: JSON.parse(row.abilities),
    skills: JSON.parse(row.skills),
    saves: JSON.parse(row.saves),
    inventory: JSON.parse(row.inventory),
    weapons: JSON.parse(row.weapons),
    spells_known: JSON.parse(row.spells_known),
    spells_prepared: JSON.parse(row.spells_prepared),
    spell_slots: JSON.parse(row.spell_slots),
    spell_slots_used: JSON.parse(row.spell_slots_used),
    resources: JSON.parse(row.resources),
    currency: JSON.parse(row.currency || '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'),
    feats: JSON.parse(row.feats || '[]'),
    personality: JSON.parse(row.personality || '{"traits":"","ideals":"","bonds":"","flaws":""}'),
    effects: JSON.parse(row.effects || '[]'),
    classes: JSON.parse(row.classes || '[]'),
    languages: JSON.parse(row.languages || '[]'),
    inventory_v2: JSON.parse(row.inventory_v2 || '[]'),
    resistances: JSON.parse(row.resistances || '[]'),
    vulnerabilities: JSON.parse(row.vulnerabilities || '[]'),
    immunities: JSON.parse(row.immunities || '[]'),
    features: JSON.parse(row.features),
    description: JSON.parse(row.description),
  };
}

// List current user's characters (admin sees all)
router.get('/', (req: AuthRequest, res) => {
  const isAdmin = req.user?.role === 'admin';
  const rows = isAdmin
    ? db.prepare('SELECT * FROM characters ORDER BY updated_at DESC').all() as CharacterRow[]
    : db
        .prepare('SELECT * FROM characters WHERE owner_id = ? ORDER BY updated_at DESC')
        .all(req.user!.id) as CharacterRow[];
  res.json({ characters: rows.map(hydrate) });
});

// Get a single character — owner, admin, or DM of a campaign the character is in
router.get('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });
  if (row.owner_id !== req.user!.id && req.user!.role !== 'admin') {
    const isDm = db.prepare(`
      SELECT c.id FROM campaigns c
      JOIN campaign_members cm ON cm.campaign_id = c.id
      WHERE cm.character_id = ? AND c.dm_id = ?
    `).get(id, req.user!.id);
    if (!isDm) return res.status(403).json({ error: 'Not your character' });
  }
  res.json({ character: hydrate(row) });
});

// Create a new character (usually a blank one to start the wizard)
router.post('/', (req: AuthRequest, res) => {
  const { name } = req.body ?? {};
  const cleanName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'Unnamed Hero';
  const info = db
    .prepare('INSERT INTO characters (owner_id, name) VALUES (?, ?)')
    .run(req.user!.id, cleanName);
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(info.lastInsertRowid) as CharacterRow;
  res.status(201).json({ character: hydrate(row) });
});

// Update character (partial — any column can be sent)
const UPDATABLE_SCALAR = new Set([
  'name',
  'level',
  'class_slug',
  'subclass_slug',
  'race_slug',
  'subrace_slug',
  'background_slug',
  'hp_current',
  'hp_max',
  'hp_temp',
  'ac',
  'portrait_url',
  'notes',
  'darkvision',
  'hit_dice_used',
  'death_saves_success',
  'death_saves_failure',
  'inspiration',
  'lucky_used',
  'speed_walk',
  'exhaustion_level',
  'action_used',
  'bonus_used',
  'reaction_used',
]);
const UPDATABLE_JSON = new Set([
  'abilities',
  'skills',
  'saves',
  'inventory',
  'weapons',
  'spells_known',
  'spells_prepared',
  'spell_slots',
  'spell_slots_used',
  'resources',
  'currency',
  'feats',
  'personality',
  'effects',
  'classes',
  'languages',
  'inventory_v2',
  'resistances',
  'vulnerabilities',
  'immunities',
  'features',
  'description',
]);

/**
 * True when the requesting user is the DM of any campaign that lists this character in
 * its members. Lets a non-admin DM edit player PCs in their own campaign (HP, exhaustion,
 * inventory, etc.) without granting them global admin rights.
 */
function isDmOfCharactersCampaign(userId: number, characterId: number): boolean {
  const row = db.prepare(
    `SELECT 1 FROM campaign_members cm
       JOIN campaigns c ON c.id = cm.campaign_id
       WHERE cm.character_id = ? AND c.dm_id = ?
       LIMIT 1`
  ).get(characterId, userId);
  return !!row;
}

router.patch('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });
  const isOwner = row.owner_id === req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const isCampaignDm = !isOwner && !isAdmin && isDmOfCharactersCampaign(req.user!.id, id);
  if (!isOwner && !isAdmin && !isCampaignDm) {
    return res.status(403).json({ error: 'Not your character' });
  }

  const body = req.body ?? {};
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [k, v] of Object.entries(body)) {
    if (UPDATABLE_SCALAR.has(k)) {
      sets.push(`${k} = ?`);
      values.push(v as string | number | null);
    } else if (UPDATABLE_JSON.has(k)) {
      sets.push(`${k} = ?`);
      values.push(JSON.stringify(v));
    }
  }

  // Multiclass migration helper: when `classes` is updated, mirror its first entry
  // into the legacy single-class columns so old code/UI keeps reading the right values.
  // The total `level` column becomes the sum across classes; `hit_dice_used` mirrors classes[0].
  if (Array.isArray(body.classes) && body.classes.length > 0) {
    const first = body.classes[0] as { slug?: string; subclass_slug?: string | null; level?: number; hit_dice_used?: number };
    const totalLevel = (body.classes as Array<{ level?: number }>)
      .reduce((sum, c) => sum + (typeof c.level === 'number' ? c.level : 0), 0);
    if (typeof first.slug === 'string') { sets.push('class_slug = ?'); values.push(first.slug); }
    sets.push('subclass_slug = ?'); values.push(typeof first.subclass_slug === 'string' ? first.subclass_slug : null);
    if (totalLevel > 0) { sets.push('level = ?'); values.push(totalLevel); }
    if (typeof first.hit_dice_used === 'number') { sets.push('hit_dice_used = ?'); values.push(first.hit_dice_used); }
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  sets.push(`updated_at = strftime('%s', 'now')`);
  values.push(id);

  db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow;
  res.json({ character: hydrate(updated) });
});

// Delete a character
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT owner_id FROM characters WHERE id = ?').get(id) as { owner_id: number } | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });
  if (row.owner_id !== req.user!.id && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Not your character' });
  }

  db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
