// One-off patch: the Open5e SRD seed leaves armor weights blank. PHB p.145 has the
// canonical values. This script writes them into the items library AND backfills
// weight_lbs on every character's inventory_v2 armor rows.
//
// Idempotent: running twice is safe — items already at the correct weight are skipped,
// inventory rows that already have a positive weight_lbs are left alone.

import { db, initSchema } from './index.js';

const ARMOR_WEIGHTS: Record<string, number> = {
  // Light
  'armor-padded': 8,
  'armor-leather': 10,
  'armor-studded-leather': 13,
  // Medium
  'armor-hide': 12,
  'armor-chain-shirt': 20,
  'armor-scale-mail': 45,
  'armor-breastplate': 20,
  'armor-half-plate': 40,
  // Heavy
  'armor-ring-mail': 40,
  'armor-chain-mail': 55,
  'armor-splint': 60,
  'armor-plate': 65,
  // Shields
  'armor-shield': 6,
};

interface ItemRow { slug: string; data: string }

function patchLibrary(): { patched: number; skipped: number } {
  const itemsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='items'").get();
  if (!itemsTable) return { patched: 0, skipped: 0 };
  const select = db.prepare('SELECT slug, data FROM items WHERE slug = ?');
  const update = db.prepare('UPDATE items SET data = ? WHERE slug = ?');
  let patched = 0;
  let skipped = 0;
  for (const [slug, weight] of Object.entries(ARMOR_WEIGHTS)) {
    const row = select.get(slug) as ItemRow | undefined;
    if (!row) { skipped += 1; continue; }
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(row.data); } catch { /* default */ }
    const desired = `${weight} lb`;
    if (data.weight === desired) { skipped += 1; continue; }
    data.weight = desired;
    data.weight_lbs = weight;
    update.run(JSON.stringify(data), slug);
    patched += 1;
    console.log(`  ✅ ${slug}: weight → ${weight} lb`);
  }
  return { patched, skipped };
}

interface CharacterRow { id: number; name: string; inventory_v2: string }

function backfillInventory(): { patched: number; rows: number } {
  const chars = db.prepare('SELECT id, name, inventory_v2 FROM characters').all() as CharacterRow[];
  const update = db.prepare('UPDATE characters SET inventory_v2 = ? WHERE id = ?');
  let totalPatched = 0;
  let totalRows = 0;
  for (const ch of chars) {
    let inv: Array<Record<string, unknown>>;
    try { inv = JSON.parse(ch.inventory_v2 ?? '[]'); }
    catch { continue; }
    if (!Array.isArray(inv) || inv.length === 0) continue;
    let dirty = false;
    for (const item of inv) {
      const slug = typeof item.library_slug === 'string' ? item.library_slug : null;
      if (!slug || !slug.startsWith('armor-')) continue;
      const w = ARMOR_WEIGHTS[slug];
      if (typeof w !== 'number') continue;
      // Don't overwrite a non-zero value that may have been edited.
      const cur = item.weight_lbs;
      if (typeof cur === 'number' && cur > 0) continue;
      item.weight_lbs = w;
      dirty = true;
      totalPatched += 1;
    }
    totalRows += 1;
    if (dirty) {
      update.run(JSON.stringify(inv), ch.id);
      console.log(`  ✅ ${ch.name} (id ${ch.id}) — backfilled armor weights`);
    }
  }
  return { patched: totalPatched, rows: totalRows };
}

function run() {
  initSchema();
  console.log('Library:');
  const lib = patchLibrary();
  console.log(`  Patched ${lib.patched}, skipped ${lib.skipped}.`);
  console.log('\nCharacter inventories:');
  const inv = backfillInventory();
  console.log(`  Walked ${inv.rows} characters, backfilled ${inv.patched} armor rows.`);
  console.log('\n✅ Done. Re-equip armor in the wizard if anything still shows 0 lb.');
}

run();
