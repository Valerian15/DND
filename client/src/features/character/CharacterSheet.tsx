import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Abilities, Character } from './types';
import { ABILITY_NAMES, ABILITY_ORDER } from './types';
import { getCharacter, getLibraryItem, updateCharacter } from './api';
import { abilityModifier, formatModifier } from './pointBuy';
import { initiative, parseHitDie, passivePerception, proficiencyBonus, recomputeDerived } from './rules';
import { getCasterConfig } from './casters';
import { SKILLS } from './skills';
import LevelUpDialog from './LevelUpDialog';

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hitDieSize, setHitDieSize] = useState(8);
  const [className, setClassName] = useState<string>('');
  const [raceName, setRaceName] = useState<string>('');
  const [backgroundName, setBackgroundName] = useState<string>('');
  const [spellNames, setSpellNames] = useState<Record<string, { name: string; level: number; school?: string }>>({});
  const [hpEditing, setHpEditing] = useState(false);
  const [hpDraft, setHpDraft] = useState(0);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
  const [levelUpOpen, setLevelUpOpen] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const c = await getCharacter(Number(id));
      setCharacter(c);
      setHpDraft(c.hp_current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!character) return;
    if (character.class_slug) {
      getLibraryItem<{ data: any; name: string }>('classes', character.class_slug)
        .then((r) => {
          setClassName(r.name);
          setHitDieSize(parseHitDie(r.data?.hit_dice));
        })
        .catch(() => {});
    }
    if (character.race_slug) {
      getLibraryItem<{ name: string }>('races', character.race_slug).then((r) => setRaceName(r.name)).catch(() => {});
    }
    if (character.background_slug) {
      getLibraryItem<{ name: string }>('backgrounds', character.background_slug).then((r) => setBackgroundName(r.name)).catch(() => {});
    }
  }, [character?.class_slug, character?.race_slug, character?.background_slug]);

  useEffect(() => {
    if (!character) return;
    const slugs = new Set<string>([
      ...(character.spells_known as string[]),
      ...(character.spells_prepared as string[]),
    ]);
    const missing = [...slugs].filter((s) => !spellNames[s]);
    if (missing.length === 0) return;
    (async () => {
      const results = await Promise.all(
        missing.map((slug) =>
          getLibraryItem<{ name: string; level: number; school?: string }>('spells', slug)
            .then((r) => ({ slug, name: r.name, level: r.level, school: r.school }))
            .catch(() => null),
        ),
      );
      setSpellNames((prev) => {
        const next = { ...prev };
        for (const r of results) if (r) next[r.slug] = { name: r.name, level: r.level, school: r.school };
        return next;
      });
    })();
  }, [character?.spells_known, character?.spells_prepared]);

  async function adjustHp(newCurrent: number) {
    if (!character) return;
    const clamped = Math.max(0, Math.min(character.hp_max, newCurrent));
    const updated = await updateCharacter(character.id, { hp_current: clamped });
    setCharacter(updated);
    setHpDraft(updated.hp_current);
  }

  async function setTempHp(temp: number) {
    if (!character) return;
    const updated = await updateCharacter(character.id, { hp_temp: Math.max(0, temp) });
    setCharacter(updated);
  }

  async function refreshDerived() {
    if (!character) return;
    const derived = recomputeDerived(character, hitDieSize);
    const updated = await updateCharacter(character.id, derived);
    setCharacter(updated);
    setRecomputeMsg(`Recomputed: HP ${updated.hp_max}, AC ${updated.ac}`);
    setTimeout(() => setRecomputeMsg(null), 2000);
  }

  async function applyLevelUp(abilities: Abilities, newLevel: number, newHpMax: number, newHpCurrent: number) {
    if (!character) return;
    // First save the user-driven changes (level and abilities).
    let updated = await updateCharacter(character.id, {
      abilities,
      level: newLevel,
      hp_max: newHpMax,
      hp_current: newHpCurrent,
    });
    // Then recompute slots/AC/etc. from the new state.
    const derived = recomputeDerived(updated, hitDieSize);
    // Preserve the HP we just carefully calculated, but accept AC and slot changes.
    updated = await updateCharacter(character.id, {
      ac: derived.ac,
      spell_slots: derived.spell_slots,
    });
    setCharacter(updated);
    setLevelUpOpen(false);
  }

  async function levelDown() {
    if (!character || character.level <= 1) return;
    if (!confirm(`Reduce ${character.name} to level ${character.level - 1}? This is intended for correcting mistakes. HP max will be recomputed from scratch.`)) return;
    const newLevel = character.level - 1;
    let updated = await updateCharacter(character.id, { level: newLevel });
    const derived = recomputeDerived(updated, hitDieSize);
    updated = await updateCharacter(character.id, derived);
    setCharacter(updated);
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading…</div>;
  if (error) return <div style={{ padding: '2rem', color: 'crimson' }}>{error}</div>;
  if (!character) return null;

  const prof = proficiencyBonus(character.level);
  const init = initiative(character.abilities);
  const profSkills = character.skills as Record<string, { proficient?: boolean }>;
  const perceptionProf = !!profSkills['perception']?.proficient;
  const passive = passivePerception(character.abilities, perceptionProf, prof);
  const config = getCasterConfig(character.class_slug);
  const desc = (character.description ?? {}) as Record<string, any>;

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <Link to="/characters" style={{ fontSize: '0.9rem' }}>← Characters</Link>
          <h1 style={{ margin: '0.25rem 0 0' }}>{character.name}</h1>
          <div style={{ color: '#666' }}>
            Level {character.level}
            {raceName && ` · ${raceName}`}
            {className && ` · ${className}`}
            {backgroundName && ` · ${backgroundName}`}
            {desc.alignment && ` · ${desc.alignment}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={levelDown} disabled={character.level <= 1} style={btn()} title="Correct a mistake; not intended for regular play">
            Level down
          </button>
          <button onClick={() => setLevelUpOpen(true)} disabled={character.level >= 20} style={btn(true)}>
            Level up
          </button>
          <button onClick={refreshDerived} style={btn()} title="Recompute HP/AC/slots from current class + abilities">
            {recomputeMsg ?? 'Recompute'}
          </button>
          <button onClick={() => navigate(`/characters/${character.id}/edit`)} style={btn()}>
            Edit
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <aside style={{ display: 'grid', gap: '1rem' }}>
          <Card>
            <div style={{
              width: '100%', aspectRatio: '1/1', borderRadius: 8, background: '#eee',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: '#aaa',
            }}>
              {character.portrait_url ? (
                <img src={character.portrait_url} alt={character.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : 'No portrait'}
            </div>
          </Card>

          <Card>
            <SectionTitle>Vitals</SectionTitle>
            <BigStat label="Hit Points">
              {hpEditing ? (
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <input type="number" value={hpDraft} onChange={(e) => setHpDraft(Number(e.target.value))}
                    onBlur={() => { adjustHp(hpDraft); setHpEditing(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { adjustHp(hpDraft); setHpEditing(false); } }}
                    autoFocus style={{ width: 60, padding: '0.25rem', fontSize: '1.1rem', textAlign: 'center' }} />
                  <span>/ {character.hp_max}</span>
                </div>
              ) : (
                <button onClick={() => setHpEditing(true)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}>
                  {character.hp_current} / {character.hp_max}
                </button>
              )}
            </BigStat>
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
              <button onClick={() => adjustHp(character.hp_current - 5)} style={chip()}>-5</button>
              <button onClick={() => adjustHp(character.hp_current - 1)} style={chip()}>-1</button>
              <button onClick={() => adjustHp(character.hp_current + 1)} style={chip()}>+1</button>
              <button onClick={() => adjustHp(character.hp_current + 5)} style={chip()}>+5</button>
              <button onClick={() => adjustHp(character.hp_max)} style={chip()} title="Full heal">Full</button>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
              Temp HP: <input type="number" value={character.hp_temp}
                onChange={(e) => setTempHp(Number(e.target.value))}
                style={{ width: 50, padding: '0.15rem', fontSize: '0.9rem' }} />
            </div>
          </Card>

          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <BigStat label="AC">{character.ac}</BigStat>
              <BigStat label="Initiative">{formatModifier(init)}</BigStat>
              <BigStat label="Proficiency">{formatModifier(prof)}</BigStat>
              <BigStat label="Passive Perception">{passive}</BigStat>
            </div>
          </Card>

          <Card>
            <SectionTitle>Abilities</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              {ABILITY_ORDER.map((key) => {
                const score = character.abilities[key];
                const mod = abilityModifier(score);
                return (
                  <div key={key} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>{ABILITY_NAMES[key]}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{score}</div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>{formatModifier(mod)}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </aside>

        <main style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem' }}>
            <Card>
              <SectionTitle>Saves</SectionTitle>
              {ABILITY_ORDER.map((key) => {
                const proficient = !!(character.saves as any)[key]?.proficient;
                const mod = abilityModifier(character.abilities[key]) + (proficient ? prof : 0);
                return (
                  <Row key={key}>
                    <span>{proficient ? '●' : '○'} {ABILITY_NAMES[key]}</span>
                    <span>{formatModifier(mod)}</span>
                  </Row>
                );
              })}
            </Card>

            <Card>
              <SectionTitle>Skills</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem' }}>
                {SKILLS.map((sk) => {
                  const proficient = !!profSkills[sk.key]?.proficient;
                  const mod = abilityModifier(character.abilities[sk.ability]) + (proficient ? prof : 0);
                  return (
                    <Row key={sk.key}>
                      <span>
                        {proficient ? '●' : '○'} {sk.name}{' '}
                        <span style={{ color: '#999', fontSize: '0.8rem' }}>({ABILITY_NAMES[sk.ability].slice(0,3)})</span>
                      </span>
                      <span>{formatModifier(mod)}</span>
                    </Row>
                  );
                })}
              </div>
            </Card>
          </div>

          {config && (
            <Card>
              <SectionTitle>Spells</SectionTitle>
              <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                {className} · casting ability {config.ability.toUpperCase()} · DC {8 + prof + abilityModifier(character.abilities[config.ability])} · attack {formatModifier(prof + abilityModifier(character.abilities[config.ability]))}
              </div>
              {character.spell_slots && Object.keys(character.spell_slots).length > 0 && (
                <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  <strong>Slots:</strong>{' '}
                  {Object.entries(character.spell_slots).map(([lvl, c]) => (
                    <span key={lvl} style={{ marginRight: '0.75rem' }}>L{lvl}: {c as number}</span>
                  ))}
                </div>
              )}
              <SpellList
                title="Cantrips"
                slugs={(character.spells_known as string[]).filter((s) => spellNames[s]?.level === 0)}
                spellNames={spellNames}
              />
              <SpellList
                title={config.model === 'known' ? 'Known spells' : config.model === 'spellbook' ? 'Spellbook' : 'Available to prepare'}
                slugs={(character.spells_known as string[]).filter((s) => (spellNames[s]?.level ?? 0) >= 1)}
                spellNames={spellNames}
                preparedSet={new Set(character.spells_prepared as string[])}
                showPreparedMark={config.model !== 'known'}
              />
            </Card>
          )}

          <Card>
            <SectionTitle>Inventory</SectionTitle>
            {(character.inventory as any[]).length === 0 ? (
              <div style={{ color: '#888' }}>Empty.</div>
            ) : (
              (character.inventory as any[]).map((item, i) => (
                <details key={i} style={{ marginBottom: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                    {item.name}
                    {item.quantity && item.quantity > 1 && ` ×${item.quantity}`}
                  </summary>
                  {item.description && (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', marginTop: '0.25rem', color: '#555' }}>
                      {item.description}
                    </div>
                  )}
                </details>
              ))
            )}
          </Card>

          {(desc.backstory || desc.age || desc.eyes) && (
            <Card>
              <SectionTitle>About</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                {desc.age && <Bit label="Age" value={desc.age} />}
                {desc.height && <Bit label="Height" value={desc.height} />}
                {desc.weight && <Bit label="Weight" value={desc.weight} />}
                {desc.eyes && <Bit label="Eyes" value={desc.eyes} />}
                {desc.hair && <Bit label="Hair" value={desc.hair} />}
                {desc.skin && <Bit label="Skin" value={desc.skin} />}
              </div>
              {desc.backstory && (
                <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', fontSize: '0.95rem' }}>{desc.backstory}</div>
              )}
            </Card>
          )}

          {character.notes && (
            <Card>
              <SectionTitle>Notes</SectionTitle>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>{character.notes}</div>
            </Card>
          )}
        </main>
      </div>

      {levelUpOpen && (
        <LevelUpDialog
          character={character}
          hitDieSize={hitDieSize}
          onConfirm={applyLevelUp}
          onCancel={() => setLevelUpOpen(false)}
        />
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', padding: '1rem', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>{children}</div>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555' }}>{children}</h3>;
}
function BigStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '0.25rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0', fontSize: '0.9rem', borderBottom: '1px solid #f2f2f2' }}>
      {children}
    </div>
  );
}
function Bit({ label, value }: { label: string; value: string }) {
  return <div><span style={{ color: '#888' }}>{label}:</span> {value}</div>;
}
function SpellList({
  title, slugs, spellNames, preparedSet, showPreparedMark,
}: {
  title: string;
  slugs: string[];
  spellNames: Record<string, { name: string; level: number; school?: string }>;
  preparedSet?: Set<string>;
  showPreparedMark?: boolean;
}) {
  if (slugs.length === 0) return null;
  const sorted = [...slugs].sort((a, b) => {
    const la = spellNames[a]?.level ?? 0;
    const lb = spellNames[b]?.level ?? 0;
    if (la !== lb) return la - lb;
    return (spellNames[a]?.name ?? a).localeCompare(spellNames[b]?.name ?? b);
  });
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#555', marginBottom: '0.25rem' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.15rem 1rem' }}>
        {sorted.map((slug) => {
          const meta = spellNames[slug];
          const prepared = preparedSet?.has(slug);
          return (
            <div key={slug} style={{ fontSize: '0.9rem' }}>
              {showPreparedMark && (prepared ? '● ' : '○ ')}
              {meta ? meta.name : slug}
              <span style={{ color: '#999', fontSize: '0.8rem' }}>{meta && meta.level > 0 ? ` · L${meta.level}` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function btn(primary = false): React.CSSProperties {
  return {
    padding: '0.5rem 1rem',
    background: primary ? '#333' : '#fff',
    color: primary ? '#fff' : '#333',
    border: '1px solid #333',
    borderRadius: 4,
    cursor: 'pointer',
  };
}
function chip(): React.CSSProperties {
  return {
    padding: '0.25rem 0.5rem',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: '0.85rem',
  };
}
