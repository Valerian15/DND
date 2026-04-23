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

/** Number of skill proficiencies a class grants at level 1 */
export const CLASS_SKILL_COUNT: Record<string, number> = {
  barbarian: 2, bard: 3, cleric: 2, druid: 2, fighter: 2,
  monk: 2, paladin: 2, ranger: 3, rogue: 4, sorcerer: 2,
  warlock: 2, wizard: 2,
};

/** Parse Open5e's prof_skills string like "Choose two from Arcana, History, ..." into skill keys */
export function parseClassSkillChoices(profSkills: string | undefined): string[] {
  if (!profSkills) return [];
  // Grab everything after "from"
  const m = profSkills.match(/from\s+(.+?)(?:\.|$)/i);
  const listPart = m ? m[1] : profSkills;
  return listPart
    .split(/,|and/i)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/\.$/, ''))
    .filter((s) => SKILLS.some((sk) => sk.key === s));
}
