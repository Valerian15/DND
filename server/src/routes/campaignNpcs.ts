import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../auth/index.js';

const router = Router();
router.use(requireAuth);

const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const VALID_SAVES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

interface NpcRow {
  id: number;
  campaign_id: number;
  category_id: number | null;
  label: string;
  portrait_url: string | null;
  size: string;
  hp_max: number;
  ac: number;
  speed: string;
  abilities: string;
  saving_throws: string;
  attacks: string;
  traits: string;
  resistances: string;
  vulnerabilities: string;
  immunities: string;
  notes: string;
  dm_notes: string;
  spells: string;
  spell_slots: string;
  spell_save_dc: number | null;
  spell_attack_bonus: number | null;
  created_at: number;
}

// Hydrate NPC. dm_notes is stripped for non-DM/non-admin viewers.
function hydrateNpc(row: NpcRow, viewerIsDm: boolean) {
  const out: Record<string, unknown> = {
    ...row,
    abilities: JSON.parse(row.abilities || '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'),
    saving_throws: JSON.parse(row.saving_throws || '[]'),
    attacks: JSON.parse(row.attacks || '[]'),
    traits: JSON.parse(row.traits || '[]'),
    resistances: JSON.parse(row.resistances || '[]'),
    vulnerabilities: JSON.parse(row.vulnerabilities || '[]'),
    immunities: JSON.parse(row.immunities || '[]'),
    spells: JSON.parse(row.spells || '[]'),
    spell_slots: JSON.parse(row.spell_slots || '{}'),
  };
  if (!viewerIsDm) delete out.dm_notes;
  return out;
}

function getDm(campaignId: number): { dm_id: number } | undefined {
  return db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(campaignId) as { dm_id: number } | undefined;
}

function isDmOrAdmin(req: AuthRequest, dmId: number) {
  return req.user!.role === 'admin' || req.user!.id === dmId;
}

router.get('/', (req: AuthRequest, res) => {
  const campaignId = Number(req.query.campaign_id);
  if (!campaignId) return res.status(400).json({ error: 'campaign_id required' });
  const campaign = getDm(campaignId);
  const viewerIsDm = !!campaign && isDmOrAdmin(req, campaign.dm_id);
  const rows = db.prepare('SELECT * FROM campaign_npcs WHERE campaign_id = ? ORDER BY label ASC').all(campaignId) as NpcRow[];
  res.json({ npcs: rows.map((r) => hydrateNpc(r, viewerIsDm)) });
});

router.post('/', (req: AuthRequest, res) => {
  const { campaign_id, category_id, label, portrait_url, size, hp_max, ac, speed, abilities, saving_throws, attacks, traits, resistances, vulnerabilities, immunities, notes, dm_notes, spells, spell_slots, spell_save_dc, spell_attack_bonus } = req.body ?? {};
  const campaignId = Number(campaign_id);
  if (!campaignId) return res.status(400).json({ error: 'campaign_id required' });
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label required' });

  const campaign = getDm(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const catId = Number(category_id) || null;
  const sizeVal = SIZES.includes(size) ? size : 'medium';
  const hpVal = Math.max(1, Number(hp_max) || 10);
  const acVal = Math.max(1, Number(ac) || 10);
  const speedVal = typeof speed === 'string' && speed.trim() ? speed.trim() : '30 ft.';
  const abilitiesVal = abilities && typeof abilities === 'object' ? JSON.stringify(abilities) : '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}';
  const savesVal = Array.isArray(saving_throws) ? JSON.stringify(saving_throws.filter((s: unknown) => VALID_SAVES.includes(s as string))) : '[]';
  const attacksVal = Array.isArray(attacks) ? JSON.stringify(attacks) : '[]';
  const traitsVal = Array.isArray(traits) ? JSON.stringify(traits) : '[]';
  const resVal = Array.isArray(resistances) ? JSON.stringify(resistances.filter((s: unknown): s is string => typeof s === 'string')) : '[]';
  const vulnVal = Array.isArray(vulnerabilities) ? JSON.stringify(vulnerabilities.filter((s: unknown): s is string => typeof s === 'string')) : '[]';
  const immVal = Array.isArray(immunities) ? JSON.stringify(immunities.filter((s: unknown): s is string => typeof s === 'string')) : '[]';
  const notesVal = typeof notes === 'string' ? notes.trim() : '';
  const dmNotesVal = typeof dm_notes === 'string' ? dm_notes.trim() : '';
  const portraitVal = typeof portrait_url === 'string' && portrait_url.trim() ? portrait_url.trim() : null;
  const spellsVal = Array.isArray(spells) ? JSON.stringify(spells.filter((s: unknown): s is string => typeof s === 'string')) : '[]';
  const spellSlotsVal = spell_slots && typeof spell_slots === 'object' ? JSON.stringify(spell_slots) : '{}';
  const dcVal = Number.isInteger(Number(spell_save_dc)) ? Number(spell_save_dc) : null;
  const atkVal = Number.isInteger(Number(spell_attack_bonus)) ? Number(spell_attack_bonus) : null;

  const info = db.prepare(
    'INSERT INTO campaign_npcs (campaign_id, category_id, label, portrait_url, size, hp_max, ac, speed, abilities, saving_throws, attacks, traits, resistances, vulnerabilities, immunities, notes, dm_notes, spells, spell_slots, spell_save_dc, spell_attack_bonus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(campaignId, catId, label.trim(), portraitVal, sizeVal, hpVal, acVal, speedVal, abilitiesVal, savesVal, attacksVal, traitsVal, resVal, vulnVal, immVal, notesVal, dmNotesVal, spellsVal, spellSlotsVal, dcVal, atkVal);

  const row = db.prepare('SELECT * FROM campaign_npcs WHERE id = ?').get(info.lastInsertRowid) as NpcRow;
  res.status(201).json({ npc: hydrateNpc(row, true) });
});

router.patch('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM campaign_npcs WHERE id = ?').get(id) as NpcRow | undefined;
  if (!row) return res.status(404).json({ error: 'NPC not found' });

  const campaign = getDm(row.campaign_id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!isDmOrAdmin(req, campaign.dm_id)) return res.status(403).json({ error: 'DM access required' });

  const { category_id, label, portrait_url, size, hp_max, ac, speed, abilities, saving_throws, attacks, traits, resistances, vulnerabilities, immunities, notes, dm_notes, spells, spell_slots, spell_save_dc, spell_attack_bonus } = req.body ?? {};
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (category_id !== undefined) { sets.push('category_id = ?'); values.push(Number(category_id) || null); }
  if (typeof label === 'string' && label.trim()) { sets.push('label = ?'); values.push(label.trim()); }
  if (portrait_url !== undefined) { sets.push('portrait_url = ?'); values.push(typeof portrait_url === 'string' && portrait_url.trim() ? portrait_url.trim() : null); }
  if (SIZES.includes(size)) { sets.push('size = ?'); values.push(size); }
  if (Number(hp_max) > 0) { sets.push('hp_max = ?'); values.push(Math.max(1, Number(hp_max))); }
  if (Number(ac) > 0) { sets.push('ac = ?'); values.push(Math.max(1, Number(ac))); }
  if (typeof speed === 'string') { sets.push('speed = ?'); values.push(speed.trim()); }
  if (abilities && typeof abilities === 'object') { sets.push('abilities = ?'); values.push(JSON.stringify(abilities)); }
  if (Array.isArray(saving_throws)) { sets.push('saving_throws = ?'); values.push(JSON.stringify(saving_throws.filter((s: unknown) => VALID_SAVES.includes(s as string)))); }
  if (Array.isArray(attacks)) { sets.push('attacks = ?'); values.push(JSON.stringify(attacks)); }
  if (Array.isArray(traits)) { sets.push('traits = ?'); values.push(JSON.stringify(traits)); }
  if (Array.isArray(resistances)) { sets.push('resistances = ?'); values.push(JSON.stringify(resistances.filter((s: unknown): s is string => typeof s === 'string'))); }
  if (Array.isArray(vulnerabilities)) { sets.push('vulnerabilities = ?'); values.push(JSON.stringify(vulnerabilities.filter((s: unknown): s is string => typeof s === 'string'))); }
  if (Array.isArray(immunities)) { sets.push('immunities = ?'); values.push(JSON.stringify(immunities.filter((s: unknown): s is string => typeof s === 'string'))); }
  if (typeof notes === 'string') { sets.push('notes = ?'); values.push(notes.trim()); }
  if (typeof dm_notes === 'string') { sets.push('dm_notes = ?'); values.push(dm_notes.trim()); }
  if (Array.isArray(spells)) { sets.push('spells = ?'); values.push(JSON.stringify(spells.filter((s: unknown): s is string => typeof s === 'string'))); }
  if (spell_slots && typeof spell_slots === 'object') { sets.push('spell_slots = ?'); values.push(JSON.stringify(spell_slots)); }
  if (spell_save_dc !== undefined) { sets.push('spell_save_dc = ?'); values.push(Number.isInteger(Number(spell_save_dc)) ? Number(spell_save_dc) : null); }
  if (spell_attack_bonus !== undefined) { sets.push('spell_attack_bonus = ?'); values.push(Number.isInteger(Number(spell_attack_bonus)) ? Number(spell_attack_bonus) : null); }

  if (!sets.length) return res.status(400).json({ error: 'No valid fields' });
  values.push(id);
  db.prepare(`UPDATE campaign_npcs SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM campaign_npcs WHERE id = ?').get(id) as NpcRow;
  res.json({ npc: hydrateNpc(updated, true) });
});

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
