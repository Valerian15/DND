import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';

const router = Router();
router.use(requireAuth);

interface CategoryRow {
  id: number;
  campaign_id: number;
  name: string;
  is_default: number;
  sort_order: number;
  created_at: number;
}

interface CampaignDm { dm_id: number }

function getDm(campaignId: number): CampaignDm | undefined {
  return db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(campaignId) as CampaignDm | undefined;
}

function isDmOrAdmin(req: AuthRequest, dmId: number) {
  return req.user!.role === 'admin' || req.user!.id === dmId;
}

// List categories for a campaign
router.get('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.query.campaign_id);
  if (!campaignId) return res.status(400).json({ error: 'campaign_id required' });
  const rows = db.prepare('SELECT * FROM campaign_token_categories WHERE campaign_id = ? ORDER BY sort_order ASC, id ASC').all(campaignId) as CategoryRow[];
  res.json({ categories: rows });
});

// Create a custom category
router.post('/', (req: AuthRequest, res) => {
  const { campaign_id, name } = req.body ?? {};
  const campaignId = Number(campaign_id);
  if (!campaignId) return res.status(400).json({ error: 'campaign_id required' });
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });

  const campaign = getDm(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM campaign_token_categories WHERE campaign_id = ?').get(campaignId) as { m: number | null }).m ?? 1;
  const info = db.prepare('INSERT INTO campaign_token_categories (campaign_id, name, is_default, sort_order) VALUES (?, ?, 0, ?)').run(campaignId, name.trim(), maxOrder + 1);
  const row = db.prepare('SELECT * FROM campaign_token_categories WHERE id = ?').get(info.lastInsertRowid) as CategoryRow;
  res.status(201).json({ category: row });
});

// Rename a category (defaults can be renamed too)
router.patch('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM campaign_token_categories WHERE id = ?').get(id) as CategoryRow | undefined;
  if (!row) return res.status(404).json({ error: 'Category not found' });

  const campaign = getDm(row.campaign_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const { name } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });

  db.prepare('UPDATE campaign_token_categories SET name = ? WHERE id = ?').run(name.trim(), id);
  const updated = db.prepare('SELECT * FROM campaign_token_categories WHERE id = ?').get(id) as CategoryRow;
  res.json({ category: updated });
});

// Delete a non-default category (blocked if it has NPCs)
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM campaign_token_categories WHERE id = ?').get(id) as CategoryRow | undefined;
  if (!row) return res.status(404).json({ error: 'Category not found' });
  if (row.is_default) return res.status(403).json({ error: 'Default categories cannot be deleted' });

  const campaign = getDm(row.campaign_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const npcCount = (db.prepare('SELECT COUNT(*) as c FROM campaign_npcs WHERE category_id = ?').get(id) as { c: number }).c;
  if (npcCount > 0) return res.status(409).json({ error: 'Move or delete the NPCs in this category first' });

  db.prepare('DELETE FROM campaign_token_categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
