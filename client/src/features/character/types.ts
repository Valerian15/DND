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
  background_slug: string | null;
  hp_current: number;
  hp_max: number;
  hp_temp: number;
  ac: number;
  portrait_url: string | null;
  abilities: Abilities;
  skills: Record<string, unknown>;
  saves: Record<string, unknown>;
  inventory: unknown[];
  weapons: string[];
  spells_known: unknown[];
  spells_prepared: unknown[];
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
