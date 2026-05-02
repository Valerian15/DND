import { describe, it, expect } from 'vitest';
import { addToDamageExpression, reduceDamageForHam } from './combatMath.js';

describe('addToDamageExpression', () => {
  it('combines positive modifiers: 2d6+3 + 10 = 2d6+13', () => {
    expect(addToDamageExpression('2d6+3', 10)).toBe('2d6+13');
  });
  it('adds modifier when none present: 1d8 + 10 = 1d8+10', () => {
    expect(addToDamageExpression('1d8', 10)).toBe('1d8+10');
  });
  it('combines with negative existing modifier: 2d6-2 + 10 = 2d6+8', () => {
    expect(addToDamageExpression('2d6-2', 10)).toBe('2d6+8');
  });
  it('drops zero modifier: 1d8+3 + (-3) = 1d8', () => {
    expect(addToDamageExpression('1d8+3', -3)).toBe('1d8');
  });
  it('produces negative modifier: 1d8 + (-5) = 1d8-5', () => {
    expect(addToDamageExpression('1d8', -5)).toBe('1d8-5');
  });
  it('returns the input verbatim on parse failure', () => {
    expect(addToDamageExpression('invalid', 10)).toBe('invalid');
    expect(addToDamageExpression('1d8+1d4', 10)).toBe('1d8+1d4');
  });
  it('strips whitespace before parsing', () => {
    expect(addToDamageExpression('  2d6 + 3  ', 10)).toBe('2d6+13');
  });
});

describe('reduceDamageForHam', () => {
  it('reduces bludgeoning by 3 when feat is on', () => {
    expect(reduceDamageForHam(true, 'bludgeoning', 10)).toEqual({ adjusted: 7, reduced: true });
  });
  it('reduces piercing by 3', () => {
    expect(reduceDamageForHam(true, 'piercing', 5)).toEqual({ adjusted: 2, reduced: true });
  });
  it('reduces slashing by 3', () => {
    expect(reduceDamageForHam(true, 'slashing', 4)).toEqual({ adjusted: 1, reduced: true });
  });
  it('clamps to 0 (no negative damage)', () => {
    expect(reduceDamageForHam(true, 'bludgeoning', 2)).toEqual({ adjusted: 0, reduced: true });
  });
  it('passes through fire damage unchanged', () => {
    expect(reduceDamageForHam(true, 'fire', 10)).toEqual({ adjusted: 10, reduced: false });
  });
  it('passes through if feat absent', () => {
    expect(reduceDamageForHam(false, 'bludgeoning', 10)).toEqual({ adjusted: 10, reduced: false });
  });
  it('passes through 0 damage with reduced flag false', () => {
    expect(reduceDamageForHam(true, 'bludgeoning', 0)).toEqual({ adjusted: 0, reduced: false });
  });
  it('case-insensitive damage type', () => {
    expect(reduceDamageForHam(true, 'BLUDGEONING', 10)).toEqual({ adjusted: 7, reduced: true });
  });
});
