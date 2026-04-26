import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';

const router = Router();
router.use(requireAuth);

const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];

interface NpcRow {
  id: number;
  campaign_id: number;
  category_id: number | null;
  label: string;
  portrait_url: string | null;
  size: string;
  hp_max: number;
  notes: string;
  created_at: number;
}

function getDm(campaignId: number): { dm_id: number } | undefined {
  return db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(campaignId) as { dm_id: number } | undefined;
}

function isDmOrAdmin(req: AuthRequest, dmId: number) {
  return req.user!.role === 'admin' || req.user!.id === dmId;
}

// List NPC templates for a campaign
router.get('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.query.campaign_id);
  if (!campaignId) return res.status(400).json({ error: 'campaign_id required' });
  const rows = db.prepare('SELECT * FROM campaign_npcs WHERE campaign_id = ? ORDER BY label ASC').all(campaignId) as NpcRow[];
  res.json({ npcs: rows });
});

// Create an NPC template
router.post('/', (req: AuthRequest, res) => {
  const { campaign_id, category_id, label, portrait_url, size, hp_max, notes } = req.body ?? {};
  const campaignId = Number(campaign_id);
  if (!campaignId) return res.status(400).json({ error: 'campaign_id required' });
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label required' });

  const campaign = getDm(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const catId = Number(category_id) || null;
  const sizeVal = SIZES.includes(size) ? size : 'medium';
  const hpVal = Number.isInteger(Number(hp_max)) && Number(hp_max) > 0 ? Number(hp_max) : 10;

  const info = db.prepare(
    'INSERT INTO campaign_npcs (campaign_id, category_id, label, portrait_url, size, hp_max, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(campaignId, catId, label.trim(), typeof portrait_url === 'string' && portrait_url.trim() ? portrait_url.trim() : null, sizeVal, hpVal, typeof notes === 'string' ? notes.trim() : '');

  const row = db.prepare('SELECT * FROM campaign_npcs WHERE id = ?').get(info.lastInsertRowid) as NpcRow;
  res.status(201).json({ npc: row });
});

// Update an NPC template
router.patch('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM campaign_npcs WHERE id = ?').get(id) as NpcRow | undefined;
  if (!row) return res.status(404).json({ error: 'NPC not found' });

  const campaign = getDm(row.campaign_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const { category_id, label, portrait_url, size, hp_max, notes } = req.body ?? {};
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (category_id !== undefined) { sets.push('category_id = ?'); values.push(Number(category_id) || null); }
  if (typeof label === 'string' && label.trim()) { sets.push('label = ?'); values.push(label.trim()); }
  if (portrait_url !== undefined) { sets.push('portrait_url = ?'); values.push(typeof portrait_url === 'string' && portrait_url.trim() ? portrait_url.trim() : null); }
  if (SIZES.includes(size)) { sets.push('size = ?'); values.push(size); }
  if (Number.isInteger(Number(hp_max)) && Number(hp_max) > 0) { sets.push('hp_max = ?'); values.push(Number(hp_max)); }
  if (typeof notes === 'string') { sets.push('notes = ?'); values.push(notes.trim()); }

  if (!sets.length) return res.status(400).json({ error: 'No valid fields' });
  values.push(id);
  db.prepare(`UPDATE campaign_npcs SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM campaign_npcs WHERE id = ?').get(id) as NpcRow;
  res.json({ npc: updated });
});

// Delete an NPC template
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM campaign_npcs WHERE id = ?').get(id) as NpcRow | undefined;
  if (!row) return res.status(404).json({ error: 'NPC not found' });

  const campaign = getDm(row.campaign_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  db.prepare('DELETE FROM campaign_npcs WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
