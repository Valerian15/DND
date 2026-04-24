import { useEffect, useState } from 'react';
import type { Character, LibraryItem } from '../types';
import { getLibraryItem, listLibrary } from '../api';
import { parseBackgroundSkillProficiencies } from '../rules';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

interface BackgroundData {
  name: string;
  desc?: string;
  skill_proficiencies?: string;
  tool_proficiencies?: string;
  languages?: string;
  equipment?: string;
  feature?: string;
  feature_desc?: string;
  suggested_characteristics?: string;
}

export default function BackgroundStep({ character, onChange }: Props) {
  const [backgrounds, setBackgrounds] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<BackgroundData | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    listLibrary('backgrounds').then(setBackgrounds).finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!character.background_slug) { setSelected(null); return; }
    setLoadingDetail(true);
    getLibraryItem<{ data: BackgroundData }>('backgrounds', character.background_slug)
      .then((r) => setSelected(r.data))
      .catch(() => setSelected(null))
      .finally(() => setLoadingDetail(false));
  }, [character.background_slug]);

  async function selectBackground(slug: string) {
    if (slug === character.background_slug) return;
    // Pull the new background's skill list and merge it in.
    let bgSkills: string[] = [];
    try {
      const r = await getLibraryItem<{ data: BackgroundData }>('backgrounds', slug);
      bgSkills = parseBackgroundSkillProficiencies(r.data?.skill_proficiencies);
    } catch {}

    // Keep any existing skill that is NOT flagged as background-granted
    // (those are class picks). Then add the new background skills.
    const existing = character.skills as Record<string, { proficient?: boolean; source?: string }>;
    const nextSkills: Record<string, { proficient: boolean; source?: string }> = {};
    for (const [key, val] of Object.entries(existing)) {
      if (!val?.proficient) continue;
      if (val.source === 'background') continue; // drop old background skills
      nextSkills[key] = { proficient: true, ...(val.source ? { source: val.source } : {}) };
    }
    for (const key of bgSkills) {
      nextSkills[key] = { proficient: true, source: 'background' };
    }

    onChange({ background_slug: slug, skills: nextSkills });
  }

  if (loadingList) return <p>Loading backgrounds…</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Choose your background</h2>
      <p style={{ color: '#666' }}>Your life before adventuring. Grants skills, tools, languages, and starting equipment.</p>
      <p style={{ color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }}>
        Background skills are merged into your skill list automatically.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {backgrounds.map((b) => {
          const isActive = character.background_slug === b.slug;
          return (
            <button
              key={b.id}
              onClick={() => selectBackground(b.slug)}
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
              {b.name}
            </button>
          );
        })}
      </div>

      {loadingDetail && <p>Loading details…</p>}

      {selected && (
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: 6, border: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
          {selected.skill_proficiencies && <p><strong>Skill proficiencies:</strong> {selected.skill_proficiencies}</p>}
          {selected.tool_proficiencies && <p><strong>Tool proficiencies:</strong> {selected.tool_proficiencies}</p>}
          {selected.languages && <p><strong>Languages:</strong> {selected.languages}</p>}
          {selected.equipment && <p><strong>Equipment:</strong> {selected.equipment}</p>}
          {selected.feature && <p><strong>Feature — {selected.feature}:</strong> {selected.feature_desc}</p>}
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
