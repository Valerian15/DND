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
