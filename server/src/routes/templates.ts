import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';
import { broadcastFiltered } from '../io.js';

const router = Router();
router.use(requireAuth);

const VALID_SHAPES = ['circle', 'square', 'cone', 'line'];

interface TemplateRow {
  id: number; map_id: number;
  shape: string;
  origin_x: number; origin_y: number;
  end_x: number; end_y: number;
  color: string;
  created_at: number;
}

function getMapCampaign(mapId: number): { id: number; dm_id: number } | undefined {
  return db.prepare(
    'SELECT c.id, c.dm_id FROM campaigns c JOIN maps m ON m.campaign_id = c.id WHERE m.id = ?'
  ).get(mapId) as { id: number; dm_id: number } | undefined;
}

// GET /api/maps/:id/templates
router.get('/:id/templates', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const templates = db.prepare(
    'SELECT * FROM map_templates WHERE map_id = ? ORDER BY id ASC'
  ).all(mapId) as TemplateRow[];
  res.json({ templates });
});

// POST /api/maps/:id/templates
router.post('/:id/templates', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  const { shape, origin_x, origin_y, end_x, end_y, color } = req.body ?? {};
  if (!VALID_SHAPES.includes(shape)) return res.status(400).json({ error: 'invalid shape' });
  if ([origin_x, origin_y, end_x, end_y].some((v) => typeof v !== 'number')) {
    return res.status(400).json({ error: 'origin/end coordinates required as numbers' });
  }
  const colorVal = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ff6b6b';

  const info = db.prepare(
    'INSERT INTO map_templates (map_id, shape, origin_x, origin_y, end_x, end_y, color) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(mapId, shape, origin_x, origin_y, end_x, end_y, colorVal);
  const template = db.prepare('SELECT * FROM map_templates WHERE id = ?').get(info.lastInsertRowid) as TemplateRow;

  broadcastFiltered(campaign.id, 'template:created', template, () => true);
  res.status(201).json({ template });
});

// DELETE /api/maps/:id/templates/:templateId
router.delete('/:id/templates/:templateId', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const templateId = Number(req.params.templateId);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  db.prepare('DELETE FROM map_templates WHERE id = ? AND map_id = ?').run(templateId, mapId);
  broadcastFiltered(campaign.id, 'template:deleted', { template_id: templateId }, () => true);
  res.json({ ok: true });
});

// DELETE /api/maps/:id/templates — clear all
router.delete('/:id/templates', (req: AuthRequest, res) => {
  const mapId = Number(req.params.id);
  const campaign = getMapCampaign(mapId);
  if (!campaign) return res.status(404).json({ error: 'Map not found' });

  db.prepare('DELETE FROM map_templates WHERE map_id = ?').run(mapId);
  broadcastFiltered(campaign.id, 'template:cleared', {}, () => true);
  res.json({ ok: true });
});

export default router;
