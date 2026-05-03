import { Router, type Response } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireAdmin } from '../auth/index.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_TYPES = [
  'races',
  'classes',
  'subclasses',
  'backgrounds',
  'spells',
  'items',
  'monsters',
  'feats',
  'conditions',
  'weapons',
] as const;

type LibraryType = (typeof ALLOWED_TYPES)[number];

interface LibraryRow {
  id: number;
  slug: string;
  name: string;
  data: string;
  source: string;
}

interface CreateLibraryBody {
  slug?: unknown;
  name?: unknown;
  data?: unknown;
  source?: unknown;
}

interface UpdateLibraryBody {
  name?: unknown;
  data?: unknown;
}

function isLibraryType(type: string): type is LibraryType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getRequiredNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function getLibraryType(reqType: string | string[] | undefined, res: Response): LibraryType | null {
  const type = getParam(reqType);
  if (!type || !isLibraryType(type)) {
    res.status(400).json({ error: 'Unknown content type' });
    return null;
  }
  return type;
}

router.get('/:type', (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;

  // Each type returns the scalars LibraryPage needs to render rich cards (CR badges, spell level
  // chips, rarity tags, etc.) without a per-card detail fetch. JSON-extract pulls fields out of
  // the seeded `data` blob for properties that don't have their own column.

  if (type === 'subclasses') {
    const klass = typeof req.query.class === 'string' ? req.query.class : null;
    const rows = klass
      ? db.prepare('SELECT id, slug, name, class_slug, source FROM subclasses WHERE class_slug = ? ORDER BY name').all(klass)
      : db.prepare('SELECT id, slug, name, class_slug, source FROM subclasses ORDER BY name').all();
    return res.json({ items: rows, count: rows.length });
  }

  if (type === 'weapons') {
    const rows = db
      .prepare('SELECT id, slug, name, category, weapon_type, source FROM weapons ORDER BY category, weapon_type, name')
      .all();
    return res.json({ items: rows, count: rows.length });
  }

  if (type === 'monsters') {
    const rows = db.prepare(`
      SELECT id, slug, name, cr,
        type AS monster_type,
        CAST(COALESCE(json_extract(data, '$.hit_points'), 0) AS INTEGER) AS hp_max,
        CAST(COALESCE(json_extract(data, '$.armor_class'), 0) AS INTEGER) AS ac,
        json_extract(data, '$.size') AS size,
        json_extract(data, '$.img_main') AS image,
        source
      FROM monsters ORDER BY name
    `).all();
    return res.json({ items: rows, count: rows.length });
  }

  if (type === 'spells') {
    const rows = db.prepare(`
      SELECT id, slug, name, level, school,
        json_extract(data, '$.casting_time') AS casting_time,
        json_extract(data, '$.range') AS range,
        json_extract(data, '$.concentration') AS concentration,
        json_extract(data, '$.ritual') AS ritual,
        json_extract(data, '$.dnd_class') AS classes,
        source
      FROM spells ORDER BY level, name
    `).all();
    return res.json({ items: rows, count: rows.length });
  }

  if (type === 'items') {
    const rows = db.prepare(`
      SELECT id, slug, name, item_type, rarity,
        json_extract(data, '$.requires_attunement') AS requires_attunement,
        json_extract(data, '$.category') AS category,
        json_extract(data, '$.base_ac') AS base_ac,
        source
      FROM items ORDER BY name
    `).all();
    return res.json({ items: rows, count: rows.length });
  }

  if (type === 'classes') {
    const rows = db.prepare(`
      SELECT id, slug, name,
        json_extract(data, '$.hit_die') AS hit_die,
        json_extract(data, '$.hd') AS hd_alt,
        json_extract(data, '$.spellcasting_ability') AS spellcasting_ability,
        source
      FROM classes ORDER BY name
    `).all();
    return res.json({ items: rows, count: rows.length });
  }

  if (type === 'feats') {
    const rows = db.prepare(`
      SELECT id, slug, name,
        json_extract(data, '$.prerequisite') AS prerequisite,
        source
      FROM feats ORDER BY name
    `).all();
    return res.json({ items: rows, count: rows.length });
  }

  if (type === 'races') {
    // Open5e nests speed under .speed.walk (object) and stores a clean enum in .size_raw,
    // separate from the long markdown blurb in .size. Pull the clean fields.
    const rows = db.prepare(`
      SELECT id, slug, name,
        COALESCE(json_extract(data, '$.size_raw'), json_extract(data, '$.size')) AS size,
        json_extract(data, '$.speed.walk') AS speed,
        source
      FROM races ORDER BY name
    `).all();
    return res.json({ items: rows, count: rows.length });
  }

  const rows = db.prepare(`SELECT id, slug, name, source FROM ${type} ORDER BY name`).all();
  res.json({ items: rows, count: rows.length });
});

router.get('/:type/:slug', (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;
  const slug = getParam(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const row = db
    .prepare(`SELECT * FROM ${type} WHERE slug = ?`)
    .get(slug) as LibraryRow | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });

  res.json({ ...row, data: JSON.parse(row.data) });
});

router.post('/:type', requireAdmin, (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;

  const body = (req.body ?? {}) as CreateLibraryBody;
  const slug = optionalString(body.slug);
  const name = optionalString(body.name);
  const requestedSource = optionalString(body.source);

  if (requestedSource === 'srd-2014') {
    return res.status(403).json({ error: 'Cannot create rows with source srd-2014; reserved for SRD seed' });
  }

  const source = requestedSource ?? 'homebrew';

  if (!slug || !name || !isPlainObject(body.data)) {
    return res.status(400).json({ error: 'slug, name, and data object are required' });
  }

  const existing = db.prepare(`SELECT id FROM ${type} WHERE slug = ?`).get(slug);
  if (existing) {
    return res.status(409).json({ error: 'Slug already exists' });
  }

  const data = body.data;
  const dataJson = JSON.stringify(data);

  if (type === 'subclasses') {
    const classSlug = optionalString(data.class_slug);
    if (!classSlug) {
      return res.status(400).json({ error: 'Subclasses require data.class_slug' });
    }
    db.prepare('INSERT INTO subclasses (slug, name, class_slug, data, source) VALUES (?, ?, ?, ?, ?)')
      .run(slug, name, classSlug, dataJson, source);
  } else if (type === 'spells') {
    const level = getRequiredNumber(data.level_int ?? data.level);
    if (level === null) {
      return res.status(400).json({ error: 'Spells require numeric data.level or data.level_int' });
    }
    const school = optionalString(data.school);
    db.prepare('INSERT INTO spells (slug, name, level, school, data, source) VALUES (?, ?, ?, ?, ?, ?)')
      .run(slug, name, level, school, dataJson, source);
  } else if (type === 'items') {
    const itemType = optionalString(data.item_type ?? data.type);
    const rarity = optionalString(data.rarity);
    db.prepare('INSERT INTO items (slug, name, item_type, rarity, data, source) VALUES (?, ?, ?, ?, ?, ?)')
      .run(slug, name, itemType, rarity, dataJson, source);
  } else if (type === 'monsters') {
    const cr = getRequiredNumber(data.cr);
    const monsterType = optionalString(data.type);
    db.prepare('INSERT INTO monsters (slug, name, cr, type, data, source) VALUES (?, ?, ?, ?, ?, ?)')
      .run(slug, name, cr, monsterType, dataJson, source);
  } else if (type === 'weapons') {
    const category = optionalString(data.category) ?? '';
    const weaponType = optionalString(data.weapon_type) ?? '';
    db.prepare('INSERT INTO weapons (slug, name, category, weapon_type, data, source) VALUES (?, ?, ?, ?, ?, ?)')
      .run(slug, name, category, weaponType, dataJson, source);
  } else {
    db.prepare(`INSERT INTO ${type} (slug, name, data, source) VALUES (?, ?, ?, ?)`)
      .run(slug, name, dataJson, source);
  }

  const row = db
    .prepare(`SELECT * FROM ${type} WHERE slug = ?`)
    .get(slug) as LibraryRow | undefined;

  res.status(201).json(row ? { ...row, data: JSON.parse(row.data) } : { ok: true });
});

router.patch('/:type/:slug', requireAdmin, (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;
  const slug = getParam(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const row = db
    .prepare(`SELECT * FROM ${type} WHERE slug = ?`)
    .get(slug) as LibraryRow | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.source === 'srd-2014') {
    return res.status(403).json({ error: 'SRD content cannot be edited' });
  }

  const body = (req.body ?? {}) as UpdateLibraryBody;
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.name !== undefined) {
    const name = optionalString(body.name);
    if (!name) return res.status(400).json({ error: 'name must be a non-empty string' });
    updates.push('name = ?');
    values.push(name);
  }

  if (body.data !== undefined) {
    if (!isPlainObject(body.data)) {
      return res.status(400).json({ error: 'data must be an object' });
    }
    updates.push('data = ?');
    values.push(JSON.stringify(body.data));

    if (type === 'subclasses') {
      const classSlug = optionalString(body.data.class_slug);
      if (!classSlug) {
        return res.status(400).json({ error: 'Subclasses require data.class_slug' });
      }
      updates.push('class_slug = ?');
      values.push(classSlug);
    } else if (type === 'spells') {
      const level = getRequiredNumber(body.data.level_int ?? body.data.level);
      if (level === null) {
        return res.status(400).json({ error: 'Spells require numeric data.level or data.level_int' });
      }
      updates.push('level = ?', 'school = ?');
      values.push(level, optionalString(body.data.school));
    } else if (type === 'items') {
      updates.push('item_type = ?', 'rarity = ?');
      values.push(optionalString(body.data.item_type ?? body.data.type), optionalString(body.data.rarity));
    } else if (type === 'monsters') {
      updates.push('cr = ?', 'type = ?');
      values.push(getRequiredNumber(body.data.cr), optionalString(body.data.type));
    } else if (type === 'weapons') {
      updates.push('category = ?', 'weapon_type = ?');
      values.push(optionalString(body.data.category) ?? '', optionalString(body.data.weapon_type) ?? '');
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'name or data required' });
  }

  values.push(slug);
  db.prepare(`UPDATE ${type} SET ${updates.join(', ')} WHERE slug = ?`).run(...values);

  const updated = db
    .prepare(`SELECT * FROM ${type} WHERE slug = ?`)
    .get(slug) as LibraryRow | undefined;

  res.json(updated ? { ...updated, data: JSON.parse(updated.data) } : { ok: true });
});

router.delete('/:type/:slug', requireAdmin, (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;
  const slug = getParam(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const row = db
    .prepare(`SELECT id, slug, name, data, source FROM ${type} WHERE slug = ?`)
    .get(slug) as LibraryRow | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.source === 'srd-2014') {
    return res.status(403).json({ error: 'SRD content cannot be deleted' });
  }

  db.prepare(`DELETE FROM ${type} WHERE slug = ?`).run(slug);
  // Tags follow the entry — clean them up too.
  db.prepare('DELETE FROM library_tags WHERE type = ? AND slug = ?').run(type, slug);
  res.json({ ok: true });
});

// ──────────────────────────── Tags ────────────────────────────
// Endpoints:
//   GET  /:type/tags                 → all tags + counts for that content type
//   GET  /:type/:slug/tags           → tags currently on this entry
//   POST /:type/:slug/tags  body{tag}→ add a tag (admin only)
//   DELETE /:type/:slug/tags/:tag    → remove a tag (admin only)

router.get('/:type/tags', (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;
  const rows = db.prepare(
    'SELECT tag, COUNT(*) AS count FROM library_tags WHERE type = ? GROUP BY tag ORDER BY tag',
  ).all(type);
  res.json({ tags: rows });
});

router.get('/:type/:slug/tags', (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;
  const slug = req.params.slug;
  const rows = db.prepare(
    'SELECT tag FROM library_tags WHERE type = ? AND slug = ? ORDER BY tag',
  ).all(type, slug) as { tag: string }[];
  res.json({ tags: rows.map((r) => r.tag) });
});

router.post('/:type/:slug/tags', requireAdmin, (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;
  const slug = req.params.slug;
  const tag = String(req.body?.tag ?? '').trim().toLowerCase().slice(0, 40);
  if (!tag) return res.status(400).json({ error: 'tag required' });
  // Verify the entry actually exists in its content table.
  const exists = db.prepare(`SELECT 1 FROM ${type} WHERE slug = ?`).get(slug);
  if (!exists) return res.status(404).json({ error: 'entry not found' });
  db.prepare('INSERT OR IGNORE INTO library_tags (type, slug, tag) VALUES (?, ?, ?)').run(type, slug, tag);
  res.json({ ok: true, tag });
});

router.delete('/:type/:slug/tags/:tag', requireAdmin, (req, res) => {
  const type = getLibraryType(req.params.type, res);
  if (!type) return;
  const slug = req.params.slug;
  const tag = String(req.params.tag).toLowerCase();
  db.prepare('DELETE FROM library_tags WHERE type = ? AND slug = ? AND tag = ?').run(type, slug, tag);
  res.json({ ok: true });
});

export default router;
