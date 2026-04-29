import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';
import { broadcastFiltered } from '../io.js';

const router = Router();
router.use(requireAuth);

interface DrawingRow {
  id: number; map_id: number;
  path: string;
  color: string;
  stroke_width: number;
  created_at: number;
}

interface HydratedDrawing extends Omit<DrawingRow, 'path'> {
  path: [number, number][];
}

function hydrate(row: DrawingRow): HydratedDrawing {
  return { ...row, path: JSON.parse(row.path) };
}

function getMapCampaign(mapId: number): { id: number; dm_id: number } | undefined {
  return db.prepare(
    'SELECT c.id, c.dm_id FROM campaigns c JOIN maps m ON m.campaign_id = c.id WHERE m.id = ?'
  ).get(mapId) as { id: number; dm_id: number } | undefined;
}

router.get('/:id/drawings', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const rows = db.prepare(
    'SELECT * FROM map_drawings WHERE map_id = ? ORDER BY id ASC'
  ).all(mapId) as DrawingRow[];
  res.json({ drawings: rows.map(hydrate) });
});

router.post('/:id/drawings', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  const { path, color, stroke_width } = req.body ?? {};
  if (!Array.isArray(path) || path.length < 2) {
    return res.status(400).json({ error: 'path must be an array with at least 2 points' });
  }
  // Validate each point is [number, number]
  const validPath = path.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number');
  if (!validPath) return res.status(400).json({ error: 'invalid path points' });

  const colorVal = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ffeb3b';
  const widthVal = Math.min(20, Math.max(1, Number(stroke_width) || 3));

  const info = db.prepare(
    'INSERT INTO map_drawings (map_id, path, color, stroke_width) VALUES (?, ?, ?, ?)'
  ).run(mapId, JSON.stringify(path), colorVal, widthVal);
  const row = db.prepare('SELECT * FROM map_drawings WHERE id = ?').get(info.lastInsertRowid) as DrawingRow;
  const drawing = hydrate(row);

  broadcastFiltered(campaign.id, 'drawing:created', drawing, () => true);
  res.status(201).json({ drawing });
});

router.delete('/:id/drawings/:drawingId', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const drawingId = Number(req.params.drawingId);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  db.prepare('DELETE FROM map_drawings WHERE id = ? AND map_id = ?').run(drawingId, mapId);
  broadcastFiltered(campaign.id, 'drawing:deleted', { drawing_id: drawingId }, () => true);
  res.json({ ok: true });
});

router.delete('/:id/drawings', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  db.prepare('DELETE FROM map_drawings WHERE map_id = ?').run(mapId);
  broadcastFiltered(campaign.id, 'drawing:cleared', {}, () => true);
  res.json({ ok: true });
});

export default router;
