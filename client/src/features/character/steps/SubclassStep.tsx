import { useEffect, useState } from 'react';
import type { Character, LibraryItem } from '../types';
import { getLibraryItem, listSubclassesFor } from '../api';
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
  const [subclasses, setSubclasses] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<SubclassData | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!character.class_slug) {
      setSubclasses([]);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    listSubclassesFor(character.class_slug)
      .then(setSubclasses)
      .catch(() => setSubclasses([]))
      .finally(() => setLoadingList(false));
  }, [character.class_slug]);

  useEffect(() => {
    if (!character.subclass_slug) {
      setSelected(null);
      return;
    }
    setLoadingDetail(true);
    getLibraryItem<{ data: SubclassData }>('subclasses', character.subclass_slug)
      .then((r) => setSelected(r.data))
      .catch(() => setSelected(null))
      .finally(() => setLoadingDetail(false));
  }, [character.subclass_slug]);

  function selectSubclass(slug: string) {
    if (slug === character.subclass_slug) return;
    onChange({ subclass_slug: slug });
  }

  // Gate 1: no class chosen
  if (!character.class_slug) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Subclass</h2>
        <p style={{ color: '#888' }}>Pick a class first (step 2) to see subclass options.</p>
      </div>
    );
  }

  // Gate 2: not yet unlocked at this level
  if (!isSubclassUnlocked(character.class_slug, character.level)) {
    const unlock = unlockLevelFor(character.class_slug);
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Subclass</h2>
        <p style={{ color: '#888' }}>
          {capitalize(character.class_slug)}s choose a subclass at level {unlock}. You're currently
          level {character.level} — come back after leveling up.
        </p>
      </div>
    );
  }

  // Gate 3: unlocked, but library is empty for this class (admin hasn't added any yet)
  if (!loadingList && subclasses.length === 0) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Subclass</h2>
        <p style={{ color: '#888' }}>
          No subclasses are currently available for {capitalize(character.class_slug)}. The admin can
          add more from the content editor (coming in Phase 2).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Choose your subclass</h2>
      <p style={{ color: '#666' }}>
        Your specialization within the {capitalize(character.class_slug)} class. Grants additional features
        at higher levels.
      </p>

      {loadingList && <p>Loading subclasses…</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {subclasses.map((s) => {
          const isActive = character.subclass_slug === s.slug;
          return (
            <button
              key={s.id}
              onClick={() => selectSubclass(s.slug)}
              style={{
                padding: '1rem',
                borderRadius: 6,
                border: isActive ? '2px solid #333' : '1px solid #ddd',
                background: isActive ? '#fafafa' : '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: isActive ? 'bold' : 'normal',
              }}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      {loadingDetail && <p>Loading details…</p>}

      {selected && (
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: 6, border: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
          {selected.desc && (
            <details open style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Features</summary>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', fontSize: '0.9rem', maxHeight: 400, overflowY: 'auto' }}>
                {selected.desc}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
