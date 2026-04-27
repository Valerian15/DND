import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';
import { broadcastFiltered } from '../io.js';
import { computeAndSaveFog } from '../vision.js';

const router = Router();
router.use(requireAuth);

interface WallRow {
  id: number; map_id: number;
  x1: number; y1: number; x2: number; y2: number;
  created_at: number;
}

function getMapCampaign(mapId: number): { id: number; dm_id: number } | undefined {
  return db.prepare(
    'SELECT c.id, c.dm_id FROM campaigns c JOIN maps m ON m.campaign_id = c.id WHERE m.id = ?'
  ).get(mapId) as { id: number; dm_id: number } | undefined;
}

function emitFog(campaignId: number, mapId: number) {
  const fog = computeAndSaveFog(mapId);
  broadcastFiltered(campaignId, 'fog:update', fog, () => true);
}

// GET /api/maps/:id/walls
router.get('/:id/walls', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const walls = db.prepare(
    'SELECT * FROM map_walls WHERE map_id = ? ORDER BY id ASC'
  ).all(mapId) as WallRow[];
  res.json({ walls });
});

// GET /api/maps/:id/fog — compute + return current vision (used on map switch)
router.get('/:id/fog', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const fog = computeAndSaveFog(mapId);
  res.json(fog);
});

// POST /api/maps/:id/walls
router.post('/:id/walls', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  if (!isDmOrAdmin) return res.status(403).json({ error: 'DM access required' });

  const { x1, y1, x2, y2 } = req.body ?? {};
  if ([x1, y1, x2, y2].some((v) => typeof v !== 'number')) {
    return res.status(400).json({ error: 'x1, y1, x2, y2 required as numbers' });
  }

  const info = db.prepare(
    'INSERT INTO map_walls (map_id, x1, y1, x2, y2) VALUES (?, ?, ?, ?, ?)'
  ).run(mapId, x1, y1, x2, y2);
  const wall = db.prepare('SELECT * FROM map_walls WHERE id = ?').get(info.lastInsertRowid) as WallRow;

  broadcastFiltered(campaign.id, 'wall:created', wall, () => true);
  emitFog(campaign.id, mapId);

  res.status(201).json({ wall });
});

// DELETE /api/maps/:id/walls/:wallId
router.delete('/:id/walls/:wallId', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const wallId = Number(req.params.wallId);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  if (!isDmOrAdmin) return res.status(403).json({ error: 'DM access required' });

  db.prepare('DELETE FROM map_walls WHERE id = ? AND map_id = ?').run(wallId, mapId);
  broadcastFiltered(campaign.id, 'wall:deleted', { wall_id: wallId }, () => true);
  emitFog(campaign.id, mapId);

  res.json({ ok: true });
});

// DELETE /api/maps/:id/walls — clear all
router.delete('/:id/walls', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  const isDmOrAdmin = req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
  if (!isDmOrAdmin) return res.status(403).json({ error: 'DM access required' });

  db.prepare('DELETE FROM map_walls WHERE map_id = ?').run(mapId);
  broadcastFiltered(campaign.id, 'wall:cleared', {}, () => true);
  emitFog(campaign.id, mapId);

  res.json({ ok: true });
});

export default router;
