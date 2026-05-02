import { useEffect, useState } from 'react';
import type { Character, ClassEntry, LibraryItem } from '../types';
import { getLibraryItem, listSubclassesFor } from '../api';
import { MD } from '../../library/Statblock';
import { isSubclassUnlocked, unlockLevelFor } from '../subclassUnlock';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

interface SubclassData {
  name: string;
  desc?: string;
}

export default function SubclassStep({ character, onChange }: Props) {
  // Use classes[] as source of truth; fall back to legacy single-class fields.
  const classes: ClassEntry[] = character.classes && character.classes.length > 0
    ? character.classes
    : (character.class_slug
      ? [{ slug: character.class_slug, subclass_slug: character.subclass_slug, level: character.level || 1, hit_dice_used: 0 }]
      : []);

  if (classes.length === 0) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Subclass</h2>
        <p style={{ color: '#888' }}>Pick a class first (step 2) to see subclass options.</p>
      </div>
    );
  }

  function setClassSubclass(classSlug: string, subclassSlug: string | null) {
    const next = classes.map((c) => c.slug === classSlug ? { ...c, subclass_slug: subclassSlug } : c);
    onChange({ classes: next });
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Subclass{classes.length > 1 ? 'es' : ''}</h2>
      <p style={{ color: '#666' }}>
        Each class chooses its own subclass at a specific level. {classes.length > 1 ? 'You have multiple classes — pick one for each.' : ''}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {classes.map((entry) => (
          <SubclassPickerForClass
            key={entry.slug}
            entry={entry}
            onSelect={(slug) => setClassSubclass(entry.slug, slug)}
          />
        ))}
      </div>
    </div>
  );
}

function SubclassPickerForClass({ entry, onSelect }: { entry: ClassEntry; onSelect: (slug: string | null) => void }) {
  const [subclasses, setSubclasses] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<SubclassData | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    setLoadingList(true);
    listSubclassesFor(entry.slug)
      .then(setSubclasses)
      .catch(() => setSubclasses([]))
      .finally(() => setLoadingList(false));
  }, [entry.slug]);

  useEffect(() => {
    if (!entry.subclass_slug) {
      setSelected(null);
      return;
    }
    getLibraryItem<{ data: SubclassData }>('subclasses', entry.subclass_slug)
      .then((r) => setSelected(r.data))
      .catch(() => setSelected(null));
  }, [entry.subclass_slug]);

  const unlocked = isSubclassUnlocked(entry.slug, entry.level);
  const unlockLvl = unlockLevelFor(entry.slug);

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <strong style={{ fontSize: '1rem' }}>{capitalize(entry.slug)}</strong>
        <span style={{ fontSize: '0.78rem', color: '#888' }}>L{entry.level}</span>
      </div>

      {!unlocked ? (
        <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>
          {capitalize(entry.slug)}s choose a subclass at level {unlockLvl}. Currently L{entry.level} — come back after leveling up.
        </p>
      ) : loadingList ? (
        <p>Loading subclasses…</p>
      ) : subclasses.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>No subclasses available for {capitalize(entry.slug)} yet.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: selected ? '1rem' : 0 }}>
            {subclasses.map((s) => {
              const isActive = entry.subclass_slug === s.slug;
              return (
                <button key={s.id} onClick={() => onSelect(isActive ? null : s.slug)}
                  style={{
                    padding: '0.6rem 0.75rem', borderRadius: 5,
                    border: isActive ? '2px solid #333' : '1px solid #ddd',
                    background: isActive ? '#fafafa' : '#fff', cursor: 'pointer',
                    textAlign: 'left', fontWeight: isActive ? 'bold' : 'normal', fontSize: '0.85rem',
                  }}>
                  {s.name}
                </button>
              );
            })}
          </div>
          {selected && entry.subclass_slug && (
            <div style={{ background: '#f9f9f9', padding: '0.75rem', borderRadius: 5, border: '1px solid #eee' }}>
              <strong style={{ fontSize: '0.9rem' }}>{selected.name}</strong>
              {selected.desc && (
                <details style={{ marginTop: '0.4rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#666' }}>Features</summary>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', maxHeight: 300, overflowY: 'auto' }}>
                    <MD text={selected.desc} />
                  </div>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
