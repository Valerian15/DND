import { useEffect, useState } from 'react';
import type { Character, LibraryItem } from '../types';
import { getLibraryItem, listLibrary } from '../api';
import { defaultResourcesForClass } from '../classResources';

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
  archetypes?: any[];
}

export default function ClassStep({ character, onChange }: Props) {
  const [classes, setClasses] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<ClassData | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    listLibrary('classes')
      .then(setClasses)
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!character.class_slug) {
      setSelected(null);
      return;
    }
    setLoadingDetail(true);
    getLibraryItem<{ data: ClassData }>('classes', character.class_slug)
      .then((r) => setSelected(r.data))
      .catch(() => setSelected(null))
      .finally(() => setLoadingDetail(false));
  }, [character.class_slug]);

  function selectClass(slug: string) {
    if (slug === character.class_slug) return;
    // Clear subclass + skill proficiencies when class changes (different class = different options)
    // Also clear class-starter items since they'll no longer match
    const inventory = ((character.inventory ?? []) as any[]).filter(
      (i) => i?.source !== 'class-starter',
    );
    onChange({
      class_slug: slug,
      subclass_slug: null,
      skills: {},
      inventory,
      resources: defaultResourcesForClass(slug, character.level),
    });
  }

  if (loadingList) return <p>Loading classes…</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Choose your class</h2>
      <p style={{ color: '#666' }}>Your character's profession and source of power. Determines hit points, proficiencies, and class features.</p>
      <p style={{ color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }}>
        Note: changing class resets your skill proficiencies and class starter kit.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {classes.map((c) => {
          const isActive = character.class_slug === c.slug;
          return (
            <button
              key={c.id}
              onClick={() => selectClass(c.slug)}
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
              {c.name}
            </button>
          );
        })}
      </div>

      {loadingDetail && <p>Loading details…</p>}

      {selected && (
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: 6, border: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
          {selected.hit_dice && <p><strong>Hit die:</strong> {selected.hit_dice}</p>}
          {selected.prof_saving_throws && (
            <p><strong>Saving throw proficiencies:</strong> {selected.prof_saving_throws}</p>
          )}
          {selected.prof_armor && <p><strong>Armor:</strong> {selected.prof_armor}</p>}
          {selected.prof_weapons && <p><strong>Weapons:</strong> {selected.prof_weapons}</p>}
          {selected.prof_skills && (
            <p><strong>Skill choices:</strong> {selected.prof_skills}</p>
          )}
          {selected.spellcasting_ability && (
            <p><strong>Spellcasting ability:</strong> {selected.spellcasting_ability}</p>
          )}
          {selected.desc && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>Full description</summary>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', fontSize: '0.9rem', maxHeight: '300px', overflowY: 'auto' }}>
                {selected.desc}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
