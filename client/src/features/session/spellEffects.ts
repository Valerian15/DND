// Parses Open5e spell duration strings into round counts (10 rounds = 1 minute).
// Returns null for instantaneous, indefinite, or out-of-combat-scope durations.
export function parseSpellDurationRounds(text: string | undefined | null): number | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  if (lower === 'instantaneous' || lower === 'special' || lower === '') return null;
  if (lower.includes('until dispelled') || lower.includes('permanent')) return null;

  // Strip leading "Concentration, up to" / "Up to"
  const cleaned = lower
    .replace(/^concentration[, ]*\s*/i, '')
    .replace(/^up\s+to\s+/i, '')
    .trim();

  // Pattern: "<n> round(s)" / "<n> minute(s)" / "<n> hour(s)"
  const m = cleaned.match(/(\d+)\s*(round|minute|hour|day)/);
  if (!m) {
    // Fallback: "1 round" / "1 minute"
    if (cleaned === '1 round') return 1;
    if (cleaned === '1 minute') return 10;
    if (cleaned === '10 minutes') return 100;
    return null;
  }
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === 'round') return Math.min(600, n);
  if (unit === 'minute') return Math.min(600, n * 10);
  // Anything 1 hour or longer is out of combat scope — caller can decide to skip
  return null;
}

// Curated map: spell slug → conditions to auto-apply on targets.
// Only spells that reliably impose a discrete D&D 5e condition on a successful hit / failed save.
// Resolution / save logic is still manual — this just sets the badge.
export const SPELL_INFLICTED_CONDITIONS: Record<string, string[]> = {
  'hold-person': ['paralyzed'],
  'hold-monster': ['paralyzed'],
  'web': ['restrained'],
  'tashas-hideous-laughter': ['prone', 'incapacitated'],
  'hideous-laughter': ['prone', 'incapacitated'],
  'sleep': ['unconscious'],
  'banishment': ['incapacitated'],
  'blindness-deafness': ['blinded'],
  'charm-person': ['charmed'],
  'command': ['prone'],
  'contagion': ['poisoned'],
  'dominate-beast': ['charmed'],
  'dominate-monster': ['charmed'],
  'dominate-person': ['charmed'],
  'fear': ['frightened'],
  'flesh-to-stone': ['restrained'],
  'mass-suggestion': ['charmed'],
  'phantasmal-killer': ['frightened'],
  'suggestion': ['charmed'],
  'slow': [],
  'haste': [],
  'bless': [],
  'bane': [],
  'faerie-fire': [],
  'hex': [],
  'hunters-mark': [],
  'invisibility': ['invisible'],
  'mage-armor': [],
  'shield-of-faith': [],
  'spiritual-weapon': [],
  'bardic-inspiration': [],
  'guidance': [],
  'resistance': [],
};

export function getSpellConditions(slug: string): string[] {
  return SPELL_INFLICTED_CONDITIONS[slug] ?? [];
}

/**
 * Curated set of healing spell slugs and their base heal-dice expression.
 * The "+SPELLMOD" placeholder is replaced at cast time with the caster's spellcasting ability mod.
 */
const HEALING_SPELLS: Record<string, { dice: string; addsSpellMod: boolean; scaling?: { perLevelDice: string } }> = {
  'cure-wounds': { dice: '1d8', addsSpellMod: true, scaling: { perLevelDice: '1d8' } },
  'healing-word': { dice: '1d4', addsSpellMod: true, scaling: { perLevelDice: '1d4' } },
  'mass-healing-word': { dice: '1d4', addsSpellMod: true, scaling: { perLevelDice: '1d4' } },
  'mass-cure-wounds': { dice: '3d8', addsSpellMod: true, scaling: { perLevelDice: '1d8' } },
  'aid': { dice: '0d0', addsSpellMod: false }, // Aid sets max HP; not a heal in this sense
  'prayer-of-healing': { dice: '2d8', addsSpellMod: true, scaling: { perLevelDice: '1d8' } },
  'heal': { dice: '70', addsSpellMod: false }, // 70 flat at L6+
  'mass-heal': { dice: '700', addsSpellMod: false },
  'power-word-heal': { dice: '0d0', addsSpellMod: false },
};

export function isHealingSpell(slug: string): boolean {
  return slug in HEALING_SPELLS;
}

/**
 * Build the heal-dice expression for a cast level + spellcasting ability modifier.
 * Returns null if the slug isn't a known healing spell.
 */
export function buildHealDice(slug: string, castLevel: number, baseLevel: number, spellMod: number): string | null {
  const spec = HEALING_SPELLS[slug];
  if (!spec) return null;
  const upcastBy = Math.max(0, castLevel - baseLevel);
  // Parse base dice (e.g. "1d8") and per-level scaling
  const parse = (expr: string): { count: number; sides: number } | null => {
    const m = expr.match(/^(\d+)d(\d+)$/);
    return m ? { count: parseInt(m[1], 10), sides: parseInt(m[2], 10) } : null;
  };
  const base = parse(spec.dice);
  if (!base) {
    // Flat number (e.g. Heal "70")
    const flat = parseInt(spec.dice, 10);
    if (Number.isFinite(flat)) return `0d1+${flat}`;
    return null;
  }
  let totalCount = base.count;
  if (spec.scaling) {
    const scale = parse(spec.scaling.perLevelDice);
    if (scale && scale.sides === base.sides) totalCount += scale.count * upcastBy;
  }
  const mod = spec.addsSpellMod ? spellMod : 0;
  return `${totalCount}d${base.sides}${mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`;
}
