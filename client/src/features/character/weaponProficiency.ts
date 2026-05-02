// Per-class weapon proficiency rules (SRD 5.1 2014).
// 'simple' = all Simple weapons, 'martial' = all Simple + Martial weapons.
// Arrays = specific slugs only.

const DRUID_SLUGS = ['club','dagger','dart','javelin','mace','quarterstaff','scimitar','sickle','sling','spear'];
const BARD_SLUGS = ['crossbow-hand','longsword','rapier','shortsword'];  // + all simple
const ROGUE_SLUGS = ['crossbow-hand','longsword','rapier','shortsword']; // + all simple
const CASTER_SLUGS = ['dagger','dart','sling','quarterstaff','crossbow-light'];

type ProfLevel = 'martial' | 'simple' | { extra: string[] };

const CLASS_PROFS: Record<string, ProfLevel> = {
  barbarian: 'martial',
  bard:      { extra: BARD_SLUGS },
  cleric:    'simple',
  druid:     { extra: DRUID_SLUGS },
  fighter:   'martial',
  monk:      { extra: ['shortsword'] },
  paladin:   'martial',
  ranger:    'martial',
  rogue:     { extra: ROGUE_SLUGS },
  sorcerer:  { extra: CASTER_SLUGS },
  warlock:   'simple',
  wizard:    { extra: CASTER_SLUGS },
};

// For classes with { extra: [...] }, they also have all Simple weapons.
const CLASS_HAS_SIMPLE_BASE = new Set(['bard', 'druid', 'monk', 'rogue']);

export function isWeaponProficient(
  classSlug: string | null,
  weaponSlug: string,
  weaponCategory: string, // 'Simple' | 'Martial'
): boolean {
  if (!classSlug) return false;
  const prof = CLASS_PROFS[classSlug];
  if (!prof) return false;
  if (prof === 'martial') return true;
  if (prof === 'simple') return weaponCategory === 'Simple';
  // extra-list class: check specific slugs + optionally all Simple
  const hasSimpleBase = CLASS_HAS_SIMPLE_BASE.has(classSlug);
  if (hasSimpleBase && weaponCategory === 'Simple') return true;
  return prof.extra.includes(weaponSlug);
}

/**
 * Multiclass-aware variant: a character is proficient with a weapon if ANY of their
 * classes confers proficiency. RAW multiclassing grants a subset of weapon profs,
 * but for the secondary classes we model the gap loosely — a Wizard 1/Fighter 1
 * gets the full fighter list, which matches player expectations.
 */
export function isWeaponProficientForClasses(
  classSlugs: string[],
  weaponSlug: string,
  weaponCategory: string,
): boolean {
  return classSlugs.some((slug) => isWeaponProficient(slug, weaponSlug, weaponCategory));
}
