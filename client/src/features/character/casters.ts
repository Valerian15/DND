import type { AbilityKey } from './types';
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
  /** If 'known', the number of spells known per level (index = character level). null = not a spellcaster at that level. */
  spellsKnownByLevel?: (number | null)[];
  /** Cantrips known per level */
  cantripsKnownByLevel: (number | null)[];
  /** If 'prepared' or 'spellbook', formula for how many spells can be prepared */
  preparedFormula?: 'ability+level' | 'ability+halfLevel';
  /** For rangers/paladins that don't get spells at level 1 */
  firstSpellLevel?: number;
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
];

export function getCasterConfig(classSlug: string | null): CasterConfig | null {
  if (!classSlug) return null;
  return CASTER_CONFIG.find((c) => c.classSlug === classSlug) ?? null;
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
