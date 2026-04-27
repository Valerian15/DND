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
  features: string;
  notes: string;
  description: string;
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
  'background_slug',
  'hp_current',
  'hp_max',
  'hp_temp',
  'ac',
  'portrait_url',
  'notes',
  'darkvision',
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
  'features',
  'description',
]);

router.patch('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | undefined;
  if (!row) return res.status(404).json({ error: 'Character not found' });
  if (row.owner_id !== req.user!.id && req.user!.role !== 'admin') {
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
