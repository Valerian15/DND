import { useEffect, useState } from 'react';
import type { Character, LibraryItem } from '../types';
import { getLibraryItem, listLibrary } from '../api';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

interface RaceData {
  name: string;
  desc?: string;
  asi_desc?: string;
  asi?: any[];
  age?: string;
  alignment?: string;
  size?: string;
  size_raw?: string;
  speed?: any;
  speed_desc?: string;
  languages?: string;
  vision?: string;
  traits?: string;
  subraces?: any[];
}

export default function RaceStep({ character, onChange }: Props) {
  const [races, setRaces] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<RaceData | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    listLibrary('races')
      .then(setRaces)
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!character.race_slug) {
      setSelected(null);
      return;
    }
    setLoadingDetail(true);
    getLibraryItem<{ data: RaceData }>('races', character.race_slug)
      .then((r) => setSelected(r.data))
      .catch(() => setSelected(null))
      .finally(() => setLoadingDetail(false));
  }, [character.race_slug]);

  function selectRace(slug: string) {
    onChange({ race_slug: slug });
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
            <button
              key={race.id}
              onClick={() => selectRace(race.slug)}
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
              {race.name}
            </button>
          );
        })}
      </div>

      {loadingDetail && <p>Loading details…</p>}

      {selected && (
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: 6, border: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
          {selected.asi_desc && (
            <p><strong>Ability Score Increase:</strong> {selected.asi_desc}</p>
          )}
          {selected.size_raw && <p><strong>Size:</strong> {selected.size_raw}</p>}
          {selected.speed_desc && <p><strong>Speed:</strong> {selected.speed_desc}</p>}
          {selected.languages && <p><strong>Languages:</strong> {selected.languages}</p>}
          {selected.vision && <p><strong>Vision:</strong> {selected.vision}</p>}
          {selected.traits && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>Traits</summary>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', fontSize: '0.9rem' }}>{selected.traits}</div>
            </details>
          )}
          {selected.desc && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>Description</summary>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', fontSize: '0.9rem' }}>{selected.desc}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
