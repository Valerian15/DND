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

export interface Character {
  id: number;
  owner_id: number;
  name: string;
  level: number;
  class_slug: string | null;
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
  spell_slots: Record<string, unknown>;
  features: unknown[];
  notes: string;
  description: Record<string, unknown>;
  darkvision: number;
  created_at: number;
  updated_at: number;
}

export interface LibraryItem {
  id: number;
  slug: string;
  name: string;
  source: string;
}
