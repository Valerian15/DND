import { useEffect, useState } from 'react';
import type { Abilities, Character, ClassEntry, LibraryItem } from '../types';
import { getLibraryItem, listLibrary } from '../api';
import { defaultResourcesForClass } from '../classResources';
import { MD } from '../../library/Statblock';
import { featuresThroughLevel } from '../classFeatures';
import { CLASS_SAVE_PROFICIENCIES, hitDieFor, meetsMulticlassPrereqs, missingMulticlassPrereqs, MULTICLASS_PREREQS } from '../rules';
import type { AbilityKey } from '../types';
import LevelUpDialog from '../LevelUpDialog';

function savesForClass(slug: string): Record<string, { proficient: boolean; sources: string[] }> {
  const profs = CLASS_SAVE_PROFICIENCIES[slug] ?? [];
  const out: Record<string, { proficient: boolean; sources: string[] }> = {};
  for (const k of profs) out[k as AbilityKey] = { proficient: true, sources: ['class'] };
  return out;
}

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

interface ClassData {
  name: string;
  desc?: string;
  hit_dice?: string;
  hp_at_1st_level?: string;
  hp_at_higher_levels?: string;
  prof_armor?: string;
  prof_weapons?: string;
  prof_tools?: string;
  prof_saving_throws?: string;
  prof_skills?: string;
  equipment?: string;
  spellcasting_ability?: string;
  archetypes?: unknown[];
}

function describePrereq(slug: string): string {
  const req = MULTICLASS_PREREQS[slug];
  if (!req) return 'no prereq';
  const parts: string[] = [];
  if (req.all) parts.push(req.all.map((k) => `${k.toUpperCase()} 13`).join(' AND '));
  if (req.oneOf) parts.push(req.oneOf.map((k) => `${k.toUpperCase()} 13`).join(' OR '));
  return parts.join(' · ');
}

export default function ClassStep({ character, onChange }: Props) {
  const [allClasses, setAllClasses] = useState<LibraryItem[]>([]);
  const [classDataByslug, setClassDataBySlug] = useState<Record<string, ClassData>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [levelUpClass, setLevelUpClass] = useState<string | null>(null);

  // Use classes[] as source of truth. If empty (legacy / fresh), derive a one-entry array
  // from the legacy field so the rest of the UI uniformly works on classes[].
  const classes: ClassEntry[] = character.classes && character.classes.length > 0
    ? character.classes
    : (character.class_slug
      ? [{ slug: character.class_slug, subclass_slug: character.subclass_slug, level: character.level || 1, hit_dice_used: 0 }]
      : []);

  useEffect(() => {
    listLibrary('classes')
      .then(setAllClasses)
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    const slugs = classes.map((c) => c.slug);
    const missing = slugs.filter((s) => !classDataByslug[s]);
    if (missing.length === 0) return;
    Promise.all(missing.map((slug) =>
      getLibraryItem<{ data: ClassData; name: string }>('classes', slug)
        .then((r) => ({ slug, data: { ...r.data, name: r.name } as ClassData }))
        .catch(() => null),
    )).then((results) => {
      setClassDataBySlug((prev) => {
        const next = { ...prev };
        for (const r of results) if (r) next[r.slug] = r.data;
        return next;
      });
    });
  }, [classes, classDataByslug]);

  function setClassesAndSync(next: ClassEntry[]) {
    onChange({ classes: next });
  }

  function pickFirstClass(slug: string) {
    // Fresh character — set classes[0] and sync legacy fields
    const startingLevel = character.level || 1;
    const inventory = ((character.inventory ?? []) as Array<{ source?: string }>).filter(
      (i) => i?.source !== 'class-starter',
    );
    onChange({
      class_slug: slug,
      subclass_slug: null,
      classes: [{ slug, subclass_slug: null, level: startingLevel, hit_dice_used: 0 }],
      skills: {},
      saves: savesForClass(slug),
      inventory,
      resources: defaultResourcesForClass(slug, startingLevel),
    });
  }

  function replaceFirstClass(slug: string) {
    if (slug === classes[0]?.slug) return;
    if (!confirm(`Switch your starting class to ${slug}? This clears your subclass, skills, saves, and starter kit.`)) return;
    const inventory = ((character.inventory ?? []) as Array<{ source?: string }>).filter(
      (i) => i?.source !== 'class-starter',
    );
    const startingLevel = classes[0]?.level || 1;
    const next: ClassEntry[] = [{ slug, subclass_slug: null, level: startingLevel, hit_dice_used: 0 }, ...classes.slice(1)];
    onChange({
      classes: next,
      class_slug: slug,
      subclass_slug: null,
      skills: {},
      saves: savesForClass(slug),
      inventory,
      resources: defaultResourcesForClass(slug, startingLevel),
    });
  }

  function addClass(slug: string) {
    if (classes.some((c) => c.slug === slug)) return;
    const next: ClassEntry[] = [...classes, { slug, subclass_slug: null, level: 1, hit_dice_used: 0 }];
    setClassesAndSync(next);
  }

  function removeClass(slug: string) {
    if (classes.length <= 1) return;
    if (!confirm(`Remove all ${slug} levels from this character?`)) return;
    setClassesAndSync(classes.filter((c) => c.slug !== slug));
  }

  function adjustClassLevel(slug: string, delta: number) {
    if (delta > 0) {
      // Level-up goes through the LevelUpDialog so the player gets ASI prompts at L4/8/12/16/19
      // (plus fighter L6/14, rogue L10), HP preview, and new-features summary. The dialog
      // handles one level at a time; clicking + repeatedly walks through each level's prompt.
      setLevelUpClass(slug);
      return;
    }
    const next = classes
      .map((c) => c.slug === slug ? { ...c, level: Math.max(1, c.level + delta) } : c);
    setClassesAndSync(next);
  }

  async function handleLevelUpConfirm(updatedClasses: ClassEntry[], abilities: Abilities, newLevel: number, newHpMax: number, newHpCurrent: number) {
    onChange({
      classes: updatedClasses,
      abilities,
      level: newLevel,
      hp_max: newHpMax,
      hp_current: newHpCurrent,
    });
    setLevelUpClass(null);
  }

  if (loadingList) return <p>Loading classes…</p>;

  // ── Fresh character: pick your first class ──
  if (classes.length === 0) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Choose your class</h2>
        <p style={{ color: '#666' }}>Your character's profession and source of power. Determines hit points, proficiencies, and class features.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {allClasses.map((c) => (
            <button key={c.id} onClick={() => pickFirstClass(c.slug)}
              style={{ padding: '1rem', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Existing character: show classes + add/remove/level controls ──
  const totalLevel = classes.reduce((sum, c) => sum + c.level, 0);
  const isMulticlass = classes.length > 1;
  const availableForMulticlass = allClasses.filter((c) =>
    !classes.some((cc) => cc.slug === c.slug),
  );

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Class{isMulticlass ? 'es' : ''} <span style={{ fontSize: '0.85rem', color: '#888', fontWeight: 400 }}>(total level {totalLevel})</span></h2>
      <p style={{ color: '#666' }}>Multiclass by adding another class — must meet the ability score prereq for any new class.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
        {classes.map((entry, idx) => {
          const data = classDataByslug[entry.slug];
          const isPrimary = idx === 0;
          return (
            <div key={entry.slug} style={{ background: '#fff', border: `1px solid ${isPrimary ? '#446' : '#ddd'}`, borderRadius: 6, padding: '0.75rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: data ? '0.5rem' : 0 }}>
                <strong style={{ flex: 1, fontSize: '1rem' }}>
                  {data?.name ?? entry.slug}
                  {isPrimary && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#446', background: '#eef', padding: '0.1rem 0.4rem', borderRadius: 3 }}>STARTING CLASS</span>}
                </strong>
                <button onClick={() => adjustClassLevel(entry.slug, -1)} disabled={entry.level <= 1}
                  style={{ width: 26, height: 26, padding: 0, fontSize: '0.9rem', cursor: entry.level <= 1 ? 'not-allowed' : 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff' }}>−</button>
                <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>L{entry.level}</span>
                <button onClick={() => adjustClassLevel(entry.slug, 1)} disabled={totalLevel >= 20}
                  style={{ width: 26, height: 26, padding: 0, fontSize: '0.9rem', cursor: totalLevel >= 20 ? 'not-allowed' : 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff' }}>+</button>
                {!isPrimary && (
                  <button onClick={() => removeClass(entry.slug)} title="Remove this class"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, background: '#fff', color: 'crimson' }}>Remove</button>
                )}
              </div>
              {data && (
                <div style={{ fontSize: '0.78rem', color: '#666', display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                  {data.hit_dice && <span><strong>HD:</strong> {data.hit_dice}</span>}
                  {data.prof_saving_throws && isPrimary && <span><strong>Saves:</strong> {data.prof_saving_throws}</span>}
                  {data.spellcasting_ability && <span><strong>Casting:</strong> {data.spellcasting_ability}</span>}
                </div>
              )}
              {(() => {
                const feats = featuresThroughLevel(entry.slug, entry.level);
                if (feats.length === 0) return null;
                return (
                  <details style={{ marginTop: '0.4rem' }}>
                    <summary style={{ fontSize: '0.78rem', cursor: 'pointer', color: '#27a' }}>Features through L{entry.level} ({feats.length})</summary>
                    <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
                      {feats.map((f, i) => (
                        <li key={i} style={{ marginBottom: '0.2rem' }}>
                          <strong>L{f.level} {f.name}</strong> — <span style={{ color: '#555' }}>{f.desc}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })()}
              {data?.desc && (
                <details style={{ marginTop: '0.4rem' }}>
                  <summary style={{ fontSize: '0.78rem', cursor: 'pointer', color: '#888' }}>Full class description</summary>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', maxHeight: 320, overflowY: 'auto', paddingRight: '0.4rem' }}>
                    <MD text={data.desc} />
                  </div>
                </details>
              )}
              {isPrimary && (
                <details style={{ marginTop: '0.4rem' }}>
                  <summary style={{ fontSize: '0.78rem', cursor: 'pointer', color: '#888' }}>Switch starting class…</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.3rem', marginTop: '0.4rem' }}>
                    {allClasses.filter((c) => c.slug !== entry.slug).map((c) => (
                      <button key={c.id} onClick={() => replaceFirstClass(c.slug)}
                        style={{ padding: '0.35rem', fontSize: '0.78rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: '#fafafa' }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {/* Add another class — show only if there's room and another class to add */}
      {availableForMulticlass.length > 0 && totalLevel < 20 && (
        <div style={{ background: '#fafafa', border: '1px dashed #ccc', borderRadius: 6, padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.6rem' }}>Multiclass into…</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.4rem' }}>
            {availableForMulticlass.map((c) => {
              const meets = meetsMulticlassPrereqs(c.slug, character.abilities);
              const missing = missingMulticlassPrereqs(c.slug, character.abilities);
              return (
                <button key={c.id} onClick={() => meets && addClass(c.slug)} disabled={!meets}
                  title={meets ? `Add a level of ${c.name}` : `Prereq: ${describePrereq(c.slug)} (you need ${missing.map((k) => k.toUpperCase()).join(' / ')})`}
                  style={{
                    padding: '0.5rem',
                    borderRadius: 5,
                    border: `1px solid ${meets ? '#bbb' : '#e6cccc'}`,
                    background: meets ? '#fff' : '#f8f0f0',
                    color: meets ? '#333' : '#a66',
                    cursor: meets ? 'pointer' : 'not-allowed',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                  }}>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: '0.68rem', color: meets ? '#888' : '#a66', marginTop: 2 }}>
                    {describePrereq(c.slug)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {levelUpClass && (
        <LevelUpDialog
          character={character}
          hitDieSize={hitDieFor(levelUpClass)}
          initialTargetClass={levelUpClass}
          onConfirm={handleLevelUpConfirm}
          onCancel={() => setLevelUpClass(null)}
        />
      )}
    </div>
  );
}
