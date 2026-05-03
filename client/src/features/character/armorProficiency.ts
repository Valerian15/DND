// Per-class armor proficiency rules (5e SRD).
// Multiclassing into a class grants only a subset of its armor profs (PHB p.164):
//   - bard, warlock: Light armor
//   - cleric, druid, fighter, paladin, ranger: Light, Medium, Shields
//   - barbarian: Shields
//   - monk, rogue, sorcerer, wizard: nothing
// We match the weaponProficiency model: OR across all the character's classes — if any
// class grants the proficiency, the character has it. This is more generous than RAW
// (the multiclass subset is narrower than the full grant), but matches player expectations
// and avoids needing two parallel proficiency models.

export type ArmorType = 'light' | 'medium' | 'heavy' | 'shield';

const PROFS_BY_CLASS: Record<string, ReadonlySet<ArmorType>> = {
  barbarian: new Set(['light', 'medium', 'shield']),
  bard: new Set(['light']),
  cleric: new Set(['light', 'medium', 'shield']),
  druid: new Set(['light', 'medium', 'shield']),
  fighter: new Set(['light', 'medium', 'heavy', 'shield']),
  monk: new Set([]),
  paladin: new Set(['light', 'medium', 'heavy', 'shield']),
  ranger: new Set(['light', 'medium', 'shield']),
  rogue: new Set(['light']),
  sorcerer: new Set([]),
  warlock: new Set(['light']),
  wizard: new Set([]),
};

export function isArmorProficientForClass(classSlug: string, armorType: ArmorType): boolean {
  const set = PROFS_BY_CLASS[classSlug];
  if (!set) return false;
  return set.has(armorType);
}

export function isArmorProficientForClasses(classSlugs: string[], armorType: ArmorType): boolean {
  return classSlugs.some((slug) => isArmorProficientForClass(slug, armorType));
}

export function classArmorProfsLabel(classSlug: string): string {
  const set = PROFS_BY_CLASS[classSlug];
  if (!set || set.size === 0) return 'no armor proficiency';
  return [...set].sort().join(', ');
}
