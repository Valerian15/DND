import type { AbilityKey, ClassEntry } from './types';
import type { CasterType } from './rules';

export interface CasterConfig {
  /** Which classes this config covers */
  classSlug: string;
  type: CasterType;
  /** Ability score used for spellcasting */
  ability: AbilityKey;
  /** How spells are gained — 'known' means you pick from the class list and they're always available.
   *  'prepared' means you pick from a bigger pool daily. */
  model: 'known' | 'prepared' | 'spellbook';
  /** If 'known', the number of spells known per level (index = class level). null = not a spellcaster at that level. */
  spellsKnownByLevel?: (number | null)[];
  /** Cantrips known per level */
  cantripsKnownByLevel: (number | null)[];
  /** If 'prepared' or 'spellbook', formula for how many spells can be prepared */
  preparedFormula?: 'ability+level' | 'ability+halfLevel';
  /** For rangers/paladins that don't get spells at level 1 */
  firstSpellLevel?: number;
  /**
   * Override the class list this caster picks from. Defaults to classSlug.
   * Eldritch Knight + Arcane Trickster pick from the wizard list, not fighter/rogue.
   */
  spellListClass?: string;
  /** Display label for the caster section. Defaults to capitalize(classSlug). */
  label?: string;
}

// Index 0 = level 1, index 1 = level 2, etc. up to level 20.
// null for levels where class has no cantrip/spell access.

export const CASTER_CONFIG: CasterConfig[] = [
  {
    classSlug: 'wizard',
    type: 'full',
    ability: 'int',
    model: 'spellbook',
    preparedFormula: 'ability+level',
    cantripsKnownByLevel: [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
  },
  {
    classSlug: 'cleric',
    type: 'full',
    ability: 'wis',
    model: 'prepared',
    preparedFormula: 'ability+level',
    cantripsKnownByLevel: [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
  },
  {
    classSlug: 'druid',
    type: 'full',
    ability: 'wis',
    model: 'prepared',
    preparedFormula: 'ability+level',
    cantripsKnownByLevel: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  },
  {
    classSlug: 'paladin',
    type: 'half',
    ability: 'cha',
    model: 'prepared',
    preparedFormula: 'ability+halfLevel',
    cantripsKnownByLevel: Array(20).fill(null),
    firstSpellLevel: 2,
  },
  {
    classSlug: 'bard',
    type: 'full',
    ability: 'cha',
    model: 'known',
    spellsKnownByLevel: [4,5,6,7,8,9,10,11,12,14,15,15,16,18,19,19,20,22,22,22],
    cantripsKnownByLevel: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  },
  {
    classSlug: 'sorcerer',
    type: 'full',
    ability: 'cha',
    model: 'known',
    spellsKnownByLevel: [2,3,4,5,6,7,8,9,10,11,12,12,13,13,14,14,15,15,15,15],
    cantripsKnownByLevel: [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],
  },
  {
    classSlug: 'ranger',
    type: 'half',
    ability: 'wis',
    model: 'known',
    spellsKnownByLevel: [null,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11],
    cantripsKnownByLevel: Array(20).fill(null),
    firstSpellLevel: 2,
  },
  {
    classSlug: 'warlock',
    type: 'warlock',
    ability: 'cha',
    model: 'known',
    spellsKnownByLevel: [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15],
    cantripsKnownByLevel: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  },
  // Third-caster subclasses. Class level is the FIGHTER/ROGUE level, not character level.
  {
    classSlug: 'eldritch-knight',
    type: 'third',
    ability: 'int',
    model: 'known',
    spellListClass: 'wizard',
    label: 'Eldritch Knight',
    firstSpellLevel: 3,
    // Spells Known by class level (index = class level - 1). PHB p.75.
    spellsKnownByLevel: [null,null,3,4,4,4,5,6,6,7,8,8,9,10,10,11,11,11,12,13],
    // Cantrips Known by class level: L3 = 2, L10 = 3.
    cantripsKnownByLevel: [null,null,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3],
  },
  {
    classSlug: 'arcane-trickster',
    type: 'third',
    ability: 'int',
    model: 'known',
    spellListClass: 'wizard',
    label: 'Arcane Trickster',
    firstSpellLevel: 3,
    // Spells Known by class level. PHB p.98.
    spellsKnownByLevel: [null,null,3,4,4,4,5,6,6,7,8,8,9,10,10,11,11,11,12,13],
    // Cantrips: L3 grants 3 (mage hand + 2). L10 = 4.
    cantripsKnownByLevel: [null,null,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  },
];

export function getCasterConfig(classSlug: string | null): CasterConfig | null {
  if (!classSlug) return null;
  return CASTER_CONFIG.find((c) => c.classSlug === classSlug) ?? null;
}

/**
 * Resolve a caster config for a class entry, including the third-caster subclass overrides
 * (Eldritch Knight on a fighter, Arcane Trickster on a rogue).
 */
export function getCasterConfigForEntry(entry: ClassEntry): CasterConfig | null {
  if (entry.slug === 'fighter' && entry.subclass_slug === 'eldritch-knight') {
    return getCasterConfig('eldritch-knight');
  }
  if (entry.slug === 'rogue' && entry.subclass_slug === 'arcane-trickster') {
    return getCasterConfig('arcane-trickster');
  }
  return getCasterConfig(entry.slug);
}

/** Given a config + character level + ability mod, how many spells can they prepare? */
export function preparedCount(config: CasterConfig, level: number, abilityMod: number): number {
  if (config.preparedFormula === 'ability+level') {
    return Math.max(1, abilityMod + level);
  }
  if (config.preparedFormula === 'ability+halfLevel') {
    return Math.max(1, abilityMod + Math.floor(level / 2));
  }
  return 0;
}

/** Max spell level the character can cast at a given character level. */
export function maxSpellLevelFor(config: CasterConfig, level: number): number {
  if (config.type === 'full') {
    if (level >= 17) return 9;
    if (level >= 15) return 8;
    if (level >= 13) return 7;
    if (level >= 11) return 6;
    if (level >= 9) return 5;
    if (level >= 7) return 4;
    if (level >= 5) return 3;
    if (level >= 3) return 2;
    return 1;
  }
  if (config.type === 'half') {
    if (level >= 17) return 5;
    if (level >= 13) return 4;
    if (level >= 9) return 3;
    if (level >= 5) return 2;
    if (level >= 2) return 1;
    return 0;
  }
  if (config.type === 'warlock') {
    if (level >= 9) return 5;
    if (level >= 7) return 4;
    if (level >= 5) return 3;
    if (level >= 3) return 2;
    return 1;
  }
  return 0;
}
