import { useEffect, useMemo, useState } from 'react';
import type { Character } from '../types';
import { getLibraryItem, listLibrary } from '../api';
import { getCasterConfig, maxSpellLevelFor, preparedCount } from '../casters';
import { abilityModifier } from '../pointBuy';
import { MD } from '../../library/Statblock';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

interface SpellFull {
  slug: string;
  name: string;
  level: number;
  school?: string;
  casting_time?: string;
  range?: string;
  duration?: string;
  components?: string;
  material?: string;
  concentration?: string;
  ritual?: string;
  desc?: string;
  higher_level?: string;
  dnd_class?: string;
  spell_lists?: string[];
}

interface SpellListItem {
  slug: string;
  name: string;
}

function spellMatchesClass(spell: SpellFull, classSlug: string): boolean {
  const slug = classSlug.toLowerCase();
  if (Array.isArray(spell.spell_lists) && spell.spell_lists.map((s) => String(s).toLowerCase()).includes(slug)) {
    return true;
  }
  if (typeof spell.dnd_class === 'string') {
    return spell.dnd_class.toLowerCase().split(/[,;]/).map((s) => s.trim()).includes(slug);
  }
  return false;
}

function normalizeLevel(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export default function SpellsStep({ character, onChange }: Props) {
  const [allSpells, setAllSpells] = useState<SpellListItem[]>([]);
  const [spellDetails, setSpellDetails] = useState<Record<string, SpellFull>>({});
  const [selectedDetail, setSelectedDetail] = useState<SpellFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');

  const config = getCasterConfig(character.class_slug);

  useEffect(() => {
    listLibrary('spells')
      .then((items) => {
        setAllSpells(items.map((i) => ({ slug: i.slug, name: i.name })));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!config || allSpells.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = allSpells.filter((s) => !spellDetails[s.slug]);
      const chunkSize = 25;
      for (let i = 0; i < missing.length; i += chunkSize) {
        if (cancelled) return;
        const chunk = missing.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((s) =>
            getLibraryItem<{ slug: string; name: string; data: any; level?: number }>('spells', s.slug)
              .then((r) => ({
                slug: r.slug ?? s.slug,
                name: r.name ?? s.name,
                row: r,
              }))
              .catch(() => null),
          ),
        );
        if (cancelled) return;
        setSpellDetails((prev) => {
          const next = { ...prev };
          for (const r of results) {
            if (!r) continue;
            const data = (r.row?.data ?? {}) as Record<string, unknown>;
            const level = normalizeLevel(
              (data as any).level_int ?? (data as any).level ?? r.row?.level,
            );
            next[r.slug] = {
              ...(data as object),
              slug: r.slug,
              name: r.name,
              level,
            } as SpellFull;
          }
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allSpells, config]);

  const classSpells = useMemo(() => {
    if (!config) return [];
    return Object.values(spellDetails).filter((s) => spellMatchesClass(s, config.classSlug));
  }, [spellDetails, config]);

  const abilityMod = config ? abilityModifier(character.abilities[config.ability]) : 0;
  const maxLevel = config ? maxSpellLevelFor(config, character.level) : 0;

  const cantripsAllowed = config?.cantripsKnownByLevel[character.level - 1] ?? null;
  const spellsKnownAllowed =
    config?.model === 'known'
      ? config.spellsKnownByLevel?.[character.level - 1] ?? null
      : null;
  const spellsPreparedAllowed =
    config && config.model !== 'known' ? preparedCount(config, character.level, abilityMod) : null;

  const knownSet = new Set<string>(((character.spells_known ?? []) as string[]));
  const preparedSet = new Set<string>(((character.spells_prepared ?? []) as string[]));

  const cantripsSelected = [...knownSet].filter((slug) => spellDetails[slug]?.level === 0);
  const leveledSelected = [...knownSet].filter((slug) => (spellDetails[slug]?.level ?? 0) >= 1);

  function toggleKnown(slug: string) {
    const spell = spellDetails[slug];
    if (!spell) return;
    const isCantrip = spell.level === 0;

    const nextKnown = new Set(knownSet);
    const nextPrepared = new Set(preparedSet);

    if (nextKnown.has(slug)) {
      nextKnown.delete(slug);
      nextPrepared.delete(slug);
    } else {
      if (isCantrip) {
        if (cantripsAllowed !== null && cantripsSelected.length >= cantripsAllowed) return;
      } else {
        if (spell.level > maxLevel) return;
        if (spellsKnownAllowed !== null && leveledSelected.length >= spellsKnownAllowed) return;
      }
      nextKnown.add(slug);
      if (config?.model === 'known' && !isCantrip) {
        nextPrepared.add(slug);
      }
    }

    onChange({
      spells_known: [...nextKnown],
      spells_prepared: [...nextPrepared],
    });
  }

  function togglePrepared(slug: string) {
    if (!knownSet.has(slug)) return;
    const spell = spellDetails[slug];
    if (!spell || spell.level === 0) return;
    const nextPrepared = new Set(preparedSet);
    if (nextPrepared.has(slug)) {
      nextPrepared.delete(slug);
    } else {
      if (spellsPreparedAllowed !== null && nextPrepared.size >= spellsPreparedAllowed) return;
      nextPrepared.add(slug);
    }
    onChange({ spells_prepared: [...nextPrepared] });
  }

  if (!character.class_slug) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Spells</h2>
        <p style={{ color: '#888' }}>Pick a class first (step 2) to see spells.</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Spells</h2>
        <p style={{ color: '#888' }}>
          {capitalize(character.class_slug)} does not cast spells. Skip this step.
        </p>
      </div>
    );
  }

  if (config.firstSpellLevel && character.level < config.firstSpellLevel) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Spells</h2>
        <p style={{ color: '#888' }}>
          {capitalize(character.class_slug)}s gain spellcasting at level {config.firstSpellLevel}. Nothing to pick yet.
        </p>
      </div>
    );
  }

  if (loading || classSpells.length === 0) {
    return <p>Loading spells…</p>;
  }

  const search_lc = search.trim().toLowerCase();
  const visible = classSpells
    .filter((s) => (filterLevel === 'all' ? true : s.level === filterLevel))
    .filter((s) => (search_lc ? (s.name ?? '').toLowerCase().includes(search_lc) : true))
    .filter((s) => s.level <= maxLevel)
    .sort((a, b) => {
      const la = a.level ?? 0;
      const lb = b.level ?? 0;
      if (la !== lb) return la - lb;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Spells</h2>
      <p style={{ color: '#666' }}>
        {capitalize(character.class_slug)} ({config.model === 'spellbook' ? 'spellbook' : config.model}). Spellcasting
        ability: {config.ability.toUpperCase()}. Max spell level: {maxLevel}.
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <StatPill label="Cantrips" current={cantripsSelected.length} max={cantripsAllowed} />
        {config.model === 'known' ? (
          <StatPill label="Spells known" current={leveledSelected.length} max={spellsKnownAllowed} />
        ) : (
          <>
            <StatPill label={config.model === 'spellbook' ? 'Spells in book' : 'Spells known'} current={leveledSelected.length} max={null} hint="no hard limit" />
            <StatPill label="Spells prepared" current={preparedSet.size} max={spellsPreparedAllowed} />
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search spell…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4, minWidth: 180 }}
        />
        <select
          value={filterLevel === 'all' ? 'all' : String(filterLevel)}
          onChange={(e) => setFilterLevel(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }}
        >
          <option value="all">All levels</option>
          <option value="0">Cantrips</option>
          {Array.from({ length: maxLevel }, (_, i) => i + 1).map((lvl) => (
            <option key={lvl} value={String(lvl)}>
              Level {lvl}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedDetail ? '1fr 1fr' : '1fr', gap: '1rem' }}>
        <div style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6 }}>
          {visible.map((spell) => {
            const isKnown = knownSet.has(spell.slug);
            const isPrepared = preparedSet.has(spell.slug);
            return (
              <div
                key={spell.slug}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  borderBottom: '1px solid #eee',
                  background: isKnown ? '#fafafa' : '#fff',
                }}
              >
                <button
                  onClick={() => setSelectedDetail(spell)}
                  style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', flex: 1, padding: 0 }}
                >
                  <strong>{spell.name ?? spell.slug}</strong>
                  <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: '0.5rem' }}>
                    {spell.level === 0 ? 'Cantrip' : `L${spell.level}`}
                    {spell.school && ` · ${spell.school}`}
                  </span>
                </button>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => toggleKnown(spell.slug)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                      borderRadius: 3,
                      border: isKnown ? '1px solid #2a7' : '1px solid #ccc',
                      background: isKnown ? '#e0f5e0' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {isKnown ? '✓ Known' : 'Add'}
                  </button>
                  {config.model !== 'known' && isKnown && spell.level > 0 && (
                    <button
                      onClick={() => togglePrepared(spell.slug)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.8rem',
                        borderRadius: 3,
                        border: isPrepared ? '1px solid #27a' : '1px solid #ccc',
                        background: isPrepared ? '#e0eaf5' : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      {isPrepared ? '✓ Prepared' : 'Prep'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: '1rem', color: '#888' }}>No spells match the filter.</div>
          )}
        </div>

        {selectedDetail && (
          <div style={{ padding: '1rem', border: '1px solid #eee', borderRadius: 6, background: '#fafafa', maxHeight: 480, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>{selectedDetail.name ?? selectedDetail.slug}</h3>
              <button onClick={() => setSelectedDetail(null)} style={{ cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {selectedDetail.level === 0 ? `${selectedDetail.school ?? ''} cantrip` : `Level ${selectedDetail.level} ${selectedDetail.school ?? ''}`}
            </p>
            {selectedDetail.casting_time && <p><strong>Casting time:</strong> {selectedDetail.casting_time}</p>}
            {selectedDetail.range && <p><strong>Range:</strong> {selectedDetail.range}</p>}
            {selectedDetail.components && <p><strong>Components:</strong> {selectedDetail.components}</p>}
            {selectedDetail.material && <p style={{ fontSize: '0.9rem', color: '#666' }}>Material: {selectedDetail.material}</p>}
            {selectedDetail.duration && <p><strong>Duration:</strong> {selectedDetail.duration}</p>}
            {selectedDetail.desc && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}><MD text={selectedDetail.desc} /></div>
            )}
            {selectedDetail.higher_level && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                <strong>At higher levels:</strong> <MD text={selectedDetail.higher_level} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, current, max, hint }: { label: string; current: number; max: number | null; hint?: string }) {
  const hit = max !== null && current >= max;
  return (
    <div style={{
      padding: '0.4rem 0.7rem',
      borderRadius: 20,
      background: hit ? '#efe' : '#f0f0f0',
      fontSize: '0.85rem',
    }}>
      <strong>{label}:</strong> {current}{max !== null ? ` / ${max}` : ''} {hint && <span style={{ color: '#888' }}>({hint})</span>}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
