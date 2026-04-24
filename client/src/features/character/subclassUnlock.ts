/** The character level at which each class unlocks its subclass choice (5e 2014). */
export const SUBCLASS_UNLOCK_LEVEL: Record<string, number> = {
  cleric: 1,
  sorcerer: 1,
  warlock: 1,
  druid: 2,
  wizard: 2,
  barbarian: 3,
  bard: 3,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
};

/** Returns true if the character is at or past the subclass unlock level for their class. */
export function isSubclassUnlocked(classSlug: string | null, level: number): boolean {
  if (!classSlug) return false;
  const required = SUBCLASS_UNLOCK_LEVEL[classSlug];
  if (required === undefined) return false;
  return level >= required;
}

export function unlockLevelFor(classSlug: string | null): number | null {
  if (!classSlug) return null;
  return SUBCLASS_UNLOCK_LEVEL[classSlug] ?? null;
}
