import type { Abilities, Character } from './types';
import { abilityModifier } from './pointBuy';

/** 5e proficiency bonus by character level */
export function proficiencyBonus(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

/** Fixed-average HP gain per level by class hit die size */
export function hpAverageForHitDie(hitDieSize: number): number {
  // 5e rule: floor(avg) + 1 = (die/2) + 1
  return Math.floor(hitDieSize / 2) + 1;
}

/** Parse "1d8", "1d10", etc. → the die size, defaults to 8 */
export function parseHitDie(s: string | undefined): number {
  if (!s) return 8;
  const m = s.match(/d(\d+)/i);
  return m ? parseInt(m[1], 10) : 8;
}

/** Computes max HP at a given level using fixed averages. */
export function computeMaxHp(level: number, hitDieSize: number, conMod: number): number {
  // Level 1: max hit die + CON
  // Level 2+: (fixed average + CON) per level
  const level1 = hitDieSize + conMod;
  const extraLevels = level - 1;
  const perExtra = hpAverageForHitDie(hitDieSize) + conMod;
  return Math.max(1, level1 + extraLevels * perExtra);
}

/** 5e Wizard/Sorcerer-style full-caster spell slots per level (quick reference table) */
export const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3],
  7: [4, 3, 3, 1], 8: [4, 3, 3, 2], 9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2],
  11: [4, 3, 3, 3, 2, 1], 12: [4, 3, 3, 3, 2, 1], 13: [4, 3, 3, 3, 2, 1, 1],
  14: [4, 3, 3, 3, 2, 1, 1], 15: [4, 3, 3, 3, 2, 1, 1, 1], 16: [4, 3, 3, 3, 2, 1, 1, 1],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};
export const HALF_CASTER_SLOTS: Record<number, number[]> = {
  1: [], 2: [2], 3: [3], 4: [3], 5: [4, 2], 6: [4, 2],
  7: [4, 3], 8: [4, 3], 9: [4, 3, 2], 10: [4, 3, 2],
  11: [4, 3, 3], 12: [4, 3, 3], 13: [4, 3, 3, 1], 14: [4, 3, 3, 1],
  15: [4, 3, 3, 2], 16: [4, 3, 3, 2], 17: [4, 3, 3, 3, 1], 18: [4, 3, 3, 3, 1],
  19: [4, 3, 3, 3, 2], 20: [4, 3, 3, 3, 2],
};
export const THIRD_CASTER_SLOTS: Record<number, number[]> = {
  1: [], 2: [], 3: [2], 4: [3], 5: [3], 6: [3],
  7: [4, 2], 8: [4, 2], 9: [4, 2], 10: [4, 3],
  11: [4, 3], 12: [4, 3], 13: [4, 3, 2], 14: [4, 3, 2],
  15: [4, 3, 2], 16: [4, 3, 3], 17: [4, 3, 3], 18: [4, 3, 3],
  19: [4, 3, 3, 1], 20: [4, 3, 3, 1],
};
export const WARLOCK_SLOTS: Record<number, { count: number; level: number }> = {
  1: { count: 1, level: 1 }, 2: { count: 2, level: 1 }, 3: { count: 2, level: 2 },
  4: { count: 2, level: 2 }, 5: { count: 2, level: 3 }, 6: { count: 2, level: 3 },
  7: { count: 2, level: 4 }, 8: { count: 2, level: 4 }, 9: { count: 2, level: 5 },
  10: { count: 2, level: 5 }, 11: { count: 3, level: 5 }, 12: { count: 3, level: 5 },
  13: { count: 3, level: 5 }, 14: { count: 3, level: 5 }, 15: { count: 3, level: 5 },
  16: { count: 3, level: 5 }, 17: { count: 4, level: 5 }, 18: { count: 4, level: 5 },
  19: { count: 4, level: 5 }, 20: { count: 4, level: 5 },
};

export type CasterType = 'full' | 'half' | 'third' | 'warlock' | 'none';

/** Maps class slug → caster type */
export function casterTypeForClass(classSlug: string | null): CasterType {
  if (!classSlug) return 'none';
  switch (classSlug) {
    case 'bard': case 'cleric': case 'druid': case 'sorcerer': case 'wizard':
      return 'full';
    case 'paladin': case 'ranger':
      return 'half';
    case 'warlock':
      return 'warlock';
    default:
      return 'none';
  }
}

/** Returns a map of slot level → slot count */
export function computeSpellSlots(classSlug: string | null, level: number): Record<string, number> {
  const type = casterTypeForClass(classSlug);
  if (type === 'none') return {};
  if (type === 'warlock') {
    const w = WARLOCK_SLOTS[level];
    return w ? { [w.level]: w.count } : {};
  }
  const table =
    type === 'full' ? FULL_CASTER_SLOTS :
    type === 'half' ? HALF_CASTER_SLOTS :
    THIRD_CASTER_SLOTS;
  const arr = table[level] ?? [];
  const out: Record<string, number> = {};
  arr.forEach((count, idx) => {
    if (count > 0) out[String(idx + 1)] = count;
  });
  return out;
}

/** Unarmored AC = 10 + DEX mod. Real AC from armor is handled when equipped. */
export function baseAc(abilities: Abilities): number {
  return 10 + abilityModifier(abilities.dex);
}

/** Initiative modifier = DEX mod */
export function initiative(abilities: Abilities): number {
  return abilityModifier(abilities.dex);
}

/** Passive perception = 10 + WIS mod (+ prof if proficient in Perception) */
export function passivePerception(abilities: Abilities, proficient: boolean, profBonus: number): number {
  return 10 + abilityModifier(abilities.wis) + (proficient ? profBonus : 0);
}

/**
 * Recompute derived stats when something changes.
 * Returns a partial character patch you can send to the API.
 */
export function recomputeDerived(
  character: Character,
  hitDieSize: number,
): Partial<Character> {
  const conMod = abilityModifier(character.abilities.con);
  const hpMax = computeMaxHp(character.level, hitDieSize, conMod);
  const ac = baseAc(character.abilities);
  const slots = computeSpellSlots(character.class_slug, character.level);

  // When HP max grows, keep current HP capped at new max (but don't shrink if already below)
  const hpCurrent = character.hp_current === 0 ? hpMax : Math.min(character.hp_current, hpMax);

  return {
    hp_max: hpMax,
    hp_current: hpCurrent,
    ac,
    spell_slots: slots,
  };
}
