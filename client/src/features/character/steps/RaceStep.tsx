import { useEffect, useMemo, useState } from 'react';
import type { Abilities, AbilityKey, Character, LibraryItem } from '../types';
import { ABILITY_NAMES, ABILITY_ORDER } from '../types';
import { getLibraryItem, listLibrary } from '../api';
import { MD } from '../../library/Statblock';
import { SKILLS } from '../skills';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

interface AsiEntry { attributes: string[]; value: number }

interface SubraceData {
  name: string;
  slug: string;
  desc?: string;
  asi?: AsiEntry[];
  asi_desc?: string;
  traits?: string;
}

interface RaceData {
  name: string;
  desc?: string;
  asi_desc?: string;
  asi?: AsiEntry[];
  age?: string;
  alignment?: string;
  size?: string;
  size_raw?: string;
  speed?: any;
  speed_desc?: string;
  languages?: string;
  vision?: string;
  traits?: string;
  subraces?: SubraceData[];
  darkvision?: number;
}

const ATTR_TO_KEY: Record<string, AbilityKey> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

/** Returns { fixed: {ability→delta}, floatingCount } extracted from an ASI list. */
function partitionAsi(asi: AsiEntry[] | undefined): { fixed: Partial<Record<AbilityKey, number>>; floatingCount: number } {
  const fixed: Partial<Record<AbilityKey, number>> = {};
  let floatingCount = 0;
  for (const e of asi ?? []) {
    for (const attr of e.attributes ?? []) {
      const key = ATTR_TO_KEY[attr.toLowerCase()];
      if (key) fixed[key] = (fixed[key] ?? 0) + e.value;
      else floatingCount += 1;
    }
  }
  return { fixed, floatingCount };
}

/** Sum two partial-ability maps. */
function sumDeltas(...maps: Array<Partial<Record<AbilityKey, number>>>): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  for (const m of maps) {
    for (const k of ABILITY_ORDER) {
      const v = m[k] ?? 0;
      if (v) out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

function applyDelta(abilities: Abilities, delta: Partial<Record<AbilityKey, number>>, sign: 1 | -1): Abilities {
  const next: Abilities = { ...abilities };
  for (const k of ABILITY_ORDER) next[k] = next[k] + sign * (delta[k] ?? 0);
  return next;
}

interface AppliedAsis {
  race?: Partial<Record<AbilityKey, number>>;
  subrace?: Partial<Record<AbilityKey, number>>;
  /** Floating +1s the player picked (race + subrace combined, in pick order). */
  floating?: AbilityKey[];
}

/** Races that grant +1 skill of choice at character creation. */
const RACES_WITH_SKILL_GRANT: Record<string, true> = {
  'human-variant': true,
};

const KNOWN_LANGUAGES = [
  'Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
  'Abyssal', 'Celestial', 'Deep Speech', 'Draconic', 'Infernal', 'Primordial',
  'Sylvan', 'Undercommon', 'Auran', 'Aquan', 'Ignan', 'Terran', 'Druidic',
];

const DAMAGE_TYPES_FOR_PARSE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

interface RaceGrants {
  languages: string[];
  resistances: string[];
  speed: number;
}

/**
 * Extract auto-applicable race grants (languages, damage resistances, speed) from race data.
 * Heuristics over the markdown text — catches the common cases (tiefling fire, dwarf poison,
 * etc.) and silently skips anything it doesn't recognise. The player can fix-up via Details.
 */
function parseRaceGrants(race: { speed?: { walk?: number }; languages?: string; traits?: string }): RaceGrants {
  const grants: RaceGrants = { languages: [], resistances: [], speed: 30 };
  if (typeof race.speed?.walk === 'number') grants.speed = race.speed.walk;

  const langText = (race.languages ?? '').toLowerCase();
  for (const lang of KNOWN_LANGUAGES) {
    if (langText.includes(lang.toLowerCase())) grants.languages.push(lang);
  }

  const traitsText = race.traits ?? '';
  // Match "resistance to <type> damage" or "resistance against <type> damage".
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

export default function RaceStep({ character, onChange }: Props) {
  const [races, setRaces] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<RaceData | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const description = (character.description ?? {}) as { applied_asis?: AppliedAsis };
  const applied: AppliedAsis = description.applied_asis ?? {};

  useEffect(() => {
    listLibrary('races').then(setRaces).finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!character.race_slug) { setSelected(null); return; }
    setLoadingDetail(true);
    getLibraryItem<{ data: RaceData }>('races', character.race_slug)
      .then((r) => setSelected(r.data))
      .catch(() => setSelected(null))
      .finally(() => setLoadingDetail(false));
  }, [character.race_slug]);

  const subrace = useMemo(() => {
    if (!selected || !character.subrace_slug) return null;
    return selected.subraces?.find((s) => s.slug === character.subrace_slug) ?? null;
  }, [selected, character.subrace_slug]);

  const raceFixed = partitionAsi(selected?.asi);
  const subraceFixed = partitionAsi(subrace?.asi);
  const totalFloatingNeeded = raceFixed.floatingCount + subraceFixed.floatingCount;

  /** Build the patch: undo previously-applied bonuses, apply the new set, persist with applied_asis. */
  function buildAsiPatch(args: {
    nextRace?: RaceData | null;
    nextSubrace?: SubraceData | null;
    nextFloating?: AbilityKey[];
  }): Partial<Character> {
    const nextRaceFixed = partitionAsi(args.nextRace?.asi).fixed;
    const nextSubraceFixed = partitionAsi(args.nextSubrace?.asi).fixed;
    const nextFloating = args.nextFloating ?? [];
    const floatingDelta: Partial<Record<AbilityKey, number>> = {};
    for (const k of nextFloating) floatingDelta[k] = (floatingDelta[k] ?? 0) + 1;

    // Compose previous deltas
    const prevDelta = sumDeltas(
      applied.race ?? {},
      applied.subrace ?? {},
      Object.fromEntries((applied.floating ?? []).map((k) => [k, 1])) as Partial<Record<AbilityKey, number>>,
    );
    const nextDelta = sumDeltas(nextRaceFixed, nextSubraceFixed, floatingDelta);

    let abilities = applyDelta(character.abilities, prevDelta, -1);
    abilities = applyDelta(abilities, nextDelta, +1);

    return {
      abilities,
      description: {
        ...(description as Record<string, unknown>),
        applied_asis: {
          race: nextRaceFixed,
          subrace: nextSubraceFixed,
          floating: nextFloating,
        } satisfies AppliedAsis,
      } as Record<string, unknown>,
    };
  }

  async function selectRace(slug: string) {
    try {
      const r = await getLibraryItem<{ data: RaceData; darkvision?: number }>('races', slug);
      const patch = buildAsiPatch({ nextRace: r.data, nextSubrace: null, nextFloating: [] });

      // If switching away from a race-skill-grant race, drop the prior race-granted skill.
      const skills = { ...((character.skills ?? {}) as Record<string, { proficient?: boolean; source?: string }>) };
      const prevRaceSkill = (description as Record<string, any>).race_skill_grant as string | undefined;
      if (prevRaceSkill && skills[prevRaceSkill]?.source === 'race') delete skills[prevRaceSkill];

      // Diff race-granted languages / resistances / speed against the previous grant snapshot
      // and overwrite cleanly so character.languages and .resistances don't drift.
      const prevGrants = ((description as Record<string, any>).applied_race_grants ?? { languages: [], resistances: [], speed: 30 }) as RaceGrants;
      const nextGrants = parseRaceGrants(r.data);
      const languages = [
        ...((character.languages ?? []) as string[]).filter((l) => !prevGrants.languages.includes(l)),
        ...nextGrants.languages,
      ];
      const resistances = [
        ...((character.resistances ?? []) as string[]).filter((dt) => !prevGrants.resistances.includes(dt)),
        ...nextGrants.resistances,
      ];

      const nextDesc = { ...(patch.description as Record<string, unknown>) };
      delete (nextDesc as any).race_skill_grant;
      (nextDesc as any).applied_race_grants = nextGrants;

      onChange({
        race_slug: slug,
        subrace_slug: null,
        darkvision: (r as any).darkvision ?? 0,
        speed_walk: nextGrants.speed,
        languages: Array.from(new Set(languages)),
        resistances: Array.from(new Set(resistances)),
        ...patch,
        skills,
        description: nextDesc,
      });
    } catch {
      onChange({ race_slug: slug });
    }
  }

  function setRaceSkill(skillKey: string) {
    const skills = { ...((character.skills ?? {}) as Record<string, { proficient?: boolean; source?: string }>) };
    const prev = (description as Record<string, any>).race_skill_grant as string | undefined;
    if (prev && skills[prev]?.source === 'race') delete skills[prev];
    if (skillKey) skills[skillKey] = { proficient: true, source: 'race' };
    const nextDesc = { ...(description as Record<string, any>) };
    if (skillKey) nextDesc.race_skill_grant = skillKey;
    else delete nextDesc.race_skill_grant;
    onChange({ skills, description: nextDesc });
  }

  function selectSubrace(slug: string | null) {
    if (!selected) return;
    const next = slug ? selected.subraces?.find((s) => s.slug === slug) ?? null : null;
    const patch = buildAsiPatch({ nextRace: selected, nextSubrace: next, nextFloating: [] });
    onChange({ subrace_slug: slug, ...patch });
  }

  function setFloating(idx: number, key: AbilityKey | '') {
    const current = applied.floating ?? [];
    const next = [...current];
    while (next.length < totalFloatingNeeded) next.push('' as any);
    next[idx] = key as AbilityKey;
    const filtered = next.slice(0, totalFloatingNeeded).filter((k): k is AbilityKey => !!k);
    const patch = buildAsiPatch({ nextRace: selected, nextSubrace: subrace, nextFloating: filtered });
    onChange(patch);
  }

  if (loadingList) return <p>Loading races…</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Choose your race</h2>
      <p style={{ color: '#666' }}>Your character's ancestry. Determines ability bonuses, speed, and innate traits.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {races.map((race) => {
          const isActive = character.race_slug === race.slug;
          return (
            <button key={race.id} onClick={() => selectRace(race.slug)}
              style={{
                padding: '1rem', borderRadius: 6,
                border: isActive ? '2px solid #333' : '1px solid #ddd',
                background: isActive ? '#fafafa' : '#fff',
                cursor: 'pointer', textAlign: 'left',
                fontWeight: isActive ? 'bold' : 'normal',
              }}>
              {race.name}
            </button>
          );
        })}
      </div>

      {loadingDetail && <p>Loading details…</p>}

      {selected && (
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: 6, border: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
          {selected.asi_desc && <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}><MD text={selected.asi_desc} /></div>}
          {selected.size_raw && <p><strong>Size:</strong> {selected.size_raw}</p>}
          {selected.speed_desc && <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}><MD text={selected.speed_desc} /></div>}
          {selected.languages && (
            <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>
              <MD text={selected.languages} />
              <div style={{ fontSize: '0.78rem', color: '#888', marginTop: '0.2rem' }}>↪ Add granted languages in the Details step.</div>
            </div>
          )}
          {selected.vision && <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}><MD text={selected.vision} /></div>}
          {selected.traits && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>Traits</summary>
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}><MD text={selected.traits} /></div>
            </details>
          )}
          {selected.desc && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>Description</summary>
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}><MD text={selected.desc} /></div>
            </details>
          )}
        </div>
      )}

      {selected && selected.subraces && selected.subraces.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Subrace</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: subrace ? '1rem' : 0 }}>
            {selected.subraces.map((s) => {
              const isActive = character.subrace_slug === s.slug;
              return (
                <button key={s.slug} onClick={() => selectSubrace(isActive ? null : s.slug)}
                  style={{
                    padding: '0.6rem 0.75rem', borderRadius: 5,
                    border: isActive ? '2px solid #333' : '1px solid #ddd',
                    background: isActive ? '#fafafa' : '#fff', cursor: 'pointer',
                    textAlign: 'left', fontSize: '0.85rem',
                    fontWeight: isActive ? 'bold' : 'normal',
                  }}>
                  {s.name}
                </button>
              );
            })}
          </div>
          {subrace && (
            <div style={{ background: '#f9f9f9', padding: '0.75rem', borderRadius: 5, border: '1px solid #eee', fontSize: '0.88rem' }}>
              <strong>{subrace.name}</strong>
              {subrace.asi_desc && <div style={{ marginTop: '0.3rem' }}><MD text={subrace.asi_desc} /></div>}
              {subrace.desc && <div style={{ marginTop: '0.3rem', color: '#555' }}><MD text={subrace.desc} /></div>}
              {subrace.traits && (
                <details style={{ marginTop: '0.4rem' }}>
                  <summary style={{ cursor: 'pointer', color: '#666' }}>Traits</summary>
                  <div style={{ marginTop: '0.3rem' }}><MD text={subrace.traits} /></div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {character.race_slug && RACES_WITH_SKILL_GRANT[character.race_slug] && (() => {
        const current = (description as Record<string, any>).race_skill_grant as string | undefined;
        return (
          <div style={{ marginTop: '1.5rem', background: '#e7f7ec', padding: '0.85rem 1rem', borderRadius: 6, border: '1px solid #c2e7d0' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Bonus skill (Variant Human)</h3>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.5rem' }}>
              Pick one skill to gain proficiency in. (You also gain a feat at level 1 — pick it in the Feats step.)
            </p>
            <select value={current ?? ''} onChange={(e) => setRaceSkill(e.target.value)}
              style={{ padding: '0.4rem', border: '1px solid #ccc', borderRadius: 4, minWidth: 220 }}>
              <option value="">— pick a skill —</option>
              {SKILLS.map((s) => (<option key={s.key} value={s.key}>{s.name}</option>))}
            </select>
          </div>
        );
      })()}

      {totalFloatingNeeded > 0 && (
        <div style={{ marginTop: '1.5rem', background: '#fff8e1', padding: '0.85rem 1rem', borderRadius: 6, border: '1px solid #ecd87a' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Floating ability bonus</h3>
          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.6rem' }}>
            Pick {totalFloatingNeeded === 1 ? 'an ability' : `${totalFloatingNeeded} different abilities`} to gain +1.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${totalFloatingNeeded}, 1fr)`, gap: '0.5rem' }}>
            {Array.from({ length: totalFloatingNeeded }).map((_, i) => {
              const value = applied.floating?.[i] ?? '';
              return (
                <select key={i} value={value} onChange={(e) => setFloating(i, e.target.value as AbilityKey | '')}
                  style={{ padding: '0.4rem', border: '1px solid #ccc', borderRadius: 4 }}>
                  <option value="">— pick —</option>
                  {ABILITY_ORDER.map((k) => (
                    <option key={k} value={k}>{ABILITY_NAMES[k]} +1</option>
                  ))}
                </select>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
