import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

interface NoteRow {
  id: number;
  campaign_id: number;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
}

function isDm(req: AuthRequest, campaignId: number): boolean {
  const campaign = db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(campaignId) as { dm_id: number } | undefined;
  if (!campaign) return false;
  return req.user!.role === 'admin' || req.user!.id === campaign.dm_id;
}

router.get('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  if (!isDm(req, campaignId)) return res.status(403).json({ error: 'DM access required' });
  const notes = db.prepare('SELECT * FROM campaign_notes WHERE campaign_id = ? ORDER BY updated_at DESC').all(campaignId) as NoteRow[];
  res.json({ notes });
});

router.post('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  if (!isDm(req, campaignId)) return res.status(403).json({ error: 'DM access required' });
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() || 'Note' : 'Note';
  const body = typeof req.body?.body === 'string' ? req.body.body : '';
  const info = db.prepare('INSERT INTO campaign_notes (campaign_id, title, body) VALUES (?, ?, ?)').run(campaignId, title, body);
  const note = db.prepare('SELECT * FROM campaign_notes WHERE id = ?').get(info.lastInsertRowid) as NoteRow;
  res.status(201).json({ note });
});

router.patch('/:nid', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  if (!isDm(req, campaignId)) return res.status(403).json({ error: 'DM access required' });
  const nid = Number(req.params.nid);
  const note = db.prepare('SELECT * FROM campaign_notes WHERE id = ? AND campaign_id = ?').get(nid, campaignId) as NoteRow | undefined;
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() || note.title : note.title;
  const body = typeof req.body?.body === 'string' ? req.body.body : note.body;
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE campaign_notes SET title = ?, body = ?, updated_at = ? WHERE id = ?').run(title, body, now, nid);
  const updated = db.prepare('SELECT * FROM campaign_notes WHERE id = ?').get(nid) as NoteRow;
  res.json({ note: updated });
});

router.delete('/:nid', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  if (!isDm(req, campaignId)) return res.status(403).json({ error: 'DM access required' });
  const nid = Number(req.params.nid);
  db.prepare('DELETE FROM campaign_notes WHERE id = ? AND campaign_id = ?').run(nid, campaignId);
  res.json({ ok: true });
});

export default router;
