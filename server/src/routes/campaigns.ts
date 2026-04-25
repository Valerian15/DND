import { randomBytes } from 'crypto';
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';

const router = Router();
router.use(requireAuth);

// --- Types ---

interface CampaignRow {
  id: number;
  dm_id: number;
  name: string;
  description: string;
  settings: string;
  invite_code: string;
  created_at: number;
  updated_at: number;
}

interface CampaignSettings {
  rolled_hp: boolean;
}

const DEFAULT_SETTINGS: CampaignSettings = { rolled_hp: false };

function hydrateSettings(raw: string): CampaignSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// --- Helpers ---

function generateInviteCode(): string {
  // Excludes visually ambiguous chars (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = randomBytes(6);
  for (const b of bytes) code += chars[b % chars.length];
  return code;
}

function freshInviteCode(): string {
  let code = generateInviteCode();
  while (db.prepare('SELECT id FROM campaigns WHERE invite_code = ?').get(code)) {
    code = generateInviteCode();
  }
  return code;
}

function isDmOrAdmin(req: AuthRequest, campaign: CampaignRow): boolean {
  return req.user!.role === 'admin' || campaign.dm_id === req.user!.id;
}

function userCanSeeCampaign(req: AuthRequest, campaignId: number, dmId: number): boolean {
  if (req.user!.role === 'admin') return true;
  if (dmId === req.user!.id) return true;
  const row = db.prepare(`
    SELECT cm.campaign_id FROM campaign_members cm
    JOIN characters c ON c.id = cm.character_id
    WHERE cm.campaign_id = ? AND c.owner_id = ?
    LIMIT 1
  `).get(campaignId, req.user!.id);
  return !!row;
}

// --- Routes ---

// List campaigns visible to the current user
router.get('/', (req: AuthRequest, res) => {
  const user = req.user!;

  type ListRow = CampaignRow & { dm_username: string; member_count: number };
  let rows: ListRow[];

  if (user.role === 'admin') {
    rows = db.prepare(`
      SELECT c.*, u.username AS dm_username,
        (SELECT COUNT(*) FROM campaign_members cm WHERE cm.campaign_id = c.id) AS member_count
      FROM campaigns c
      JOIN users u ON u.id = c.dm_id
      ORDER BY c.updated_at DESC
    `).all() as ListRow[];
  } else {
    rows = db.prepare(`
      SELECT DISTINCT c.*, u.username AS dm_username,
        (SELECT COUNT(*) FROM campaign_members cm WHERE cm.campaign_id = c.id) AS member_count
      FROM campaigns c
      JOIN users u ON u.id = c.dm_id
      WHERE c.dm_id = ?
        OR c.id IN (
          SELECT cm.campaign_id FROM campaign_members cm
          JOIN characters ch ON ch.id = cm.character_id
          WHERE ch.owner_id = ?
        )
      ORDER BY c.updated_at DESC
    `).all(user.id, user.id) as ListRow[];
  }

  res.json({
    campaigns: rows.map((r) => ({ ...r, settings: hydrateSettings(r.settings) })),
  });
});

// Join a campaign via invite code — static path must come before /:id
router.post('/join', (req: AuthRequest, res) => {
  const { invite_code, character_id } = req.body ?? {};

  if (typeof invite_code !== 'string' || invite_code.trim().length === 0) {
    return res.status(400).json({ error: 'invite_code is required' });
  }
  const charId = Number(character_id);
  if (!Number.isInteger(charId) || charId <= 0) {
    return res.status(400).json({ error: 'character_id must be a positive integer' });
  }

  const campaign = db.prepare('SELECT * FROM campaigns WHERE invite_code = ?')
    .get(invite_code.trim().toUpperCase()) as CampaignRow | undefined;
  if (!campaign) return res.status(404).json({ error: 'Invalid invite code' });

  if (campaign.dm_id === req.user!.id) {
    return res.status(400).json({ error: 'You are the DM of this campaign' });
  }

  const character = db.prepare('SELECT id, owner_id FROM characters WHERE id = ?')
    .get(charId) as { id: number; owner_id: number } | undefined;
  if (!character) return res.status(404).json({ error: 'Character not found' });
  if (character.owner_id !== req.user!.id && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Not your character' });
  }

  const existingMembership = db.prepare('SELECT campaign_id FROM campaign_members WHERE character_id = ?')
    .get(charId) as { campaign_id: number } | undefined;
  if (existingMembership) {
    return res.status(409).json({ error: 'Character is already in a campaign' });
  }

  db.prepare('INSERT INTO campaign_members (campaign_id, character_id) VALUES (?, ?)').run(campaign.id, charId);
  res.status(201).json({ ok: true, campaign_id: campaign.id });
});

// Get one campaign with its member list
router.get('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  const row = db.prepare(`
    SELECT c.*, u.username AS dm_username
    FROM campaigns c
    JOIN users u ON u.id = c.dm_id
    WHERE c.id = ?
  `).get(id) as (CampaignRow & { dm_username: string }) | undefined;

  if (!row) return res.status(404).json({ error: 'Campaign not found' });
  if (!userCanSeeCampaign(req, id, row.dm_id)) {
    return res.status(403).json({ error: 'Not a member of this campaign' });
  }

  const members = db.prepare(`
    SELECT cm.character_id, cm.joined_at,
      ch.name AS character_name, ch.class_slug, ch.level, ch.portrait_url, ch.owner_id,
      u.username AS owner_username
    FROM campaign_members cm
    JOIN characters ch ON ch.id = cm.character_id
    JOIN users u ON u.id = ch.owner_id
    WHERE cm.campaign_id = ?
    ORDER BY cm.joined_at ASC
  `).all(id);

  res.json({
    campaign: { ...row, settings: hydrateSettings(row.settings), members },
  });
});

// Create a campaign — caller becomes DM
router.post('/', (req: AuthRequest, res) => {
  const { name, description } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  const invite_code = freshInviteCode();
  const info = db.prepare(
    'INSERT INTO campaigns (dm_id, name, description, invite_code) VALUES (?, ?, ?, ?)'
  ).run(req.user!.id, name.trim(), typeof description === 'string' ? description.trim() : '', invite_code);

  const created = db.prepare(`
    SELECT c.*, u.username AS dm_username
    FROM campaigns c JOIN users u ON u.id = c.dm_id
    WHERE c.id = ?
  `).get(info.lastInsertRowid) as CampaignRow & { dm_username: string };

  res.status(201).json({
    campaign: { ...created, settings: hydrateSettings(created.settings), members: [] },
  });
});

// Update name / description / settings (DM or admin)
router.patch('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as CampaignRow | undefined;
  if (!row) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, row)) return res.status(403).json({ error: 'DM access required' });

  const { name, description, settings } = req.body ?? {};
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (typeof name === 'string' && name.trim().length > 0) {
    sets.push('name = ?');
    values.push(name.trim());
  }
  if (typeof description === 'string') {
    sets.push('description = ?');
    values.push(description.trim());
  }
  if (settings !== null && typeof settings === 'object' && !Array.isArray(settings)) {
    // Merge incoming settings over current; only known keys survive
    const merged: CampaignSettings = {
      ...hydrateSettings(row.settings),
      ...(typeof settings.rolled_hp === 'boolean' ? { rolled_hp: settings.rolled_hp } : {}),
    };
    sets.push('settings = ?');
    values.push(JSON.stringify(merged));
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  sets.push("updated_at = strftime('%s', 'now')");
  values.push(id);

  db.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare(`
    SELECT c.*, u.username AS dm_username
    FROM campaigns c JOIN users u ON u.id = c.dm_id
    WHERE c.id = ?
  `).get(id) as CampaignRow & { dm_username: string };

  res.json({ campaign: { ...updated, settings: hydrateSettings(updated.settings) } });
});

// Delete a campaign — cascade removes all members automatically
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as CampaignRow | undefined;
  if (!row) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, row)) return res.status(403).json({ error: 'DM access required' });

  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Remove a member — DM/admin can remove anyone; a player can remove their own character
router.delete('/:id/members/:characterId', (req: AuthRequest, res) => {
  const campaignId = Number(req.params.id);
  const characterId = Number(req.params.characterId);

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as CampaignRow | undefined;
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const character = db.prepare('SELECT id, owner_id FROM characters WHERE id = ?')
    .get(characterId) as { id: number; owner_id: number } | undefined;
  if (!character) return res.status(404).json({ error: 'Character not found' });

  const isOwner = character.owner_id === req.user!.id;
  if (!isDmOrAdmin(req, campaign) && !isOwner) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const member = db.prepare('SELECT campaign_id FROM campaign_members WHERE campaign_id = ? AND character_id = ?')
    .get(campaignId, characterId);
  if (!member) return res.status(404).json({ error: 'Character is not in this campaign' });

  db.prepare('DELETE FROM campaign_members WHERE campaign_id = ? AND character_id = ?').run(campaignId, characterId);
  res.json({ ok: true });
});

export default router;
