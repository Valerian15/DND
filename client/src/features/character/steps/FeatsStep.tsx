import { useEffect, useState } from 'react';
import { listLibrary, getLibraryItem } from '../api';
import type { Character, LibraryItem } from '../types';
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
};

export default function FeatsStep({ character, onChange }: Props) {
  const [allFeats, setAllFeats] = useState<LibraryItem[]>([]);
  const [details, setDetails] = useState<Record<string, FeatData>>({});
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState('');

  const selected = character.feats ?? [];

  useEffect(() => {
    listLibrary('feats')
      .then((items) => setAllFeats(items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const missing = selected.filter((s) => !details[s]);
    if (missing.length === 0) return;
    Promise.all(missing.map((slug) =>
      getLibraryItem<{ name: string; data: FeatData }>('feats', slug)
        .then((r) => ({ slug, data: { ...r.data, name: r.name } as FeatData }))
        .catch(() => null),
    )).then((results) => {
      setDetails((prev) => {
        const next = { ...prev };
        for (const r of results) if (r) next[r.slug] = r.data;
        return next;
      });
    });
  }, [selected, details]);

  function addFeat() {
    if (!picking || selected.includes(picking)) return;
    onChange({ feats: [...selected, picking] });
    setPicking('');
  }

  function removeFeat(slug: string) {
    onChange({ feats: selected.filter((s) => s !== slug) });
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
            .map((f) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
        </select>
        <button onClick={addFeat} disabled={!picking}
          style={{ padding: '0.5rem 1rem', background: picking ? '#333' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: picking ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
          + Add
        </button>
      </div>
    </div>
  );
}
