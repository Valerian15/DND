import { useEffect, useState } from 'react';
import { listLibrary, getLibraryItem } from '../api';
import type { AbilityKey, Character, LibraryItem } from '../types';
import { ABILITY_NAMES, ABILITY_ORDER } from '../types';
import { MD } from '../../library/Statblock';

interface FeatData {
  name: string;
  desc?: string;
  prerequisite?: string;
  effects_desc?: string[];
}

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

/** Feats whose mechanical effect is wired into the game automation. */
const AUTOMATED_FEATS: Record<string, string> = {
  'tough': '+2 HP per level (auto-applied to HP max)',
  'alert': '+5 to initiative rolls (auto-applied)',
  'war-caster': 'Advantage on Con concentration saves (auto-applied)',
  'great-weapon-master': '−5/+10 power attack toggle on heavy melee weapons (in-game sheet)',
  'sharpshooter': '−5/+10 power attack toggle on ranged weapons (in-game sheet)',
  'heavy-armor-master': '−3 to bludgeoning/piercing/slashing damage taken (auto-applied)',
  'resilient': '+1 to chosen ability and proficiency in its saving throws',
  'lucky': '3 luck points/long rest — spend one in-sheet to reroll a d20, or accept a defensive prompt to force an attacker to reroll',
};

interface FeatGrants {
  resilient?: { ability: AbilityKey };
}

interface SaveEntry { proficient?: boolean; sources?: string[] }

/** Add a source tag to a save proficiency, creating the entry if missing. */
function addSaveSource(saves: unknown, ability: string, source: string): Record<string, SaveEntry> {
  const out = { ...((saves ?? {}) as Record<string, SaveEntry>) };
  const entry = out[ability] ?? {};
  // Migrate legacy entries (proficient: true, no sources) to ['class'].
  const baseSources = entry.sources ?? (entry.proficient ? ['class'] : []);
  const sources = baseSources.includes(source) ? baseSources : [...baseSources, source];
  out[ability] = { proficient: true, sources };
  return out;
}

/** Remove a source tag; if no sources remain, drop the entry. */
function removeSaveSource(saves: unknown, ability: string, source: string): Record<string, SaveEntry> {
  const out = { ...((saves ?? {}) as Record<string, SaveEntry>) };
  const entry = out[ability];
  if (!entry) return out;
  const baseSources = entry.sources ?? (entry.proficient ? ['class'] : []);
  const sources = baseSources.filter((s) => s !== source);
  if (sources.length === 0) delete out[ability];
  else out[ability] = { proficient: true, sources };
  return out;
}

const ABILITY_WORD_TO_KEY: Record<string, AbilityKey> = {
  strength: 'str', str: 'str',
  dexterity: 'dex', dex: 'dex',
  constitution: 'con', con: 'con',
  intelligence: 'int', int: 'int',
  wisdom: 'wis', wis: 'wis',
  charisma: 'cha', cha: 'cha',
};

/** Parse a prerequisite line into an {ability, minScore} pair. Returns null if unparseable. */
function parseAbilityPrereq(prereq: string | undefined): { ability: AbilityKey; minScore: number } | null {
  if (!prereq) return null;
  const m = prereq.match(/(strength|str|dexterity|dex|constitution|con|intelligence|int|wisdom|wis|charisma|cha)\s+(\d+)/i);
  if (!m) return null;
  const ability = ABILITY_WORD_TO_KEY[m[1].toLowerCase()];
  const minScore = parseInt(m[2], 10);
  if (!ability || !Number.isFinite(minScore)) return null;
  return { ability, minScore };
}

export default function FeatsStep({ character, onChange }: Props) {
  const [allFeats, setAllFeats] = useState<LibraryItem[]>([]);
  const [details, setDetails] = useState<Record<string, FeatData>>({});
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState('');

  const selected = character.feats ?? [];

  useEffect(() => {
    listLibrary('feats')
      .then(async (items) => {
        setAllFeats(items);
        // Lazy-load prereqs for the picker so ineligible feats can be greyed out.
        const results = await Promise.all(items.map((it) =>
          getLibraryItem<{ name: string; data: FeatData }>('feats', it.slug)
            .then((r) => ({ slug: it.slug, data: { ...r.data, name: r.name } as FeatData }))
            .catch(() => null),
        ));
        setDetails((prev) => {
          const next = { ...prev };
          for (const r of results) if (r) next[r.slug] = r.data;
          return next;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function addFeat() {
    if (!picking || selected.includes(picking)) return;
    onChange({ feats: [...selected, picking] });
    setPicking('');
  }

  function removeFeat(slug: string) {
    const patch: Partial<Character> = { feats: selected.filter((s) => s !== slug) };
    // If removing Resilient, undo its ability +1 AND remove the feat tag from saves.
    if (slug === 'resilient') {
      const desc = (character.description ?? {}) as Record<string, any>;
      const grants = (desc.feat_grants ?? {}) as FeatGrants;
      const prev = grants.resilient?.ability;
      if (prev) {
        const abilities = { ...character.abilities };
        abilities[prev] = Math.max(0, abilities[prev] - 1);
        const nextGrants = { ...grants };
        delete nextGrants.resilient;
        patch.abilities = abilities;
        patch.description = { ...desc, feat_grants: nextGrants };
        patch.saves = removeSaveSource(character.saves, prev, 'feat:resilient');
      }
    }
    onChange(patch);
  }

  function setResilientAbility(next: AbilityKey | '') {
    const desc = (character.description ?? {}) as Record<string, any>;
    const grants = (desc.feat_grants ?? {}) as FeatGrants;
    const prev = grants.resilient?.ability;
    if (prev === next) return;

    const abilities = { ...character.abilities };
    if (prev) abilities[prev] = Math.max(0, abilities[prev] - 1);
    if (next) abilities[next] = Math.min(20, abilities[next] + 1);

    const nextGrants: FeatGrants = { ...grants };
    if (next) nextGrants.resilient = { ability: next };
    else delete nextGrants.resilient;

    let saves = character.saves as Record<string, unknown>;
    if (prev) saves = removeSaveSource(saves, prev, 'feat:resilient') as Record<string, unknown>;
    if (next) saves = addSaveSource(saves, next, 'feat:resilient') as Record<string, unknown>;

    onChange({
      abilities,
      saves,
      description: { ...desc, feat_grants: nextGrants },
    });
  }

  if (loading) return <p style={{ color: '#666' }}>Loading feats…</p>;

  if (allFeats.length === 0) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Feats</h2>
        <div style={{ color: '#555', padding: '1rem', background: '#f9f9f9', borderRadius: 6 }}>
          <p style={{ margin: '0 0 0.5rem' }}>No feats in the library yet.</p>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Ask your admin to seed feats from the SRD, then come back.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Feats</h2>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        In standard 5e you gain a feat instead of an Ability Score Improvement at levels 4, 8, 12, 16, and 19.
        Variant Human and some races/classes also start with one. Pick the feats your character has earned.
      </p>

      {selected.length === 0 ? (
        <p style={{ color: '#999', fontSize: '0.9rem', margin: '1rem 0' }}>No feats selected yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {selected.map((slug) => {
            const feat = details[slug];
            return (
              <div key={slug} style={{ background: '#f9f9f9', border: '1px solid #e0e0e0', borderRadius: 6, padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: feat?.desc || feat?.effects_desc ? '0.5rem' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1rem' }}>✦ {feat?.name ?? slug}</strong>
                    {AUTOMATED_FEATS[slug] && (
                      <span title={AUTOMATED_FEATS[slug]}
                        style={{ fontSize: '0.7rem', color: '#2a7', background: '#e7f7ec', border: '1px solid #c2e7d0', borderRadius: 3, padding: '0.1rem 0.4rem' }}>
                        ⚙ auto
                      </span>
                    )}
                  </div>
                  <button onClick={() => removeFeat(slug)}
                    style={{ padding: '0.25rem 0.6rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, background: '#fff', color: 'crimson', fontSize: '0.8rem' }}>
                    Remove
                  </button>
                </div>
                {AUTOMATED_FEATS[slug] && (
                  <div style={{ fontSize: '0.78rem', color: '#2a7', marginBottom: '0.4rem' }}>{AUTOMATED_FEATS[slug]}</div>
                )}
                {slug === 'resilient' && (() => {
                  const grants = ((character.description ?? {}) as Record<string, any>).feat_grants as FeatGrants | undefined;
                  const current = grants?.resilient?.ability ?? '';
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                      <span>Ability:</span>
                      <select value={current} onChange={(e) => setResilientAbility(e.target.value as AbilityKey | '')}
                        style={{ padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4 }}>
                        <option value="">— pick —</option>
                        {ABILITY_ORDER.map((k) => (
                          <option key={k} value={k}>{ABILITY_NAMES[k]}</option>
                        ))}
                      </select>
                      {current && <span style={{ color: '#2a7', fontSize: '0.8rem' }}>+1 {current.toUpperCase()}, save proficiency</span>}
                    </div>
                  );
                })()}
                {feat && (
                  <div style={{ fontSize: '0.85rem', color: '#444', lineHeight: 1.5 }}>
                    {feat.prerequisite && <div style={{ fontStyle: 'italic', color: '#888', marginBottom: '0.4rem' }}>Prerequisite: {feat.prerequisite}</div>}
                    {feat.desc && <div style={{ marginBottom: feat.effects_desc?.length ? '0.5rem' : 0 }}><MD text={feat.desc} /></div>}
                    {feat.effects_desc && feat.effects_desc.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                        {feat.effects_desc.map((e, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <select value={picking} onChange={(e) => setPicking(e.target.value)}
          style={{ flex: 1, padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.9rem', background: '#fff' }}>
          <option value="">Pick a feat to add…</option>
          {allFeats
            .filter((f) => !selected.includes(f.slug))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((f) => {
              const prereq = parseAbilityPrereq(details[f.slug]?.prerequisite);
              const meets = !prereq || character.abilities[prereq.ability] >= prereq.minScore;
              const suffix = !meets && prereq
                ? ` — needs ${prereq.ability.toUpperCase()} ${prereq.minScore}`
                : '';
              return <option key={f.slug} value={f.slug}>{meets ? '' : '⚠ '}{f.name}{suffix}</option>;
            })}
        </select>
        <button onClick={addFeat} disabled={!picking}
          style={{ padding: '0.5rem 1rem', background: picking ? '#333' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: picking ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
          + Add
        </button>
      </div>
      {(() => {
        const prereq = picking ? parseAbilityPrereq(details[picking]?.prerequisite) : null;
        if (!prereq) return null;
        const meets = character.abilities[prereq.ability] >= prereq.minScore;
        if (meets) return null;
        return (
          <p style={{ marginTop: '0.5rem', color: '#a60', fontSize: '0.82rem' }}>
            Prereq: {prereq.ability.toUpperCase()} {prereq.minScore} (you have {character.abilities[prereq.ability]}). You can still add this feat — the wizard won't block you — but the character won't legally meet the prerequisite.
          </p>
        );
      })()}
    </div>
  );
}
