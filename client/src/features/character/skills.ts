import type { AbilityKey } from './types';

export interface SkillDef {
  key: string;
  name: string;
  ability: AbilityKey;
}

export const SKILLS: SkillDef[] = [
  { key: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { key: 'animal-handling', name: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', name: 'Arcana', ability: 'int' },
  { key: 'athletics', name: 'Athletics', ability: 'str' },
  { key: 'deception', name: 'Deception', ability: 'cha' },
  { key: 'history', name: 'History', ability: 'int' },
  { key: 'insight', name: 'Insight', ability: 'wis' },
  { key: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { key: 'investigation', name: 'Investigation', ability: 'int' },
  { key: 'medicine', name: 'Medicine', ability: 'wis' },
  { key: 'nature', name: 'Nature', ability: 'int' },
  { key: 'perception', name: 'Perception', ability: 'wis' },
  { key: 'performance', name: 'Performance', ability: 'cha' },
  { key: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { key: 'religion', name: 'Religion', ability: 'int' },
  { key: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', name: 'Stealth', ability: 'dex' },
  { key: 'survival', name: 'Survival', ability: 'wis' },
];

const ALL_SKILL_KEYS = SKILLS.map((s) => s.key);

export const CLASS_SKILL_COUNT: Record<string, number> = {
  barbarian: 2, bard: 3, cleric: 2, druid: 2, fighter: 2,
  monk: 2, paladin: 2, ranger: 3, rogue: 4, sorcerer: 2,
  warlock: 2, wizard: 2,
};

/**
 * Skill grants when MULTICLASSING into a class (PHB p.164). Most classes grant 0;
 * rogue/bard/ranger each grant +1 skill from their list when added as a secondary class.
 */
export const MULTICLASS_SKILL_COUNT: Record<string, number> = {
  bard: 1, ranger: 1, rogue: 1,
};

/**
 * Parse a class's prof_skills string into a list of skill keys the player can choose from.
 * Handles:
 * - "Choose two from Arcana, History, ..."  → the listed skills
 * - "Choose any three"                        → all skills (bard, rogue-like)
 * - Empty/missing                             → empty list
 */
export function parseClassSkillChoices(profSkills: string | undefined): string[] {
  if (!profSkills) return [];

  // Bard-style: "Choose any N" means any skill from the full 5e list
  if (/choose\s+any/i.test(profSkills)) {
    return ALL_SKILL_KEYS;
  }

  // Standard: "Choose N from A, B, C, ..."
  const m = profSkills.match(/from\s+(.+?)(?:\.|$)/i);
  const listPart = m ? m[1] : profSkills;
  return listPart
    .split(/,|and/i)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/\.$/, ''))
    .filter((s) => ALL_SKILL_KEYS.includes(s));
}
