import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';
import { getIo } from '../io.js';

const router = Router();
router.use(requireAuth);

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

interface CampaignDmRow {
  dm_id: number;
  active_map_id: number | null;
}

function getCampaignForMap(campaignId: number): CampaignDmRow | undefined {
  return db.prepare('SELECT dm_id, active_map_id FROM campaigns WHERE id = ?')
    .get(campaignId) as CampaignDmRow | undefined;
}

function isDmOrAdmin(req: AuthRequest, dmId: number): boolean {
  return req.user!.role === 'admin' || req.user!.id === dmId;
}

// List maps for a campaign
router.get('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.query.campaign_id);
  if (!campaignId) return res.status(400).json({ error: 'campaign_id query param required' });

  const campaign = getCampaignForMap(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const rows = db.prepare('SELECT * FROM maps WHERE campaign_id = ? ORDER BY created_at ASC')
    .all(campaignId) as MapRow[];

  res.json({ maps: rows, active_map_id: campaign.active_map_id });
});

// Create a map
router.post('/', (req: AuthRequest, res) => {
  const { campaign_id, name, image_url, grid_size, grid_offset_x, grid_offset_y } = req.body ?? {};

  const campaignId = Number(campaign_id);
  if (!campaignId) return res.status(400).json({ error: 'campaign_id required' });

  const campaign = getCampaignForMap(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name required' });
  }
  if (typeof image_url !== 'string' || image_url.trim().length === 0) {
    return res.status(400).json({ error: 'image_url required' });
  }

  const info = db.prepare(
    'INSERT INTO maps (campaign_id, name, image_url, grid_size, grid_offset_x, grid_offset_y) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    campaignId,
    name.trim(),
    image_url.trim(),
    Number.isInteger(Number(grid_size)) && Number(grid_size) > 0 ? Number(grid_size) : 50,
    Number.isInteger(Number(grid_offset_x)) ? Number(grid_offset_x) : 0,
    Number.isInteger(Number(grid_offset_y)) ? Number(grid_offset_y) : 0,
  );

  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(info.lastInsertRowid) as MapRow;
  res.status(201).json({ map: row });
});

// Update grid settings for a map
router.patch('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(id) as MapRow | undefined;
  if (!row) return res.status(404).json({ error: 'Map not found' });

  const campaign = getCampaignForMap(row.campaign_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const { name, image_url, grid_size, grid_offset_x, grid_offset_y } = req.body ?? {};
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (typeof name === 'string' && name.trim().length > 0) {
    sets.push('name = ?'); values.push(name.trim());
  }
  if (typeof image_url === 'string' && image_url.trim().length > 0) {
    sets.push('image_url = ?'); values.push(image_url.trim());
  }
  if (Number.isInteger(Number(grid_size)) && Number(grid_size) > 0) {
    sets.push('grid_size = ?'); values.push(Number(grid_size));
  }
  if (Number.isInteger(Number(grid_offset_x))) {
    sets.push('grid_offset_x = ?'); values.push(Number(grid_offset_x));
  }
  if (Number.isInteger(Number(grid_offset_y))) {
    sets.push('grid_offset_y = ?'); values.push(Number(grid_offset_y));
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(id);
  db.prepare(`UPDATE maps SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM maps WHERE id = ?').get(id) as MapRow;
  res.json({ map: updated });
});

// Delete a map
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(id) as MapRow | undefined;
  if (!row) return res.status(404).json({ error: 'Map not found' });

  const campaign = getCampaignForMap(row.campaign_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  // Clear active_map_id if this map was active
  if (campaign.active_map_id === id) {
    db.prepare('UPDATE campaigns SET active_map_id = NULL WHERE id = ?').run(row.campaign_id);
    getIo().to(`campaign:${row.campaign_id}`).emit('map:switched', null);
  }

  db.prepare('DELETE FROM maps WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Activate a map — sets it as the session's active map and broadcasts to all clients
router.post('/:id/activate', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(id) as MapRow | undefined;
  if (!row) return res.status(404).json({ error: 'Map not found' });

  const campaign = getCampaignForMap(row.campaign_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  db.prepare('UPDATE campaigns SET active_map_id = ? WHERE id = ?').run(id, row.campaign_id);
  getIo().to(`campaign:${row.campaign_id}`).emit('map:switched', row);

  res.json({ map: row });
});

export default router;
