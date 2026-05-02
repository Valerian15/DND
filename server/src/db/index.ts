import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../data/game.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  db.exec(`
    -- USERS / AUTH

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- LIBRARY CONTENT
    -- One table per content type. JSON 'data' column holds the full object.
    -- 'source' tracks origin: 'srd-2014', 'homebrew', custom names, etc.

    CREATE TABLE IF NOT EXISTS races (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS subclasses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      class_slug TEXT,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_subclasses_class ON subclasses(class_slug);

    CREATE TABLE IF NOT EXISTS backgrounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS spells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      school TEXT,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_spells_level ON spells(level);
    CREATE INDEX IF NOT EXISTS idx_spells_name ON spells(name);

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      item_type TEXT,
      rarity TEXT,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

    CREATE TABLE IF NOT EXISTS monsters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      cr REAL,
      type TEXT,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_monsters_cr ON monsters(cr);
    CREATE INDEX IF NOT EXISTS idx_monsters_name ON monsters(name);

    CREATE TABLE IF NOT EXISTS feats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'srd-2014',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS weapons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      weapon_type TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'custom',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_weapons_name ON weapons(name);

    -- CHARACTERS
    -- Most 5e character data lives in JSON columns for flexibility.
    -- Commonly queried fields (level, hp, class, owner) are top-level.

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      class_slug TEXT,
      subclass_slug TEXT,
      race_slug TEXT,
      background_slug TEXT,
      hp_current INTEGER NOT NULL DEFAULT 0,
      hp_max INTEGER NOT NULL DEFAULT 0,
      hp_temp INTEGER NOT NULL DEFAULT 0,
      ac INTEGER NOT NULL DEFAULT 10,
      portrait_url TEXT,
      abilities TEXT NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
      skills TEXT NOT NULL DEFAULT '{}',
      saves TEXT NOT NULL DEFAULT '{}',
      inventory TEXT NOT NULL DEFAULT '[]',
      spells_known TEXT NOT NULL DEFAULT '[]',
      spells_prepared TEXT NOT NULL DEFAULT '[]',
      spell_slots TEXT NOT NULL DEFAULT '{}',
      features TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_characters_owner ON characters(owner_id);

    -- CAMPAIGNS

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dm_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      settings TEXT NOT NULL DEFAULT '{"rolled_hp":false}',
      invite_code TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (dm_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_dm ON campaigns(dm_id);

    CREATE TABLE IF NOT EXISTS campaign_members (
      campaign_id INTEGER NOT NULL,
      character_id INTEGER NOT NULL,
      joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (campaign_id, character_id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    -- Enforces one campaign per character at the DB level
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_members_character ON campaign_members(character_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign ON campaign_members(campaign_id);

    -- TOKEN CATEGORIES (DM-defined groupings, two defaults seeded on campaign create)

    CREATE TABLE IF NOT EXISTS campaign_token_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_token_categories_campaign ON campaign_token_categories(campaign_id);

    -- NPC TEMPLATES (DM prepares before session)

    CREATE TABLE IF NOT EXISTS campaign_npcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      category_id INTEGER,
      label TEXT NOT NULL,
      portrait_url TEXT,
      size TEXT NOT NULL DEFAULT 'medium'
        CHECK (size IN ('tiny','small','medium','large','huge','gargantuan')),
      hp_max INTEGER NOT NULL DEFAULT 10,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES campaign_token_categories(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_npcs_campaign ON campaign_npcs(campaign_id);

    -- MAP TOKENS (instances on a map)

    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id INTEGER NOT NULL,
      token_type TEXT NOT NULL DEFAULT 'npc' CHECK (token_type IN ('pc', 'npc')),
      character_id INTEGER,
      campaign_npc_id INTEGER,
      label TEXT NOT NULL,
      portrait_url TEXT,
      size TEXT NOT NULL DEFAULT 'medium'
        CHECK (size IN ('tiny','small','medium','large','huge','gargantuan')),
      col INTEGER NOT NULL DEFAULT 0,
      row INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 0,
      hp_max INTEGER NOT NULL DEFAULT 0,
      hp_visible INTEGER NOT NULL DEFAULT 1,
      controlled_by TEXT NOT NULL DEFAULT '[]',
      conditions TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL,
      FOREIGN KEY (campaign_npc_id) REFERENCES campaign_npcs(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_map ON tokens(map_id);

    -- MAPS

    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      grid_size INTEGER NOT NULL DEFAULT 50,
      grid_offset_x INTEGER NOT NULL DEFAULT 0,
      grid_offset_y INTEGER NOT NULL DEFAULT 0,
      fog_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_maps_campaign ON maps(campaign_id);

    -- CHAT

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'chat',
      data TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_campaign ON chat_messages(campaign_id, created_at);

    -- INITIATIVE

    CREATE TABLE IF NOT EXISTS initiative_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      token_id INTEGER,
      label TEXT NOT NULL,
      initiative INTEGER NOT NULL DEFAULT 0,
      dex_score INTEGER NOT NULL DEFAULT 10,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_initiative_campaign ON initiative_entries(campaign_id);

    -- WALLS (fog of war)

    CREATE TABLE IF NOT EXISTS map_walls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id INTEGER NOT NULL,
      x1 REAL NOT NULL,
      y1 REAL NOT NULL,
      x2 REAL NOT NULL,
      y2 REAL NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_map_walls_map ON map_walls(map_id);

    -- FOG EXPLORATION MEMORY

    CREATE TABLE IF NOT EXISTS map_fog (
      map_id INTEGER NOT NULL,
      col INTEGER NOT NULL,
      row INTEGER NOT NULL,
      PRIMARY KEY (map_id, col, row)
    );

    CREATE INDEX IF NOT EXISTS idx_map_fog_map ON map_fog(map_id);

    -- MAP FOLDERS (nested folder tree for DM map organisation)

    CREATE TABLE IF NOT EXISTS map_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_map_folders_campaign ON map_folders(campaign_id);

    -- CAMPAIGN NOTES (DM scratchpad per campaign)

    CREATE TABLE IF NOT EXISTS campaign_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Note',
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_notes_campaign ON campaign_notes(campaign_id);
  `);

  // Seed SRD weapons (INSERT OR IGNORE — safe to run repeatedly)
  const seedWeapon = db.prepare(
    `INSERT OR IGNORE INTO weapons (slug, name, category, weapon_type, data, source)
     VALUES (?, ?, ?, ?, ?, 'srd-2014')`
  );
  const seedWeapons = db.transaction(() => {
    const w = (
      slug: string, name: string, category: string, weapon_type: string,
      damage_dice: string, damage_type: string, properties: string[],
      cost: string, weight: string,
      extra: Record<string, unknown> = {}
    ) => seedWeapon.run(
      slug, name, category, weapon_type,
      JSON.stringify({ damage_dice, damage_type, properties, cost, weight, ...extra })
    );

    // Simple Melee
    w('club',          'Club',           'Simple', 'Melee', '1d4', 'bludgeoning', ['light'],                    '1 sp',  '2 lb.');
    w('dagger',        'Dagger',         'Simple', 'Melee', '1d4', 'piercing',    ['finesse','light','thrown'],  '2 gp',  '1 lb.', { range_normal: 20, range_long: 60 });
    w('greatclub',     'Greatclub',      'Simple', 'Melee', '1d8', 'bludgeoning', ['two-handed'],               '2 sp',  '10 lb.');
    w('handaxe',       'Handaxe',        'Simple', 'Melee', '1d6', 'slashing',    ['light','thrown'],           '5 gp',  '2 lb.', { range_normal: 20, range_long: 60 });
    w('javelin',       'Javelin',        'Simple', 'Melee', '1d6', 'piercing',    ['thrown'],                   '5 sp',  '2 lb.', { range_normal: 30, range_long: 120 });
    w('light-hammer',  'Light Hammer',   'Simple', 'Melee', '1d4', 'bludgeoning', ['light','thrown'],           '2 gp',  '2 lb.', { range_normal: 20, range_long: 60 });
    w('mace',          'Mace',           'Simple', 'Melee', '1d6', 'bludgeoning', [],                           '5 gp',  '4 lb.');
    w('quarterstaff',  'Quarterstaff',   'Simple', 'Melee', '1d6', 'bludgeoning', ['versatile'],                '2 sp',  '4 lb.', { versatile_dice: '1d8' });
    w('sickle',        'Sickle',         'Simple', 'Melee', '1d4', 'slashing',    ['light'],                    '1 gp',  '2 lb.');
    w('spear',         'Spear',          'Simple', 'Melee', '1d6', 'piercing',    ['thrown','versatile'],       '1 gp',  '3 lb.', { range_normal: 20, range_long: 60, versatile_dice: '1d8' });

    // Simple Ranged
    w('crossbow-light','Light Crossbow', 'Simple', 'Ranged','1d8', 'piercing',    ['loading','two-handed','ammunition'], '25 gp', '5 lb.', { range_normal: 80, range_long: 320 });
    w('dart',          'Dart',           'Simple', 'Ranged','1d4', 'piercing',    ['finesse','thrown'],         '5 cp',  '0.25 lb.', { range_normal: 20, range_long: 60 });
    w('shortbow',      'Shortbow',       'Simple', 'Ranged','1d6', 'piercing',    ['two-handed','ammunition'],  '25 gp', '2 lb.', { range_normal: 80, range_long: 320 });
    w('sling',         'Sling',          'Simple', 'Ranged','1d4', 'bludgeoning', ['ammunition'],               '1 sp',  '0 lb.', { range_normal: 30, range_long: 120 });

    // Martial Melee
    w('battleaxe',     'Battleaxe',      'Martial','Melee', '1d8', 'slashing',    ['versatile'],                '10 gp', '4 lb.', { versatile_dice: '1d10' });
    w('flail',         'Flail',          'Martial','Melee', '1d8', 'bludgeoning', [],                           '10 gp', '2 lb.');
    w('glaive',        'Glaive',         'Martial','Melee', '1d10','slashing',    ['heavy','reach','two-handed'],'20 gp','6 lb.');
    w('greataxe',      'Greataxe',       'Martial','Melee', '1d12','slashing',    ['heavy','two-handed'],       '30 gp', '7 lb.');
    w('greatsword',    'Greatsword',     'Martial','Melee', '2d6', 'slashing',    ['heavy','two-handed'],       '50 gp', '6 lb.');
    w('halberd',       'Halberd',        'Martial','Melee', '1d10','slashing',    ['heavy','reach','two-handed'],'20 gp','6 lb.');
    w('lance',         'Lance',          'Martial','Melee', '1d12','piercing',    ['reach'],                    '10 gp', '6 lb.');
    w('longsword',     'Longsword',      'Martial','Melee', '1d8', 'slashing',    ['versatile'],                '15 gp', '3 lb.', { versatile_dice: '1d10' });
    w('maul',          'Maul',           'Martial','Melee', '2d6', 'bludgeoning', ['heavy','two-handed'],       '10 gp', '10 lb.');
    w('morningstar',   'Morningstar',    'Martial','Melee', '1d8', 'piercing',    [],                           '15 gp', '4 lb.');
    w('pike',          'Pike',           'Martial','Melee', '1d10','piercing',    ['heavy','reach','two-handed'],'5 gp', '18 lb.');
    w('rapier',        'Rapier',         'Martial','Melee', '1d8', 'piercing',    ['finesse'],                  '25 gp', '2 lb.');
    w('scimitar',      'Scimitar',       'Martial','Melee', '1d6', 'slashing',    ['finesse','light'],          '25 gp', '3 lb.');
    w('shortsword',    'Shortsword',     'Martial','Melee', '1d6', 'piercing',    ['finesse','light'],          '10 gp', '2 lb.');
    w('trident',       'Trident',        'Martial','Melee', '1d6', 'piercing',    ['thrown','versatile'],       '5 gp',  '4 lb.', { range_normal: 20, range_long: 60, versatile_dice: '1d8' });
    w('war-pick',      'War Pick',       'Martial','Melee', '1d8', 'piercing',    [],                           '5 gp',  '2 lb.');
    w('warhammer',     'Warhammer',      'Martial','Melee', '1d8', 'bludgeoning', ['versatile'],                '15 gp', '2 lb.', { versatile_dice: '1d10' });
    w('whip',          'Whip',           'Martial','Melee', '1d4', 'slashing',    ['finesse','reach'],          '2 gp',  '3 lb.');

    // Martial Ranged
    w('blowgun',       'Blowgun',        'Martial','Ranged','1',   'piercing',    ['loading','ammunition'],     '10 gp', '1 lb.', { range_normal: 25, range_long: 100 });
    w('crossbow-hand', 'Hand Crossbow',  'Martial','Ranged','1d6', 'piercing',    ['light','loading','ammunition'],'75 gp','3 lb.', { range_normal: 30, range_long: 120 });
    w('crossbow-heavy','Heavy Crossbow', 'Martial','Ranged','1d10','piercing',    ['heavy','loading','two-handed','ammunition'],'50 gp','18 lb.', { range_normal: 100, range_long: 400 });
    w('longbow',       'Longbow',        'Martial','Ranged','1d8', 'piercing',    ['heavy','two-handed','ammunition'],'50 gp','2 lb.', { range_normal: 150, range_long: 600 });
    w('net',           'Net',            'Martial','Ranged','0',   '',            ['thrown'],                   '1 gp',  '3 lb.', { range_normal: 5, range_long: 15 });
  });
  seedWeapons();

  // Add active_map_id to campaigns if not already present (safe to run repeatedly)
  try { db.exec('ALTER TABLE campaigns ADD COLUMN active_map_id INTEGER'); } catch { /* exists */ }
  // Darkvision (feet) on characters — set from race data when race is selected
  try { db.exec('ALTER TABLE characters ADD COLUMN darkvision INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  // Fog of war toggle per map
  try { db.exec('ALTER TABLE maps ADD COLUMN fog_enabled INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  // Weapon slugs selected during character creation
  try { db.exec("ALTER TABLE characters ADD COLUMN weapons TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  // Spell slot usage tracking (separate from max slots)
  try { db.exec("ALTER TABLE characters ADD COLUMN spell_slots_used TEXT NOT NULL DEFAULT '{}'"); } catch { /* exists */ }
  // Hit dice used (total = level, recover half on long rest)
  try { db.exec('ALTER TABLE characters ADD COLUMN hit_dice_used INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  // Class resource tracker array [{name, current, max, reset}]
  try { db.exec("ALTER TABLE characters ADD COLUMN resources TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  // Map folder assignment
  try { db.exec('ALTER TABLE maps ADD COLUMN folder_id INTEGER'); } catch { /* exists */ }
  // Death save tracking (resets when HP > 0)
  try { db.exec('ALTER TABLE characters ADD COLUMN death_saves_success INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE characters ADD COLUMN death_saves_failure INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  // Inspiration (boolean 0/1, granted by DM)
  try { db.exec('ALTER TABLE characters ADD COLUMN inspiration INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  // Library monster slug on NPC tokens (allows opening full stat block)
  try { db.exec('ALTER TABLE tokens ADD COLUMN monster_slug TEXT'); } catch { /* exists */ }
  // Full stat block fields on campaign NPCs
  try { db.exec('ALTER TABLE campaign_npcs ADD COLUMN ac INTEGER NOT NULL DEFAULT 10'); } catch { /* exists */ }
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN speed TEXT NOT NULL DEFAULT '30 ft.'"); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE campaign_npcs ADD COLUMN abilities TEXT NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'`); } catch { /* exists */ }
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN saving_throws TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN attacks TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN traits TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  // Initiative turn tracking
  try { db.exec('ALTER TABLE campaigns ADD COLUMN initiative_current_id INTEGER'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE campaigns ADD COLUMN initiative_round INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }

  // Hidden tokens (DM-only visibility)
  try { db.exec('ALTER TABLE tokens ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  // Character currency (pp, gp, ep, sp, cp)
  try { db.exec(`ALTER TABLE characters ADD COLUMN currency TEXT NOT NULL DEFAULT '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'`); } catch { /* exists */ }
  // Character feats (array of feat slugs from library)
  try { db.exec("ALTER TABLE characters ADD COLUMN feats TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  // Character personality (traits, ideals, bonds, flaws)
  try { db.exec(`ALTER TABLE characters ADD COLUMN personality TEXT NOT NULL DEFAULT '{"traits":"","ideals":"","bonds":"","flaws":""}'`); } catch { /* exists */ }
  // Exhaustion level (5e: 0–6)
  try { db.exec('ALTER TABLE characters ADD COLUMN exhaustion_level INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  // Damage type modifiers — stored as JSON arrays of damage type strings.
  // Library monsters already have these as text fields in their `data` JSON; PCs/NPCs need explicit columns.
  try { db.exec("ALTER TABLE characters ADD COLUMN resistances TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE characters ADD COLUMN vulnerabilities TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE characters ADD COLUMN immunities TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN resistances TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN vulnerabilities TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN immunities TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  // Active timed effects (Bless, Hunter's Mark, etc.) — stored on tokens (universal for PC/NPC/monster)
  try { db.exec("ALTER TABLE tokens ADD COLUMN effects TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  // Legacy: previously added character.effects. Kept for compatibility but no longer used.
  try { db.exec("ALTER TABLE characters ADD COLUMN effects TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }

  // Subrace selection (Hill vs Mountain Dwarf, High vs Wood Elf, etc.).
  try { db.exec('ALTER TABLE characters ADD COLUMN subrace_slug TEXT'); } catch { /* exists */ }

  // Spoken/read languages — JSON array of language names (e.g. ['Common', 'Dwarvish']).
  try { db.exec("ALTER TABLE characters ADD COLUMN languages TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }

  // Lucky feat point tracker (0..3). Resets on long rest.
  try { db.exec('ALTER TABLE characters ADD COLUMN lucky_used INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }

  // Walking speed in feet (race + feat modifiers). Default 30 covers most Medium races.
  try { db.exec('ALTER TABLE characters ADD COLUMN speed_walk INTEGER NOT NULL DEFAULT 30'); } catch { /* exists */ }

  // Saved encounters — DM snapshots the active map's tokens + initiative, restore later.
  db.exec(`
    CREATE TABLE IF NOT EXISTS encounters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      tokens_json TEXT NOT NULL DEFAULT '[]',
      initiative_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_encounters_campaign ON encounters(campaign_id);
  `);

  // AOE spell templates on maps
  db.exec(`
    CREATE TABLE IF NOT EXISTS map_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id INTEGER NOT NULL,
      shape TEXT NOT NULL CHECK (shape IN ('circle', 'square', 'cone', 'line')),
      origin_x REAL NOT NULL,
      origin_y REAL NOT NULL,
      end_x REAL NOT NULL,
      end_y REAL NOT NULL,
      color TEXT NOT NULL DEFAULT '#ff6b6b',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_map_templates_map ON map_templates(map_id);
  `);

  // Freehand drawings on maps (DM annotations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS map_drawings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#ffeb3b',
      stroke_width INTEGER NOT NULL DEFAULT 3,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_map_drawings_map ON map_drawings(map_id);
  `);

  // Library tags — DM-defined free-form tags applied to library entries.
  // Indexed by (type, slug, tag) for direct row uniqueness; (type, tag) for filter lookups.
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      slug TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_library_tags_unique ON library_tags(type, slug, tag);
    CREATE INDEX IF NOT EXISTS idx_library_tags_lookup ON library_tags(type, tag);
  `);

  // Phase 7-A.5: per-token spell slot usage (monsters / campaign NPCs only — PCs use
  // characters.spell_slots_used). Display-only; click-to-toggle visual tracking by the DM.
  try { db.exec("ALTER TABLE tokens ADD COLUMN spell_slots_used TEXT NOT NULL DEFAULT '{}'"); } catch { /* exists */ }

  // Phase 7-A.5: Campaign NPC spellcasting — DM-built NPCs can have a structured spell list,
  // save DC, and attack bonus, rendered as a real spell tab on the NpcSheet.
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN spells TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN spell_slots TEXT NOT NULL DEFAULT '{}'"); } catch { /* exists */ }
  try { db.exec('ALTER TABLE campaign_npcs ADD COLUMN spell_save_dc INTEGER'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE campaign_npcs ADD COLUMN spell_attack_bonus INTEGER'); } catch { /* exists */ }

  // Phase 7-A: action economy trackers — toggled in InGameSheet/Hotbar, auto-reset on turn start.
  try { db.exec('ALTER TABLE characters ADD COLUMN action_used INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE characters ADD COLUMN bonus_used INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE characters ADD COLUMN reaction_used INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }

  // QoL batch: per-map scene tag (italic banner shown above chat)
  try { db.exec("ALTER TABLE maps ADD COLUMN scene_tag TEXT NOT NULL DEFAULT ''"); } catch { /* exists */ }
  // QoL batch: DM-only notes per campaign NPC (hidden pane, only visible to DM/admin)
  try { db.exec("ALTER TABLE campaign_npcs ADD COLUMN dm_notes TEXT NOT NULL DEFAULT ''"); } catch { /* exists */ }
  // QoL batch: per-token aura ring (radius in feet, hex color). Both nullable = no aura.
  try { db.exec('ALTER TABLE tokens ADD COLUMN aura_radius INTEGER'); } catch { /* exists */ }
  try { db.exec('ALTER TABLE tokens ADD COLUMN aura_color TEXT'); } catch { /* exists */ }

  // Multiclassing: characters have a `classes` JSON array with one entry per class.
  // The legacy class_slug/subclass_slug/level/hit_dice_used columns are mirrors of classes[0]
  // and stay in sync during migration so old code keeps working.
  try { db.exec("ALTER TABLE characters ADD COLUMN classes TEXT NOT NULL DEFAULT '[]'"); } catch { /* exists */ }

  // Backfill: for any character with a class_slug but empty classes array,
  // populate classes from the legacy single-class fields.
  const charsToBackfill = db.prepare(
    "SELECT id, class_slug, subclass_slug, level, hit_dice_used FROM characters WHERE class_slug IS NOT NULL AND classes = '[]'"
  ).all() as { id: number; class_slug: string; subclass_slug: string | null; level: number; hit_dice_used: number }[];
  if (charsToBackfill.length > 0) {
    const updateStmt = db.prepare('UPDATE characters SET classes = ? WHERE id = ?');
    for (const c of charsToBackfill) {
      const entry = [{ slug: c.class_slug, subclass_slug: c.subclass_slug, level: c.level, hit_dice_used: c.hit_dice_used ?? 0 }];
      updateStmt.run(JSON.stringify(entry), c.id);
    }
    console.log(`  ↳ Backfilled classes[] on ${charsToBackfill.length} character(s)`);
  }

  console.log('✅ Database schema ready');
}
