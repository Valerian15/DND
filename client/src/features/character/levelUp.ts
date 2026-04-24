import type { Abilities, AbilityKey, Character } from './types';
import { ABILITY_ORDER } from './types';
import { hpAverageForHitDie } from './rules';
import { abilityModifier } from './pointBuy';

/** Levels at which a 5e character gains an Ability Score Improvement (or feat in place of one). */
export const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

/** Some classes get bonus ASIs (fighter, rogue). Keep it simple for now. */
export const EXTRA_ASI_LEVELS: Record<string, number[]> = {
  fighter: [6, 14],
  rogue: [10],
};

export function isAsiLevel(classSlug: string | null, level: number): boolean {
  if (ASI_LEVELS.has(level)) return true;
  if (!classSlug) return false;
  return EXTRA_ASI_LEVELS[classSlug]?.includes(level) ?? false;
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
  newLevel: number;
  hpGain: number;
  newHpMax: number;
  asiRequired: boolean;
}

export function previewLevelUp(
  character: Character,
  hitDieSize: number,
): LevelUpPreview {
  const newLevel = character.level + 1;
  const conMod = abilityModifier(character.abilities.con);
  const hpGain = hpGainOnLevelUp(hitDieSize, conMod);
  const newHpMax = character.hp_max + hpGain;
  return {
    newLevel,
    hpGain,
    newHpMax,
    asiRequired: isAsiLevel(character.class_slug, newLevel),
  };
}

export { ABILITY_ORDER };
