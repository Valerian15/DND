// Curated spellcasting profiles for SRD monsters whose stat blocks include a spell list.
// We keep this as a small hand-authored map rather than parsing the free-form `actions` text
// each monster carries — parsing is fragile and most home games only use a handful of casters.
//
// To add a new monster: pick the slug from /api/library/monsters, copy its DC + attack bonus
// from the stat block, list cantrips and leveled spells.

export interface MonsterSpellcastingProfile {
  /** What the spell-attack/save modifiers come from — display only. */
  ability: 'int' | 'wis' | 'cha';
  /** Spell save DC. */
  save_dc: number;
  /** Spell attack bonus. */
  attack_bonus: number;
  /** At-will cantrips. */
  cantrips: string[];
  /** Leveled spells grouped by base level (1-9). */
  spells_by_level: Record<number, string[]>;
  /** Slot counts per level — informational; slot tracking is not yet implemented. */
  slots_by_level: Record<number, number>;
}

export const MONSTER_SPELLCASTING: Record<string, MonsterSpellcastingProfile> = {
  // --- Liches and high-tier wizards ---
  'lich': {
    ability: 'int',
    save_dc: 20,
    attack_bonus: 12,
    cantrips: ['mage-hand', 'prestidigitation', 'ray-of-frost'],
    spells_by_level: {
      1: ['detect-magic', 'magic-missile', 'shield', 'thunderwave'],
      2: ['detect-thoughts', 'invisibility', 'mirror-image'],
      3: ['animate-dead', 'counterspell', 'dispel-magic', 'fireball'],
      4: ['blight', 'dimension-door'],
      5: ['cloudkill', 'scrying'],
      6: ['disintegrate', 'globe-of-invulnerability'],
      7: ['finger-of-death', 'plane-shift'],
      8: ['dominate-monster', 'power-word-stun'],
      9: ['power-word-kill'],
    },
    slots_by_level: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  },

  'archmage': {
    ability: 'int',
    save_dc: 18,
    attack_bonus: 9,
    cantrips: ['fire-bolt', 'light', 'mage-hand', 'prestidigitation'],
    spells_by_level: {
      1: ['detect-magic', 'identify', 'mage-armor', 'magic-missile'],
      2: ['detect-thoughts', 'mirror-image', 'misty-step'],
      3: ['counterspell', 'fly', 'lightning-bolt'],
      4: ['banishment', 'fire-shield', 'stoneskin'],
      5: ['cone-of-cold', 'scrying', 'wall-of-force'],
      6: ['globe-of-invulnerability'],
      7: ['teleport'],
      8: ['mind-blank'],
      9: ['time-stop'],
    },
    slots_by_level: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  },

  'mage': {
    ability: 'int',
    save_dc: 14,
    attack_bonus: 6,
    cantrips: ['fire-bolt', 'light', 'mage-hand', 'prestidigitation'],
    spells_by_level: {
      1: ['detect-magic', 'mage-armor', 'magic-missile', 'shield'],
      2: ['misty-step', 'suggestion'],
      3: ['counterspell', 'fireball', 'fly'],
      4: ['greater-invisibility', 'ice-storm'],
      5: ['cone-of-cold'],
    },
    slots_by_level: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  },

  // --- Divine casters ---
  'priest': {
    ability: 'wis',
    save_dc: 13,
    attack_bonus: 5,
    cantrips: ['light', 'sacred-flame', 'thaumaturgy'],
    spells_by_level: {
      1: ['cure-wounds', 'guiding-bolt', 'sanctuary'],
      2: ['lesser-restoration', 'spiritual-weapon'],
      3: ['dispel-magic', 'spirit-guardians'],
    },
    slots_by_level: { 1: 4, 2: 3, 3: 2 },
  },

  'cult-fanatic': {
    ability: 'wis',
    save_dc: 11,
    attack_bonus: 3,
    cantrips: ['light', 'sacred-flame', 'thaumaturgy'],
    spells_by_level: {
      1: ['command', 'inflict-wounds', 'shield-of-faith'],
      2: ['hold-person', 'spiritual-weapon'],
    },
    slots_by_level: { 1: 4, 2: 3 },
  },

  'druid': {
    ability: 'wis',
    save_dc: 12,
    attack_bonus: 4,
    cantrips: ['druidcraft', 'produce-flame', 'shillelagh'],
    spells_by_level: {
      1: ['entangle', 'longstrider', 'speak-with-animals', 'thunderwave'],
      2: ['animal-messenger', 'barkskin'],
    },
    slots_by_level: { 1: 4, 2: 3 },
  },
};

export function getMonsterSpellcasting(slug: string | null): MonsterSpellcastingProfile | null {
  if (!slug) return null;
  return MONSTER_SPELLCASTING[slug] ?? null;
}
