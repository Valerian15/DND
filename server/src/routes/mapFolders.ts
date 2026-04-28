import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

interface FolderRow {
  id: number;
  campaign_id: number;
  name: string;
  parent_id: number | null;
  created_at: number;
}

function getCampaignDm(campaignId: number): number | null {
  const row = db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(campaignId) as { dm_id: number } | undefined;
  return row?.dm_id ?? null;
}

function isDmOrAdmin(req: AuthRequest, dmId: number): boolean {
  return req.user!.role === 'admin' || req.user!.id === dmId;
}

// List all folders for a campaign (flat; client builds tree)
router.get('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const dmId = getCampaignDm(campaignId);
  if (dmId === null) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, dmId)) return res.status(403).json({ error: 'DM access required' });

  const rows = db.prepare(
    'SELECT * FROM map_folders WHERE campaign_id = ? ORDER BY parent_id ASC, name ASC'
  ).all(campaignId) as FolderRow[];
  res.json({ folders: rows });
});

// Create a folder
router.post('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const dmId = getCampaignDm(campaignId);
  if (dmId === null) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, dmId)) return res.status(403).json({ error: 'DM access required' });

  const { name, parent_id } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name required' });
  }

  const parentId = parent_id != null && Number.isInteger(Number(parent_id)) && Number(parent_id) > 0
    ? Number(parent_id) : null;

  const info = db.prepare(
    'INSERT INTO map_folders (campaign_id, name, parent_id) VALUES (?, ?, ?)'
  ).run(campaignId, name.trim().slice(0, 100), parentId);

  const row = db.prepare('SELECT * FROM map_folders WHERE id = ?').get(info.lastInsertRowid) as FolderRow;
  res.status(201).json({ folder: row });
});

// Rename a folder
router.patch('/:fid', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const folderId = Number(req.params.fid);

  const dmId = getCampaignDm(campaignId);
  if (dmId === null) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, dmId)) return res.status(403).json({ error: 'DM access required' });

  const folder = db.prepare('SELECT * FROM map_folders WHERE id = ? AND campaign_id = ?')
    .get(folderId, campaignId) as FolderRow | undefined;
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const { name, parent_id } = req.body ?? {};
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (typeof name === 'string' && name.trim().length > 0) {
    sets.push('name = ?'); values.push(name.trim().slice(0, 100));
  }
  if ('parent_id' in (req.body ?? {})) {
    const parentId = parent_id != null && Number.isInteger(Number(parent_id)) && Number(parent_id) > 0
      ? Number(parent_id) : null;
    sets.push('parent_id = ?'); values.push(parentId);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(folderId);
  db.prepare(`UPDATE map_folders SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM map_folders WHERE id = ?').get(folderId) as FolderRow;
  res.json({ folder: updated });
});

// Delete a folder
// ?deleteContents=true  → cascade delete all maps inside (recursively)
// ?deleteContents=false → move contained maps to this folder's parent (or null)
router.delete('/:fid', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const folderId = Number(req.params.fid);

  const dmId = getCampaignDm(campaignId);
  if (dmId === null) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, dmId)) return res.status(403).json({ error: 'DM access required' });

  const folder = db.prepare('SELECT * FROM map_folders WHERE id = ? AND campaign_id = ?')
    .get(folderId, campaignId) as FolderRow | undefined;
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const deleteContents = req.query.deleteContents === 'true';

  // Collect all descendant folder IDs recursively
  function collectDescendants(id: number): number[] {
    const children = db.prepare('SELECT id FROM map_folders WHERE parent_id = ?')
      .all(id) as { id: number }[];
    const ids: number[] = [id];
    for (const child of children) {
      ids.push(...collectDescendants(child.id));
    }
    return ids;
  }

  const allFolderIds = collectDescendants(folderId);

  db.transaction(() => {
    if (deleteContents) {
      // Delete all maps in those folders
      for (const fid of allFolderIds) {
        db.prepare('DELETE FROM maps WHERE folder_id = ? AND campaign_id = ?').run(fid, campaignId);
      }
    } else {
      // Move maps in affected folders to this folder's parent
      for (const fid of allFolderIds) {
        db.prepare('UPDATE maps SET folder_id = ? WHERE folder_id = ? AND campaign_id = ?')
          .run(folder.parent_id, fid, campaignId);
      }
      // Re-parent direct child folders to this folder's parent
      db.prepare('UPDATE map_folders SET parent_id = ? WHERE parent_id = ? AND campaign_id = ?')
        .run(folder.parent_id, folderId, campaignId);
    }
    // Delete all descendant folders then the folder itself
    for (const fid of allFolderIds.slice().reverse()) {
      db.prepare('DELETE FROM map_folders WHERE id = ?').run(fid);
    }
  })();

  res.json({ ok: true });
});

export default router;
