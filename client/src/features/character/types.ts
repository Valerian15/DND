export interface Abilities {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export type AbilityKey = keyof Abilities;

export const ABILITY_ORDER: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export interface ClassResource {
  name: string;
  current: number;
  max: number;
  reset: 'long' | 'short';
}

/**
 * Structured inventory item (equipment refactor). Replaces the loose
 * `inventory: any[]` + `weapons: string[]` model. Stored in `character.inventory_v2`.
 *
 * Fields beyond name/quantity are optional — homebrew items can be created with just
 * a name. Library-derived items copy the relevant stats in at the time of pickup so
 * combat resolvers don't have to refetch.
 */
export type InventoryCategory = 'weapon' | 'armor' | 'tool' | 'gear' | 'consumable' | 'treasure' | 'other';

export interface InventoryItem {
  id: string;
  /** Slug of the source library item (weapons / armor / items). Empty for homebrew rows. */
  library_slug?: string;
  /** Where the row came from (e.g. 'class-starter', 'background-starter', 'shop'). Free-form. */
  source?: string;
  name: string;
  quantity: number;
  weight_lbs?: number;
  cost_gp?: number;
  category: InventoryCategory;
  /** True if held / worn. Combat resolver only sees equipped weapons. */
  equipped?: boolean;
  /** True if attuned (max 3 attuned items per character). */
  attuned?: boolean;
  description?: string;
  // ── weapon-specific (copied from library on pickup) ──
  damage_dice?: string;
  damage_type?: string;
  weapon_type?: 'Melee' | 'Ranged';
  weapon_category?: 'Simple' | 'Martial';
  properties?: string[];
  range_normal?: number;
  range_long?: number;
  versatile_dice?: string;
  // ── armor-specific ──
  armor_class?: number;
  armor_type?: 'light' | 'medium' | 'heavy' | 'shield';
  stealth_disadvantage?: boolean;
}

/**
 * Multiclass entry. Each class a character has is one entry in `Character.classes`.
 * For single-class characters this array has one entry that mirrors the legacy
 * top-level fields (class_slug, subclass_slug, level, hit_dice_used).
 */
export interface ClassEntry {
  slug: string;
  subclass_slug: string | null;
  level: number;
  hit_dice_used: number;
}

export interface TimedEffect {
  name: string;
  rounds: number;
}

export interface Character {
  id: number;
  owner_id: number;
  name: string;
  /** Total level across all classes. Computed = sum of classes[].level. */
  level: number;
  /** Multiclass entries. classes[0] mirrors legacy class_slug/subclass_slug for backwards compat. */
  classes: ClassEntry[];
  /** @deprecated mirror of classes[0].slug — kept for backwards compatibility during multiclass rollout */
  class_slug: string | null;
  /** @deprecated mirror of classes[0].subclass_slug */
  subclass_slug: string | null;
  race_slug: string | null;
  subrace_slug: string | null;
  background_slug: string | null;
  hp_current: number;
  hp_max: number;
  hp_temp: number;
  ac: number;
  portrait_url: string | null;
  abilities: Abilities;
  skills: Record<string, unknown>;
  saves: Record<string, unknown>;
  /** @deprecated free-form inventory; legacy fallback. New code reads inventory_v2. */
  inventory: unknown[];
  /** @deprecated weapon slug list; legacy. New code derives equipped weapons from inventory_v2. */
  weapons: string[];
  /** Structured inventory rows. Empty array for legacy chars that haven't been migrated. */
  inventory_v2: InventoryItem[];
  spells_known: unknown[];
  spells_prepared: unknown[];
  languages: string[];
  spell_slots: Record<string, number>;
  spell_slots_used: Record<string, number>;
  hit_dice_used: number;
  resources: ClassResource[];
  currency: { pp: number; gp: number; ep: number; sp: number; cp: number };
  feats: string[];
  personality: { traits: string; ideals: string; bonds: string; flaws: string };
  features: unknown[];
  notes: string;
  description: Record<string, unknown>;
  darkvision: number;
  death_saves_success: number;
  death_saves_failure: number;
  inspiration: number;
  lucky_used: number;
  speed_walk: number;
  exhaustion_level: number;
  action_used: number;
  bonus_used: number;
  reaction_used: number;
  effects: TimedEffect[];
  /** Damage types this character has resistance/vulnerability/immunity to (lowercase, e.g. ['fire','cold']). */
  resistances: string[];
  vulnerabilities: string[];
  immunities: string[];
  created_at: number;
  updated_at: number;
}

export interface LibraryItem {
  id: number;
  slug: string;
  name: string;
  source: string;
}
