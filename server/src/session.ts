import type { Server, Socket } from 'socket.io';
import { verifyToken, type AuthUser } from './auth/index.js';
import { db } from './db/index.js';
import { broadcastFiltered, getIo } from './io.js';
import { offerReaction, resolveReaction, cancelOffers } from './reactions.js';
import { addToDamageExpression, reduceDamageForHam } from './combatMath.js';
import { canUserSeeToken, hydrateToken, broadcastFogTokenChanges, VALID_CONDITIONS, type TokenRow } from './routes/tokens.js';
import { computeAndSaveFog, getVisibleSet } from './vision.js';

interface OnlineUser {
  user_id: number;
  username: string;
  role: string;
}

interface MapRow {
  id: number;
  campaign_id: number;
  name: string;
  image_url: string;
  grid_size: number;
  grid_offset_x: number;
  grid_offset_y: number;
  fog_enabled?: number;
  scene_tag?: string;
  created_at: number;
}

interface ChatMessageRow {
  id: number;
  campaign_id: number;
  user_id: number;
  username: string;
  body: string;
  type: string;
  data: string | null;
  created_at: number;
}

interface ChatMessageOut {
  id: number;
  campaign_id: number;
  user_id: number;
  username: string;
  body: string;
  type: 'chat' | 'roll' | 'action' | 'whisper';
  data?: {
    // Roll fields
    expression?: string;
    dice?: number[];
    modifier?: number;
    total?: number;
    label?: string;
    rollMode?: 'advantage' | 'disadvantage';
    // Whisper fields (private chat between sender + named recipient + admins)
    whisper?: { to_user_id: number; to_name: string };
    // Damage/heal fields used by the undo system
    target_token_id?: number;
    prev_hp?: number;
    undone?: boolean;
    // Spell summary metadata used by the post-hoc condition picker (DM-only UI).
    failed_target_ids?: number[];
    spell_name?: string;
    conditions_applied?: string[];
  };
  created_at: number;
}

interface InitiativeEntryRow {
  id: number;
  campaign_id: number;
  token_id: number | null;
  label: string;
  initiative: number;
  dex_score: number;
  created_at: number;
}

interface WallRow { id: number; map_id: number; x1: number; y1: number; x2: number; y2: number; created_at: number }

interface InitiativeStateOut {
  entries: InitiativeEntryRow[];
  current_id: number | null;
  round: number;
}

interface ServerToClientEvents {
  'session:state': (state: {
    online: OnlineUser[];
    active_map: MapRow | null;
    chat_history: ChatMessageOut[];
    initiative: InitiativeStateOut;
    walls: WallRow[];
    fog_visible: [number, number][];
    fog_explored: [number, number][];
  }) => void;
  'session:presence': (data: { online: OnlineUser[] }) => void;
  'map:switched': (map: MapRow | null) => void;
  'map:updated': (map: MapRow) => void;
  'session:ping': (data: { x: number; y: number; user_id: number; color: string }) => void;
  'combat:hp_undone': (data: { message_id: number }) => void;
  'token:created': (token: unknown) => void;
  'token:moved': (data: { token_id: number; col: number; row: number }) => void;
  'token:deleted': (data: { token_id: number }) => void;
  'token:hp_updated': (data: { token_id: number; hp_current: number }) => void;
  'token:conditions_updated': (data: { token_id: number; conditions: string[] }) => void;
  'token:effects_updated': (data: { token_id: number; effects: { name: string; rounds: number; indefinite?: boolean }[] }) => void;
  'token:aura_updated': (data: { token_id: number; aura_radius: number | null; aura_color: string | null }) => void;
  'token:slots_updated': (data: { token_id: number; spell_slots_used: Record<string, number> }) => void;
  'chat:message': (msg: ChatMessageOut) => void;
  'initiative:updated': (state: InitiativeStateOut) => void;
  /** A character's per-turn flags (action/bonus/reaction) were just reset server-side. */
  'character:turn_reset': (data: { character_id: number }) => void;
  /** Sent after a DM applies post-hoc conditions via the spell-summary picker. */
  'combat:summary_conditions_applied': (data: { message_id: number; conditions: string[] }) => void;
  /** Player-targeted reaction prompt (Shield, Counterspell). Filtered to the eligible user. */
  'reaction:offer': (data: { offer_id: string; deadline: number; kind: 'shield' | 'counterspell' | 'gwm-bonus' | 'lucky'; prompt: string; detail?: string }) => void;
  /** Tells the client to close a reaction chip when another player resolved the trigger first. */
  'reaction:cancelled': (data: { offer_id: string }) => void;
}

interface ClientToServerEvents {
  'session:join': (data: { campaign_id: number }) => void;
  'token:move': (data: { token_id: number; col: number; row: number }) => void;
  'chat:send': (data: { body: string; label?: string }) => void;
  'initiative:roll': () => void;
  'initiative:set': (data: { id: number; initiative: number }) => void;
  'initiative:remove': (data: { id: number }) => void;
  'initiative:add': (data: { label: string; initiative: number }) => void;
  'initiative:clear': () => void;
  'initiative:next_turn': () => void;
  'initiative:end_combat': () => void;
  'token:effect_apply': (data: { token_id: number; name: string; rounds: number; indefinite?: boolean }) => void;
  'token:effect_remove': (data: { token_id: number; name: string }) => void;
  'token:effect_adjust': (data: { token_id: number; name: string; delta: number }) => void;
  'token:conditions_set': (data: { token_id: number; conditions: string[] }) => void;
  'group:roll': (data: { kind: 'skill' | 'save' | 'ability'; key: string }) => void;
  'combat:resolve_spell': (data: {
    caster_token_id: number;
    target_token_ids: number[];
    spell_name: string;
    save_ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    save_dc: number;
    damage_dice: string;
    damage_type: string;
    half_on_save: boolean;
    /** Conditions to apply to targets that fail their save. */
    conditions_on_fail?: string[];
    /** Slot level the spell is cast at — used by Counterspell to gauge auto-counter vs DC contest. */
    cast_level?: number;
  }) => void;
  /**
   * Attack-vs-AC resolver — used for spell attacks (Fire Bolt etc.) AND weapon attacks.
   * For each target: roll d20+attack_bonus vs AC. On hit: roll damage_dice. On nat 20: double the dice.
   * If roll_mode is 'advantage' / 'disadvantage', the d20 roll is 2d20 pick high / low.
   */
  'combat:resolve_attack': (data: {
    caster_token_id: number;
    target_token_ids: number[];
    attack_name: string;
    attack_bonus: number;
    damage_dice: string;
    damage_type: string;
    /** True for spell attacks (just affects chat label). */
    is_spell?: boolean;
    roll_mode?: 'advantage' | 'normal' | 'disadvantage';
    /** Slot level the spell is cast at (when is_spell=true) — for Counterspell DC contests. */
    cast_level?: number;
    /**
     * GWM / Sharpshooter -5/+10 toggle. Server validates the caster has the appropriate feat
     * before applying. Client should only show the toggle for eligible weapons.
     */
    power_attack?: boolean;
  }) => void;
  /**
   * Auto-hit damage resolver (Magic Missile and similar).
   * `hit_count` instances of `damage_dice` are distributed round-robin across the targets.
   * No attack roll, no save — every hit lands.
   */
  'combat:resolve_auto_hit': (data: {
    caster_token_id: number;
    target_token_ids: number[];
    attack_name: string;
    hit_count: number;
    damage_dice: string;
    damage_type: string;
    /** Slot level for Counterspell DC contests. */
    cast_level?: number;
  }) => void;
  /**
   * Healing resolver (Cure Wounds, Healing Word, Mass Healing Word, etc.).
   * Rolls heal_dice once per target and adds to HP (clamped to hp_max).
   */
  'combat:resolve_heal': (data: {
    caster_token_id: number;
    target_token_ids: number[];
    spell_name: string;
    heal_dice: string;
  }) => void;
  /** Map ping — relayed to all clients. Origin is map-canvas pixel coords. */
  'session:ping': (data: { x: number; y: number }) => void;
  /**
   * DM-only — undo a damage/heal applied via a combat:resolve_* handler.
   * Reads the chat message's `data` JSON for `target_token_id` + `prev_hp` and restores them.
   */
  'combat:undo_hp': (data: { message_id: number }) => void;
  /**
   * DM-only — apply chosen condition(s) to the failed-save targets recorded on a spell-summary
   * chat message. The message's `data` is updated to include `conditions_applied` so the picker
   * doesn't reappear after the fact.
   */
  'combat:apply_summary_conditions': (data: { message_id: number; conditions: string[] }) => void;
  /** Player response to a Shield / Counterspell offer. */
  'reaction:respond': (data: { offer_id: string; accept: boolean }) => void;
}

interface SocketData {
  user: AuthUser;
  campaign_id?: number;
}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const presence = new Map<number, Map<string, OnlineUser>>();

function onlineList(campaignId: number): OnlineUser[] {
  const room = presence.get(campaignId);
  if (!room) return [];
  return [...new Map([...room.values()].map((u) => [u.user_id, u])).values()];
}

function getActiveMap(campaignId: number): MapRow | null {
  return db.prepare(`
    SELECT m.* FROM maps m
    JOIN campaigns c ON c.active_map_id = m.id
    WHERE c.id = ?
  `).get(campaignId) as MapRow | undefined ?? null;
}

function getCampaignDm(campaignId: number): number | null {
  const row = db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(campaignId) as { dm_id: number } | undefined;
  return row?.dm_id ?? null;
}

function hydrateMessage(row: ChatMessageRow): ChatMessageOut {
  return {
    ...row,
    type: row.type as ChatMessageOut['type'],
    data: row.data ? JSON.parse(row.data) : undefined,
  };
}

function getRecentMessages(campaignId: number, viewerUserId: number, viewerRole: string): ChatMessageOut[] {
  const rows = db.prepare(
    'SELECT * FROM chat_messages WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 100'
  ).all(campaignId) as ChatMessageRow[];
  const all = rows.reverse().map(hydrateMessage);
  // Filter out whispers the viewer wasn't part of.
  return all.filter((m) => {
    if (m.type !== 'whisper') return true;
    if (viewerRole === 'admin') return true;
    if (m.user_id === viewerUserId) return true;
    if (m.data?.whisper?.to_user_id === viewerUserId) return true;
    return false;
  });
}

function getInitiativeEntries(campaignId: number): InitiativeEntryRow[] {
  return db.prepare(
    'SELECT * FROM initiative_entries WHERE campaign_id = ? ORDER BY initiative DESC, dex_score DESC, id ASC'
  ).all(campaignId) as InitiativeEntryRow[];
}

function getInitiativeState(campaignId: number): InitiativeStateOut {
  const entries = getInitiativeEntries(campaignId);
  const turn = db.prepare('SELECT initiative_current_id, initiative_round FROM campaigns WHERE id = ?')
    .get(campaignId) as { initiative_current_id: number | null; initiative_round: number } | undefined;
  return {
    entries,
    current_id: turn?.initiative_current_id ?? null,
    round: turn?.initiative_round ?? 0,
  };
}

function setInitiativeTurn(campaignId: number, currentId: number | null, round: number) {
  db.prepare('UPDATE campaigns SET initiative_current_id = ?, initiative_round = ? WHERE id = ?')
    .run(currentId, round, campaignId);
}

function getNpcDex(token: { character_id: number | null; campaign_npc_id?: number | null; monster_slug?: string | null; abilities?: string | null }): number {
  // PC: from characters.abilities (JSON)
  if (token.character_id !== null && token.abilities) {
    try {
      const a = JSON.parse(token.abilities) as { dex?: number };
      return a.dex ?? 10;
    } catch { /* fall through */ }
  }
  // Library monster: from monsters.data JSON via monster_slug
  if (token.monster_slug) {
    const mrow = db.prepare('SELECT data FROM monsters WHERE slug = ?').get(token.monster_slug) as { data: string } | undefined;
    if (mrow?.data) {
      try {
        const d = JSON.parse(mrow.data) as { dexterity?: number };
        return d.dexterity ?? 10;
      } catch { /* fall through */ }
    }
  }
  // Campaign NPC: from campaign_npcs.abilities (JSON)
  if (token.campaign_npc_id) {
    const nrow = db.prepare('SELECT abilities FROM campaign_npcs WHERE id = ?').get(token.campaign_npc_id) as { abilities: string } | undefined;
    if (nrow?.abilities) {
      try {
        const a = JSON.parse(nrow.abilities) as { dex?: number };
        return a.dex ?? 10;
      } catch { /* fall through */ }
    }
  }
  return 10;
}

/**
 * Roll a damage expression like "8d6", "1d8+3", "2d4+5".
 * Returns the individual dice rolls, the flat modifier, and the total.
 */
function rollDiceExpression(expr: string): { rolls: number[]; modifier: number; total: number } {
  const match = expr.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return { rolls: [], modifier: 0, total: 0 };
  const count = Math.min(50, Math.max(0, parseInt(match[1], 10)));
  const sides = Math.max(1, parseInt(match[2], 10));
  const mod = match[3] ? parseInt(match[3], 10) : 0;
  const rolls: number[] = [];
  let total = mod;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }
  return { rolls, modifier: mod, total };
}

const ABILITY_FULL_NAME: Record<string, string> = {
  str: 'strength', dex: 'dexterity', con: 'constitution',
  int: 'intelligence', wis: 'wisdom', cha: 'charisma',
};

/**
 * Compute the saving-throw modifier for any token (PC / library monster / campaign NPC).
 * Falls back to 0 if data is missing.
 */
function computeSaveModForToken(
  token: { character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null },
  ability: string,
): number {
  // PC
  if (token.character_id) {
    const c = db.prepare('SELECT level, abilities, saves FROM characters WHERE id = ?').get(token.character_id) as { level: number; abilities: string; saves: string } | undefined;
    if (!c) return 0;
    try {
      const abil = JSON.parse(c.abilities) as Record<string, number>;
      const saves = JSON.parse(c.saves) as Record<string, { proficient?: boolean }>;
      const score = abil[ability] ?? 10;
      const mod = Math.floor((score - 10) / 2);
      const profBonus = Math.floor((c.level - 1) / 4) + 2;
      return mod + (saves[ability]?.proficient ? profBonus : 0);
    } catch { return 0; }
  }
  // Library monster: data has explicit `<ability>_save` field (or null) and ability scores
  if (token.monster_slug) {
    const m = db.prepare('SELECT data FROM monsters WHERE slug = ?').get(token.monster_slug) as { data: string } | undefined;
    if (!m) return 0;
    try {
      const d = JSON.parse(m.data) as Record<string, unknown>;
      const fullKey = ABILITY_FULL_NAME[ability];
      const sb = d[`${fullKey}_save`];
      if (typeof sb === 'number') return sb;
      const score = typeof d[fullKey] === 'number' ? d[fullKey] as number : 10;
      return Math.floor((score - 10) / 2);
    } catch { return 0; }
  }
  // Campaign NPC: abilities + saving_throws array
  if (token.campaign_npc_id) {
    const n = db.prepare('SELECT abilities, saving_throws FROM campaign_npcs WHERE id = ?').get(token.campaign_npc_id) as { abilities: string; saving_throws: string } | undefined;
    if (!n) return 0;
    try {
      const abil = JSON.parse(n.abilities) as Record<string, number>;
      const profSaves = JSON.parse(n.saving_throws) as string[];
      const score = abil[ability] ?? 10;
      const mod = Math.floor((score - 10) / 2);
      // NPC prof bonus is hardcoded +2 (matches NpcSheet display).
      return mod + (profSaves.includes(ability) ? 2 : 0);
    } catch { return 0; }
  }
  return 0;
}

/**
 * Returns the damage modifier for a given damage type against a token:
 *   2 = vulnerable (double), 1 = normal, 0.5 = resistant (half), 0 = immune.
 * Library monsters use substring matching on their existing damage_resistances/vulnerabilities/immunities
 * text fields. PCs and campaign NPCs use explicit JSON arrays of damage type names.
 */
function damageModifierForToken(
  token: { character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null },
  damageType: string,
): { multiplier: 0 | 0.5 | 1 | 2; label: '' | 'resisted' | 'vulnerable' | 'immune' } {
  const dt = (damageType || '').toLowerCase().trim();
  if (!dt) return { multiplier: 1, label: '' };

  let resistances: string[] = [];
  let vulnerabilities: string[] = [];
  let immunities: string[] = [];

  if (token.character_id) {
    const c = db.prepare('SELECT resistances, vulnerabilities, immunities FROM characters WHERE id = ?').get(token.character_id) as { resistances: string; vulnerabilities: string; immunities: string } | undefined;
    if (c) {
      try { resistances = JSON.parse(c.resistances || '[]'); } catch { /* default */ }
      try { vulnerabilities = JSON.parse(c.vulnerabilities || '[]'); } catch { /* default */ }
      try { immunities = JSON.parse(c.immunities || '[]'); } catch { /* default */ }
    }
  } else if (token.monster_slug) {
    const m = db.prepare('SELECT data FROM monsters WHERE slug = ?').get(token.monster_slug) as { data: string } | undefined;
    if (m) {
      try {
        const d = JSON.parse(m.data) as { damage_resistances?: string; damage_vulnerabilities?: string; damage_immunities?: string };
        // Open5e fields are comma/semicolon-separated text. Split + lowercase + trim. Substring qualifiers
        // ("nonmagical attacks") aren't honored — caller takes the loose match.
        const parse = (s: string | undefined) => (s ?? '').toLowerCase().split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        resistances = parse(d.damage_resistances);
        vulnerabilities = parse(d.damage_vulnerabilities);
        immunities = parse(d.damage_immunities);
      } catch { /* default */ }
    }
  } else if (token.campaign_npc_id) {
    const n = db.prepare('SELECT resistances, vulnerabilities, immunities FROM campaign_npcs WHERE id = ?').get(token.campaign_npc_id) as { resistances: string; vulnerabilities: string; immunities: string } | undefined;
    if (n) {
      try { resistances = JSON.parse(n.resistances || '[]'); } catch { /* default */ }
      try { vulnerabilities = JSON.parse(n.vulnerabilities || '[]'); } catch { /* default */ }
      try { immunities = JSON.parse(n.immunities || '[]'); } catch { /* default */ }
    }
  }

  // Substring match — covers "fire" inside "fire damage from nonmagical sources" etc.
  const has = (arr: string[]) => arr.some((entry) => entry.includes(dt));
  if (has(immunities)) return { multiplier: 0, label: 'immune' };
  if (has(resistances)) return { multiplier: 0.5, label: 'resisted' };
  if (has(vulnerabilities)) return { multiplier: 2, label: 'vulnerable' };
  return { multiplier: 1, label: '' };
}

/**
 * Persist a token's new HP and broadcast the change. For PC tokens, also keeps
 * `characters.hp_current` in sync so the character sheet reflects auto-resolver
 * damage/heal even after a refresh or for clients that aren't actively listening.
 */
// Reaction-eligibility check for a PC token: do they have `spellSlug` prepared (or known),
// an unspent slot of `minLevel` or higher, and an unused reaction this turn?
// Returns the character's owner_id (player to prompt) or null if they can't react.
function checkPcCanReactWith(tokenId: number, spellSlug: string, minLevel: number): { ownerId: number; characterId: number; charName: string } | null {
  const tok = db.prepare("SELECT character_id, token_type FROM tokens WHERE id = ?").get(tokenId) as { character_id: number | null; token_type: string } | undefined;
  if (!tok || tok.token_type !== 'pc' || tok.character_id == null) return null;
  const ch = db.prepare(
    'SELECT id, owner_id, name, spells_known, spells_prepared, spell_slots, spell_slots_used, reaction_used FROM characters WHERE id = ?'
  ).get(tok.character_id) as {
    id: number; owner_id: number; name: string;
    spells_known: string; spells_prepared: string;
    spell_slots: string; spell_slots_used: string;
    reaction_used: number;
  } | undefined;
  if (!ch) return null;
  if (ch.reaction_used) return null;

  // Must have the spell either prepared (prepared casters) or known (sorcerers / warlocks).
  let known: string[] = [];
  let prepared: string[] = [];
  try { known = JSON.parse(ch.spells_known) ?? []; } catch { /* */ }
  try { prepared = JSON.parse(ch.spells_prepared) ?? []; } catch { /* */ }
  if (!known.includes(spellSlug) && !prepared.includes(spellSlug)) return null;

  // Must have an unspent slot of at least `minLevel`.
  let slots: Record<string, number> = {};
  let used: Record<string, number> = {};
  try { slots = JSON.parse(ch.spell_slots) ?? {}; } catch { /* */ }
  try { used = JSON.parse(ch.spell_slots_used) ?? {}; } catch { /* */ }
  let slotLvl: number | null = null;
  for (let l = minLevel; l <= 9; l++) {
    const max = slots[String(l)] ?? 0;
    const u = used[String(l)] ?? 0;
    if (max > u) { slotLvl = l; break; }
  }
  if (slotLvl == null) return null;
  return { ownerId: ch.owner_id, characterId: ch.id, charName: ch.name };
}

/**
 * Check if a PC token can use Lucky to force the attacker to reroll.
 * Returns the owner / character / name + current luck if eligible, null otherwise.
 */
function checkPcCanLuckyReroll(tokenId: number): { ownerId: number; characterId: number; charName: string; luckyUsed: number } | null {
  const tok = db.prepare("SELECT character_id, token_type FROM tokens WHERE id = ?").get(tokenId) as { character_id: number | null; token_type: string } | undefined;
  if (!tok || tok.token_type !== 'pc' || tok.character_id == null) return null;
  const ch = db.prepare(
    'SELECT id, owner_id, name, feats, lucky_used, reaction_used FROM characters WHERE id = ?'
  ).get(tok.character_id) as { id: number; owner_id: number; name: string; feats: string; lucky_used: number; reaction_used: number } | undefined;
  if (!ch || ch.reaction_used) return null;
  let feats: string[] = [];
  try { feats = JSON.parse(ch.feats) ?? []; } catch { /* */ }
  if (!feats.includes('lucky')) return null;
  if (ch.lucky_used >= 3) return null;
  return { ownerId: ch.owner_id, characterId: ch.id, charName: ch.name, luckyUsed: ch.lucky_used };
}

/** Burn one luck point and mark reaction_used. */
function consumeLucky(characterId: number) {
  db.prepare('UPDATE characters SET lucky_used = lucky_used + 1, reaction_used = 1 WHERE id = ?').run(characterId);
}

// Spend `level` slot + mark reaction_used on a character. Used after Yes on a reaction offer.
function consumePcReaction(characterId: number, minLevel: number) {
  const ch = db.prepare('SELECT spell_slots, spell_slots_used FROM characters WHERE id = ?')
    .get(characterId) as { spell_slots: string; spell_slots_used: string } | undefined;
  if (!ch) return;
  let slots: Record<string, number> = {};
  let used: Record<string, number> = {};
  try { slots = JSON.parse(ch.spell_slots) ?? {}; } catch { /* */ }
  try { used = JSON.parse(ch.spell_slots_used) ?? {}; } catch { /* */ }
  for (let l = minLevel; l <= 9; l++) {
    const max = slots[String(l)] ?? 0;
    const u = used[String(l)] ?? 0;
    if (max > u) { used[String(l)] = u + 1; break; }
  }
  db.prepare('UPDATE characters SET spell_slots_used = ?, reaction_used = 1 WHERE id = ?')
    .run(JSON.stringify(used), characterId);
}

// All PC tokens within `rangeFt` (Chebyshev / king's-move) of the caster on the same map.
// Returns [tokenId, ownerId, characterId, charName] for those eligible to Counterspell.
function findCounterspellCandidates(casterTokenId: number, rangeFt: number, casterSpellLevel: number): Array<{ tokenId: number; ownerId: number; characterId: number; charName: string }> {
  const caster = db.prepare('SELECT map_id, col, row FROM tokens WHERE id = ?').get(casterTokenId) as { map_id: number; col: number; row: number } | undefined;
  if (!caster) return [];
  const map = db.prepare('SELECT grid_size FROM maps WHERE id = ?').get(caster.map_id) as { grid_size: number } | undefined;
  if (!map) return [];
  // 5e grid: 1 cell = 5 ft.
  const rangeCells = Math.ceil(rangeFt / 5);
  const candidates = db.prepare(
    "SELECT id, character_id, col, row FROM tokens WHERE map_id = ? AND token_type = 'pc' AND id != ?"
  ).all(caster.map_id, casterTokenId) as { id: number; character_id: number | null; col: number; row: number }[];
  const out: Array<{ tokenId: number; ownerId: number; characterId: number; charName: string }> = [];
  for (const c of candidates) {
    const dist = Math.max(Math.abs(c.col - caster.col), Math.abs(c.row - caster.row));
    if (dist > rangeCells) continue;
    const elig = checkPcCanReactWith(c.id, 'counterspell', Math.max(3, Math.min(9, casterSpellLevel)));
    if (elig) out.push({ tokenId: c.id, ownerId: elig.ownerId, characterId: elig.characterId, charName: elig.charName });
  }
  return out;
}

// Spellcasting ability used for the Counterspell ability check (5e RAW: your spellcasting modifier).
// Counterspell-eligible classes only. Defaults to INT for unknown classes.
function counterspellAbility(classSlug: string | null): 'int' | 'cha' {
  switch (classSlug) {
    case 'sorcerer':
    case 'warlock':
    case 'bard':
      return 'cha';
    case 'wizard':
    default:
      return 'int';
  }
}

/** Wrapper around reduceDamageForHam that resolves the feat from the target's character row. */
function applyHeavyArmorMaster(
  target: { character_id: number | null },
  damageType: string,
  dmg: number,
): { adjusted: number; reduced: boolean } {
  const hasHam = !!target.character_id && getCharacterFeats(target.character_id).has('heavy-armor-master');
  return reduceDamageForHam(hasHam, damageType, dmg);
}

/** Returns true if the token has a "Rage" effect active (case-insensitive name match). */
function tokenHasRageEffect(tokenId: number): boolean {
  const row = db.prepare('SELECT effects FROM tokens WHERE id = ?').get(tokenId) as { effects: string } | undefined;
  if (!row) return false;
  try {
    const arr = JSON.parse(row.effects ?? '[]');
    return Array.isArray(arr) && arr.some((e: { name?: unknown }) => typeof e?.name === 'string' && /^rage$/i.test(e.name));
  } catch { return false; }
}

/** Find the barbarian level for a PC character (searches classes[] then falls back to class_slug). */
function getBarbarianLevel(characterId: number | null): number {
  if (!characterId) return 0;
  const ch = db.prepare('SELECT class_slug, level, classes FROM characters WHERE id = ?').get(characterId) as { class_slug: string | null; level: number; classes: string } | undefined;
  if (!ch) return 0;
  try {
    const classes = JSON.parse(ch.classes ?? '[]') as Array<{ slug: string; level: number }>;
    if (Array.isArray(classes) && classes.length > 0) {
      const barb = classes.find((c) => c.slug === 'barbarian');
      return barb?.level ?? 0;
    }
  } catch { /* fall through */ }
  return ch.class_slug === 'barbarian' ? ch.level : 0;
}

/** Rage offense bonus by barbarian level (PHB p.48): +2 (1-8), +3 (9-15), +4 (16+). */
function rageOffenseBonus(barbarianLevel: number): number {
  if (barbarianLevel <= 0) return 0;
  if (barbarianLevel >= 16) return 4;
  if (barbarianLevel >= 9) return 3;
  return 2;
}

/** Find the rogue level for a PC character. Mirror of getBarbarianLevel. */
function getRogueLevel(characterId: number | null): number {
  if (!characterId) return 0;
  const ch = db.prepare('SELECT class_slug, level, classes FROM characters WHERE id = ?').get(characterId) as { class_slug: string | null; level: number; classes: string } | undefined;
  if (!ch) return 0;
  try {
    const classes = JSON.parse(ch.classes ?? '[]') as Array<{ slug: string; level: number }>;
    if (Array.isArray(classes) && classes.length > 0) {
      const rg = classes.find((c) => c.slug === 'rogue');
      return rg?.level ?? 0;
    }
  } catch { /* fall through */ }
  return ch.class_slug === 'rogue' ? ch.level : 0;
}

/** Sneak attack dice count = ceil(rogueLevel / 2). */
function sneakAttackDiceCount(rogueLevel: number): number {
  if (rogueLevel <= 0) return 0;
  return Math.ceil(rogueLevel / 2);
}

/**
 * RAW sneak attack eligibility (without checking weapon type, which we don't track):
 *   - the attacker is a rogue PC who hasn't sneak-attacked this turn
 *   - either the attack roll has advantage OR a non-target, non-attacker creature is
 *     within 5 ft of the target (Chebyshev ≤ 1 on a 5-ft grid)
 */
function checkSneakAttackEligible(
  attackerTokenId: number,
  attackerCharacterId: number | null,
  targetTokenId: number,
  hadAdvantage: boolean,
): boolean {
  if (!attackerCharacterId) return false;
  const ch = db.prepare('SELECT sneak_used_this_turn FROM characters WHERE id = ?').get(attackerCharacterId) as { sneak_used_this_turn: number } | undefined;
  if (!ch || ch.sneak_used_this_turn) return false;
  if (getRogueLevel(attackerCharacterId) <= 0) return false;
  if (hadAdvantage) return true;

  // Adjacency check: pull target's row + every other token on the same map; any token
  // (except the attacker itself) within Chebyshev distance 1 counts as flanking.
  const target = db.prepare('SELECT map_id, col, row FROM tokens WHERE id = ?').get(targetTokenId) as { map_id: number; col: number; row: number } | undefined;
  if (!target) return false;
  const others = db.prepare('SELECT id, col, row FROM tokens WHERE map_id = ? AND id != ? AND id != ?')
    .all(target.map_id, targetTokenId, attackerTokenId) as Array<{ id: number; col: number; row: number }>;
  return others.some((t) => Math.abs(t.col - target.col) <= 1 && Math.abs(t.row - target.row) <= 1);
}

function consumeSneakAttack(characterId: number) {
  db.prepare('UPDATE characters SET sneak_used_this_turn = 1 WHERE id = ?').run(characterId);
}

/**
 * Rage defense: resistance to bludgeoning/piercing/slashing while raging. Halves damage
 * AFTER the existing resistance multiplier from `damageModifierForToken` (applies once).
 */
function applyRageDefense(
  target: { id: number; character_id: number | null },
  damageType: string,
  dmg: number,
): { adjusted: number; reduced: boolean } {
  if (dmg <= 0 || !target.character_id) return { adjusted: dmg, reduced: false };
  const dt = (damageType || '').toLowerCase().trim();
  if (dt !== 'bludgeoning' && dt !== 'piercing' && dt !== 'slashing') {
    return { adjusted: dmg, reduced: false };
  }
  if (getBarbarianLevel(target.character_id) <= 0) return { adjusted: dmg, reduced: false };
  if (!tokenHasRageEffect(target.id)) return { adjusted: dmg, reduced: false };
  return { adjusted: Math.floor(dmg / 2), reduced: true };
}

/** Load the feats array for a PC character. Returns an empty Set if missing or unparseable. */
function getCharacterFeats(characterId: number | null | undefined): Set<string> {
  if (!characterId) return new Set();
  const ch = db.prepare('SELECT feats FROM characters WHERE id = ?').get(characterId) as { feats: string } | undefined;
  if (!ch) return new Set();
  try {
    const arr = JSON.parse(ch.feats || '[]');
    if (Array.isArray(arr)) return new Set(arr.filter((s): s is string => typeof s === 'string'));
  } catch { /* fall through */ }
  return new Set();
}

// Compute spellcasting modifier for a PC = ability_mod + proficiency_bonus.
function spellcastingMod(characterId: number): number {
  const ch = db.prepare('SELECT class_slug, level, abilities FROM characters WHERE id = ?').get(characterId) as { class_slug: string | null; level: number; abilities: string } | undefined;
  if (!ch) return 0;
  const ability = counterspellAbility(ch.class_slug);
  let abilities: Record<string, number> = {};
  try { abilities = JSON.parse(ch.abilities) ?? {}; } catch { /* */ }
  const score = abilities[ability] ?? 10;
  const abilMod = Math.floor((score - 10) / 2);
  const profBonus = Math.floor((ch.level - 1) / 4) + 2;
  return abilMod + profBonus;
}

// Run Counterspell offers for one incoming spell. Returns true if the spell was negated.
// `incomingLevel` is the slot level the spell was cast at; used to decide auto-counter vs contest.
async function maybeCounterspell(cid: number, casterTokenId: number, spellName: string, incomingLevel: number, _insertChat?: unknown): Promise<boolean> {
  const candidates = findCounterspellCandidates(casterTokenId, 60, 3);
  if (candidates.length === 0) return false;
  const casterTok = db.prepare('SELECT label FROM tokens WHERE id = ?').get(casterTokenId) as { label: string } | undefined;
  const casterLabel = casterTok?.label ?? 'caster';

  type O = { offerId: string; promise: Promise<boolean>; characterId: number; charName: string };
  const offers: O[] = candidates.map((c) => {
    const o = offerReaction(cid, c.ownerId, {
      kind: 'counterspell',
      prompt: `Counterspell ${casterLabel}'s ${spellName} (L${incomingLevel})?`,
      detail: incomingLevel <= 3
        ? 'L3+ slot auto-negates.'
        : `Auto-counters with an L${incomingLevel}+ slot. Otherwise contest: 1d20 + your spellcasting mod vs DC ${10 + incomingLevel}.`,
    });
    return { offerId: o.offerId, promise: o.promise, characterId: c.characterId, charName: c.charName };
  });

  const winner = await new Promise<O | null>((resolve) => {
    let pending = offers.length;
    let settled = false;
    for (const o of offers) {
      o.promise.then((accept) => {
        if (settled) return;
        if (accept) {
          settled = true;
          resolve(o);
        } else if (--pending === 0) {
          settled = true;
          resolve(null);
        }
      });
    }
  });

  if (!winner) return false;
  cancelOffers(offers.filter((o) => o.offerId !== winner.offerId).map((o) => o.offerId));

  // Determine the slot the counterspeller will spend — lowest available L3+ slot.
  const ch = db.prepare('SELECT spell_slots, spell_slots_used FROM characters WHERE id = ?')
    .get(winner.characterId) as { spell_slots: string; spell_slots_used: string } | undefined;
  let slots: Record<string, number> = {};
  let used: Record<string, number> = {};
  try { slots = JSON.parse(ch?.spell_slots ?? '{}'); } catch { /* */ }
  try { used = JSON.parse(ch?.spell_slots_used ?? '{}'); } catch { /* */ }
  let chosenSlot = 0;
  for (let l = 3; l <= 9; l++) {
    if ((slots[String(l)] ?? 0) > (used[String(l)] ?? 0)) { chosenSlot = l; break; }
  }
  // Always burn the slot + reaction on Yes (5e: you commit even if the contest fails).
  consumePcReaction(winner.characterId, 3);

  const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');
  const postNote = (text: string, data?: object) => {
    const r = insertChat.run(cid, 0, 'system', `/action ${text}`, 'action', data ? JSON.stringify(data) : null);
    const noteRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
    getIo().to(`campaign:${cid}`).emit('chat:message', hydrateMessage(noteRow));
  };

  // Auto-counter: counterspeller's slot ≥ incoming level → no roll needed.
  if (chosenSlot >= incomingLevel) {
    postNote(`${winner.charName} casts Counterspell (L${chosenSlot}) — ${casterLabel}'s ${spellName} is negated.`);
    return true;
  }

  // Contest: 1d20 + spellcasting modifier vs DC 10 + incomingLevel.
  const mod = spellcastingMod(winner.characterId);
  const roll = Math.floor(Math.random() * 20) + 1;
  const total = roll + mod;
  const dc = 10 + incomingLevel;
  const ok = total >= dc;

  // Post the d20 roll itself so it's visible in the dice log.
  const rollData = { expression: `1d20${mod >= 0 ? '+' : ''}${mod}`, dice: [roll], modifier: mod, total, label: `${winner.charName} — Counterspell check (DC ${dc})` };
  const rollR = insertChat.run(cid, 0, 'system', `/roll 1d20${mod >= 0 ? '+' : ''}${mod}`, 'roll', JSON.stringify(rollData));
  const rollRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(rollR.lastInsertRowid) as ChatMessageRow;
  getIo().to(`campaign:${cid}`).emit('chat:message', hydrateMessage(rollRow));

  if (ok) {
    postNote(`${winner.charName}'s Counterspell (L${chosenSlot}) — ${total} ≥ DC ${dc}: ${casterLabel}'s ${spellName} is negated.`);
    return true;
  }
  postNote(`${winner.charName}'s Counterspell (L${chosenSlot}) — ${total} < DC ${dc}: ${casterLabel}'s ${spellName} resolves anyway.`);
  return false;
}

function applyTokenHpChange(cid: number, tokenId: number, characterId: number | null, newHp: number) {
  // Read prev HP so we can detect wake-from-down transitions.
  const prevRow = db.prepare('SELECT hp_current FROM tokens WHERE id = ?').get(tokenId) as { hp_current: number } | undefined;
  const prevHp = prevRow?.hp_current ?? 0;

  db.prepare('UPDATE tokens SET hp_current = ? WHERE id = ?').run(newHp, tokenId);
  if (characterId !== null) {
    db.prepare("UPDATE characters SET hp_current = ?, updated_at = strftime('%s', 'now') WHERE id = ?")
      .run(newHp, characterId);

    // Heal-from-down: PC was at 0, now > 0 → reset death saves and post a wake note.
    if (prevHp === 0 && newHp > 0) {
      const char = db.prepare('SELECT name, death_saves_success, death_saves_failure FROM characters WHERE id = ?').get(characterId) as { name: string; death_saves_success: number; death_saves_failure: number } | undefined;
      if (char && (char.death_saves_success > 0 || char.death_saves_failure > 0)) {
        db.prepare('UPDATE characters SET death_saves_success = 0, death_saves_failure = 0 WHERE id = ?').run(characterId);
        const r = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)')
          .run(cid, 0, 'system', `/action ${char.name} regains consciousness — death saves reset.`, 'action', null);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        getIo().to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }
    }
  }
  getIo().to(`campaign:${cid}`).emit('token:hp_updated', { token_id: tokenId, hp_current: newHp });
}

/**
 * Damage-while-down: if a PC was already at 0 HP and just took damage, RAW says they
 * automatically fail one death save (two on a crit). Caller passes wasCrit so we know.
 */
function applyDownDamageFail(cid: number, characterId: number | null, wasCrit: boolean) {
  if (characterId === null) return;
  const char = db.prepare('SELECT name, death_saves_failure FROM characters WHERE id = ?').get(characterId) as { name: string; death_saves_failure: number } | undefined;
  if (!char) return;
  const fails = wasCrit ? 2 : 1;
  const next = Math.min(3, (char.death_saves_failure ?? 0) + fails);
  if (next === char.death_saves_failure) return;
  db.prepare('UPDATE characters SET death_saves_failure = ? WHERE id = ?').run(next, characterId);
  const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');
  const r = insertChat.run(cid, 0, 'system', `/action ${char.name} takes damage while down — ${fails} death save failure${fails > 1 ? 's' : ''} (now ${next}/3).`, 'action', null);
  const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
  getIo().to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
  if (next >= 3) {
    const dr = insertChat.run(cid, 0, 'system', `/action ${char.name} dies (3 death save failures).`, 'action', null);
    const drow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(dr.lastInsertRowid) as ChatMessageRow;
    getIo().to(`campaign:${cid}`).emit('chat:message', hydrateMessage(drow));
  }
}

/** Read the AC of any token (PC / library monster / campaign NPC). Defaults to 10 if missing. */
function computeAcForToken(token: { character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null }): number {
  if (token.character_id) {
    const c = db.prepare('SELECT ac FROM characters WHERE id = ?').get(token.character_id) as { ac: number } | undefined;
    return c?.ac ?? 10;
  }
  if (token.monster_slug) {
    const m = db.prepare('SELECT data FROM monsters WHERE slug = ?').get(token.monster_slug) as { data: string } | undefined;
    if (!m) return 10;
    try {
      const d = JSON.parse(m.data) as { armor_class?: number };
      return typeof d.armor_class === 'number' ? d.armor_class : 10;
    } catch { return 10; }
  }
  if (token.campaign_npc_id) {
    const n = db.prepare('SELECT ac FROM campaign_npcs WHERE id = ?').get(token.campaign_npc_id) as { ac: number } | undefined;
    return n?.ac ?? 10;
  }
  return 10;
}

/**
 * Roll damage as a crit: doubles the dice count, modifier unchanged.
 * Example: "1d10+3" on crit → 2d10+3.
 */
function rollCritDamage(expr: string): { rolls: number[]; modifier: number; total: number } {
  const match = expr.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return { rolls: [], modifier: 0, total: 0 };
  const baseCount = parseInt(match[1], 10);
  const sides = Math.max(1, parseInt(match[2], 10));
  const mod = match[3] ? parseInt(match[3], 10) : 0;
  const count = Math.min(50, Math.max(0, baseCount * 2));
  const rolls: number[] = [];
  let total = mod;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }
  return { rolls, modifier: mod, total };
}

function rollDice(expression: string): { dice: number[]; modifier: number; total: number; rollMode?: 'advantage' | 'disadvantage' } | null {
  const match = expression.match(/^(\d+)d(\d+)(adv|dis)?([+-]\d+)?$/i);
  if (!match) return null;
  const count = Math.min(Math.max(1, parseInt(match[1])), 20);
  const sides = Math.min(Math.max(2, parseInt(match[2])), 1000);
  const mode = match[3]?.toLowerCase() as 'adv' | 'dis' | undefined;
  const modifier = match[4] ? parseInt(match[4]) : 0;

  let dice: number[];
  let rollMode: 'advantage' | 'disadvantage' | undefined;

  if (mode && count === 1 && sides === 20) {
    // Roll 2d20, pick high (advantage) or low (disadvantage)
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    rollMode = mode === 'adv' ? 'advantage' : 'disadvantage';
    const chosen = rollMode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
    dice = [a, b, chosen]; // [roll1, roll2, chosen] — client displays both, uses chosen for total
  } else {
    dice = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  }

  const used = mode && count === 1 && sides === 20 ? dice[2] : dice.reduce((a, b) => a + b, 0);
  const total = used + modifier;
  return { dice, modifier, total, ...(rollMode ? { rollMode } : {}) };
}

function isDmOrAdmin(user: AuthUser, campaignId: number): boolean {
  const dmId = getCampaignDm(campaignId);
  return user.role === 'admin' || user.id === dmId;
}

export function setupSession(io: AppServer) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing token'));
    const user = verifyToken(token);
    if (!user) return next(new Error('Invalid token'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket: AppSocket) => {
    const user = socket.data.user;

    socket.on('session:join', ({ campaign_id }) => {
      const room = `campaign:${campaign_id}`;
      socket.join(room);
      socket.data.campaign_id = campaign_id;

      if (!presence.has(campaign_id)) presence.set(campaign_id, new Map());
      presence.get(campaign_id)!.set(socket.id, {
        user_id: user.id,
        username: user.username,
        role: user.role,
      });

      const activeMapNow = getActiveMap(campaign_id);
      const walls = activeMapNow
        ? db.prepare('SELECT * FROM map_walls WHERE map_id = ? ORDER BY id ASC').all(activeMapNow.id) as WallRow[]
        : [];
      const fog = activeMapNow ? computeAndSaveFog(activeMapNow.id) : { visible: [], explored: [] };

      socket.emit('session:state', {
        online: onlineList(campaign_id),
        active_map: activeMapNow,
        chat_history: getRecentMessages(campaign_id, user.id, user.role),
        initiative: getInitiativeState(campaign_id),
        walls,
        fog_visible: fog.visible,
        fog_explored: fog.explored,
      });

      io.to(room).emit('session:presence', { online: onlineList(campaign_id) });
    });

    socket.on('token:move', ({ token_id, col, row }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;

      const token = db.prepare('SELECT t.*, cnpc.category_id FROM tokens t LEFT JOIN campaign_npcs cnpc ON cnpc.id = t.campaign_npc_id WHERE t.id = ?')
        .get(token_id) as TokenRow | undefined;
      if (!token) return;

      const dmId = getCampaignDm(campaign_id);
      if (dmId === null) return;

      const isDm = user.role === 'admin' || user.id === dmId;
      let canMove = isDm;
      if (!canMove && token.token_type === 'pc' && token.character_id !== null) {
        const char = db.prepare('SELECT owner_id FROM characters WHERE id = ?')
          .get(token.character_id) as { owner_id: number } | undefined;
        canMove = char?.owner_id === user.id;
      }
      if (!canMove) {
        const controlled = JSON.parse(token.controlled_by) as number[];
        canMove = controlled.includes(user.id);
      }
      if (!canMove) return;

      const mapId = token.map_id;

      if (token.token_type === 'pc') {
        db.prepare('UPDATE tokens SET col = ?, row = ? WHERE id = ?').run(col, row, token_id);

        // PC move: always broadcast move, then recompute fog and send appear/disappear for NPCs
        broadcastFiltered(
          campaign_id,
          'token:moved',
          { token_id, col, row },
          (uid, role) => role === 'admin' || uid === dmId || canUserSeeToken(uid, { ...token, col, row }, dmId),
        );

        const oldVisible = getVisibleSet(mapId);
        const fog = computeAndSaveFog(mapId);
        const newVisible = getVisibleSet(mapId);
        broadcastFiltered(campaign_id, 'fog:update', fog, () => true);
        broadcastFogTokenChanges(campaign_id, mapId, oldVisible, newVisible, dmId);

      } else {
        // NPC move: send appropriate events based on old vs new visibility
        const oldKey = `${token.col},${token.row}`;
        const newKey = `${col},${row}`;
        const vis = getVisibleSet(mapId);
        const wasVisible = vis.has(oldKey);
        const isVisible = vis.has(newKey);

        db.prepare('UPDATE tokens SET col = ?, row = ? WHERE id = ?').run(col, row, token_id);
        const movedToken = { ...token, col, row };

        const playerFilter = (uid: number, role: string) => role !== 'admin' && uid !== dmId;

        if (wasVisible && isVisible) {
          // Stayed visible: send move to everyone
          broadcastFiltered(campaign_id, 'token:moved', { token_id, col, row }, () => true);
        } else if (!wasVisible && isVisible) {
          // Entered visibility: players now see it for the first time
          broadcastFiltered(campaign_id, 'token:moved', { token_id, col, row }, (uid, role) => role === 'admin' || uid === dmId);
          broadcastFiltered(campaign_id, 'token:created', hydrateToken(movedToken), playerFilter);
        } else if (wasVisible && !isVisible) {
          // Left visibility: players lose sight of it
          broadcastFiltered(campaign_id, 'token:deleted', { token_id }, playerFilter);
          broadcastFiltered(campaign_id, 'token:moved', { token_id, col, row }, (uid, role) => role === 'admin' || uid === dmId);
        } else {
          // Neither old nor new cell visible: DM only
          broadcastFiltered(campaign_id, 'token:moved', { token_id, col, row }, (uid, role) => role === 'admin' || uid === dmId);
        }
      }
    });

    socket.on('chat:send', ({ body, label }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null || !body) return;
      const text = String(body).trim().slice(0, 1000);
      if (!text) return;

      // Whisper: /w <name> <message> — name can be a character name or a username.
      // Recipients = sender + target user + any role='admin' user in the campaign room.
      // The campaign DM does NOT see whispers unless they also hold role='admin'.
      const whisperMatch = text.match(/^\/w\s+(\S+)\s+(.+)$/i);
      if (whisperMatch) {
        const targetName = whisperMatch[1];
        const messageText = whisperMatch[2].trim();
        if (!messageText) return;

        // Resolve target: check character names in the campaign first, then usernames.
        const charHit = db.prepare(`
          SELECT c.owner_id AS user_id, c.name
          FROM characters c
          JOIN campaign_members cm ON cm.character_id = c.id
          WHERE cm.campaign_id = ? AND c.name = ? COLLATE NOCASE
        `).get(campaign_id, targetName) as { user_id: number; name: string } | undefined;
        let targetUserId: number | null = charHit?.user_id ?? null;
        let targetDisplayName: string = charHit?.name ?? targetName;
        if (!targetUserId) {
          const userHit = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(targetName) as { id: number; username: string } | undefined;
          if (userHit) { targetUserId = userHit.id; targetDisplayName = userHit.username; }
        }
        if (!targetUserId) {
          // Unknown recipient — bounce a private system note back to the sender only.
          socket.emit('chat:message', {
            id: -Date.now(),
            campaign_id,
            user_id: 0,
            username: 'system',
            body: `Whisper failed: no character or user named "${targetName}" in this campaign.`,
            type: 'action',
            created_at: Math.floor(Date.now() / 1000),
          });
          return;
        }

        const whisperData = JSON.stringify({ whisper: { to_user_id: targetUserId, to_name: targetDisplayName } });
        const res = db.prepare(
          'INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(campaign_id, user.id, user.username, messageText, 'whisper', whisperData);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(res.lastInsertRowid) as ChatMessageRow;
        const msgOut = hydrateMessage(row);

        // Recipients: sender, target user, and any admin in the room.
        broadcastFiltered(
          campaign_id,
          'chat:message',
          msgOut,
          (uid, role) => uid === user.id || uid === targetUserId || role === 'admin',
        );
        return;
      }

      let type = 'chat';
      let data: string | null = null;

      const rollMatch = text.match(/^\/roll\s+(\d+d\d+(?:adv|dis)?([+-]\d+)?)$/i);
      if (rollMatch) {
        const expression = rollMatch[1];
        const result = rollDice(expression);
        if (result) {
          type = 'roll';
          const safeLabel = label ? String(label).trim().slice(0, 100) : undefined;
          data = JSON.stringify({ expression, ...result, ...(safeLabel ? { label: safeLabel } : {}) });
        }
      }

      if (text.startsWith('/action ')) {
        type = 'action';
      }

      const res = db.prepare(
        'INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(campaign_id, user.id, user.username, text, type, data);

      const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(res.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${campaign_id}`).emit('chat:message', hydrateMessage(row));
    });

    socket.on('initiative:roll', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      const activeMap = getActiveMap(campaign_id);
      if (!activeMap) return;

      const mapTokens = db.prepare(`
        SELECT t.id, t.label, t.character_id, t.campaign_npc_id, t.monster_slug, c.abilities
        FROM tokens t
        LEFT JOIN characters c ON c.id = t.character_id
        WHERE t.map_id = ?
      `).all(activeMap.id) as { id: number; label: string; character_id: number | null; campaign_npc_id: number | null; monster_slug: string | null; abilities: string | null }[];

      db.prepare('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaign_id);

      const insertStmt = db.prepare(
        'INSERT INTO initiative_entries (campaign_id, token_id, label, initiative, dex_score) VALUES (?, ?, ?, ?, ?)'
      );

      for (const token of mapTokens) {
        const dexScore = getNpcDex(token);
        const dexMod = Math.floor((dexScore - 10) / 2);
        const roll = Math.floor(Math.random() * 20) + 1;
        // Alert feat: +5 to initiative.
        const alertBonus = getCharacterFeats(token.character_id).has('alert') ? 5 : 0;
        insertStmt.run(campaign_id, token.id, token.label, roll + dexMod + alertBonus, dexScore);
      }

      // Set round 1 and highlight first entry
      const firstEntry = getInitiativeEntries(campaign_id)[0];
      setInitiativeTurn(campaign_id, firstEntry?.id ?? null, firstEntry ? 1 : 0);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:set', ({ id, initiative }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;
      if (!Number.isInteger(initiative)) return;

      db.prepare('UPDATE initiative_entries SET initiative = ? WHERE id = ? AND campaign_id = ?')
        .run(initiative, id, campaign_id);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:remove', ({ id }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      // If we remove the current turn entry, advance the turn first
      const state = getInitiativeState(campaign_id);
      if (state.current_id === id && state.entries.length > 1) {
        const idx = state.entries.findIndex((e) => e.id === id);
        const next = state.entries[(idx + 1) % state.entries.length];
        setInitiativeTurn(campaign_id, next.id, state.round);
      } else if (state.current_id === id) {
        setInitiativeTurn(campaign_id, null, 0);
      }
      db.prepare('DELETE FROM initiative_entries WHERE id = ? AND campaign_id = ?').run(id, campaign_id);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:add', ({ label, initiative }) => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;
      if (!label || !Number.isInteger(initiative)) return;

      db.prepare(
        'INSERT INTO initiative_entries (campaign_id, token_id, label, initiative, dex_score) VALUES (?, NULL, ?, ?, 10)'
      ).run(campaign_id, String(label).trim().slice(0, 100), initiative);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:clear', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      db.prepare('DELETE FROM initiative_entries WHERE campaign_id = ?').run(campaign_id);
      setInitiativeTurn(campaign_id, null, 0);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:next_turn', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      const state = getInitiativeState(campaign_id);
      if (state.entries.length === 0) return;

      const idx = state.current_id !== null ? state.entries.findIndex((e) => e.id === state.current_id) : -1;
      const nextIdx = (idx + 1) % state.entries.length;
      const nextRound = idx === -1 || nextIdx === 0 ? Math.max(1, state.round) + (nextIdx === 0 && idx !== -1 ? 1 : 0) : state.round;
      const roundIncremented = (nextRound > state.round) && state.round > 0;
      setInitiativeTurn(campaign_id, state.entries[nextIdx].id, nextRound || 1);

      // Reset action economy flags for the PC whose turn just started — they get a fresh
      // Action / Bonus Action / Reaction at the start of their turn (5e basic rule).
      const startingEntry = state.entries[nextIdx];
      if (startingEntry?.token_id != null) {
        const tokRow = db.prepare('SELECT character_id FROM tokens WHERE id = ?')
          .get(startingEntry.token_id) as { character_id: number | null } | undefined;
        if (tokRow?.character_id != null) {
          db.prepare('UPDATE characters SET action_used = 0, bonus_used = 0, reaction_used = 0, sneak_used_this_turn = 0 WHERE id = ?')
            .run(tokRow.character_id);
          io.to(`campaign:${campaign_id}`).emit('character:turn_reset', { character_id: tokRow.character_id });
        }
      }

      // Decrement effect timers on every token in this campaign whose round just advanced
      if (roundIncremented) {
        const tokenRows = db.prepare(
          'SELECT t.id, t.effects FROM tokens t JOIN maps m ON m.id = t.map_id WHERE m.campaign_id = ?'
        ).all(campaign_id) as { id: number; effects: string }[];
        const updateStmt = db.prepare('UPDATE tokens SET effects = ? WHERE id = ?');
        for (const tok of tokenRows) {
          let arr: { name: string; rounds: number; indefinite?: boolean }[];
          try { arr = JSON.parse(tok.effects ?? '[]'); }
          catch { continue; }
          if (!Array.isArray(arr) || arr.length === 0) continue;
          // Indefinite effects are unchanged; timed ones decrement and drop at 0.
          const next = arr
            .map((e) => e.indefinite ? e : { ...e, rounds: e.rounds - 1 })
            .filter((e) => e.indefinite || e.rounds > 0);
          if (next.length !== arr.length || next.some((e, i) => e.rounds !== arr[i].rounds)) {
            updateStmt.run(JSON.stringify(next), tok.id);
            io.to(`campaign:${campaign_id}`).emit('token:effects_updated', { token_id: tok.id, effects: next });
          }
        }
      }

      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    socket.on('initiative:end_combat', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;
      if (!isDmOrAdmin(user, campaign_id)) return;

      setInitiativeTurn(campaign_id, null, 0);
      io.to(`campaign:${campaign_id}`).emit('initiative:updated', getInitiativeState(campaign_id));
    });

    function tokenIsInCampaign(tokenId: number, cid: number): boolean {
      const row = db.prepare(
        'SELECT 1 FROM tokens t JOIN maps m ON m.id = t.map_id WHERE t.id = ? AND m.campaign_id = ?'
      ).get(tokenId, cid);
      return !!row;
    }

    /**
     * 5e concentration save triggered when a concentrating creature takes damage.
     * DC = max(10, floor(damage/2)); on fail, remove the `concentration` condition.
     * No-op if the token isn't concentrating or damage is zero.
     */
    function triggerConcentrationSave(cid: number, tokenId: number, damage: number) {
      if (damage <= 0) return;
      const token = db.prepare('SELECT id, label, conditions, character_id, monster_slug, campaign_npc_id FROM tokens WHERE id = ?')
        .get(tokenId) as { id: number; label: string; conditions: string; character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null } | undefined;
      if (!token) return;
      let conds: string[] = [];
      try { conds = JSON.parse(token.conditions); } catch { return; }
      if (!conds.includes('concentration')) return;

      const dc = Math.max(10, Math.floor(damage / 2));
      const conMod = computeSaveModForToken(token, 'con');

      // War Caster: advantage on Con saves to maintain concentration.
      const feats = getCharacterFeats(token.character_id);
      const hasWarCaster = feats.has('war-caster');
      const r1 = Math.floor(Math.random() * 20) + 1;
      const r2 = hasWarCaster ? Math.floor(Math.random() * 20) + 1 : null;
      const roll = r2 !== null ? Math.max(r1, r2) : r1;
      const total = roll + conMod;
      const passed = total >= dc;

      const expr = hasWarCaster ? `2d20kh1${conMod >= 0 ? '+' : ''}${conMod}` : `1d20${conMod >= 0 ? '+' : ''}${conMod}`;
      const advNote = hasWarCaster ? ' (War Caster advantage)' : '';
      const label = `${token.label} — Concentration Save (DC ${dc})${advNote} ${passed ? '✓ held' : '✗ broken'}`;
      const dice = r2 !== null ? [r1, r2] : [r1];
      const data = JSON.stringify({ expression: expr, dice, modifier: conMod, total, label });
      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');
      const r = insertChat.run(cid, user.id, user.username, `/roll ${expr}`, 'roll', data);
      const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));

      if (!passed) {
        const next = conds.filter((c) => c !== 'concentration');
        db.prepare('UPDATE tokens SET conditions = ? WHERE id = ?').run(JSON.stringify(next), tokenId);
        io.to(`campaign:${cid}`).emit('token:conditions_updated', { token_id: tokenId, conditions: next });
        const ar = insertChat.run(cid, user.id, user.username, `/action ${token.label} loses concentration.`, 'action', null);
        const arow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(ar.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(arow));
      }
    }

    function applyEffectMutation(tokenId: number, mutate: (arr: { name: string; rounds: number; indefinite?: boolean }[]) => { name: string; rounds: number; indefinite?: boolean }[]) {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      if (!tokenIsInCampaign(tokenId, cid)) return;
      const row = db.prepare('SELECT effects FROM tokens WHERE id = ?').get(tokenId) as { effects: string } | undefined;
      if (!row) return;
      let arr: { name: string; rounds: number; indefinite?: boolean }[] = [];
      try {
        const parsed = JSON.parse(row.effects ?? '[]');
        if (Array.isArray(parsed)) arr = parsed.filter((e: unknown): e is { name: string; rounds: number; indefinite?: boolean } => !!e && typeof (e as { name: string }).name === 'string' && typeof (e as { rounds: number }).rounds === 'number');
      } catch { /* default empty */ }
      const next = mutate(arr).filter((e) => e.indefinite || e.rounds > 0).slice(0, 32);
      db.prepare('UPDATE tokens SET effects = ? WHERE id = ?').run(JSON.stringify(next), tokenId);
      io.to(`campaign:${cid}`).emit('token:effects_updated', { token_id: tokenId, effects: next });
    }

    socket.on('token:effect_apply', ({ token_id, name, rounds, indefinite }) => {
      if (typeof name !== 'string' || !name.trim()) return;
      if (!indefinite && (!Number.isFinite(rounds) || rounds <= 0)) return;
      const trimmed = name.trim().slice(0, 50);
      const r = indefinite ? 1 : Math.min(600, Math.floor(rounds));
      applyEffectMutation(token_id, (arr) => {
        const without = arr.filter((e) => e.name !== trimmed);
        return [...without, indefinite ? { name: trimmed, rounds: r, indefinite: true } : { name: trimmed, rounds: r }];
      });
    });

    socket.on('token:effect_remove', ({ token_id, name }) => {
      if (typeof name !== 'string') return;
      applyEffectMutation(token_id, (arr) => arr.filter((e) => e.name !== name));
    });

    socket.on('token:effect_adjust', ({ token_id, name, delta }) => {
      if (typeof name !== 'string' || !Number.isFinite(delta)) return;
      const d = Math.floor(delta);
      applyEffectMutation(token_id, (arr) => arr.map((e) => e.name === name ? { ...e, rounds: e.rounds + d } : e));
    });

    socket.on('token:conditions_set', ({ token_id, conditions }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      if (!Array.isArray(conditions)) return;
      if (!tokenIsInCampaign(token_id, cid)) return;
      const filtered = (conditions as unknown[]).filter((c): c is string => typeof c === 'string' && VALID_CONDITIONS.has(c));
      const json = JSON.stringify(filtered);
      db.prepare('UPDATE tokens SET conditions = ? WHERE id = ?').run(json, token_id);
      io.to(`campaign:${cid}`).emit('token:conditions_updated', { token_id, conditions: filtered });
    });

    socket.on('group:roll', ({ kind, key }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      if (!isDmOrAdmin(user, cid)) return;
      if (kind !== 'skill' && kind !== 'save' && kind !== 'ability') return;

      const SKILL_TO_ABILITY: Record<string, string> = {
        'acrobatics': 'dex', 'animal-handling': 'wis', 'arcana': 'int', 'athletics': 'str',
        'deception': 'cha', 'history': 'int', 'insight': 'wis', 'intimidation': 'cha',
        'investigation': 'int', 'medicine': 'wis', 'nature': 'int', 'perception': 'wis',
        'performance': 'cha', 'persuasion': 'cha', 'religion': 'int', 'sleight-of-hand': 'dex',
        'stealth': 'dex', 'survival': 'wis',
      };
      const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

      let abilityKey: string;
      if (kind === 'skill') {
        if (!SKILL_TO_ABILITY[key]) return;
        abilityKey = SKILL_TO_ABILITY[key];
      } else {
        if (!ABILITIES.includes(key)) return;
        abilityKey = key;
      }

      const labelBase = kind === 'skill'
        ? key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
        : kind === 'save'
        ? `${key.toUpperCase()} Save`
        : `${key.toUpperCase()} Check`;

      // Get all PC characters in this campaign (joined via campaign_members)
      const pcs = db.prepare(`
        SELECT c.id, c.name, c.level, c.abilities, c.skills, c.saves
        FROM characters c
        JOIN campaign_members cm ON cm.character_id = c.id
        WHERE cm.campaign_id = ?
        ORDER BY c.name ASC
      `).all(cid) as { id: number; name: string; level: number; abilities: string; skills: string; saves: string }[];

      const insertStmt = db.prepare(
        'INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)'
      );

      for (const pc of pcs) {
        let mod = 0;
        try {
          const abil = JSON.parse(pc.abilities) as Record<string, number>;
          const score = abil[abilityKey] ?? 10;
          const abilMod = Math.floor((score - 10) / 2);
          const prof = Math.floor((pc.level - 1) / 4) + 2; // 5e prof bonus by level
          let isProficient = false;
          let isExpertise = false;
          if (kind === 'skill') {
            const skills = JSON.parse(pc.skills) as Record<string, { proficient?: boolean; expertise?: boolean }>;
            isProficient = !!skills[key]?.proficient;
            isExpertise = !!skills[key]?.expertise;
          } else if (kind === 'save') {
            const saves = JSON.parse(pc.saves) as Record<string, { proficient?: boolean }>;
            isProficient = !!saves[key]?.proficient;
          }
          // Expertise (rogue / bard) doubles the proficiency bonus on the chosen skills.
          const profMod = isExpertise ? prof * 2 : isProficient ? prof : 0;
          mod = abilMod + profMod;
        } catch { /* fall through with mod = 0 */ }

        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + mod;
        const expression = `1d20${mod >= 0 ? '+' : ''}${mod}`;
        const data = JSON.stringify({ expression, dice: [roll], modifier: mod, total, label: `${pc.name} — ${labelBase}` });
        const res = insertStmt.run(cid, user.id, user.username, `/roll ${expression}`, 'roll', data);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(res.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }
    });

    socket.on('combat:resolve_spell', async ({ caster_token_id, target_token_ids, spell_name, save_ability, save_dc, damage_dice, damage_type, half_on_save, conditions_on_fail, cast_level }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;

      // Gate: only resolve if combat automation is on for this campaign
      const campRow = db.prepare('SELECT settings FROM campaigns WHERE id = ?').get(cid) as { settings: string } | undefined;
      if (!campRow) return;
      let settings: { combat_automation?: boolean } = {};
      try { settings = JSON.parse(campRow.settings); } catch { /* default */ }
      if (!settings.combat_automation) return;

      // Validate caster is in this campaign
      if (!tokenIsInCampaign(caster_token_id, cid)) return;
      const validTargets = (target_token_ids ?? []).filter((id) => typeof id === 'number' && tokenIsInCampaign(id, cid));
      if (validTargets.length === 0) return;
      if (typeof spell_name !== 'string' || !spell_name.trim()) return;
      if (!['str','dex','con','int','wis','cha'].includes(save_ability)) return;
      if (!Number.isFinite(save_dc) || save_dc < 1 || save_dc > 40) return;
      if (typeof damage_dice !== 'string' || !damage_dice.trim()) return;

      const casterToken = db.prepare('SELECT label FROM tokens WHERE id = ?').get(caster_token_id) as { label: string } | undefined;
      const casterName = casterToken?.label ?? 'Caster';

      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');

      // Counterspell offer — any nearby PC with Counterspell prepared + L3+ slot can negate.
      // Defaults to L1 if the caller didn't pass cast_level (e.g. a free-form modal).
      const negated = await maybeCounterspell(cid, caster_token_id, spell_name, Math.max(1, Math.min(9, cast_level ?? 1)), insertChat);
      if (negated) return;

      // Roll shared damage once (5e: AOE save spells share one damage roll across all targets)
      const dmg = rollDiceExpression(damage_dice);
      if (dmg.total === 0 && dmg.rolls.length === 0) return;

      // Post the damage roll once
      {
        const data = JSON.stringify({ expression: damage_dice, dice: dmg.rolls, modifier: dmg.modifier, total: dmg.total, label: `${spell_name} — ${damage_type || 'damage'}` });
        const r = insertChat.run(cid, user.id, user.username, `/roll ${damage_dice}`, 'roll', data);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      // Cast announcement
      {
        const r = insertChat.run(cid, user.id, user.username, `/action ${casterName} casts ${spell_name} (DC ${save_dc} ${save_ability.toUpperCase()}).`, 'action', null);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      // Per-target: roll save, apply damage
      const summaries: string[] = [];
      const failedTargetIds: number[] = []; // for the manual condition picker on the summary
      for (const tid of validTargets) {
        const target = db.prepare('SELECT id, label, hp_current, hp_max, character_id, monster_slug, campaign_npc_id FROM tokens WHERE id = ?').get(tid) as { id: number; label: string; hp_current: number; hp_max: number; character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null } | undefined;
        if (!target) continue;

        const saveMod = computeSaveModForToken(target, save_ability);
        const saveRoll = Math.floor(Math.random() * 20) + 1;
        const saveTotal = saveRoll + saveMod;
        const passed = saveTotal >= save_dc;
        let damageDealt = passed ? (half_on_save ? Math.floor(dmg.total / 2) : 0) : dmg.total;
        const dmgMod = damageModifierForToken(target, damage_type);
        if (damageDealt > 0 && dmgMod.multiplier !== 1) {
          damageDealt = Math.floor(damageDealt * dmgMod.multiplier);
        }
        const ham = applyHeavyArmorMaster(target, damage_type, damageDealt);
        damageDealt = ham.adjusted;
        const rageDef = applyRageDefense(target, damage_type, damageDealt);
        damageDealt = rageDef.adjusted;

        // Post the save roll. Carry undo metadata when damage will land — DM sees an undo button.
        const saveExpr = `1d20${saveMod >= 0 ? '+' : ''}${saveMod}`;
        const hamNote = ham.reduced ? ' (HAM −3)' : '';
        const rageNote = rageDef.reduced ? ' (rage resistance)' : '';
        const saveLabel = `${target.label} — ${save_ability.toUpperCase()} Save (DC ${save_dc}) ${passed ? '✓ saved' : '✗ failed'}${hamNote}${rageNote}`;
        const undoMeta = damageDealt > 0 ? { target_token_id: tid, prev_hp: target.hp_current } : {};
        const saveData = JSON.stringify({ expression: saveExpr, dice: [saveRoll], modifier: saveMod, total: saveTotal, label: saveLabel, ...undoMeta });
        const sr = insertChat.run(cid, user.id, user.username, `/roll ${saveExpr}`, 'roll', saveData);
        const saveRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sr.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(saveRow));

        // Apply damage
        if (damageDealt > 0) {
          const wasDown = target.hp_current === 0;
          const newHp = Math.max(0, target.hp_current - damageDealt);
          applyTokenHpChange(cid, tid, target.character_id, newHp);
          triggerConcentrationSave(cid, tid, damageDealt);
          if (wasDown) applyDownDamageFail(cid, target.character_id, false);
        }

        // Apply curated conditions only to targets that failed their save
        if (!passed && Array.isArray(conditions_on_fail) && conditions_on_fail.length > 0) {
          const validConds = conditions_on_fail.filter((c) => typeof c === 'string' && VALID_CONDITIONS.has(c));
          if (validConds.length > 0) {
            const tokRow = db.prepare('SELECT conditions FROM tokens WHERE id = ?').get(tid) as { conditions: string } | undefined;
            let existing: string[] = [];
            try { existing = JSON.parse(tokRow?.conditions ?? '[]'); } catch { /* ignore */ }
            const merged = Array.from(new Set([...existing, ...validConds]));
            db.prepare('UPDATE tokens SET conditions = ? WHERE id = ?').run(JSON.stringify(merged), tid);
            io.to(`campaign:${cid}`).emit('token:conditions_updated', { token_id: tid, conditions: merged });
          }
        }

        const modSuffix = dmgMod.label ? ` (${dmgMod.label})` : '';
        summaries.push(`${target.label}: ${passed ? '✓' : '✗'} ${damageDealt}${modSuffix}`);
        if (!passed) failedTargetIds.push(tid);
      }

      // Final summary action — carries failed_target_ids so DMs/admins can apply a condition
      // post-hoc for spells whose entry in the curated map didn't include one (Slow, Banishment,
      // Bestow Curse, etc.).
      const summaryText = `${casterName}'s ${spell_name}: ${summaries.join(' · ')}`;
      const summaryData = failedTargetIds.length > 0
        ? JSON.stringify({ failed_target_ids: failedTargetIds, spell_name })
        : null;
      const sumRes = insertChat.run(cid, user.id, user.username, `/action ${summaryText}`, 'action', summaryData);
      const sumRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sumRes.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(sumRow));
    });

    socket.on('combat:resolve_attack', async ({ caster_token_id, target_token_ids, attack_name, attack_bonus, damage_dice, damage_type, is_spell, roll_mode, cast_level, power_attack }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;

      // Gate: combat automation must be on
      const campRow = db.prepare('SELECT settings FROM campaigns WHERE id = ?').get(cid) as { settings: string } | undefined;
      if (!campRow) return;
      let settings: { combat_automation?: boolean } = {};
      try { settings = JSON.parse(campRow.settings); } catch { /* default */ }
      if (!settings.combat_automation) return;

      if (!tokenIsInCampaign(caster_token_id, cid)) return;
      const validTargets = (target_token_ids ?? []).filter((id) => typeof id === 'number' && tokenIsInCampaign(id, cid));
      if (validTargets.length === 0) return;
      if (typeof attack_name !== 'string' || !attack_name.trim()) return;
      if (!Number.isFinite(attack_bonus)) return;
      if (typeof damage_dice !== 'string' || !damage_dice.trim()) return;

      const casterToken = db.prepare('SELECT label, character_id FROM tokens WHERE id = ?').get(caster_token_id) as { label: string; character_id: number | null } | undefined;
      const casterName = casterToken?.label ?? 'Caster';
      const verb = is_spell ? 'casts' : 'attacks with';

      // GWM / Sharpshooter -5/+10 toggle. Validate the caster has at least one of those feats.
      let effectiveAttackBonus = attack_bonus;
      let effectiveDamageDice = damage_dice;
      let powerAttackApplied = false;
      if (power_attack && !is_spell) {
        const feats = getCharacterFeats(casterToken?.character_id);
        if (feats.has('great-weapon-master') || feats.has('sharpshooter')) {
          effectiveAttackBonus = attack_bonus - 5;
          effectiveDamageDice = addToDamageExpression(damage_dice, 10);
          powerAttackApplied = true;
        }
      }

      // Rage offense: barbarian PC with a "Rage" effect on their token gets +2/+3/+4 weapon
      // damage. Loose vs RAW (which restricts to melee STR-based attacks) — we apply to all
      // non-spell attacks so the player can rage with thrown weapons; if a barbarian wants
      // to be RAW-strict they can drop the rage effect before a ranged attack.
      let rageBonusApplied = 0;
      if (!is_spell && casterToken?.character_id) {
        const barbLevel = getBarbarianLevel(casterToken.character_id);
        if (barbLevel > 0 && tokenHasRageEffect(caster_token_id)) {
          rageBonusApplied = rageOffenseBonus(barbLevel);
          if (rageBonusApplied > 0) effectiveDamageDice = addToDamageExpression(effectiveDamageDice, rageBonusApplied);
        }
      }

      // Sneak attack scaffolding: figure out how many dice to add per-target on hit. The
      // actual eligibility check (advantage / adjacent ally / once-per-turn) happens inside
      // the per-target loop. We don't track weapon-type, so all non-spell rogue attacks are
      // candidate.
      const rogueLevel = !is_spell && casterToken?.character_id ? getRogueLevel(casterToken.character_id) : 0;
      const sneakDiceCount = sneakAttackDiceCount(rogueLevel);
      let sneakAlreadyAppliedThisAction = false; // once per turn — don't burn on multiple targets in one Attack action

      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');

      // Counterspell offer for spell attacks (Fire Bolt, Disintegrate, etc.). Skipped for
      // weapons (is_spell falsy). Cantrips count as L0 — they can still be Counterspelled.
      if (is_spell) {
        const negated = await maybeCounterspell(cid, caster_token_id, attack_name, Math.max(1, Math.min(9, cast_level ?? 1)), insertChat);
        if (negated) return;
      }

      // Cast announcement
      {
        const tags: string[] = [];
        if (powerAttackApplied) tags.push('-5/+10 power attack');
        if (rageBonusApplied > 0) tags.push(`+${rageBonusApplied} rage damage`);
        const note = tags.length > 0 ? ` (${tags.join(', ')})` : '';
        const r = insertChat.run(cid, user.id, user.username, `/action ${casterName} ${verb} ${attack_name}${note}.`, 'action', null);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      // GWM bonus-attack tracker: set true if any target was crit-hit or dropped to 0 HP.
      let gwmTriggered = false;

      // Per-target: roll attack vs AC, on hit roll damage (with crit on nat 20)
      const summaries: string[] = [];
      for (const tid of validTargets) {
        const target = db.prepare('SELECT id, label, hp_current, hp_max, character_id, monster_slug, campaign_npc_id FROM tokens WHERE id = ?').get(tid) as { id: number; label: string; hp_current: number; hp_max: number; character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null } | undefined;
        if (!target) continue;

        const baseAc = computeAcForToken(target);
        let ac = baseAc;
        // Advantage / disadvantage: roll 2d20 and pick high/low. Normal: roll 1d20.
        const isAdv = roll_mode === 'advantage';
        const isDis = roll_mode === 'disadvantage';
        const r1 = Math.floor(Math.random() * 20) + 1;
        const r2 = (isAdv || isDis) ? Math.floor(Math.random() * 20) + 1 : null;
        const atkRoll = r2 === null ? r1 : (isAdv ? Math.max(r1, r2) : Math.min(r1, r2));
        const dicePosted = r2 === null ? [r1] : [r1, r2, atkRoll]; // chat client treats [a,b,chosen] as adv/dis display
        let mutAtkRoll = atkRoll;
        let mutDicePosted = dicePosted.slice();
        let mutIsCrit = atkRoll === 20;
        let mutIsFumble = atkRoll === 1;
        let mutAtkTotal = mutAtkRoll + effectiveAttackBonus;
        let hits = mutIsCrit || (!mutIsFumble && mutAtkTotal >= ac);
        let shieldUsed = false;
        let luckyUsedTag = false;

        // Lucky reaction (defensive): if the target is a PC with the Lucky feat and would be hit
        // by the current roll, let them spend a luck point to force a reroll. Server rolls a fresh
        // d20 for the attacker and uses the LOWER of the two (the player would always pick lower
        // when defending).
        if (hits) {
          const elig = checkPcCanLuckyReroll(tid);
          if (elig) {
            const offer = offerReaction(cid, elig.ownerId, {
              kind: 'lucky',
              prompt: `${casterName} hits ${elig.charName} (rolled ${mutAtkTotal}). Spend luck to force reroll?`,
              detail: `Luck remaining: ${3 - elig.luckyUsed}/3. Server will keep the lower of the two attacker d20s.`,
            });
            const accepted = await offer.promise;
            if (accepted) {
              const reroll = Math.floor(Math.random() * 20) + 1;
              const newRoll = Math.min(mutAtkRoll, reroll);
              mutDicePosted = [mutAtkRoll, reroll, newRoll];
              mutAtkRoll = newRoll;
              mutIsCrit = mutAtkRoll === 20;
              mutIsFumble = mutAtkRoll === 1;
              mutAtkTotal = mutAtkRoll + effectiveAttackBonus;
              hits = mutIsCrit || (!mutIsFumble && mutAtkTotal >= ac);
              consumeLucky(elig.characterId);
              luckyUsedTag = true;
            }
          }
        }

        // Shield reaction: only offered if Lucky didn't already burn the reaction.
        if (hits && !mutIsCrit && !luckyUsedTag) {
          const elig = checkPcCanReactWith(tid, 'shield', 1);
          if (elig) {
            const offer = offerReaction(cid, elig.ownerId, {
              kind: 'shield',
              prompt: `${casterName} hits ${elig.charName}! Cast Shield?`,
              detail: `+5 AC may negate. Rolled ${mutAtkTotal} vs AC ${baseAc}; needs ${mutAtkTotal} vs AC ${baseAc + 5} after Shield.`,
            });
            const accepted = await offer.promise;
            if (accepted) {
              consumePcReaction(elig.characterId, 1);
              ac = baseAc + 5;
              hits = mutAtkTotal >= ac;
              shieldUsed = true;
            }
          }
        }

        // Re-bind names for the rest of the resolver
        const isCrit = mutIsCrit;
        const isFumble = mutIsFumble;
        const atkTotal = mutAtkTotal;
        const dicePosted2 = mutDicePosted;

        // Post the attack roll
        const advSuffix = isAdv ? 'adv' : isDis ? 'dis' : '';
        const atkExpr = `1d20${advSuffix}${effectiveAttackBonus >= 0 ? '+' : ''}${effectiveAttackBonus}`;
        const luckyTag = luckyUsedTag ? ' — Lucky reroll' : '';
        const hitLabel = isCrit ? '★ CRIT' : isFumble ? '✗ fumble' : hits ? `✓ hit (AC ${ac})${luckyTag}` : `✗ miss (AC ${ac}${shieldUsed ? ' — Shield' : luckyTag})`;
        const rollModeForData = isAdv ? 'advantage' : isDis ? 'disadvantage' : undefined;
        const atkData = JSON.stringify({ expression: atkExpr, dice: dicePosted2, modifier: effectiveAttackBonus, total: atkTotal, label: `${target.label} — ${attack_name} ${hitLabel}`, rollMode: rollModeForData });
        const ar = insertChat.run(cid, user.id, user.username, `/roll ${atkExpr}`, 'roll', atkData);
        const atkRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(ar.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(atkRow));

        if (!hits) {
          summaries.push(`${target.label}: ${shieldUsed ? '🛡 Shield' : isCrit ? 'CRIT' : 'miss'}`);
          continue;
        }

        // Sneak attack: roll the sneak dice as their own pool added to weapon damage if
        // eligible. Crit doubles the dice; once-per-turn enforced via sneakAlreadyAppliedThisAction.
        let sneakDiceLanded = 0;
        let sneakRollTotal = 0;
        let sneakRollDice: number[] = [];
        if (sneakDiceCount > 0 && !sneakAlreadyAppliedThisAction
            && checkSneakAttackEligible(caster_token_id, casterToken?.character_id ?? null, tid, isAdv)) {
          const count = isCrit ? sneakDiceCount * 2 : sneakDiceCount;
          for (let i = 0; i < count; i++) {
            const r = Math.floor(Math.random() * 6) + 1;
            sneakRollDice.push(r);
            sneakRollTotal += r;
          }
          sneakDiceLanded = count;
          sneakAlreadyAppliedThisAction = true;
          if (casterToken?.character_id) consumeSneakAttack(casterToken.character_id);
        }

        // Damage roll (with crit doubling dice)
        const dmg = isCrit ? rollCritDamage(effectiveDamageDice) : rollDiceExpression(effectiveDamageDice);
        // Bake sneak attack roll into the totals BEFORE resistance multipliers — sneak
        // attack damage is the same type as the weapon attack so it's affected the same way.
        const baseDamageTotal = dmg.total + sneakRollTotal;
        const dmgMod = damageModifierForToken(target, damage_type);
        let adjustedTotal = dmgMod.multiplier === 1 ? baseDamageTotal : Math.floor(baseDamageTotal * dmgMod.multiplier);
        const ham = applyHeavyArmorMaster(target, damage_type, adjustedTotal);
        adjustedTotal = ham.adjusted;
        const rageDef = applyRageDefense(target, damage_type, adjustedTotal);
        adjustedTotal = rageDef.adjusted;
        const sneakSuffix = sneakDiceLanded > 0 ? ` (+${sneakRollTotal} sneak attack ${sneakDiceLanded}d6${isCrit ? ' crit-doubled' : ''})` : '';
        const modSuffix = (dmgMod.label ? ` (${dmgMod.label})` : '')
          + (ham.reduced ? ' (HAM −3)' : '')
          + (rageDef.reduced ? ' (rage)' : '')
          + sneakSuffix;
        const dmgLabel = `${target.label} — ${attack_name} ${damage_type || 'damage'}${isCrit ? ' (crit!)' : ''}${modSuffix}`;
        const undoMeta = adjustedTotal > 0 ? { target_token_id: tid, prev_hp: target.hp_current } : {};
        const dmgData = JSON.stringify({ expression: effectiveDamageDice, dice: dmg.rolls, modifier: dmg.modifier, total: adjustedTotal, label: dmgLabel, ...undoMeta });
        const dr = insertChat.run(cid, user.id, user.username, `/roll ${effectiveDamageDice}`, 'roll', dmgData);
        const dmgRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(dr.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(dmgRow));

        if (adjustedTotal > 0) {
          const wasDown = target.hp_current === 0;
          const newHp = Math.max(0, target.hp_current - adjustedTotal);
          applyTokenHpChange(cid, tid, target.character_id, newHp);
          triggerConcentrationSave(cid, tid, adjustedTotal);
          if (wasDown) applyDownDamageFail(cid, target.character_id, isCrit);
          // GWM trigger: melee crit OR target dropped to 0 HP. is_spell excluded (ranged
          // weapon attacks aren't strictly in scope either, but RAW says "with a melee
          // weapon" — we don't track weapon-type here so the client gates the toggle UI;
          // we still trigger on any non-spell attack and trust the player.)
          if (!is_spell && (isCrit || newHp === 0)) gwmTriggered = true;
        }
        summaries.push(`${target.label}: ${isCrit ? '★ CRIT' : '✓'} ${adjustedTotal}${modSuffix}`);
      }

      // Offer GWM bonus action prompt after all targets resolved.
      if (gwmTriggered && casterToken?.character_id) {
        const feats = getCharacterFeats(casterToken.character_id);
        if (feats.has('great-weapon-master')) {
          const ownerRow = db.prepare('SELECT owner_id FROM characters WHERE id = ?').get(casterToken.character_id) as { owner_id: number } | undefined;
          if (ownerRow) {
            const offer = offerReaction(cid, ownerRow.owner_id, {
              kind: 'gwm-bonus',
              prompt: `${casterName} can take a bonus melee attack (GWM)`,
              detail: 'Triggered by a critical hit or dropping a target to 0 HP. Make the attack manually with your bonus action.',
            });
            offer.promise.then((accepted) => {
              if (!accepted) return;
              const noteRes = insertChat.run(cid, user.id, user.username, `/action ${casterName} uses Great Weapon Master bonus attack.`, 'action', null);
              const noteRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(noteRes.lastInsertRowid) as ChatMessageRow;
              io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(noteRow));
            });
          }
        }
      }

      // Final summary
      const summaryText = `${casterName}'s ${attack_name}: ${summaries.join(' · ')}`;
      const sumRes = insertChat.run(cid, user.id, user.username, `/action ${summaryText}`, 'action', null);
      const sumRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sumRes.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(sumRow));
    });

    socket.on('combat:resolve_auto_hit', async ({ caster_token_id, target_token_ids, attack_name, hit_count, damage_dice, damage_type, cast_level }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;

      const campRow = db.prepare('SELECT settings FROM campaigns WHERE id = ?').get(cid) as { settings: string } | undefined;
      if (!campRow) return;
      let settings: { combat_automation?: boolean } = {};
      try { settings = JSON.parse(campRow.settings); } catch { /* default */ }
      if (!settings.combat_automation) return;

      if (!tokenIsInCampaign(caster_token_id, cid)) return;
      const validTargets = (target_token_ids ?? []).filter((id) => typeof id === 'number' && tokenIsInCampaign(id, cid));
      if (validTargets.length === 0) return;
      if (typeof attack_name !== 'string' || !attack_name.trim()) return;
      if (!Number.isFinite(hit_count) || hit_count < 1) return;
      if (typeof damage_dice !== 'string' || !damage_dice.trim()) return;

      // Parse the per-hit damage dice once (e.g. "1d4+1" → count 1, sides 4, mod 1)
      const m = damage_dice.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
      if (!m) return;
      const baseCount = parseInt(m[1], 10);
      const sides = Math.max(1, parseInt(m[2], 10));
      const baseMod = m[3] ? parseInt(m[3], 10) : 0;
      const totalHits = Math.min(20, Math.max(1, Math.floor(hit_count)));

      const casterToken = db.prepare('SELECT label FROM tokens WHERE id = ?').get(caster_token_id) as { label: string } | undefined;
      const casterName = casterToken?.label ?? 'Caster';

      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');

      // Counterspell — Magic Missile is the canonical example, can be counterspelled.
      const negated = await maybeCounterspell(cid, caster_token_id, attack_name, Math.max(1, Math.min(9, cast_level ?? 1)), insertChat);
      if (negated) return;

      // Distribute hits round-robin across the targets
      const hitsPerTarget = new Array(validTargets.length).fill(0);
      for (let i = 0; i < totalHits; i++) {
        hitsPerTarget[i % validTargets.length]++;
      }

      // Cast announcement
      {
        const r = insertChat.run(cid, user.id, user.username, `/action ${casterName} casts ${attack_name} (${totalHits} hits).`, 'action', null);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      const summaries: string[] = [];
      for (let i = 0; i < validTargets.length; i++) {
        const tid = validTargets[i];
        const hits = hitsPerTarget[i];
        if (hits === 0) continue;
        const target = db.prepare('SELECT id, label, hp_current, character_id, monster_slug, campaign_npc_id FROM tokens WHERE id = ?').get(tid) as { id: number; label: string; hp_current: number; character_id: number | null; monster_slug: string | null; campaign_npc_id: number | null } | undefined;
        if (!target) continue;

        // Roll N copies of the per-hit dice expression as a single multi-dice roll
        const rollCount = baseCount * hits;
        const totalMod = baseMod * hits;
        const rolls: number[] = [];
        let dmgTotal = totalMod;
        for (let j = 0; j < rollCount; j++) {
          const r = Math.floor(Math.random() * sides) + 1;
          rolls.push(r);
          dmgTotal += r;
        }

        const dmgMod = damageModifierForToken(target, damage_type);
        let adjustedDmg = dmgMod.multiplier === 1 ? dmgTotal : Math.floor(dmgTotal * dmgMod.multiplier);
        const ham = applyHeavyArmorMaster(target, damage_type, adjustedDmg);
        adjustedDmg = ham.adjusted;
        const rageDef = applyRageDefense(target, damage_type, adjustedDmg);
        adjustedDmg = rageDef.adjusted;
        const modSuffix = (dmgMod.label ? ` (${dmgMod.label})` : '')
          + (ham.reduced ? ' (HAM −3)' : '')
          + (rageDef.reduced ? ' (rage)' : '');

        const expr = `${rollCount}d${sides}${totalMod !== 0 ? (totalMod > 0 ? '+' + totalMod : totalMod) : ''}`;
        const dmgLabel = `${target.label} — ${attack_name} (${hits} hit${hits > 1 ? 's' : ''}) ${damage_type || 'damage'}${modSuffix}`;
        const undoMeta = adjustedDmg > 0 ? { target_token_id: tid, prev_hp: target.hp_current } : {};
        const dmgData = JSON.stringify({ expression: expr, dice: rolls, modifier: totalMod, total: adjustedDmg, label: dmgLabel, ...undoMeta });
        const dr = insertChat.run(cid, user.id, user.username, `/roll ${expr}`, 'roll', dmgData);
        const dmgRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(dr.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(dmgRow));

        const wasDown = target.hp_current === 0;
        const newHp = Math.max(0, target.hp_current - adjustedDmg);
        applyTokenHpChange(cid, tid, target.character_id, newHp);
        triggerConcentrationSave(cid, tid, adjustedDmg);
        if (wasDown) applyDownDamageFail(cid, target.character_id, false);
        summaries.push(`${target.label}: ${hits}× → ${adjustedDmg}${modSuffix}`);
      }

      const summaryText = `${casterName}'s ${attack_name}: ${summaries.join(' · ')}`;
      const sumRes = insertChat.run(cid, user.id, user.username, `/action ${summaryText}`, 'action', null);
      const sumRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sumRes.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(sumRow));
    });

    socket.on('combat:resolve_heal', ({ caster_token_id, target_token_ids, spell_name, heal_dice }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;

      const campRow = db.prepare('SELECT settings FROM campaigns WHERE id = ?').get(cid) as { settings: string } | undefined;
      if (!campRow) return;
      let settings: { combat_automation?: boolean } = {};
      try { settings = JSON.parse(campRow.settings); } catch { /* default */ }
      if (!settings.combat_automation) return;

      if (!tokenIsInCampaign(caster_token_id, cid)) return;
      const validTargets = (target_token_ids ?? []).filter((id) => typeof id === 'number' && tokenIsInCampaign(id, cid));
      if (validTargets.length === 0) return;
      if (typeof spell_name !== 'string' || !spell_name.trim()) return;
      if (typeof heal_dice !== 'string' || !heal_dice.trim()) return;

      const casterToken = db.prepare('SELECT label FROM tokens WHERE id = ?').get(caster_token_id) as { label: string } | undefined;
      const casterName = casterToken?.label ?? 'Caster';

      const insertChat = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)');

      // Cast announcement
      {
        const r = insertChat.run(cid, user.id, user.username, `/action ${casterName} casts ${spell_name}.`, 'action', null);
        const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(row));
      }

      // Roll heal once per target (each ally gets their own roll)
      const summaries: string[] = [];
      for (const tid of validTargets) {
        const target = db.prepare('SELECT id, label, hp_current, hp_max, character_id FROM tokens WHERE id = ?').get(tid) as { id: number; label: string; hp_current: number; hp_max: number; character_id: number | null } | undefined;
        if (!target) continue;
        if (target.hp_current >= target.hp_max) {
          summaries.push(`${target.label}: full HP`);
          continue;
        }

        const heal = rollDiceExpression(heal_dice);
        const newHp = Math.min(target.hp_max, target.hp_current + heal.total);
        const actual = newHp - target.hp_current;

        const healLabel = `${target.label} — ${spell_name} (heal)`;
        const undoMeta = actual > 0 ? { target_token_id: tid, prev_hp: target.hp_current } : {};
        const healData = JSON.stringify({ expression: heal_dice, dice: heal.rolls, modifier: heal.modifier, total: heal.total, label: healLabel, ...undoMeta });
        const dr = insertChat.run(cid, user.id, user.username, `/roll ${heal_dice}`, 'roll', healData);
        const healRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(dr.lastInsertRowid) as ChatMessageRow;
        io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(healRow));

        if (actual > 0) {
          applyTokenHpChange(cid, tid, target.character_id, newHp);
        }
        summaries.push(`${target.label}: +${actual}`);
      }

      const summaryText = `${casterName}'s ${spell_name}: ${summaries.join(' · ')}`;
      const sumRes = insertChat.run(cid, user.id, user.username, `/action ${summaryText}`, 'action', null);
      const sumRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(sumRes.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(sumRow));
    });

    // Map ping — alt-click on canvas. Relay to all in the campaign room.
    // Server tags with user_id (so clients can distinguish/colorize) and a deterministic color.
    socket.on('session:ping', ({ x, y }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      // Hash user id into a hue for a stable per-player color
      const hue = (user.id * 47) % 360;
      const color = `hsl(${hue} 80% 55%)`;
      io.to(`campaign:${cid}`).emit('session:ping', { x, y, user_id: user.id, color });
    });

    // DM-only — undo damage/heal applied via combat:resolve_*. Reads target_token_id + prev_hp
    // from the chat message's data JSON and restores HP.
    socket.on('combat:undo_hp', ({ message_id }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      // Permission: admin or campaign DM only
      const camp = db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(cid) as { dm_id: number } | undefined;
      if (!camp) return;
      if (user.role !== 'admin' && user.id !== camp.dm_id) return;

      const msg = db.prepare('SELECT id, campaign_id, data, type, body FROM chat_messages WHERE id = ?').get(message_id) as { id: number; campaign_id: number; data: string | null; type: string; body: string } | undefined;
      if (!msg || msg.campaign_id !== cid || !msg.data) return;
      let parsed: { target_token_id?: number; prev_hp?: number; undone?: boolean; label?: string } = {};
      try { parsed = JSON.parse(msg.data); } catch { return; }
      if (parsed.undone) return; // already reverted
      if (typeof parsed.target_token_id !== 'number' || typeof parsed.prev_hp !== 'number') return;

      const token = db.prepare('SELECT id, label, character_id, hp_current FROM tokens WHERE id = ?').get(parsed.target_token_id) as { id: number; label: string; character_id: number | null; hp_current: number } | undefined;
      if (!token) return;
      // Apply restore
      applyTokenHpChange(cid, token.id, token.character_id, parsed.prev_hp);

      // Mark message as undone in its data JSON so future clicks no-op
      const updatedData = JSON.stringify({ ...parsed, undone: true });
      db.prepare('UPDATE chat_messages SET data = ? WHERE id = ?').run(updatedData, msg.id);
      io.to(`campaign:${cid}`).emit('combat:hp_undone', { message_id: msg.id });

      // Post a small action note for transparency
      const note = `↶ Undone: ${token.label} HP restored to ${parsed.prev_hp}.`;
      const r = db.prepare('INSERT INTO chat_messages (campaign_id, user_id, username, body, type, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(cid, user.id, user.username, `/action ${note}`, 'action', null);
      const noteRow = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid) as ChatMessageRow;
      io.to(`campaign:${cid}`).emit('chat:message', hydrateMessage(noteRow));
    });

    // DM-only: apply chosen conditions to the failed-save targets recorded on a spell-summary
    // chat message. Used by the post-hoc condition picker for spells that the curated map didn't
    // already auto-apply (Slow, Banishment, Bestow Curse, etc.).
    socket.on('combat:apply_summary_conditions', ({ message_id, conditions }) => {
      const cid = socket.data.campaign_id;
      if (cid == null) return;
      const camp = db.prepare('SELECT dm_id FROM campaigns WHERE id = ?').get(cid) as { dm_id: number } | undefined;
      if (!camp) return;
      if (user.role !== 'admin' && user.id !== camp.dm_id) return;

      const msg = db.prepare('SELECT id, campaign_id, data FROM chat_messages WHERE id = ?').get(message_id) as { id: number; campaign_id: number; data: string | null } | undefined;
      if (!msg || msg.campaign_id !== cid || !msg.data) return;
      let parsed: { failed_target_ids?: number[]; spell_name?: string; conditions_applied?: string[] } = {};
      try { parsed = JSON.parse(msg.data); } catch { return; }
      const targets = parsed.failed_target_ids ?? [];
      if (targets.length === 0) return;

      const valid = (conditions ?? []).filter((c) => typeof c === 'string' && VALID_CONDITIONS.has(c));
      if (valid.length === 0) return;

      // Apply to each failed-save target — merge with existing conditions.
      for (const tid of targets) {
        const tokRow = db.prepare('SELECT conditions FROM tokens WHERE id = ?').get(tid) as { conditions: string } | undefined;
        if (!tokRow) continue;
        let existing: string[] = [];
        try { existing = JSON.parse(tokRow.conditions ?? '[]'); } catch { /* ignore */ }
        const merged = Array.from(new Set([...existing, ...valid]));
        db.prepare('UPDATE tokens SET conditions = ? WHERE id = ?').run(JSON.stringify(merged), tid);
        io.to(`campaign:${cid}`).emit('token:conditions_updated', { token_id: tid, conditions: merged });
      }

      // Mark the summary message so the picker hides on subsequent renders.
      const updatedData = JSON.stringify({ ...parsed, conditions_applied: [...(parsed.conditions_applied ?? []), ...valid] });
      db.prepare('UPDATE chat_messages SET data = ? WHERE id = ?').run(updatedData, msg.id);
      io.to(`campaign:${cid}`).emit('combat:summary_conditions_applied', { message_id: msg.id, conditions: valid });
    });

    // Player Yes/No on a pending Shield / Counterspell offer.
    socket.on('reaction:respond', ({ offer_id, accept }) => {
      if (typeof offer_id !== 'string') return;
      resolveReaction(offer_id, !!accept);
    });

    socket.on('disconnect', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;

      const room = presence.get(campaign_id);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) presence.delete(campaign_id);
      }

      io.to(`campaign:${campaign_id}`).emit('session:presence', {
        online: onlineList(campaign_id),
      });
    });
  });
}
