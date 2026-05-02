import type { Abilities, AbilityKey, Character, ClassEntry } from './types';
import { abilityModifier } from './pointBuy';

/** 5e proficiency bonus by character level */
export function proficiencyBonus(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

export function hpAverageForHitDie(hitDieSize: number): number {
  return Math.floor(hitDieSize / 2) + 1;
}

export function parseHitDie(s: string | undefined): number {
  if (!s) return 8;
  const m = s.match(/d(\d+)/i);
  return m ? parseInt(m[1], 10) : 8;
}

export function computeMaxHp(level: number, hitDieSize: number, conMod: number): number {
  const level1 = hitDieSize + conMod;
  const extraLevels = level - 1;
  const perExtra = hpAverageForHitDie(hitDieSize) + conMod;
  return Math.max(1, level1 + extraLevels * perExtra);
}

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

export function baseAc(abilities: Abilities): number {
  return 10 + abilityModifier(abilities.dex);
}

export function initiative(abilities: Abilities): number {
  return abilityModifier(abilities.dex);
}

export function passivePerception(abilities: Abilities, proficient: boolean, profBonus: number): number {
  return 10 + abilityModifier(abilities.wis) + (proficient ? profBonus : 0);
}

export function recomputeDerived(
  character: Character,
  hitDieSize: number,
): Partial<Character> {
  const conMod = abilityModifier(character.abilities.con);
  const ac = baseAc(character.abilities);
  const classes = character.classes ?? [];

  // Multiclass path: classes[] populated with at least one entry → use multiclass math.
  // Single-class path (legacy): fall back to class_slug + level.
  let hpMax: number;
  let slots: Record<string, number>;
  if (classes.length > 0) {
    hpMax = computeMulticlassHp(classes, conMod);
    slots = computeMulticlassSpellSlots(classes);
    // Warlock pact slots merge in (separate pool but stored together for now).
    // If a class entry is warlock, add its pact slots on top of multiclass slots.
    const warlockEntry = classes.find((c) => c.slug === 'warlock');
    if (warlockEntry) {
      const pact = computeWarlockPactSlots(warlockEntry.level);
      for (const [lvl, count] of Object.entries(pact)) {
        slots[lvl] = (slots[lvl] ?? 0) + count;
      }
    }
  } else {
    hpMax = computeMaxHp(character.level, hitDieSize, conMod);
    slots = computeSpellSlots(character.class_slug, character.level);
  }

  // Tough feat: +2 HP per character level.
  if ((character.feats ?? []).includes('tough')) {
    hpMax += 2 * character.level;
  }

  const hpCurrent = character.hp_current === 0 ? hpMax : Math.min(character.hp_current, hpMax);
  return {
    hp_max: hpMax,
    hp_current: hpCurrent,
    ac,
    spell_slots: slots,
  };
}

/** Saving throws each class is proficient in (5e 2014 SRD). */
export const CLASS_SAVE_PROFICIENCIES: Record<string, AbilityKey[]> = {
  barbarian: ['str', 'con'],
  bard: ['dex', 'cha'],
  cleric: ['wis', 'cha'],
  druid: ['int', 'wis'],
  fighter: ['str', 'con'],
  monk: ['str', 'dex'],
  paladin: ['wis', 'cha'],
  ranger: ['str', 'dex'],
  rogue: ['dex', 'int'],
  sorcerer: ['con', 'cha'],
  warlock: ['wis', 'cha'],
  wizard: ['int', 'wis'],
};

/* ============================================================================
 * MULTICLASSING (5e 2014 PHB ch.6)
 * ============================================================================ */

/** Hit die size per class (the d-something each class rolls for HP per level). */
export const HIT_DIE_BY_CLASS: Record<string, number> = {
  barbarian: 12,
  fighter: 10, paladin: 10, ranger: 10,
  bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
  sorcerer: 6, wizard: 6,
};

export function hitDieFor(classSlug: string): number {
  return HIT_DIE_BY_CLASS[classSlug] ?? 8;
}

/**
 * 5e PHB multiclass prereqs. To take a level in a class you must meet ALL of its
 * required ability scores. (Fighter is "STR 13 OR DEX 13" — handled with `oneOf`.)
 *
 * Note: prereqs apply when ADDING a class. Your starting class has no prereq.
 */
export interface MulticlassPrereq {
  /** All of these abilities must be ≥ 13. */
  all?: AbilityKey[];
  /** Any one of these abilities must be ≥ 13. */
  oneOf?: AbilityKey[];
}

export const MULTICLASS_PREREQS: Record<string, MulticlassPrereq> = {
  barbarian: { all: ['str'] },
  bard: { all: ['cha'] },
  cleric: { all: ['wis'] },
  druid: { all: ['wis'] },
  fighter: { oneOf: ['str', 'dex'] },
  monk: { all: ['dex', 'wis'] },
  paladin: { all: ['str', 'cha'] },
  ranger: { all: ['dex', 'wis'] },
  rogue: { all: ['dex'] },
  sorcerer: { all: ['cha'] },
  warlock: { all: ['cha'] },
  wizard: { all: ['int'] },
};

/** Returns true if the character's abilities meet the multiclass prereq for a class. */
export function meetsMulticlassPrereqs(classSlug: string, abilities: Abilities): boolean {
  const req = MULTICLASS_PREREQS[classSlug];
  if (!req) return true; // no prereq registered (homebrew, etc.)
  if (req.all && !req.all.every((k) => (abilities[k] ?? 0) >= 13)) return false;
  if (req.oneOf && !req.oneOf.some((k) => (abilities[k] ?? 0) >= 13)) return false;
  return true;
}

/** Returns the unmet prereq abilities (for showing the user what's missing). */
export function missingMulticlassPrereqs(classSlug: string, abilities: Abilities): AbilityKey[] {
  const req = MULTICLASS_PREREQS[classSlug];
  if (!req) return [];
  const missing: AbilityKey[] = [];
  if (req.all) {
    for (const k of req.all) if ((abilities[k] ?? 0) < 13) missing.push(k);
  }
  if (req.oneOf) {
    if (!req.oneOf.some((k) => (abilities[k] ?? 0) >= 13)) missing.push(...req.oneOf);
  }
  return missing;
}

/**
 * Multiclass HP (PHB p.164):
 *  - First class taken: full hit die value + Con mod at level 1
 *  - All subsequent levels (any class): per-class average + Con mod
 *
 * We don't know which class was taken first historically, so we use `classes[0]`
 * as the starting class. The wizard step that adds a class should preserve order.
 */
export function computeMulticlassHp(classes: ClassEntry[], conMod: number): number {
  if (classes.length === 0) return 1;
  const first = classes[0];
  const firstHitDie = hitDieFor(first.slug);
  let hp = firstHitDie + conMod;
  // Remaining levels in the first class
  hp += Math.max(0, first.level - 1) * (hpAverageForHitDie(firstHitDie) + conMod);
  // Every level of subsequent classes uses that class's average (no level-1 bonus)
  for (let i = 1; i < classes.length; i++) {
    const c = classes[i];
    const die = hitDieFor(c.slug);
    hp += c.level * (hpAverageForHitDie(die) + conMod);
  }
  return Math.max(1, hp);
}

/**
 * Multiclass spell slot computation (PHB p.164):
 *   caster level = sum of (full caster levels) + floor(half-caster levels / 2)
 *                  + floor(third-caster levels / 3)
 * Then look up that total in the FULL_CASTER_SLOTS table.
 *
 * Warlock levels do NOT contribute to multiclass slots — pact magic is separate.
 *
 * Subclass-aware: fighter/rogue only count as third-casters if they're an
 * Eldritch Knight or Arcane Trickster.
 */
export function multiclassCasterLevel(classes: ClassEntry[]): number {
  let total = 0;
  for (const c of classes) {
    const t = casterTypeForClass(c.slug);
    if (t === 'full') total += c.level;
    else if (t === 'half') total += Math.floor(c.level / 2);
    else if (t === 'none') {
      // Third caster check — fighter EK / rogue AT
      if ((c.slug === 'fighter' && c.subclass_slug === 'eldritch-knight')
        || (c.slug === 'rogue' && c.subclass_slug === 'arcane-trickster')) {
        total += Math.floor(c.level / 3);
      }
    }
    // warlock is excluded (pact magic uses its own slot pool)
  }
  return total;
}

export function computeMulticlassSpellSlots(classes: ClassEntry[]): Record<string, number> {
  const cl = multiclassCasterLevel(classes);
  if (cl === 0) {
    // No multiclass-shared slots. But a single half-caster at level 1 still has none,
    // and a single full caster's slots are picked up by the cl=1 path above.
    return {};
  }
  const arr = FULL_CASTER_SLOTS[cl] ?? [];
  const out: Record<string, number> = {};
  arr.forEach((count, idx) => { if (count > 0) out[String(idx + 1)] = count; });
  return out;
}

/**
 * Warlock pact slots — separate from multiclass spell slots.
 * Returns the pact slot pool keyed by slot level.
 * `warlockLevel` is the character's warlock-class level (0 if not a warlock).
 */
export function computeWarlockPactSlots(warlockLevel: number): Record<string, number> {
  if (warlockLevel <= 0) return {};
  const w = WARLOCK_SLOTS[warlockLevel];
  return w ? { [String(w.level)]: w.count } : {};
}

/** Parse Open5e's background skill_proficiencies string into skill keys. */
export function parseBackgroundSkillProficiencies(raw: string | undefined): string[] {
  if (!raw) return [];
  // Examples: "Insight, Religion" or "History, Religion"
  return raw
    .split(/,|and/i)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter((s) => s.length > 0);
}
