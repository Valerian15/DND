import { useEffect, useMemo, useState } from 'react';
import type { Abilities, AbilityKey, Character, LibraryItem } from '../types';
import { ABILITY_NAMES, ABILITY_ORDER } from '../types';
import { getLibraryItem, listLibrary } from '../api';
import { MD } from '../../library/Statblock';

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
      onChange({
        race_slug: slug,
        subrace_slug: null,
        darkvision: (r as any).darkvision ?? 0,
        ...patch,
      });
    } catch {
      onChange({ race_slug: slug });
    }
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
          {selected.languages && <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}><MD text={selected.languages} /></div>}
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
