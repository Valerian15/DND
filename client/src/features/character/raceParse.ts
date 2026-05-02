// Pure helpers for extracting auto-applicable race grants (languages, damage resistances,
// walking speed) out of the markdown / structured race data. Kept separate from RaceStep
// so the parsing can be unit-tested without rendering the component.

const KNOWN_LANGUAGES = [
  'Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
  'Abyssal', 'Celestial', 'Deep Speech', 'Draconic', 'Infernal', 'Primordial',
  'Sylvan', 'Undercommon', 'Auran', 'Aquan', 'Ignan', 'Terran', 'Druidic',
];

const DAMAGE_TYPES_FOR_PARSE = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
];

export interface RaceGrants {
  languages: string[];
  resistances: string[];
  speed: number;
}

export interface ParsableRace {
  speed?: { walk?: number };
  languages?: string;
  traits?: string;
}

/**
 * Extract auto-applicable race grants from race data. Heuristics over the markdown text —
 * catches the common cases (tiefling fire, dwarf poison, etc.) and silently skips anything
 * it doesn't recognise.
 */
export function parseRaceGrants(race: ParsableRace): RaceGrants {
  const grants: RaceGrants = { languages: [], resistances: [], speed: 30 };
  if (typeof race.speed?.walk === 'number') grants.speed = race.speed.walk;

  const langText = (race.languages ?? '').toLowerCase();
  for (const lang of KNOWN_LANGUAGES) {
    if (langText.includes(lang.toLowerCase())) grants.languages.push(lang);
  }

  const traitsText = race.traits ?? '';
  const resRe = /resistance\s+(?:to|against)\s+(\w+)\s*damage/gi;
  let m;
  while ((m = resRe.exec(traitsText)) !== null) {
    const dt = m[1].toLowerCase();
    if (DAMAGE_TYPES_FOR_PARSE.includes(dt) && !grants.resistances.includes(dt)) {
      grants.resistances.push(dt);
    }
  }
  return grants;
}
