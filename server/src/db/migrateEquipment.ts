// One-shot migration: legacy `inventory` (free-form) + `weapons` (slug list) → `inventory_v2`.
//
// Run via `pnpm migrate:equipment`. Idempotent — characters that already have
// description.equipment_migrated_at set are skipped. Legacy columns are NOT touched, so
// the migration is reversible: drop inventory_v2 contents and clear the timestamp.

import { db, initSchema } from './index.js';

interface CharacterRow {
  id: number;
  name: string;
  inventory: string;
  weapons: string;
  inventory_v2: string;
  description: string;
}

interface WeaponLibraryData {
  damage_dice?: string;
  damage_type?: string;
  weapon_type?: string;
  category?: string;
  properties?: string[] | string;
  range_normal?: number;
  range_long?: number;
  versatile_dice?: string;
  weight_lbs?: number;
  cost_gp?: number;
  weight?: string | number;
  cost?: string | number;
}

interface InventoryItemV2 {
  id: string;
  library_slug?: string;
  source?: string;
  name: string;
  quantity: number;
  weight_lbs?: number;
  cost_gp?: number;
  category: 'weapon' | 'armor' | 'tool' | 'gear' | 'consumable' | 'treasure' | 'other';
  equipped?: boolean;
  attuned?: boolean;
  description?: string;
  damage_dice?: string;
  damage_type?: string;
  weapon_type?: 'Melee' | 'Ranged';
  weapon_category?: 'Simple' | 'Martial';
  properties?: string[];
  range_normal?: number;
  range_long?: number;
  versatile_dice?: string;
  armor_class?: number;
  armor_type?: 'light' | 'medium' | 'heavy' | 'shield';
  stealth_disadvantage?: boolean;
}

/** Heuristic parse of "5 lb" / "5" / 5 → 5 (lbs). */
function parseWeight(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.match(/[\d.]+/);
    if (m) return Number(m[0]);
  }
  return undefined;
}

/** Heuristic parse of "10 gp" / "10" / 10 → 10. */
function parseCostGp(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.match(/(\d+(?:\.\d+)?)\s*(gp|sp|cp|pp|ep)?/i);
    if (m) {
      const n = Number(m[1]);
      const unit = (m[2] ?? 'gp').toLowerCase();
      if (unit === 'gp') return n;
      if (unit === 'sp') return n / 10;
      if (unit === 'cp') return n / 100;
      if (unit === 'ep') return n / 2;
      if (unit === 'pp') return n * 10;
    }
  }
  return undefined;
}

function fetchWeapon(slug: string): { name: string; category: string; weapon_type: string; data: WeaponLibraryData } | null {
  const row = db.prepare('SELECT name, category, weapon_type, data FROM weapons WHERE slug = ?').get(slug) as { name: string; category: string; weapon_type: string; data: string } | undefined;
  if (!row) return null;
  try { return { name: row.name, category: row.category, weapon_type: row.weapon_type, data: JSON.parse(row.data) as WeaponLibraryData }; } catch { return null; }
}

function buildWeaponRow(slug: string, source?: string): InventoryItemV2 {
  const lib = fetchWeapon(slug);
  if (!lib) {
    return {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      library_slug: slug, name: slug, quantity: 1, category: 'weapon', equipped: true,
      ...(source ? { source } : {}),
    };
  }
  const props = Array.isArray(lib.data.properties)
    ? lib.data.properties
    : typeof lib.data.properties === 'string'
      ? lib.data.properties.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  return {
    id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    library_slug: slug,
    name: lib.name,
    quantity: 1,
    category: 'weapon',
    equipped: true,
    weight_lbs: parseWeight(lib.data.weight_lbs ?? lib.data.weight),
    cost_gp: parseCostGp(lib.data.cost_gp ?? lib.data.cost),
    damage_dice: lib.data.damage_dice,
    damage_type: lib.data.damage_type,
    weapon_type: lib.weapon_type === 'Ranged' ? 'Ranged' : lib.weapon_type === 'Melee' ? 'Melee' : undefined,
    weapon_category: lib.category === 'Simple' ? 'Simple' : lib.category === 'Martial' ? 'Martial' : undefined,
    properties: props,
    range_normal: lib.data.range_normal,
    range_long: lib.data.range_long,
    versatile_dice: lib.data.versatile_dice,
    ...(source ? { source } : {}),
  };
}

interface LegacyInventoryRow {
  id?: string;
  source?: string;
  name?: string;
  quantity?: number;
  description?: string;
}

function buildLegacyGearRow(legacy: LegacyInventoryRow): InventoryItemV2 {
  return {
    id: legacy.id ?? `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: legacy.name ?? 'Unnamed item',
    quantity: typeof legacy.quantity === 'number' ? legacy.quantity : 1,
    category: 'gear',
    description: legacy.description,
    ...(legacy.source ? { source: legacy.source } : {}),
  };
}

function migrateOne(ch: CharacterRow): { migrated: boolean; reason?: string } {
  let descObj: Record<string, unknown> = {};
  try { descObj = JSON.parse(ch.description ?? '{}'); } catch { /* default */ }
  if (descObj.equipment_migrated_at) return { migrated: false, reason: 'already migrated' };

  let v2: InventoryItemV2[] = [];
  try {
    const parsed = JSON.parse(ch.inventory_v2 ?? '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Already has structured rows somehow — mark as migrated and skip.
      descObj.equipment_migrated_at = Date.now();
      db.prepare('UPDATE characters SET description = ? WHERE id = ?').run(JSON.stringify(descObj), ch.id);
      return { migrated: false, reason: 'inventory_v2 already populated' };
    }
  } catch { /* default */ }

  // 1) Weapons: each slug becomes an equipped weapon row.
  let weaponSlugs: string[] = [];
  try {
    const arr = JSON.parse(ch.weapons ?? '[]');
    if (Array.isArray(arr)) weaponSlugs = arr.filter((s): s is string => typeof s === 'string');
  } catch { /* default */ }
  for (const slug of weaponSlugs) v2.push(buildWeaponRow(slug));

  // 2) Free-form inventory rows: pass-through as 'gear' rows.
  let legacyInv: LegacyInventoryRow[] = [];
  try {
    const arr = JSON.parse(ch.inventory ?? '[]');
    if (Array.isArray(arr)) legacyInv = arr as LegacyInventoryRow[];
  } catch { /* default */ }
  for (const row of legacyInv) v2.push(buildLegacyGearRow(row));

  descObj.equipment_migrated_at = Date.now();
  db.prepare('UPDATE characters SET inventory_v2 = ?, description = ? WHERE id = ?')
    .run(JSON.stringify(v2), JSON.stringify(descObj), ch.id);
  return { migrated: true };
}

function run() {
  initSchema();
  const chars = db.prepare('SELECT id, name, inventory, weapons, inventory_v2, description FROM characters').all() as CharacterRow[];
  let migrated = 0;
  let skipped = 0;
  for (const ch of chars) {
    const result = migrateOne(ch);
    if (result.migrated) {
      migrated += 1;
      console.log(`  ✅ ${ch.name} (id ${ch.id}) — migrated`);
    } else {
      skipped += 1;
      console.log(`  ⏭  ${ch.name} (id ${ch.id}) — skipped (${result.reason})`);
    }
  }
  console.log(`\n✅ Done. Migrated ${migrated}, skipped ${skipped}, total ${chars.length}.`);
  console.log('   Legacy `inventory` and `weapons` columns are untouched. To revert:');
  console.log('   UPDATE characters SET inventory_v2 = \'[]\', description = json_remove(description, \'$.equipment_migrated_at\');');
}

run();
