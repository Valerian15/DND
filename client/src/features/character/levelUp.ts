import type { Abilities, AbilityKey, Character } from './types';
import { ABILITY_ORDER } from './types';
import { hpAverageForHitDie } from './rules';
import { abilityModifier } from './pointBuy';
import { getCasterConfig } from './casters';

/** Levels at which a 5e character gains an Ability Score Improvement (or feat in place of one). */
export const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

/** Some classes get bonus ASIs (fighter, rogue). Keep it simple for now. */
export const EXTRA_ASI_LEVELS: Record<string, number[]> = {
  fighter: [6, 14],
  rogue: [10],
};

/**
 * Returns true if reaching `classLevel` in `classSlug` triggers an ASI.
 * NB: in 5e ASIs are gated on the CLASS level, not the character's total level.
 * Fighter 4 / Wizard 4 → two separate ASIs.
 */
export function isAsiLevel(classSlug: string | null, classLevel: number): boolean {
  if (ASI_LEVELS.has(classLevel)) return true;
  if (!classSlug) return false;
  return EXTRA_ASI_LEVELS[classSlug]?.includes(classLevel) ?? false;
}

export interface AsiChoice {
  mode: 'plus-two' | 'plus-one-one' | 'skip';
  firstAbility?: AbilityKey;
  secondAbility?: AbilityKey;
}

/** Apply an ASI choice to an abilities object. Returns the new abilities (or null if invalid). */
export function applyAsi(abilities: Abilities, choice: AsiChoice): Abilities | null {
  if (choice.mode === 'skip') return { ...abilities };

  const next: Abilities = { ...abilities };

  if (choice.mode === 'plus-two') {
    if (!choice.firstAbility) return null;
    if (next[choice.firstAbility] >= 20) return null;
    next[choice.firstAbility] = Math.min(20, next[choice.firstAbility] + 2);
    return next;
  }

  if (choice.mode === 'plus-one-one') {
    if (!choice.firstAbility || !choice.secondAbility) return null;
    if (choice.firstAbility === choice.secondAbility) return null;
    if (next[choice.firstAbility] >= 20 || next[choice.secondAbility] >= 20) return null;
    next[choice.firstAbility] = Math.min(20, next[choice.firstAbility] + 1);
    next[choice.secondAbility] = Math.min(20, next[choice.secondAbility] + 1);
    return next;
  }

  return null;
}

/**
 * Compute the HP increase for gaining one level.
 * Fixed average rule: floor(die / 2) + 1 + CON modifier.
 */
export function hpGainOnLevelUp(hitDieSize: number, conMod: number): number {
  return hpAverageForHitDie(hitDieSize) + conMod;
}

/** Produce a summary of what will happen when the character levels up. */
export interface LevelUpPreview {
  /** New TOTAL character level after the level up. */
  newLevel: number;
  /** Class slug being levelled. */
  targetClass: string;
  /** New per-class level for the targetClass after the level up. */
  newClassLevel: number;
  hpGain: number;
  newHpMax: number;
  /** ASI is gated on the new CLASS level, not the total character level. */
  asiRequired: boolean;
  /** Number of new cantrips the character can pick up at this level (0 if none). */
  cantripsGained: number;
  /** Number of new spells known the character can pick up at this level (0 or null if not a known caster). */
  spellsKnownGained: number;
}

/**
 * Preview a level-up. `targetClass` is the class slug being levelled
 * (defaults to the primary/first class if omitted, or the legacy class_slug).
 */
export function previewLevelUp(
  character: Character,
  hitDieSize: number,
  targetClass?: string,
): LevelUpPreview {
  const classes = character.classes ?? [];
  const slug = targetClass
    ?? classes[0]?.slug
    ?? character.class_slug
    ?? '';
  const currentClassLevel = classes.find((c) => c.slug === slug)?.level
    ?? (slug === character.class_slug ? character.level : 0);
  const newClassLevel = currentClassLevel + 1;
  const newLevel = character.level + 1;
  const conMod = abilityModifier(character.abilities.con);
  const toughBonus = (character.feats ?? []).includes('tough') ? 2 : 0;
  const hpGain = hpGainOnLevelUp(hitDieSize, conMod) + toughBonus;
  const newHpMax = character.hp_max + hpGain;

  // Spells/cantrips known deltas — only meaningful for caster classes with a known table.
  let cantripsGained = 0;
  let spellsKnownGained = 0;
  const config = getCasterConfig(slug);
  if (config && newClassLevel >= 1 && newClassLevel <= 20) {
    const prevC = currentClassLevel >= 1 ? config.cantripsKnownByLevel[currentClassLevel - 1] ?? null : null;
    const nextC = config.cantripsKnownByLevel[newClassLevel - 1] ?? null;
    if (typeof prevC === 'number' && typeof nextC === 'number' && nextC > prevC) cantripsGained = nextC - prevC;
    else if (prevC === null && typeof nextC === 'number') cantripsGained = nextC;

    if (config.model === 'known' && config.spellsKnownByLevel) {
      const prevS = currentClassLevel >= 1 ? config.spellsKnownByLevel[currentClassLevel - 1] ?? null : null;
      const nextS = config.spellsKnownByLevel[newClassLevel - 1] ?? null;
      if (typeof prevS === 'number' && typeof nextS === 'number' && nextS > prevS) spellsKnownGained = nextS - prevS;
      else if (prevS === null && typeof nextS === 'number') spellsKnownGained = nextS;
    }
  }

  return {
    newLevel,
    targetClass: slug,
    newClassLevel,
    hpGain,
    newHpMax,
    asiRequired: isAsiLevel(slug, newClassLevel),
    cantripsGained,
    spellsKnownGained,
  };
}

export { ABILITY_ORDER };
