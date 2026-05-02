import { describe, it, expect } from 'vitest';
import { getCasterConfig, getCasterConfigForEntry, maxSpellLevelFor, preparedCount } from './casters';
import type { ClassEntry } from './types';

describe('getCasterConfig', () => {
  it('returns the wizard config for "wizard"', () => {
    const cfg = getCasterConfig('wizard');
    expect(cfg?.classSlug).toBe('wizard');
    expect(cfg?.ability).toBe('int');
    expect(cfg?.model).toBe('spellbook');
  });

  it('returns null for non-casters', () => {
    expect(getCasterConfig('barbarian')).toBeNull();
    expect(getCasterConfig('fighter')).toBeNull();
    expect(getCasterConfig('rogue')).toBeNull();
  });

  it('returns null for unknown classes and null input', () => {
    expect(getCasterConfig(null)).toBeNull();
    expect(getCasterConfig('homebrew')).toBeNull();
  });
});

describe('getCasterConfigForEntry', () => {
  function entry(slug: string, subclass: string | null): ClassEntry {
    return { slug, subclass_slug: subclass, level: 5, hit_dice_used: 0 };
  }

  it('plain fighter returns null', () => {
    expect(getCasterConfigForEntry(entry('fighter', null))).toBeNull();
  });

  it('Eldritch Knight fighter resolves to the EK config (third caster, INT, wizard list)', () => {
    const cfg = getCasterConfigForEntry(entry('fighter', 'eldritch-knight'));
    expect(cfg?.classSlug).toBe('eldritch-knight');
    expect(cfg?.type).toBe('third');
    expect(cfg?.ability).toBe('int');
    expect(cfg?.spellListClass).toBe('wizard');
  });

  it('Arcane Trickster rogue resolves to the AT config (third, INT, wizard list)', () => {
    const cfg = getCasterConfigForEntry(entry('rogue', 'arcane-trickster'));
    expect(cfg?.classSlug).toBe('arcane-trickster');
    expect(cfg?.type).toBe('third');
    expect(cfg?.ability).toBe('int');
    expect(cfg?.spellListClass).toBe('wizard');
  });

  it('Champion fighter still returns null', () => {
    expect(getCasterConfigForEntry(entry('fighter', 'champion'))).toBeNull();
  });

  it('wizard regardless of subclass uses the wizard config', () => {
    expect(getCasterConfigForEntry(entry('wizard', 'school-of-evocation'))?.classSlug).toBe('wizard');
  });
});

describe('maxSpellLevelFor', () => {
  it.each([
    [1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 4], [8, 4],
    [9, 5], [10, 5], [11, 6], [12, 6], [13, 7], [14, 7], [15, 8],
    [16, 8], [17, 9], [18, 9], [19, 9], [20, 9],
  ])('full caster L%i max spell level = %i', (level, expected) => {
    const cfg = getCasterConfig('wizard')!;
    expect(maxSpellLevelFor(cfg, level)).toBe(expected);
  });

  it.each([
    [1, 0], [2, 1], [3, 1], [4, 1], [5, 2], [9, 3], [13, 4], [17, 5], [20, 5],
  ])('half caster (paladin) L%i max spell level = %i', (level, expected) => {
    const cfg = getCasterConfig('paladin')!;
    expect(maxSpellLevelFor(cfg, level)).toBe(expected);
  });

  it.each([
    [1, 1], [3, 2], [5, 3], [7, 4], [9, 5], [11, 5], [20, 5],
  ])('warlock L%i max spell level = %i (caps at 5)', (level, expected) => {
    const cfg = getCasterConfig('warlock')!;
    expect(maxSpellLevelFor(cfg, level)).toBe(expected);
  });
});

describe('preparedCount', () => {
  it('cleric (ability+level): WIS +3, L5 = max(1, 3+5) = 8', () => {
    const cfg = getCasterConfig('cleric')!;
    expect(preparedCount(cfg, 5, 3)).toBe(8);
  });

  it('cleric clamps to minimum 1 for low totals', () => {
    const cfg = getCasterConfig('cleric')!;
    expect(preparedCount(cfg, 1, -3)).toBe(1);
  });

  it('paladin (ability+halfLevel): CHA +3, L5 = max(1, 3 + 2) = 5', () => {
    const cfg = getCasterConfig('paladin')!;
    expect(preparedCount(cfg, 5, 3)).toBe(5);
  });

  it('paladin L1 not yet a caster (firstSpellLevel=2) but formula still returns >=1', () => {
    const cfg = getCasterConfig('paladin')!;
    expect(preparedCount(cfg, 1, 0)).toBe(1); // 0 + floor(1/2) = 0 → clamps to 1
  });

  it('returns 0 for known casters (sorcerer/bard/warlock — no prepared formula)', () => {
    const cfg = getCasterConfig('sorcerer')!;
    expect(preparedCount(cfg, 5, 3)).toBe(0);
  });
});
