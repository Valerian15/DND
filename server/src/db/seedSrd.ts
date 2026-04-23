import { db, initSchema } from './index.js';

const API = 'https://api.open5e.com/v1';
const SRD_DOC = 'wotc-srd';

interface Open5eResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

async function fetchAll<T>(url: string): Promise<T[]> {
  const all: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${next}`);
    const data = (await res.json()) as Open5eResponse<T>;
    all.push(...data.results);
    next = data.next;
  }
  return all;
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isSrd(obj: any): boolean {
  // Open5e items from SRD have document__slug === 'wotc-srd'.
  // If the field is missing we default to accepting (some endpoints don't set it).
  return !obj.document__slug || obj.document__slug === SRD_DOC;
}

async function seedSpells() {
  console.log('⚙️  Fetching spells...');
  const spells = await fetchAll<any>(
    `${API}/spells/?document__slug=${SRD_DOC}&limit=100`,
  );
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO spells (slug, name, level, school, data, source)
    VALUES (?, ?, ?, ?, ?, 'srd-2014')
  `);
  const tx = db.transaction((rows: any[]) => {
    for (const s of rows) {
      const lvl = typeof s.level_int === 'number' ? s.level_int : 0;
      stmt.run(s.slug || toSlug(s.name), s.name, lvl, s.school || null, JSON.stringify(s));
    }
  });
  tx(spells);
  console.log(`  ✅ ${spells.length} spells`);
}

async function seedMonsters() {
  console.log('⚙️  Fetching monsters...');
  const monsters = await fetchAll<any>(
    `${API}/monsters/?document__slug=${SRD_DOC}&limit=100`,
  );
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO monsters (slug, name, cr, type, data, source)
    VALUES (?, ?, ?, ?, ?, 'srd-2014')
  `);
  const tx = db.transaction((rows: any[]) => {
    for (const m of rows) {
      const cr = typeof m.cr === 'number' ? m.cr : parseFloat(m.cr) || 0;
      stmt.run(m.slug || toSlug(m.name), m.name, cr, m.type || null, JSON.stringify(m));
    }
  });
  tx(monsters);
  console.log(`  ✅ ${monsters.length} monsters`);
}

async function seedItems() {
  console.log('⚙️  Fetching magic items + equipment...');
  const magic = await fetchAll<any>(
    `${API}/magicitems/?document__slug=${SRD_DOC}&limit=100`,
  );
  const weapons = await fetchAll<any>(`${API}/weapons/?limit=100`);
  const armor = await fetchAll<any>(`${API}/armor/?limit=100`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO items (slug, name, item_type, rarity, data, source)
    VALUES (?, ?, ?, ?, ?, 'srd-2014')
  `);
  const tx = db.transaction(() => {
    for (const i of magic) {
      stmt.run(i.slug || toSlug(i.name), i.name, i.type || 'magic', i.rarity || null, JSON.stringify(i));
    }
    for (const w of weapons) {
      stmt.run(toSlug('weapon-' + w.name), w.name, 'weapon', null, JSON.stringify(w));
    }
    for (const a of armor) {
      stmt.run(toSlug('armor-' + a.name), a.name, 'armor', null, JSON.stringify(a));
    }
  });
  tx();
  console.log(`  ✅ ${magic.length} magic items, ${weapons.length} weapons, ${armor.length} armor`);
}

async function seedRaces() {
  console.log('⚙️  Fetching races...');
  const races = await fetchAll<any>(
    `${API}/races/?document__slug=${SRD_DOC}&limit=100`,
  );
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO races (slug, name, data, source)
    VALUES (?, ?, ?, 'srd-2014')
  `);
  const tx = db.transaction((rows: any[]) => {
    for (const r of rows) {
      stmt.run(r.slug || toSlug(r.name), r.name, JSON.stringify(r));
    }
  });
  tx(races);
  console.log(`  ✅ ${races.length} races`);
}

async function seedClasses() {
  console.log('⚙️  Fetching classes + subclasses (SRD only)...');
  const classes = await fetchAll<any>(
    `${API}/classes/?document__slug=${SRD_DOC}&limit=100`,
  );

  const classStmt = db.prepare(`
    INSERT OR REPLACE INTO classes (slug, name, data, source)
    VALUES (?, ?, ?, 'srd-2014')
  `);
  const subStmt = db.prepare(`
    INSERT OR REPLACE INTO subclasses (slug, name, class_slug, data, source)
    VALUES (?, ?, ?, ?, 'srd-2014')
  `);

  let subCount = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const c of classes) {
      classStmt.run(c.slug || toSlug(c.name), c.name, JSON.stringify(c));
      if (Array.isArray(c.archetypes)) {
        for (const a of c.archetypes) {
          if (!isSrd(a)) {
            skipped++;
            continue;
          }
          subStmt.run(
            a.slug || toSlug(c.name + '-' + a.name),
            a.name,
            c.slug || toSlug(c.name),
            JSON.stringify(a),
          );
          subCount++;
        }
      }
    }
  });
  tx();
  console.log(`  ✅ ${classes.length} classes, ${subCount} subclasses (${skipped} non-SRD skipped)`);
}

async function seedBackgrounds() {
  console.log('⚙️  Fetching backgrounds...');
  const bgs = await fetchAll<any>(
    `${API}/backgrounds/?document__slug=${SRD_DOC}&limit=100`,
  );
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO backgrounds (slug, name, data, source)
    VALUES (?, ?, ?, 'srd-2014')
  `);
  const tx = db.transaction((rows: any[]) => {
    for (const b of rows) {
      stmt.run(b.slug || toSlug(b.name), b.name, JSON.stringify(b));
    }
  });
  tx(bgs);
  console.log(`  ✅ ${bgs.length} backgrounds`);
}

async function seedFeats() {
  console.log('⚙️  Fetching feats...');
  const feats = await fetchAll<any>(
    `${API}/feats/?document__slug=${SRD_DOC}&limit=100`,
  );
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO feats (slug, name, data, source)
    VALUES (?, ?, ?, 'srd-2014')
  `);
  const tx = db.transaction((rows: any[]) => {
    for (const f of rows) {
      stmt.run(f.slug || toSlug(f.name), f.name, JSON.stringify(f));
    }
  });
  tx(feats);
  console.log(`  ✅ ${feats.length} feats`);
}

async function seedConditions() {
  console.log('⚙️  Fetching conditions...');
  const conditions = await fetchAll<any>(
    `${API}/conditions/?document__slug=${SRD_DOC}&limit=100`,
  );
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO conditions (slug, name, data, source)
    VALUES (?, ?, ?, 'srd-2014')
  `);
  const tx = db.transaction((rows: any[]) => {
    for (const c of rows) {
      stmt.run(c.slug || toSlug(c.name), c.name, JSON.stringify(c));
    }
  });
  tx(conditions);
  console.log(`  ✅ ${conditions.length} conditions`);
}

async function main() {
  initSchema();
  console.log('📚 Starting SRD content seed from Open5e...\n');
  const t0 = Date.now();

  await seedRaces();
  await seedClasses();
  await seedBackgrounds();
  await seedSpells();
  await seedMonsters();
  await seedItems();
  await seedFeats();
  await seedConditions();

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Seed complete in ${seconds}s.`);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
