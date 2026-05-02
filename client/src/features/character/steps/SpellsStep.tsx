import { useEffect, useMemo, useState } from 'react';
import type { Character, ClassEntry } from '../types';
import { getLibraryItem, listLibrary } from '../api';
import { getCasterConfigForEntry, maxSpellLevelFor, preparedCount, type CasterConfig } from '../casters';
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

function effectiveClasses(character: Character): ClassEntry[] {
  if (character.classes && character.classes.length > 0) return character.classes;
  if (character.class_slug) {
    return [{ slug: character.class_slug, subclass_slug: character.subclass_slug, level: character.level || 1, hit_dice_used: 0 }];
  }
  return [];
}

export default function SpellsStep({ character, onChange }: Props) {
  const [allSpells, setAllSpells] = useState<SpellListItem[]>([]);
  const [spellDetails, setSpellDetails] = useState<Record<string, SpellFull>>({});
  const [loading, setLoading] = useState(true);

  const classes = effectiveClasses(character);
  const casterEntries = useMemo(
    () => classes
      .map((entry) => ({ entry, config: getCasterConfigForEntry(entry) }))
      .filter((e): e is { entry: ClassEntry; config: CasterConfig } => !!e.config),
    [classes],
  );

  useEffect(() => {
    listLibrary('spells')
      .then((items) => setAllSpells(items.map((i) => ({ slug: i.slug, name: i.name }))))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (casterEntries.length === 0 || allSpells.length === 0) return;
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
              .then((r) => ({ slug: r.slug ?? s.slug, name: r.name ?? s.name, row: r }))
              .catch(() => null),
          ),
        );
        if (cancelled) return;
        setSpellDetails((prev) => {
          const next = { ...prev };
          for (const r of results) {
            if (!r) continue;
            const data = (r.row?.data ?? {}) as Record<string, unknown>;
            const level = normalizeLevel((data as any).level_int ?? (data as any).level ?? r.row?.level);
            next[r.slug] = { ...(data as object), slug: r.slug, name: r.name, level } as SpellFull;
          }
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [allSpells, casterEntries.length]);

  if (classes.length === 0) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Spells</h2>
        <p style={{ color: '#888' }}>Pick a class first (step 2) to see spells.</p>
      </div>
    );
  }

  if (casterEntries.length === 0) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Spells</h2>
        <p style={{ color: '#888' }}>None of your classes cast spells. Skip this step.</p>
      </div>
    );
  }

  if (loading) return <p>Loading spells…</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Spells</h2>
      <p style={{ color: '#666' }}>
        {casterEntries.length === 1
          ? 'Pick the spells your character knows or has prepared.'
          : 'Each casting class gets its own picker. Spell slots are shared (multiclass slot table).'}
      </p>

      {casterEntries.map(({ entry, config }) => (
        <ClassSpellSection
          key={entry.slug + (entry.subclass_slug ?? '')}
          character={character}
          entry={entry}
          config={config}
          spellDetails={spellDetails}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function ClassSpellSection({
  character,
  entry,
  config,
  spellDetails,
  onChange,
}: {
  character: Character;
  entry: ClassEntry;
  config: CasterConfig;
  spellDetails: Record<string, SpellFull>;
  onChange: (patch: Partial<Character>) => void;
}) {
  const [filterLevel, setFilterLevel] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<SpellFull | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const classLevel = entry.level;
  const listClass = config.spellListClass ?? config.classSlug;
  const label = config.label ?? capitalize(entry.slug);

  const classSpells = useMemo(
    () => Object.values(spellDetails).filter((s) => spellMatchesClass(s, listClass)),
    [spellDetails, listClass],
  );

  const abilityMod = abilityModifier(character.abilities[config.ability]);
  const maxLevel = maxSpellLevelFor(config, classLevel);

  const cantripsAllowed = config.cantripsKnownByLevel[classLevel - 1] ?? null;
  const spellsKnownAllowed = config.model === 'known'
    ? config.spellsKnownByLevel?.[classLevel - 1] ?? null
    : null;
  const spellsPreparedAllowed = config.model !== 'known'
    ? preparedCount(config, classLevel, abilityMod)
    : null;

  const knownSet = new Set<string>(((character.spells_known ?? []) as string[]));
  const preparedSet = new Set<string>(((character.spells_prepared ?? []) as string[]));

  // Per-class counts use only spells from THIS class's list.
  const classSpellSlugs = useMemo(() => new Set(classSpells.map((s) => s.slug)), [classSpells]);
  const cantripsForClass = [...knownSet].filter((slug) => classSpellSlugs.has(slug) && spellDetails[slug]?.level === 0);
  const leveledForClass = [...knownSet].filter((slug) => classSpellSlugs.has(slug) && (spellDetails[slug]?.level ?? 0) >= 1);
  const preparedForClass = [...preparedSet].filter((slug) => classSpellSlugs.has(slug));

  if (config.firstSpellLevel && classLevel < config.firstSpellLevel) {
    return (
      <section style={sectionStyle}>
        <SectionHeader label={label} classLevel={classLevel} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <p style={{ color: '#888', margin: '0.5rem 0 0' }}>
          {label} gains spellcasting at class level {config.firstSpellLevel}. Currently L{classLevel} — nothing to pick yet.
        </p>
      </section>
    );
  }

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
        if (cantripsAllowed !== null && cantripsForClass.length >= cantripsAllowed) return;
      } else {
        if (spell.level > maxLevel) return;
        if (spellsKnownAllowed !== null && leveledForClass.length >= spellsKnownAllowed) return;
      }
      nextKnown.add(slug);
      if (config.model === 'known' && !isCantrip) {
        nextPrepared.add(slug);
      }
    }

    onChange({ spells_known: [...nextKnown], spells_prepared: [...nextPrepared] });
  }

  function togglePrepared(slug: string) {
    if (!knownSet.has(slug)) return;
    const spell = spellDetails[slug];
    if (!spell || spell.level === 0) return;
    const nextPrepared = new Set(preparedSet);
    if (nextPrepared.has(slug)) {
      nextPrepared.delete(slug);
    } else {
      if (spellsPreparedAllowed !== null && preparedForClass.length >= spellsPreparedAllowed) return;
      nextPrepared.add(slug);
    }
    onChange({ spells_prepared: [...nextPrepared] });
  }

  const search_lc = search.trim().toLowerCase();
  const visible = classSpells
    .filter((s) => (filterLevel === 'all' ? true : s.level === filterLevel))
    .filter((s) => (search_lc ? (s.name ?? '').toLowerCase().includes(search_lc) : true))
    .filter((s) => s.level <= maxLevel)
    .sort((a, b) => {
      const la = a.level ?? 0, lb = b.level ?? 0;
      if (la !== lb) return la - lb;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

  return (
    <section style={sectionStyle}>
      <SectionHeader label={label} classLevel={classLevel} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      {!collapsed && (
        <>
          <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.5rem 0' }}>
            {config.model === 'spellbook' ? 'Spellbook' : capitalize(config.model)} caster · {config.ability.toUpperCase()} ·
            max spell level {maxLevel} · spell list: {listClass}.
          </p>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <StatPill label="Cantrips" current={cantripsForClass.length} max={cantripsAllowed} />
            {config.model === 'known' ? (
              <StatPill label="Spells known" current={leveledForClass.length} max={spellsKnownAllowed} />
            ) : (
              <>
                <StatPill label={config.model === 'spellbook' ? 'Spells in book' : 'Spells in pool'} current={leveledForClass.length} max={null} hint="no hard limit" />
                <StatPill label="Spells prepared" current={preparedForClass.length} max={spellsPreparedAllowed} />
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Search spell…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '0.4rem', border: '1px solid #ddd', borderRadius: 4, minWidth: 180 }} />
            <select value={filterLevel === 'all' ? 'all' : String(filterLevel)}
              onChange={(e) => setFilterLevel(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{ padding: '0.4rem', border: '1px solid #ddd', borderRadius: 4 }}>
              <option value="all">All levels</option>
              <option value="0">Cantrips</option>
              {Array.from({ length: maxLevel }, (_, i) => i + 1).map((lvl) => (
                <option key={lvl} value={String(lvl)}>Level {lvl}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selectedDetail ? '1fr 1fr' : '1fr', gap: '0.75rem' }}>
            <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6 }}>
              {visible.map((spell) => {
                const isKnown = knownSet.has(spell.slug);
                const isPrepared = preparedSet.has(spell.slug);
                return (
                  <div key={spell.slug}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.4rem 0.6rem', borderBottom: '1px solid #eee',
                      background: isKnown ? '#fafafa' : '#fff',
                    }}>
                    <button onClick={() => setSelectedDetail(spell)}
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', flex: 1, padding: 0 }}>
                      <strong>{spell.name ?? spell.slug}</strong>
                      <span style={{ fontSize: '0.78rem', color: '#888', marginLeft: '0.5rem' }}>
                        {spell.level === 0 ? 'Cantrip' : `L${spell.level}`}
                        {spell.school && ` · ${spell.school}`}
                      </span>
                    </button>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => toggleKnown(spell.slug)}
                        style={{
                          padding: '0.2rem 0.5rem', fontSize: '0.78rem', borderRadius: 3,
                          border: isKnown ? '1px solid #2a7' : '1px solid #ccc',
                          background: isKnown ? '#e0f5e0' : '#fff', cursor: 'pointer',
                        }}>
                        {isKnown ? '✓ Known' : 'Add'}
                      </button>
                      {config.model !== 'known' && isKnown && spell.level > 0 && (
                        <button onClick={() => togglePrepared(spell.slug)}
                          style={{
                            padding: '0.2rem 0.5rem', fontSize: '0.78rem', borderRadius: 3,
                            border: isPrepared ? '1px solid #27a' : '1px solid #ccc',
                            background: isPrepared ? '#e0eaf5' : '#fff', cursor: 'pointer',
                          }}>
                          {isPrepared ? '✓ Prepared' : 'Prep'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && <div style={{ padding: '0.75rem', color: '#888' }}>No spells match the filter.</div>}
            </div>

            {selectedDetail && (
              <div style={{ padding: '0.75rem', border: '1px solid #eee', borderRadius: 6, background: '#fafafa', maxHeight: 380, overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0 }}>{selectedDetail.name ?? selectedDetail.slug}</h4>
                  <button onClick={() => setSelectedDetail(null)} style={{ cursor: 'pointer' }}>✕</button>
                </div>
                <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {selectedDetail.level === 0 ? `${selectedDetail.school ?? ''} cantrip` : `Level ${selectedDetail.level} ${selectedDetail.school ?? ''}`}
                </p>
                {selectedDetail.casting_time && <p style={smallP}><strong>Casting time:</strong> {selectedDetail.casting_time}</p>}
                {selectedDetail.range && <p style={smallP}><strong>Range:</strong> {selectedDetail.range}</p>}
                {selectedDetail.components && <p style={smallP}><strong>Components:</strong> {selectedDetail.components}</p>}
                {selectedDetail.duration && <p style={smallP}><strong>Duration:</strong> {selectedDetail.duration}</p>}
                {selectedDetail.desc && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}><MD text={selectedDetail.desc} /></div>}
                {selectedDetail.higher_level && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    <strong>At higher levels:</strong> <MD text={selectedDetail.higher_level} />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SectionHeader({ label, classLevel, collapsed, onToggle }: { label: string; classLevel: number; collapsed: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
      }}>
      <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
        {collapsed ? '▸' : '▾'} {label} <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 400 }}>L{classLevel}</span>
      </h3>
    </button>
  );
}

function StatPill({ label, current, max, hint }: { label: string; current: number; max: number | null; hint?: string }) {
  const hit = max !== null && current >= max;
  return (
    <div style={{ padding: '0.35rem 0.65rem', borderRadius: 18, background: hit ? '#efe' : '#f0f0f0', fontSize: '0.82rem' }}>
      <strong>{label}:</strong> {current}{max !== null ? ` / ${max}` : ''} {hint && <span style={{ color: '#888' }}>({hint})</span>}
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 6,
};

const smallP: React.CSSProperties = { margin: '0.25rem 0', fontSize: '0.85rem' };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
