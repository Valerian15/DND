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
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_maps_campaign ON maps(campaign_id);
  `);

  // Add active_map_id to campaigns if not already present (safe to run repeatedly)
  try {
    db.exec('ALTER TABLE campaigns ADD COLUMN active_map_id INTEGER');
  } catch {
    // Column already exists — fine
  }

  console.log('✅ Database schema ready');
}
