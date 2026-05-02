// Pure helpers used by the combat resolvers. Extracted so they can be unit-tested
// without spinning up the whole server module graph.

/** Add a flat bonus to a "NdM[+X]" damage expression. Returns the original on parse failure. */
export function addToDamageExpression(expr: string, bonus: number): string {
  const m = expr.replace(/\s+/g, '').match(/^(\d+d\d+)([+-]\d+)?$/i);
  if (!m) return expr;
  const dice = m[1];
  const mod = m[2] ? parseInt(m[2], 10) : 0;
  const next = mod + bonus;
  if (next === 0) return dice;
  return `${dice}${next > 0 ? '+' : ''}${next}`;
}

/**
 * Apply Heavy Armor Master damage reduction.
 * RAW: -3 from bludgeoning/piercing/slashing damage from nonmagical weapons while wearing heavy
 * armor. We apply more loosely: any B/P/S damage if the target has the feat. Caller decides whether
 * the feat is present.
 */
export function reduceDamageForHam(
  hasHam: boolean,
  damageType: string,
  dmg: number,
): { adjusted: number; reduced: boolean } {
  if (!hasHam || dmg <= 0) return { adjusted: dmg, reduced: false };
  const dt = (damageType || '').toLowerCase().trim();
  if (dt !== 'bludgeoning' && dt !== 'piercing' && dt !== 'slashing') {
    return { adjusted: dmg, reduced: false };
  }
  return { adjusted: Math.max(0, dmg - 3), reduced: true };
}
