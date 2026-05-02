import { describe, it, expect } from 'vitest';
import { previewLevelUp, applyAsi, isAsiLevel, hpGainOnLevelUp } from './levelUp';
import type { Abilities, Character } from './types';

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

describe('isAsiLevel', () => {
  it('triggers at standard ASI levels regardless of class', () => {
    for (const lvl of [4, 8, 12, 16, 19]) {
      expect(isAsiLevel('wizard', lvl)).toBe(true);
    }
  });
  it('fighter has bonus ASIs at 6 and 14', () => {
    expect(isAsiLevel('fighter', 6)).toBe(true);
    expect(isAsiLevel('fighter', 14)).toBe(true);
  });
  it('rogue has bonus ASI at 10', () => {
    expect(isAsiLevel('rogue', 10)).toBe(true);
  });
  it('non-ASI levels return false', () => {
    expect(isAsiLevel('fighter', 5)).toBe(false);
  });
});

describe('applyAsi', () => {
  it('+2 mode bumps a single ability by 2', () => {
    const next = applyAsi(baseAbilities, { mode: 'plus-two', firstAbility: 'str' });
    expect(next?.str).toBe(12);
  });
  it('+2 mode caps at 20', () => {
    const next = applyAsi({ ...baseAbilities, str: 19 }, { mode: 'plus-two', firstAbility: 'str' });
    expect(next?.str).toBe(20);
  });
  it('+2 mode rejects already-capped ability', () => {
    const next = applyAsi({ ...baseAbilities, str: 20 }, { mode: 'plus-two', firstAbility: 'str' });
    expect(next).toBeNull();
  });
  it('+1/+1 mode bumps two different abilities', () => {
    const next = applyAsi(baseAbilities, { mode: 'plus-one-one', firstAbility: 'str', secondAbility: 'dex' });
    expect(next?.str).toBe(11);
    expect(next?.dex).toBe(15);
  });
  it('+1/+1 mode rejects same ability twice', () => {
    const next = applyAsi(baseAbilities, { mode: 'plus-one-one', firstAbility: 'str', secondAbility: 'str' });
    expect(next).toBeNull();
  });
  it('skip mode returns abilities unchanged', () => {
    const next = applyAsi(baseAbilities, { mode: 'skip' });
    expect(next).toEqual(baseAbilities);
  });
});

describe('hpGainOnLevelUp', () => {
  it('d10 + Con +2 = 6 + 2 = 8', () => {
    expect(hpGainOnLevelUp(10, 2)).toBe(8);
  });
  it('d6 + Con 0 = 4', () => {
    expect(hpGainOnLevelUp(6, 0)).toBe(4);
  });
});

describe('previewLevelUp', () => {
  it('reports new level and class level', () => {
    const c = mkChar({ level: 4, class_slug: 'fighter', hp_max: 36 });
    const preview = previewLevelUp(c, 10, 'fighter');
    expect(preview.newLevel).toBe(5);
    expect(preview.newClassLevel).toBe(5);
  });
  it('flags ASI at fighter L4', () => {
    const c = mkChar({ level: 3, class_slug: 'fighter' });
    expect(previewLevelUp(c, 10, 'fighter').asiRequired).toBe(true);
  });
  it('does not flag ASI at fighter L5', () => {
    const c = mkChar({ level: 4, class_slug: 'fighter' });
    expect(previewLevelUp(c, 10, 'fighter').asiRequired).toBe(false);
  });
  it('Tough adds +2 to hpGain', () => {
    const c = mkChar({ level: 4, class_slug: 'fighter', hp_max: 36, feats: ['tough'] });
    const withoutTough = mkChar({ level: 4, class_slug: 'fighter', hp_max: 36 });
    const a = previewLevelUp(c, 10, 'fighter');
    const b = previewLevelUp(withoutTough, 10, 'fighter');
    expect(a.hpGain).toBe(b.hpGain + 2);
  });
  it('reports cantrip and spells-known deltas for sorcerer L1→L2', () => {
    const c = mkChar({ level: 1, class_slug: 'sorcerer' });
    const preview = previewLevelUp(c, 6, 'sorcerer');
    // Sorcerer cantrips: L1 = 4, L2 = 4 → 0 cantrips gained.
    // Sorcerer spells known: L1 = 2, L2 = 3 → 1 spell gained.
    expect(preview.cantripsGained).toBe(0);
    expect(preview.spellsKnownGained).toBe(1);
  });
  it('reports cantrip delta for wizard L3→L4 (+1 cantrip — wizard scaling lands at 4 and 10)', () => {
    const c = mkChar({ level: 3, class_slug: 'wizard' });
    const preview = previewLevelUp(c, 6, 'wizard');
    expect(preview.cantripsGained).toBe(1);
  });
});
