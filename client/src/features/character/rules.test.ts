import { describe, it, expect } from 'vitest';
import {
  proficiencyBonus,
  hpAverageForHitDie,
  computeMaxHp,
  computeSpellSlots,
  computeMulticlassHp,
  multiclassCasterLevel,
  computeMulticlassSpellSlots,
  meetsMulticlassPrereqs,
  recomputeDerived,
  CLASS_SAVE_PROFICIENCIES,
} from './rules';
import type { Abilities, Character, ClassEntry } from './types';

const baseAbilities: Abilities = { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };

function mkChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 1, owner_id: 1, name: 'Test', level: 1, classes: [], class_slug: null, subclass_slug: null,
    race_slug: null, subrace_slug: null, background_slug: null,
    hp_current: 0, hp_max: 0, hp_temp: 0, ac: 10, portrait_url: null,
    abilities: baseAbilities, skills: {}, saves: {}, inventory: [], weapons: [],
    spells_known: [], spells_prepared: [], spell_slots: {}, spell_slots_used: {}, hit_dice_used: 0,
    resources: [], currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, feats: [],
    personality: { traits: '', ideals: '', bonds: '', flaws: '' }, features: [], notes: '',
    description: {}, darkvision: 0, death_saves_success: 0, death_saves_failure: 0,
    inspiration: 0, lucky_used: 0, speed_walk: 30, exhaustion_level: 0,
    languages: [],
    action_used: 0, bonus_used: 0, reaction_used: 0,
    effects: [], resistances: [], vulnerabilities: [], immunities: [],
    created_at: 0, updated_at: 0,
    ...overrides,
  };
}

describe('proficiencyBonus', () => {
  it.each([
    [1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [12, 4], [13, 5], [16, 5], [17, 6], [20, 6],
  ])('level %i → +%i', (level, expected) => {
    expect(proficiencyBonus(level)).toBe(expected);
  });
});

describe('hpAverageForHitDie', () => {
  it.each([[6, 4], [8, 5], [10, 6], [12, 7]])('d%i → %i', (die, avg) => {
    expect(hpAverageForHitDie(die)).toBe(avg);
  });
});

describe('computeMaxHp', () => {
  it('level 1 = full hit die + Con mod', () => {
    expect(computeMaxHp(1, 10, 2)).toBe(12); // 10 + 2
  });
  it('level 5 fighter d10, +2 Con = 10+2 + 4×(6+2) = 44', () => {
    expect(computeMaxHp(5, 10, 2)).toBe(44);
  });
  it('clamps to minimum 1', () => {
    expect(computeMaxHp(1, 6, -5)).toBe(1);
  });
});

describe('computeSpellSlots', () => {
  it('full caster level 1 → 2 first-level slots', () => {
    expect(computeSpellSlots('wizard', 1)).toEqual({ '1': 2 });
  });
  it('half caster level 1 → no slots yet (paladin starts at L2)', () => {
    expect(computeSpellSlots('paladin', 1)).toEqual({});
  });
  it('warlock level 5 → 2 third-level pact slots', () => {
    expect(computeSpellSlots('warlock', 5)).toEqual({ '3': 2 });
  });
  it('non-caster returns empty', () => {
    expect(computeSpellSlots('barbarian', 5)).toEqual({});
  });
});

describe('computeMulticlassHp', () => {
  it('Fighter 1 / Wizard 1, +2 Con = 10+2 + 1×(4+2) = 18', () => {
    const classes: ClassEntry[] = [
      { slug: 'fighter', subclass_slug: null, level: 1, hit_dice_used: 0 },
      { slug: 'wizard', subclass_slug: null, level: 1, hit_dice_used: 0 },
    ];
    expect(computeMulticlassHp(classes, 2)).toBe(18);
  });
  it('Wizard 1 (primary, d6 full) / Fighter 1 (secondary, d10 avg) = 6+2 + 1×(6+2) = 16', () => {
    const classes: ClassEntry[] = [
      { slug: 'wizard', subclass_slug: null, level: 1, hit_dice_used: 0 },
      { slug: 'fighter', subclass_slug: null, level: 1, hit_dice_used: 0 },
    ];
    expect(computeMulticlassHp(classes, 2)).toBe(16);
  });
});

describe('multiclassCasterLevel', () => {
  it('Wizard 5 / Cleric 3 = 5 + 3 = 8 full caster levels', () => {
    expect(multiclassCasterLevel([
      { slug: 'wizard', subclass_slug: null, level: 5, hit_dice_used: 0 },
      { slug: 'cleric', subclass_slug: null, level: 3, hit_dice_used: 0 },
    ])).toBe(8);
  });
  it('Paladin 4 = floor(4/2) = 2', () => {
    expect(multiclassCasterLevel([
      { slug: 'paladin', subclass_slug: null, level: 4, hit_dice_used: 0 },
    ])).toBe(2);
  });
  it('Eldritch Knight Fighter 6 = floor(6/3) = 2', () => {
    expect(multiclassCasterLevel([
      { slug: 'fighter', subclass_slug: 'eldritch-knight', level: 6, hit_dice_used: 0 },
    ])).toBe(2);
  });
  it('Plain Fighter does not contribute', () => {
    expect(multiclassCasterLevel([
      { slug: 'fighter', subclass_slug: null, level: 6, hit_dice_used: 0 },
    ])).toBe(0);
  });
  it('Warlock excluded from multiclass casting (pact magic separate)', () => {
    expect(multiclassCasterLevel([
      { slug: 'warlock', subclass_slug: null, level: 5, hit_dice_used: 0 },
    ])).toBe(0);
  });
});

describe('computeMulticlassSpellSlots', () => {
  it('Wizard 5 / Cleric 3 = caster level 8 = full caster L8 slots', () => {
    expect(computeMulticlassSpellSlots([
      { slug: 'wizard', subclass_slug: null, level: 5, hit_dice_used: 0 },
      { slug: 'cleric', subclass_slug: null, level: 3, hit_dice_used: 0 },
    ])).toEqual({ '1': 4, '2': 3, '3': 3, '4': 2 });
  });
});

describe('meetsMulticlassPrereqs', () => {
  it('fighter requires STR 13 OR DEX 13', () => {
    expect(meetsMulticlassPrereqs('fighter', { ...baseAbilities, str: 13, dex: 8 })).toBe(true);
    expect(meetsMulticlassPrereqs('fighter', { ...baseAbilities, str: 8, dex: 13 })).toBe(true);
    expect(meetsMulticlassPrereqs('fighter', { ...baseAbilities, str: 12, dex: 12 })).toBe(false);
  });
  it('paladin requires STR 13 AND CHA 13', () => {
    expect(meetsMulticlassPrereqs('paladin', { ...baseAbilities, str: 13, cha: 13 })).toBe(true);
    expect(meetsMulticlassPrereqs('paladin', { ...baseAbilities, str: 13, cha: 12 })).toBe(false);
  });
  it('monk requires DEX 13 AND WIS 13', () => {
    expect(meetsMulticlassPrereqs('monk', { ...baseAbilities, dex: 13, wis: 13 })).toBe(true);
    expect(meetsMulticlassPrereqs('monk', { ...baseAbilities, dex: 13, wis: 12 })).toBe(false);
  });
});

describe('recomputeDerived', () => {
  it('adds Tough +2/level to hp_max', () => {
    const c = mkChar({
      level: 5, class_slug: 'fighter', feats: ['tough'],
      abilities: { ...baseAbilities, con: 14 },
    });
    const baseHp = computeMaxHp(5, 10, 2); // 44
    const result = recomputeDerived(c, 10);
    expect(result.hp_max).toBe(baseHp + 2 * 5); // 54
  });
  it('without Tough returns unmodified hp_max', () => {
    const c = mkChar({
      level: 5, class_slug: 'fighter', feats: [],
      abilities: { ...baseAbilities, con: 14 },
    });
    const result = recomputeDerived(c, 10);
    expect(result.hp_max).toBe(computeMaxHp(5, 10, 2));
  });
  it('preserves hp_current when not zero', () => {
    const c = mkChar({ level: 1, hp_current: 5, hp_max: 10, class_slug: 'fighter' });
    const result = recomputeDerived(c, 10);
    expect(result.hp_current).toBe(5);
  });
  it('seeds hp_current to hp_max when 0 (fresh character)', () => {
    const c = mkChar({ level: 1, hp_current: 0, class_slug: 'fighter' });
    const result = recomputeDerived(c, 10);
    expect(result.hp_current).toBe(result.hp_max);
  });
});

describe('CLASS_SAVE_PROFICIENCIES', () => {
  it('all 12 classes have exactly 2 saves each', () => {
    const slugs = ['barbarian','bard','cleric','druid','fighter','monk','paladin','ranger','rogue','sorcerer','warlock','wizard'];
    for (const s of slugs) {
      expect(CLASS_SAVE_PROFICIENCIES[s]).toBeDefined();
      expect(CLASS_SAVE_PROFICIENCIES[s]?.length).toBe(2);
    }
  });
});
