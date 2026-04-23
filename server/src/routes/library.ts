import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/index.js';

const router = Router();
router.use(requireAuth);

const ALLOWED = new Set([
  'races',
  'classes',
  'subclasses',
  'backgrounds',
  'spells',
  'items',
  'monsters',
  'feats',
  'conditions',
]);

router.get('/:type', (req, res) => {
  const type = req.params.type;
  if (!ALLOWED.has(type)) {
    return res.status(400).json({ error: 'Unknown content type' });
  }

  const rows = db.prepare(`SELECT id, slug, name, source FROM ${type} ORDER BY name`).all();
  res.json({ items: rows, count: rows.length });
});

router.get('/:type/:slug', (req, res) => {
  const type = req.params.type;
  if (!ALLOWED.has(type)) {
    return res.status(400).json({ error: 'Unknown content type' });
  }
  const row = db
    .prepare(`SELECT * FROM ${type} WHERE slug = ?`)
    .get(req.params.slug) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });

  res.json({ ...row, data: JSON.parse(row.data) });
});

export default router;
