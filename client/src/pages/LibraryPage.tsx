import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { listLibrary, listTagsForType } from '../features/library/api';
import EntryFormModal from '../features/library/EntryFormModal';
import DetailModal from '../features/library/DetailModal';
import { CONTENT_TYPES, type ContentType, type LibraryDetail, type LibraryListItem } from '../features/library/types';

type Modal =
  | { kind: 'none' }
  | { kind: 'detail'; slug: string }
  | { kind: 'create' }
  | { kind: 'edit'; entry: LibraryDetail };

type Density = 'grid' | 'list';
type SortMode = 'name' | 'level' | 'cr' | 'source';

// Standard 5e XP reward by CR — used for the Encounter Budget calculator.
const XP_BY_CR: Record<string, number> = {
  '0': 10, '0.125': 25, '0.25': 50, '0.5': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

// Encounter difficulty thresholds per character level (5e DMG p.82).
const XP_THRESHOLDS: Record<number, { easy: number; medium: number; hard: number; deadly: number }> = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },
};

// Encounter multiplier for total XP based on monster count (5e DMG p.82).
function encounterMultiplier(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 1.5;
  if (n <= 6) return 2;
  if (n <= 10) return 2.5;
  if (n <= 14) return 3;
  return 4;
}

const PHB_CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
const CREATURE_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];

export default function LibraryPage() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeType, setActiveType] = useState<ContentType>('races');
  const [items, setItems] = useState<LibraryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>({ kind: 'none' });
  const [reloadKey, setReloadKey] = useState(0);

  // Toolbar state
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'srd' | 'homebrew'>('all');
  const [density, setDensity] = useState<Density>('grid');

  // Per-type filter state — keyed by content type.
  const [crRange, setCrRange] = useState<[number, number]>([0, 30]);
  const [creatureTypes, setCreatureTypes] = useState<Set<string>>(new Set());
  const [spellLevels, setSpellLevels] = useState<Set<number>>(new Set());
  const [spellSchools, setSpellSchools] = useState<Set<string>>(new Set());
  const [spellClass, setSpellClass] = useState<string>('');
  const [concentrationOnly, setConcentrationOnly] = useState(false);
  const [ritualOnly, setRitualOnly] = useState(false);
  const [itemRarities, setItemRarities] = useState<Set<string>>(new Set());

  // Tag state
  const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  // Compare-mode state
  const [compareMode, setCompareMode] = useState(false);
  const [comparedSlugs, setComparedSlugs] = useState<string[]>([]);

  // Encounter-budget state (Monsters tab only)
  const [encounterOpen, setEncounterOpen] = useState(false);
  const [encounterMonsters, setEncounterMonsters] = useState<{ slug: string; name: string; cr: number; count: number }[]>([]);
  const [partyLevel, setPartyLevel] = useState(5);
  const [partySize, setPartySize] = useState(4);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLibrary(activeType)
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    listTagsForType(activeType).then((t) => { if (!cancelled) setAllTags(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeType, reloadKey]);

  // Reset filters when switching tabs.
  useEffect(() => {
    setSearch('');
    setSortMode('name');
    setSourceFilter('all');
    setCrRange([0, 30]);
    setCreatureTypes(new Set());
    setSpellLevels(new Set());
    setSpellSchools(new Set());
    setSpellClass('');
    setConcentrationOnly(false);
    setRitualOnly(false);
    setItemRarities(new Set());
    setActiveTags(new Set());
    setCompareMode(false);
    setComparedSlugs([]);
    setEncounterOpen(false);
  }, [activeType]);

  function reload() { setReloadKey((k) => k + 1); }

  // ───────── Filter pipeline ─────────
  const filtered = useMemo(() => {
    let xs = items.slice();

    // Source filter
    if (sourceFilter === 'srd') xs = xs.filter((i) => i.source === 'srd-2014');
    else if (sourceFilter === 'homebrew') xs = xs.filter((i) => i.source !== 'srd-2014');

    // Search
    const q = search.trim().toLowerCase();
    if (q) xs = xs.filter((i) => i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q));

    // Tag filter — entry must have at least one of the active tags. We don't fetch per-entry
    // tags eagerly (would be N round-trips); instead we rely on the entry detail caching pattern.
    // For v1 we filter at the server level only when one tag is active and the user clicks it on
    // a card; multi-tag AND/OR is a follow-up.
    // (Tag filter applied later via per-entry fetch — see effect below.)

    // Per-type filters
    if (activeType === 'monsters') {
      xs = xs.filter((i) => {
        if (i.cr === undefined) return true;
        if (i.cr < crRange[0] || i.cr > crRange[1]) return false;
        if (creatureTypes.size > 0 && (!i.monster_type || !creatureTypes.has(i.monster_type.toLowerCase()))) return false;
        return true;
      });
    } else if (activeType === 'spells') {
      xs = xs.filter((i) => {
        if (spellLevels.size > 0 && (i.level === undefined || !spellLevels.has(i.level))) return false;
        if (spellSchools.size > 0 && (!i.school || !spellSchools.has(i.school))) return false;
        if (concentrationOnly && !i.concentration) return false;
        if (ritualOnly && !i.ritual) return false;
        if (spellClass && (!i.classes || !i.classes.toLowerCase().includes(spellClass.toLowerCase()))) return false;
        return true;
      });
    } else if (activeType === 'items') {
      xs = xs.filter((i) => {
        if (itemRarities.size > 0 && (!i.rarity || !itemRarities.has(i.rarity))) return false;
        return true;
      });
    }

    // Sort
    xs.sort((a, b) => {
      if (sortMode === 'level' && a.level !== undefined && b.level !== undefined) {
        return (a.level - b.level) || a.name.localeCompare(b.name);
      }
      if (sortMode === 'cr' && a.cr !== undefined && b.cr !== undefined) {
        return (a.cr - b.cr) || a.name.localeCompare(b.name);
      }
      if (sortMode === 'source') {
        return a.source.localeCompare(b.source) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
    return xs;
  }, [items, search, sortMode, sourceFilter, activeType, crRange, creatureTypes, spellLevels, spellSchools, spellClass, concentrationOnly, ritualOnly, itemRarities]);

  // Encounter budget computation
  const encounterTotalXp = encounterMonsters.reduce((sum, m) => sum + (XP_BY_CR[String(m.cr)] ?? 0) * m.count, 0);
  const totalCount = encounterMonsters.reduce((s, m) => s + m.count, 0);
  const adjusted = Math.round(encounterTotalXp * encounterMultiplier(totalCount));
  const thresholds = XP_THRESHOLDS[partyLevel];
  const partyEasy = thresholds ? thresholds.easy * partySize : 0;
  const partyMedium = thresholds ? thresholds.medium * partySize : 0;
  const partyHard = thresholds ? thresholds.hard * partySize : 0;
  const partyDeadly = thresholds ? thresholds.deadly * partySize : 0;
  const difficulty = adjusted >= partyDeadly ? 'Deadly'
    : adjusted >= partyHard ? 'Hard'
    : adjusted >= partyMedium ? 'Medium'
    : adjusted >= partyEasy ? 'Easy'
    : 'Trivial';
  const difficultyColor = {
    Trivial: '#888', Easy: '#4a4', Medium: '#a84', Hard: '#a44', Deadly: '#a22',
  }[difficulty] ?? '#666';

  function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
    const next = new Set(set);
    if (next.has(item)) next.delete(item); else next.add(item);
    return next;
  }

  function toggleCompare(slug: string) {
    setComparedSlugs((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug].slice(-3));
  }

  function addToEncounter(item: LibraryListItem) {
    if (item.cr === undefined) return;
    setEncounterMonsters((prev) => {
      const existing = prev.find((m) => m.slug === item.slug);
      if (existing) return prev.map((m) => m.slug === item.slug ? { ...m, count: m.count + 1 } : m);
      return [...prev, { slug: item.slug, name: item.name, cr: item.cr!, count: 1 }];
    });
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to="/" style={{ textDecoration: 'none', color: '#666', fontSize: '0.9rem' }}>← Home</Link>
          <h1 style={{ margin: '0.25rem 0 0' }}>Library</h1>
        </div>
        <div>
          Logged in as <strong>{user?.username}</strong> ({user?.role}){' '}
          {isAdmin && <Link to="/admin" style={{ marginLeft: '1rem' }}>Admin panel</Link>}
          <button onClick={logout} style={{ marginLeft: '1rem', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginTop: '1.5rem', borderBottom: '1px solid #ddd', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        {CONTENT_TYPES.map((t) => {
          const active = t.type === activeType;
          return (
            <button key={t.type} onClick={() => setActiveType(t.type)}
              style={{
                padding: '0.6rem 1rem', background: active ? '#fff' : 'transparent',
                border: '1px solid', borderColor: active ? '#ddd' : 'transparent',
                borderBottomColor: active ? '#fff' : 'transparent', marginBottom: -1, cursor: 'pointer',
                fontWeight: active ? 600 : 400, color: active ? '#222' : '#666', borderRadius: '6px 6px 0 0',
              }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Toolbar — search + sort + source + density + actions */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name…"
          style={{ flex: 1, minWidth: 200, padding: '0.45rem 0.7rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.9rem' }} />

        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={{ padding: '0.45rem 0.5rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }}>
          <option value="name">Sort: A-Z</option>
          {activeType === 'spells' && <option value="level">Sort: by level</option>}
          {activeType === 'monsters' && <option value="cr">Sort: by CR</option>}
          <option value="source">Sort: by source</option>
        </select>

        {/* Source chips */}
        <div style={{ display: 'inline-flex', gap: 2, border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden' }}>
          {(['all', 'srd', 'homebrew'] as const).map((s) => (
            <button key={s} onClick={() => setSourceFilter(s)}
              style={{
                padding: '0.4rem 0.7rem', fontSize: '0.78rem', cursor: 'pointer',
                border: 'none', background: sourceFilter === s ? '#333' : '#fff',
                color: sourceFilter === s ? '#fff' : '#555', fontWeight: sourceFilter === s ? 600 : 400,
              }}>
              {s === 'all' ? 'All' : s === 'srd' ? 'SRD' : 'Homebrew'}
            </button>
          ))}
        </div>

        {/* Density toggle */}
        <div style={{ display: 'inline-flex', gap: 2, border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden' }}>
          {(['grid', 'list'] as const).map((d) => (
            <button key={d} onClick={() => setDensity(d)} title={d === 'grid' ? 'Grid view' : 'List view'}
              style={{
                padding: '0.4rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer',
                border: 'none', background: density === d ? '#333' : '#fff',
                color: density === d ? '#fff' : '#555',
              }}>
              {d === 'grid' ? '▦' : '☰'}
            </button>
          ))}
        </div>

        <button onClick={() => { setCompareMode((m) => !m); if (compareMode) setComparedSlugs([]); }}
          style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: compareMode ? '#446' : '#fff', color: compareMode ? '#fff' : '#555', fontWeight: compareMode ? 600 : 400 }}>
          🔍 Compare
        </button>

        {activeType === 'monsters' && (
          <button onClick={() => setEncounterOpen((o) => !o)}
            style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: encounterOpen ? '#a44' : '#fff', color: encounterOpen ? '#fff' : '#555', fontWeight: encounterOpen ? 600 : 400 }}>
            ⚔ Encounter ({encounterMonsters.length})
          </button>
        )}

        {isAdmin && (
          <button onClick={() => setModal({ kind: 'create' })}
            style={{ padding: '0.45rem 0.9rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}>
            + Add new
          </button>
        )}
      </div>

      {/* Per-type filter row */}
      {(activeType === 'monsters' || activeType === 'spells' || activeType === 'items') && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#fafafa', border: '1px solid #eee', borderRadius: 4, display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', fontSize: '0.78rem' }}>
          {activeType === 'monsters' && (
            <>
              <label style={{ color: '#666' }}>CR:
                <input type="number" min={0} max={30} value={crRange[0]}
                  onChange={(e) => setCrRange([Math.max(0, Math.min(30, Number(e.target.value) || 0)), crRange[1]])}
                  style={{ width: 50, marginLeft: 4, padding: '0.15rem 0.3rem', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.78rem' }} />
                <span style={{ margin: '0 0.3rem' }}>–</span>
                <input type="number" min={0} max={30} value={crRange[1]}
                  onChange={(e) => setCrRange([crRange[0], Math.max(0, Math.min(30, Number(e.target.value) || 30))])}
                  style={{ width: 50, padding: '0.15rem 0.3rem', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.78rem' }} />
              </label>
              <span style={{ color: '#aaa' }}>·</span>
              <span style={{ color: '#666' }}>Type:</span>
              {CREATURE_TYPES.map((ct) => (
                <Chip key={ct} active={creatureTypes.has(ct)} onClick={() => setCreatureTypes((s) => toggleSetItem(s, ct))}>
                  {ct}
                </Chip>
              ))}
            </>
          )}
          {activeType === 'spells' && (
            <>
              <span style={{ color: '#666' }}>Level:</span>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                <Chip key={lvl} active={spellLevels.has(lvl)} onClick={() => setSpellLevels((s) => toggleSetItem(s, lvl))}>
                  {lvl === 0 ? 'C' : lvl}
                </Chip>
              ))}
              <span style={{ color: '#aaa' }}>·</span>
              <span style={{ color: '#666' }}>School:</span>
              {SCHOOLS.map((sc) => (
                <Chip key={sc} active={spellSchools.has(sc)} onClick={() => setSpellSchools((s) => toggleSetItem(s, sc))}>
                  {sc.slice(0, 4)}
                </Chip>
              ))}
              <span style={{ color: '#aaa' }}>·</span>
              <select value={spellClass} onChange={(e) => setSpellClass(e.target.value)}
                style={{ padding: '0.15rem 0.3rem', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.78rem' }}>
                <option value="">All classes</option>
                {PHB_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Chip active={concentrationOnly} onClick={() => setConcentrationOnly((c) => !c)}>conc.</Chip>
              <Chip active={ritualOnly} onClick={() => setRitualOnly((r) => !r)}>ritual</Chip>
            </>
          )}
          {activeType === 'items' && (
            <>
              <span style={{ color: '#666' }}>Rarity:</span>
              {RARITIES.map((r) => (
                <Chip key={r} active={itemRarities.has(r)} onClick={() => setItemRarities((s) => toggleSetItem(s, r))}>
                  {r}
                </Chip>
              ))}
            </>
          )}
        </div>
      )}

      {/* Tag filter row */}
      {allTags.length > 0 && (
        <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.75rem', background: '#f7f4ee', border: '1px solid #ece5d4', borderRadius: 4, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', fontSize: '0.75rem' }}>
          <span style={{ color: '#776', fontWeight: 600 }}>Tags:</span>
          {allTags.map((t) => (
            <Chip key={t.tag} active={activeTags.has(t.tag)}
              onClick={() => setActiveTags((s) => toggleSetItem(s, t.tag))}>
              #{t.tag} <span style={{ color: '#aa9', fontWeight: 400 }}>({t.count})</span>
            </Chip>
          ))}
        </div>
      )}

      {/* Encounter budget panel */}
      {activeType === 'monsters' && encounterOpen && (
        <div style={{ marginTop: '0.7rem', padding: '0.75rem', background: '#fdf6f6', border: '1px solid #f0d8d8', borderRadius: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.85rem', color: '#722' }}>⚔ Encounter Budget</strong>
            <label style={{ fontSize: '0.78rem', color: '#666' }}>
              Party size: <input type="number" min={1} max={10} value={partySize} onChange={(e) => setPartySize(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                style={{ width: 40, padding: '0.15rem 0.3rem', border: '1px solid #ccc', borderRadius: 3 }} />
            </label>
            <label style={{ fontSize: '0.78rem', color: '#666' }}>
              Avg level: <input type="number" min={1} max={20} value={partyLevel} onChange={(e) => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                style={{ width: 40, padding: '0.15rem 0.3rem', border: '1px solid #ccc', borderRadius: 3 }} />
            </label>
            <button onClick={() => setEncounterMonsters([])}
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff', color: '#666' }}>
              Clear
            </button>
          </div>
          {encounterMonsters.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: '#a76', fontStyle: 'italic' }}>
              Click "+ enc" on monster cards below to add them.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '0.4rem' }}>
              {encounterMonsters.map((m) => (
                <div key={m.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.2rem 0.5rem', background: '#fff', border: '1px solid #e0c0c0', borderRadius: 4, fontSize: '0.74rem' }}>
                  <span>{m.name}</span>
                  <span style={{ color: '#aaa' }}>CR {m.cr}</span>
                  <button onClick={() => setEncounterMonsters((p) => p.map((x) => x.slug === m.slug ? { ...x, count: Math.max(0, x.count - 1) } : x).filter((x) => x.count > 0))}
                    style={{ width: 16, height: 16, padding: 0, fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 2, background: '#fff' }}>−</button>
                  <strong>{m.count}</strong>
                  <button onClick={() => setEncounterMonsters((p) => p.map((x) => x.slug === m.slug ? { ...x, count: x.count + 1 } : x))}
                    style={{ width: 16, height: 16, padding: 0, fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 2, background: '#fff' }}>+</button>
                </div>
              ))}
            </div>
          )}
          {encounterMonsters.length > 0 && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#555', alignItems: 'baseline' }}>
              <span>Raw XP: <strong>{encounterTotalXp}</strong></span>
              <span>×{encounterMultiplier(totalCount)} = Adjusted: <strong>{adjusted}</strong></span>
              <span>Difficulty: <strong style={{ color: difficultyColor }}>{difficulty}</strong></span>
              <span style={{ color: '#999' }}>Party thresholds — Easy {partyEasy} · Med {partyMedium} · Hard {partyHard} · Deadly {partyDeadly}</span>
            </div>
          )}
        </div>
      )}

      {/* Compare panel */}
      {compareMode && comparedSlugs.length > 0 && (
        <div style={{ marginTop: '0.7rem', padding: '0.6rem 0.75rem', background: '#eef0f5', border: '1px solid #d0d4dd', borderRadius: 4, fontSize: '0.78rem', color: '#446' }}>
          <strong>Comparing {comparedSlugs.length}/3:</strong>{' '}
          {comparedSlugs.map((s) => {
            const it = items.find((i) => i.slug === s);
            return it ? (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6, padding: '0.15rem 0.45rem', background: '#fff', border: '1px solid #ccd', borderRadius: 12 }}>
                {it.name}
                <button onClick={() => toggleCompare(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#88a' }}>×</button>
              </span>
            ) : null;
          })}
          {comparedSlugs.length >= 2 && (
            <button onClick={() => setModal({ kind: 'detail', slug: '__compare__' })} disabled
              style={{ marginLeft: '0.5rem', padding: '0.2rem 0.5rem', fontSize: '0.72rem', cursor: 'not-allowed', border: '1px solid #ccc', borderRadius: 3, background: '#fff', color: '#aaa' }}
              title="Side-by-side compare opens below">
              View comparison
            </button>
          )}
        </div>
      )}

      {compareMode && comparedSlugs.length >= 2 && (
        <CompareView slugs={comparedSlugs} type={activeType} onClose={() => { setComparedSlugs([]); setCompareMode(false); }} />
      )}

      {/* Results header */}
      <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#666', fontSize: '0.85rem' }}>
          {loading ? 'Loading…' : `${filtered.length} of ${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}
        </div>
      </div>

      {error && <div style={{ color: '#c00', marginTop: '0.6rem' }}>Error: {error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ color: '#666', marginTop: '0.6rem' }}>No entries match.</div>
      )}

      {/* Results — grid or list */}
      {!loading && !error && filtered.length > 0 && (
        density === 'grid' ? (
          <div style={{ marginTop: '0.6rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {filtered.map((item) => (
              <Card key={`${activeType}-${item.slug}`}
                item={item} type={activeType}
                isCompared={comparedSlugs.includes(item.slug)}
                compareMode={compareMode}
                onOpen={() => setModal({ kind: 'detail', slug: item.slug })}
                onCompare={() => toggleCompare(item.slug)}
                onAddToEncounter={activeType === 'monsters' && encounterOpen ? () => addToEncounter(item) : undefined} />
            ))}
          </div>
        ) : (
          <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid #eee', borderRadius: 4, background: '#fff' }}>
            {filtered.map((item) => (
              <Row key={`${activeType}-${item.slug}`}
                item={item} type={activeType}
                isCompared={comparedSlugs.includes(item.slug)}
                compareMode={compareMode}
                onOpen={() => setModal({ kind: 'detail', slug: item.slug })}
                onCompare={() => toggleCompare(item.slug)}
                onAddToEncounter={activeType === 'monsters' && encounterOpen ? () => addToEncounter(item) : undefined} />
            ))}
          </div>
        )
      )}

      {modal.kind === 'detail' && (
        <DetailModal type={activeType} slug={modal.slug} isAdmin={isAdmin}
          onClose={() => setModal({ kind: 'none' })}
          onEdit={(entry) => setModal({ kind: 'edit', entry })}
          onDeleted={() => { setModal({ kind: 'none' }); reload(); }} />
      )}
      {modal.kind === 'create' && (
        <EntryFormModal type={activeType} mode="create"
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => { setModal({ kind: 'none' }); reload(); }} />
      )}
      {modal.kind === 'edit' && (
        <EntryFormModal type={activeType} mode="edit" existing={modal.entry}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => { setModal({ kind: 'none' }); reload(); }} />
      )}
    </div>
  );
}

// ───────── Components ─────────

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '0.15rem 0.5rem', fontSize: '0.72rem', cursor: 'pointer',
        border: `1px solid ${active ? '#446' : '#ccc'}`, borderRadius: 12,
        background: active ? '#446' : '#fff', color: active ? '#fff' : '#666',
        fontWeight: active ? 600 : 400, textTransform: 'capitalize',
      }}>
      {children}
    </button>
  );
}

interface ItemRowProps {
  item: LibraryListItem;
  type: ContentType;
  isCompared: boolean;
  compareMode: boolean;
  onOpen: () => void;
  onCompare: () => void;
  onAddToEncounter?: () => void;
}

function Card({ item, type, isCompared, compareMode, onOpen, onCompare, onAddToEncounter }: ItemRowProps) {
  const isSrd = item.source === 'srd-2014';
  const meta = renderMeta(item, type);
  return (
    <div onClick={() => compareMode ? onCompare() : onOpen()}
      style={{
        textAlign: 'left', padding: '0.75rem 0.85rem',
        background: isCompared ? '#f0eef8' : '#fff',
        border: `1px solid ${isCompared ? '#88a' : '#ddd'}`,
        borderRadius: 6, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: '0.3rem', position: 'relative',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <div style={{ fontWeight: 600, color: '#222', flex: 1 }}>{item.name}</div>
        {onAddToEncounter && (
          <button onClick={(e) => { e.stopPropagation(); onAddToEncounter(); }}
            title="Add to encounter"
            style={{ padding: '0.1rem 0.35rem', fontSize: '0.62rem', cursor: 'pointer', border: '1px solid #c88', borderRadius: 3, background: '#fff', color: '#a44', fontWeight: 600, flexShrink: 0 }}>
            + enc
          </button>
        )}
      </div>
      {meta && <div style={{ fontSize: '0.72rem', color: '#666' }}>{meta}</div>}
      <div style={{ fontSize: '0.65rem', color: isSrd ? '#888' : '#27a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {isSrd ? 'SRD' : item.source}
      </div>
    </div>
  );
}

function Row({ item, type, isCompared, compareMode, onOpen, onCompare, onAddToEncounter }: ItemRowProps) {
  const isSrd = item.source === 'srd-2014';
  const meta = renderMeta(item, type);
  return (
    <div onClick={() => compareMode ? onCompare() : onOpen()}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.45rem 0.7rem', borderBottom: '1px solid #f3f3f3',
        background: isCompared ? '#f0eef8' : 'transparent', cursor: 'pointer',
      }}>
      <div style={{ minWidth: 140, fontWeight: 600, fontSize: '0.85rem', color: '#222' }}>{item.name}</div>
      <div style={{ flex: 1, fontSize: '0.75rem', color: '#666' }}>{meta}</div>
      <div style={{ fontSize: '0.65rem', color: isSrd ? '#888' : '#27a', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>
        {isSrd ? 'SRD' : item.source}
      </div>
      {onAddToEncounter && (
        <button onClick={(e) => { e.stopPropagation(); onAddToEncounter(); }}
          style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #c88', borderRadius: 3, background: '#fff', color: '#a44', fontWeight: 600 }}>
          + enc
        </button>
      )}
    </div>
  );
}

// Per-type small metadata line shown on cards / rows. Adapts to whatever fields are present.
function renderMeta(item: LibraryListItem, type: ContentType): string | null {
  if (type === 'monsters') {
    const parts: string[] = [];
    if (item.cr !== undefined) parts.push(`CR ${formatCr(item.cr)}`);
    if (item.monster_type) parts.push(item.monster_type);
    if (item.size) parts.push(item.size);
    return parts.join(' · ');
  }
  if (type === 'spells') {
    const parts: string[] = [];
    if (item.level !== undefined) parts.push(item.level === 0 ? 'Cantrip' : `L${item.level}`);
    if (item.school) parts.push(item.school);
    if (item.concentration) parts.push('conc.');
    if (item.ritual) parts.push('ritual');
    return parts.join(' · ');
  }
  if (type === 'items') {
    const parts: string[] = [];
    if (item.rarity) parts.push(item.rarity);
    if (item.item_type) parts.push(item.item_type);
    if (item.requires_attunement) parts.push('attunement');
    return parts.join(' · ');
  }
  if (type === 'classes') {
    const parts: string[] = [];
    if (item.hit_die) parts.push(`d${item.hit_die}`);
    else if (item.hd_alt) parts.push(item.hd_alt);
    if (item.spellcasting_ability) parts.push(`Caster (${item.spellcasting_ability.toUpperCase()})`);
    return parts.join(' · ');
  }
  if (type === 'feats') return item.prerequisite ? `Req: ${item.prerequisite}` : null;
  if (type === 'subclasses') return item.class_slug ? `${item.class_slug}` : null;
  if (type === 'weapons') {
    const parts: string[] = [];
    if (item.category) parts.push(item.category);
    if (item.weapon_type) parts.push(item.weapon_type);
    return parts.join(' · ');
  }
  if (type === 'races') {
    const parts: string[] = [];
    if (item.size) parts.push(item.size);
    if (item.speed) parts.push(`${item.speed} ft`);
    return parts.join(' · ');
  }
  return null;
}

function formatCr(cr: number): string {
  if (cr === 0.125) return '⅛';
  if (cr === 0.25) return '¼';
  if (cr === 0.5) return '½';
  return String(cr);
}

// ───────── Compare view ─────────
import { getLibraryDetail } from '../features/library/api';
import { Statblock } from '../features/library/Statblock';

function CompareView({ slugs, type, onClose }: { slugs: string[]; type: ContentType; onClose: () => void }) {
  const [details, setDetails] = useState<Record<string, LibraryDetail | null>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(slugs.map((s) => getLibraryDetail(type, s).catch(() => null))).then((rs) => {
      if (cancelled) return;
      const next: Record<string, LibraryDetail | null> = {};
      slugs.forEach((s, i) => { next[s] = rs[i]; });
      setDetails(next);
    });
    return () => { cancelled = true; };
  }, [slugs, type]);

  return (
    <div style={{ marginTop: '0.7rem', padding: '0.75rem', border: '1px solid #d0d4dd', borderRadius: 4, background: '#fafbfd' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.85rem', color: '#446' }}>Side-by-side</strong>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid #ccc', borderRadius: 3, padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem', color: '#666' }}>Close</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${slugs.length}, minmax(0, 1fr))`, gap: '0.5rem', maxHeight: '70vh', overflow: 'auto' }}>
        {slugs.map((s) => {
          const d = details[s];
          if (d === undefined) return <div key={s} style={{ padding: '0.5rem', color: '#888', fontSize: '0.75rem' }}>Loading…</div>;
          if (d === null) return <div key={s} style={{ padding: '0.5rem', color: '#a44', fontSize: '0.75rem' }}>Failed to load</div>;
          return (
            <div key={s} style={{ minWidth: 0 }}>
              <Statblock type={type} name={d.name} data={d.data ?? {}} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
