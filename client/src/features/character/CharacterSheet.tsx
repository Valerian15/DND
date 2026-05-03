import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Abilities, Character, ClassEntry } from './types';
import { ABILITY_NAMES, ABILITY_ORDER } from './types';
import { getCharacter, getLibraryItem, updateCharacter } from './api';
import { abilityModifier, formatModifier } from './pointBuy';
import { initiative, parseHitDie, passivePerception, proficiencyBonus, recomputeDerived } from './rules';
import { getCasterConfig } from './casters';
import { SKILLS } from './skills';
import { isWeaponProficient, isWeaponProficientForClasses } from './weaponProficiency';
import { isArmorProficientForClasses } from './armorProficiency';
import { viewEquippedWeapons, viewInventory, viewTotalWeight, carryCapacity, hasStealthDisadvantage, failingStrengthRequirement, viewEquippedArmor, viewEquippedShield } from './inventoryView';
import { parseSpellForAttack, scaleCantripDice } from './attackUtils';
import LevelUpDialog from './LevelUpDialog';
import { MD } from '../library/Statblock';
import { featuresThroughLevel } from './classFeatures';

interface WeaponData {
  slug: string;
  name: string;
  category: string;
  weapon_type: string;
  damage_dice: string;
  damage_type: string;
  properties: string[];
  versatile_dice?: string;
  range_normal?: number;
  range_long?: number;
}

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hitDieSize, setHitDieSize] = useState(8);
  const [className, setClassName] = useState<string>('');
  const [subclassName, setSubclassName] = useState<string>('');
  const [classNames, setClassNames] = useState<Record<string, string>>({});
  const [subclassNames, setSubclassNames] = useState<Record<string, string>>({});
  const [raceName, setRaceName] = useState<string>('');
  const [backgroundName, setBackgroundName] = useState<string>('');
  const [spellNames, setSpellNames] = useState<Record<string, { name: string; level: number; school?: string; desc?: string }>>({});
  const [weaponData, setWeaponData] = useState<Record<string, WeaponData>>({});
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
    } else {
      setClassName('');
    }
    if (character.subclass_slug) {
      getLibraryItem<{ name: string }>('subclasses', character.subclass_slug)
        .then((r) => setSubclassName(r.name))
        .catch(() => setSubclassName(''));
    } else {
      setSubclassName('');
    }
    if (character.race_slug) {
      getLibraryItem<{ name: string }>('races', character.race_slug).then((r) => setRaceName(r.name)).catch(() => {});
    }
    if (character.background_slug) {
      getLibraryItem<{ name: string }>('backgrounds', character.background_slug).then((r) => setBackgroundName(r.name)).catch(() => {});
    }
  }, [character?.class_slug, character?.subclass_slug, character?.race_slug, character?.background_slug]);

  // Multiclass: load display names for every class and subclass in classes[]
  useEffect(() => {
    if (!character?.classes) return;
    const classSlugs = character.classes.map((c) => c.slug);
    const subSlugs = character.classes.map((c) => c.subclass_slug).filter((s): s is string => !!s);
    const missingClasses = classSlugs.filter((s) => !classNames[s]);
    const missingSubs = subSlugs.filter((s) => !subclassNames[s]);
    if (missingClasses.length > 0) {
      Promise.all(missingClasses.map((slug) =>
        getLibraryItem<{ name: string }>('classes', slug).then((r) => ({ slug, name: r.name })).catch(() => null),
      )).then((results) => {
        setClassNames((prev) => {
          const next = { ...prev };
          for (const r of results) if (r) next[r.slug] = r.name;
          return next;
        });
      });
    }
    if (missingSubs.length > 0) {
      Promise.all(missingSubs.map((slug) =>
        getLibraryItem<{ name: string }>('subclasses', slug).then((r) => ({ slug, name: r.name })).catch(() => null),
      )).then((results) => {
        setSubclassNames((prev) => {
          const next = { ...prev };
          for (const r of results) if (r) next[r.slug] = r.name;
          return next;
        });
      });
    }
  }, [character?.classes, classNames, subclassNames]);

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
          getLibraryItem<{ name: string; level: number; school?: string; data?: { desc?: string } }>('spells', slug)
            .then((r) => ({ slug, name: r.name, level: r.level, school: r.school, desc: r.data?.desc }))
            .catch(() => null),
        ),
      );
      setSpellNames((prev) => {
        const next = { ...prev };
        for (const r of results) if (r) next[r.slug] = { name: r.name, level: r.level, school: r.school, desc: r.desc };
        return next;
      });
    })();
  }, [character?.spells_known, character?.spells_prepared]);

  useEffect(() => {
    if (!character?.weapons?.length) return;
    const missing = character.weapons.filter((s) => !weaponData[s]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map((slug) =>
        getLibraryItem<{ name: string; category: string; weapon_type: string; data: Record<string, unknown> }>('weapons', slug)
          .then((r) => ({
            slug,
            name: r.name,
            category: r.category ?? '',
            weapon_type: r.weapon_type ?? '',
            damage_dice: String(r.data.damage_dice ?? ''),
            damage_type: String(r.data.damage_type ?? ''),
            properties: Array.isArray(r.data.properties) ? (r.data.properties as string[]) : [],
            versatile_dice: r.data.versatile_dice ? String(r.data.versatile_dice) : undefined,
            range_normal: typeof r.data.range_normal === 'number' ? r.data.range_normal : undefined,
            range_long: typeof r.data.range_long === 'number' ? r.data.range_long : undefined,
          }))
          .catch(() => null),
      ),
    ).then((results) => {
      setWeaponData((prev) => {
        const next = { ...prev };
        for (const r of results) if (r) next[r.slug] = r;
        return next;
      });
    });
  }, [character?.weapons]);

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

  async function applyLevelUp(updatedClasses: ClassEntry[], abilities: Abilities, newLevel: number, newHpMax: number, newHpCurrent: number) {
    if (!character) return;
    let updated = await updateCharacter(character.id, {
      classes: updatedClasses,
      abilities,
      level: newLevel,
      hp_max: newHpMax,
      hp_current: newHpCurrent,
    });
    // Re-derive everything (includes feat-aware HP — Tough +2/level — and recomputes AC + slots).
    const derived = recomputeDerived(updated, hitDieSize);
    updated = await updateCharacter(character.id, {
      hp_max: derived.hp_max,
      hp_current: derived.hp_current,
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
            {raceName && ` · ${character.subrace_slug ? humanize(character.subrace_slug) : raceName}`}
            {(() => {
              // Multiclass: render "Fighter 3 (Battle Master) / Wizard 2 (Evoker)"
              const cls = character.classes ?? [];
              if (cls.length > 0) {
                const parts = cls.map((c) => {
                  const name = classNames[c.slug] ?? c.slug;
                  const sub = c.subclass_slug ? subclassNames[c.subclass_slug] : null;
                  return `${name} ${c.level}${sub ? ` (${sub})` : ''}`;
                });
                return ` · ${parts.join(' / ')}`;
              }
              // Legacy fallback
              return (
                <>
                  {className && ` · ${className}`}
                  {subclassName && ` (${subclassName})`}
                </>
              );
            })()}
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
            {(() => {
              const stealthDis = hasStealthDisadvantage(character);
              const strReq = failingStrengthRequirement(character);
              const speed = (character.speed_walk ?? 30) - (strReq != null ? 10 : 0);
              const classSlugs = (character.classes && character.classes.length > 0)
                ? character.classes.map((c) => c.slug)
                : (character.class_slug ? [character.class_slug] : []);
              const armor = viewEquippedArmor(character);
              const shield = viewEquippedShield(character);
              const armorNotProf = armor && armor.armor_type && !isArmorProficientForClasses(classSlugs, armor.armor_type);
              const shieldNotProf = shield && !isArmorProficientForClasses(classSlugs, 'shield');
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <BigStat label="AC">{character.ac}</BigStat>
                    <BigStat label="Initiative">{formatModifier(init)}</BigStat>
                    <BigStat label="Proficiency">{formatModifier(prof)}</BigStat>
                    <BigStat label="Passive Perception">{passive}</BigStat>
                    <BigStat label="Speed">{speed} ft</BigStat>
                  </div>
                  {(stealthDis || strReq != null || armorNotProf || shieldNotProf) && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#a60' }}>
                      {armorNotProf && <div>⚠ Not proficient with {armor!.name} — disadv on STR/DEX checks, attacks, saves; can't cast spells</div>}
                      {shieldNotProf && <div>⚠ Not proficient with {shield!.name} — same penalties as non-proficient armor</div>}
                      {stealthDis && <div>⚠ Disadvantage on Stealth (armor)</div>}
                      {strReq != null && <div>⚠ STR {strReq} not met — speed reduced by 10 ft</div>}
                    </div>
                  )}
                </>
              );
            })()}
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
                  const entry = profSkills[sk.key] as { proficient?: boolean; expertise?: boolean } | undefined;
                  const proficient = !!entry?.proficient;
                  const expertise = !!entry?.expertise;
                  const profMod = expertise ? prof * 2 : proficient ? prof : 0;
                  const mod = abilityModifier(character.abilities[sk.ability]) + profMod;
                  return (
                    <Row key={sk.key}>
                      <span>
                        {expertise ? '⬢' : proficient ? '●' : '○'} {sk.name}{' '}
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
                spellAtk={prof + abilityModifier(character.abilities[config.ability])}
                spellDc={8 + prof + abilityModifier(character.abilities[config.ability])}
                characterLevel={character.level}
              />
              <SpellList
                title={config.model === 'known' ? 'Known spells' : config.model === 'spellbook' ? 'Spellbook' : 'Available to prepare'}
                slugs={(character.spells_known as string[]).filter((s) => (spellNames[s]?.level ?? 0) >= 1)}
                spellNames={spellNames}
                preparedSet={new Set(character.spells_prepared as string[])}
                showPreparedMark={config.model !== 'known'}
                spellAtk={prof + abilityModifier(character.abilities[config.ability])}
                spellDc={8 + prof + abilityModifier(character.abilities[config.ability])}
                characterLevel={character.level}
              />
            </Card>
          )}

          {(() => {
            const strMod = abilityModifier(character.abilities.str);
            const dexMod = abilityModifier(character.abilities.dex);

            // Equipped weapons via the structured view (inventory_v2 with legacy fallback).
            const equippedWeapons = viewEquippedWeapons(character);
            if (equippedWeapons.length === 0) return null;

            return (
              <Card>
                <SectionTitle>Attacks</SectionTitle>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {equippedWeapons.map((item) => {
                    // Migrated rows carry their own stats; legacy rows defer to weaponData lookup
                    // by library_slug (the slug-only synthesis from viewInventory).
                    const slug = item.library_slug ?? item.id;
                    const w = item.damage_dice ? item : weaponData[item.library_slug ?? ''];
                    if (!w) return <div key={item.id} style={{ fontSize: '0.9rem', color: '#aaa' }}>{item.name}</div>;

                    const classSlugs = (character.classes && character.classes.length > 0)
                      ? character.classes.map((c) => c.slug)
                      : (character.class_slug ? [character.class_slug] : []);
                    const wCategory = (w.weapon_category ?? w.category) as string;
                    const wProperties = (w.properties ?? []) as string[];
                    const wType = w.weapon_type as 'Melee' | 'Ranged' | undefined;
                    const proficient = isWeaponProficientForClasses(classSlugs, slug, wCategory);
                    const isFinesse = wProperties.includes('finesse');
                    const isRanged = wType === 'Ranged';
                    const abilityMod = isRanged ? dexMod : isFinesse ? Math.max(strMod, dexMod) : strMod;
                    const attackBonus = abilityMod + (proficient ? prof : 0);
                    const damageMod = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod;
                    const damageStr = w.damage_dice
                      ? `${w.damage_dice}${damageMod !== 0 ? formatModifier(damageMod) : ''}`
                      : '—';
                    const rangeStr = w.range_normal ? `${w.range_normal}/${w.range_long ?? w.range_normal} ft` : null;

                    return (
                      <AttackRow
                        key={item.id}
                        name={w.name ?? item.name}
                        subtitle={`${wCategory ?? ''} ${wType ?? ''}${proficient ? '' : ' · not proficient'}`}
                        detail={[...wProperties, ...(rangeStr ? [rangeStr] : [])].join(', ')}
                        attackLabel={formatModifier(attackBonus)}
                        damageLabel={damageStr}
                        damageType={w.damage_type}
                        extra={w.versatile_dice ? `${w.versatile_dice}${formatModifier(damageMod)} two-handed` : undefined}
                      />
                    );
                  })}
                </div>
              </Card>
            );
          })()}

          {(() => {
            const cls = character.classes && character.classes.length > 0
              ? character.classes
              : (character.class_slug ? [{ slug: character.class_slug, level: character.level || 1, subclass_slug: null, hit_dice_used: 0 }] : []);
            const sections = cls
              .map((c) => ({ slug: c.slug, level: c.level, feats: featuresThroughLevel(c.slug, c.level) }))
              .filter((s) => s.feats.length > 0);
            if (sections.length === 0) return null;
            return (
              <Card>
                <SectionTitle>Class features</SectionTitle>
                {sections.map((s) => (
                  <div key={s.slug} style={{ marginBottom: '0.75rem' }}>
                    {sections.length > 1 && (
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#666', marginBottom: '0.25rem', textTransform: 'capitalize' }}>{s.slug} L{s.level}</div>
                    )}
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                      {s.feats.map((f, i) => (
                        <li key={i} style={{ marginBottom: '0.2rem' }}>
                          <strong>L{f.level} {f.name}</strong> — <span style={{ color: '#555' }}>{f.desc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </Card>
            );
          })()}

          <Card>
            <SectionTitle>Currency</SectionTitle>
            <CurrencyEditor character={character} setCharacter={setCharacter} />
          </Card>

          <Card>
            {(() => {
              const carried = viewTotalWeight(character);
              const cap = carryCapacity(character);
              const overEncumbered = carried > cap;
              return (
                <>
                  <SectionTitle>Inventory</SectionTitle>
                  <div style={{ fontSize: '0.78rem', color: overEncumbered ? '#a44' : '#888', marginBottom: '0.5rem' }}>
                    Carried: <strong>{carried.toFixed(1)}</strong> / {cap} lb
                    {overEncumbered && <span style={{ marginLeft: '0.4rem' }}>⚠ over capacity</span>}
                  </div>
                </>
              );
            })()}
            <InventoryEditor character={character} setCharacter={setCharacter} />
          </Card>

          {(desc.backstory || desc.age || desc.eyes || (character.languages && character.languages.length > 0)) && (
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
              {character.languages && character.languages.length > 0 && (
                <div style={{ fontSize: '0.9rem', marginTop: '0.4rem' }}>
                  <span style={{ color: '#888', fontWeight: 600, marginRight: '0.4rem' }}>Languages:</span>
                  {character.languages.join(', ')}
                </div>
              )}
              {desc.backstory && (
                <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', fontSize: '0.95rem' }}>{desc.backstory}</div>
              )}
            </Card>
          )}

          {character.personality && (character.personality.traits || character.personality.ideals || character.personality.bonds || character.personality.flaws) && (
            <Card>
              <SectionTitle>Personality</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                {character.personality.traits && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Traits</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#444' }}>{character.personality.traits}</div>
                  </div>
                )}
                {character.personality.ideals && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Ideals</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#444' }}>{character.personality.ideals}</div>
                  </div>
                )}
                {character.personality.bonds && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Bonds</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#444' }}>{character.personality.bonds}</div>
                  </div>
                )}
                {character.personality.flaws && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Flaws</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#444' }}>{character.personality.flaws}</div>
                  </div>
                )}
              </div>
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

function humanize(slug: string): string {
  return slug.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function CurrencyEditor({
  character,
  setCharacter,
}: {
  character: Character;
  setCharacter: (c: Character) => void;
}) {
  const [saving, setSaving] = useState(false);
  const cur = character.currency ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  const colors: Record<string, string> = { pp: '#cad', gp: '#cb4', ep: '#bbb', sp: '#aab', cp: '#a85' };
  async function setValue(coin: 'pp' | 'gp' | 'ep' | 'sp' | 'cp', value: number) {
    setSaving(true);
    try {
      const next = { ...cur, [coin]: Math.max(0, Math.floor(value) || 0) };
      const updated = await updateCharacter(character.id, { currency: next });
      setCharacter(updated);
    } finally { setSaving(false); }
  }
  async function adjust(coin: 'pp' | 'gp' | 'ep' | 'sp' | 'cp', delta: number) {
    await setValue(coin, (cur[coin] ?? 0) + delta);
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
        {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((coin) => (
          <div key={coin} style={{ background: '#fafafa', border: `1px solid ${colors[coin]}`, borderRadius: 6, padding: '0.35rem 0.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: colors[coin], textTransform: 'uppercase', marginBottom: 2 }}>{coin}</div>
            <input type="number" value={cur[coin] ?? 0} min={0} disabled={saving}
              onChange={(e) => setValue(coin, Number(e.target.value))}
              style={{ width: '100%', padding: '0.15rem 0.2rem', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.85rem', textAlign: 'center', fontWeight: 700, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
              <button onClick={() => adjust(coin, -1)} disabled={saving || (cur[coin] ?? 0) === 0}
                style={{ flex: 1, padding: '0.1rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 2, background: '#fff', color: '#666' }}>−</button>
              <button onClick={() => adjust(coin, 1)} disabled={saving}
                style={{ flex: 1, padding: '0.1rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 2, background: '#fff', color: '#666' }}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#888' }}>
        Coin weight: {((cur.pp ?? 0) + (cur.gp ?? 0) + (cur.ep ?? 0) + (cur.sp ?? 0) + (cur.cp ?? 0)) / 50} lb
        <span style={{ color: '#bbb', marginLeft: '0.4rem' }}>(50 coins = 1 lb)</span>
      </div>
    </div>
  );
}

function InventoryEditor({
  character,
  setCharacter,
}: {
  character: Character;
  setCharacter: (c: Character) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftQty, setDraftQty] = useState('1');
  const [draftWeight, setDraftWeight] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Read via inventory_v2 with legacy fallback. The first write commits the converted
  // (or augmented) array as the new v2, effectively migrating the character implicitly.
  const items = viewInventory(character);

  async function persist(next: typeof items) {
    setSaving(true);
    try {
      const updated = await updateCharacter(character.id, { inventory_v2: next });
      setCharacter(updated);
    } finally {
      setSaving(false);
    }
  }

  async function addItem() {
    const name = draftName.trim();
    if (!name) return;
    const qty = Math.max(1, Math.min(999, parseInt(draftQty, 10) || 1));
    const weightNum = draftWeight.trim() === '' ? undefined : Math.max(0, parseFloat(draftWeight));
    const item = {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      quantity: qty,
      category: 'gear' as const,
      ...(typeof weightNum === 'number' && Number.isFinite(weightNum) ? { weight_lbs: weightNum } : {}),
      description: draftDesc.trim() || undefined,
    };
    await persist([...items, item]);
    setDraftName('');
    setDraftQty('1');
    setDraftWeight('');
    setDraftDesc('');
    setAdding(false);
  }

  async function adjustQty(idx: number, delta: number) {
    const next = items.slice();
    const cur = Math.max(1, (next[idx].quantity ?? 1) + delta);
    next[idx] = { ...next[idx], quantity: cur };
    await persist(next);
  }

  async function removeItem(idx: number) {
    if (!confirm(`Remove ${items[idx].name ?? 'this item'}?`)) return;
    await persist(items.filter((_, i) => i !== idx));
  }

  return (
    <>
      {items.length === 0 ? (
        <div style={{ color: '#888' }}>Empty.</div>
      ) : (
        items.map((item, i) => {
          const canToggleEquip = item.category === 'weapon' || item.category === 'armor';
          const toggleEquip = async () => {
            const next = items.slice();
            next[i] = { ...next[i], equipped: !next[i].equipped };
            await persist(next);
          };
          const catColors: Record<string, string> = {
            weapon: '#a83', armor: '#368', tool: '#666', gear: '#888',
            consumable: '#6a4', treasure: '#c83', other: '#999',
          };
          return (
          <details key={item.id ?? i} style={{ marginBottom: '0.4rem' }}>
            <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span title={item.category} style={{ fontSize: '0.6rem', color: '#fff', background: catColors[item.category] ?? '#888', borderRadius: 2, padding: '0.05rem 0.3rem', textTransform: 'uppercase', flexShrink: 0 }}>
                {item.category[0]}
              </span>
              <strong style={{ flex: 1 }}>
                {item.name ?? '(unnamed)'}
                {(item.quantity ?? 1) > 1 && <span style={{ color: '#888', fontWeight: 400 }}> ×{item.quantity}</span>}
                {item.weight_lbs && <span style={{ color: '#aaa', fontWeight: 400, fontSize: '0.78rem', marginLeft: '0.4rem' }}>{(item.weight_lbs * (item.quantity ?? 1)).toFixed(1)} lb</span>}
              </strong>
              {canToggleEquip && (
                <button onClick={(e) => { e.preventDefault(); toggleEquip(); }} disabled={saving}
                  title={item.equipped ? 'Equipped (click to unequip)' : 'Click to equip'}
                  style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', border: `1px solid ${item.equipped ? '#2a7' : '#ccc'}`, borderRadius: 3, background: item.equipped ? '#e7f7ec' : '#fff', color: item.equipped ? '#2a7' : '#888' }}>
                  {item.equipped ? '✓ Equipped' : 'Equip'}
                </button>
              )}
              <button onClick={(e) => { e.preventDefault(); adjustQty(i, -1); }} disabled={saving || (item.quantity ?? 1) <= 1}
                style={{ width: 22, height: 22, padding: 0, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 3, background: '#fff' }}>−</button>
              <button onClick={(e) => { e.preventDefault(); adjustQty(i, +1); }} disabled={saving}
                style={{ width: 22, height: 22, padding: 0, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 3, background: '#fff' }}>+</button>
              <button onClick={(e) => { e.preventDefault(); removeItem(i); }} disabled={saving}
                style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, background: '#fff', color: 'crimson' }}>×</button>
            </summary>
            {item.description && (
              <div style={{ fontSize: '0.9rem', marginTop: '0.25rem', color: '#555' }}>
                <MD text={String(item.description)} />
              </div>
            )}
          </details>
          );
        })
      )}

      {adding ? (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }}>
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Item name"
              style={{ flex: 2, padding: '0.3rem', fontSize: '0.85rem', border: '1px solid #ddd', borderRadius: 3 }} />
            <input value={draftQty} onChange={(e) => setDraftQty(e.target.value)} placeholder="Qty" type="number" min={1}
              style={{ width: 60, padding: '0.3rem', fontSize: '0.85rem', border: '1px solid #ddd', borderRadius: 3 }} />
            <input value={draftWeight} onChange={(e) => setDraftWeight(e.target.value)} placeholder="lb (each)" type="number" min={0} step={0.5}
              title="Weight per single item in pounds (multiplied by quantity for encumbrance)"
              style={{ width: 70, padding: '0.3rem', fontSize: '0.85rem', border: '1px solid #ddd', borderRadius: 3 }} />
          </div>
          <textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} placeholder="Description (optional)"
            rows={2} style={{ width: '100%', padding: '0.3rem', fontSize: '0.85rem', border: '1px solid #ddd', borderRadius: 3, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
            <button onClick={addItem} disabled={!draftName.trim() || saving}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.85rem', cursor: draftName.trim() ? 'pointer' : 'not-allowed', border: '1px solid #2a7', background: draftName.trim() ? '#e7f7ec' : '#f5f5f5', color: '#2a7', borderRadius: 3, fontWeight: 600 }}>
              Add
            </button>
            <button onClick={() => { setAdding(false); setDraftName(''); setDraftQty('1'); setDraftWeight(''); setDraftDesc(''); }}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.85rem', cursor: 'pointer', border: '1px solid #ccc', background: '#fff', color: '#666', borderRadius: 3 }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ marginTop: '0.5rem', padding: '0.3rem 0.7rem', fontSize: '0.85rem', cursor: 'pointer', border: '1px dashed #ccc', background: '#fff', color: '#666', borderRadius: 3 }}>
          + Add item
        </button>
      )}
    </>
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
  title, slugs, spellNames, preparedSet, showPreparedMark, spellAtk, spellDc, characterLevel,
}: {
  title: string;
  slugs: string[];
  spellNames: Record<string, { name: string; level: number; school?: string; desc?: string }>;
  preparedSet?: Set<string>;
  showPreparedMark?: boolean;
  spellAtk: number;
  spellDc: number;
  characterLevel: number;
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
      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#555', marginBottom: '0.4rem' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {sorted.map((slug) => {
          const meta = spellNames[slug];
          if (!meta) {
            return <div key={slug} style={{ fontSize: '0.85rem', color: '#aaa' }}>{slug}</div>;
          }
          const prepared = preparedSet?.has(slug);
          const isCantrip = meta.level === 0;
          const parsed = meta.desc ? parseSpellForAttack(meta.desc) : { mode: null, damageDice: null, damageType: null, saveAbility: null };
          const dice = isCantrip && parsed.damageDice
            ? scaleCantripDice(parsed.damageDice, characterLevel)
            : parsed.damageDice;

          return (
            <details key={slug} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 5, padding: '0.4rem 0.6rem' }}>
              <summary style={{ fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {showPreparedMark && <span style={{ color: prepared ? '#2a7' : '#bbb' }}>{prepared ? '●' : '○'}</span>}
                <span style={{ fontWeight: 600 }}>{meta.name}</span>
                <span style={{ color: '#999', fontSize: '0.78rem' }}>{isCantrip ? 'Cantrip' : `L${meta.level}`}{meta.school ? ` · ${meta.school}` : ''}</span>
              </summary>
              <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#444', lineHeight: 1.5 }}>
                {parsed.mode === 'spell_attack' && (
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.4rem', padding: '0.3rem 0.5rem', background: '#f0f4ff', borderRadius: 4, fontSize: '0.8rem' }}>
                    <span><strong>Attack:</strong> {formatModifier(spellAtk)} (1d20{formatModifier(spellAtk)})</span>
                    {dice && <span><strong>Damage:</strong> {dice}{parsed.damageType ? ` ${parsed.damageType}` : ''}</span>}
                  </div>
                )}
                {parsed.mode === 'save' && (
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.4rem', padding: '0.3rem 0.5rem', background: '#fff4e8', borderRadius: 4, fontSize: '0.8rem' }}>
                    <span><strong>Save:</strong> DC {spellDc}{parsed.saveAbility ? ` ${parsed.saveAbility.toUpperCase()}` : ''}</span>
                    {dice && <span><strong>Damage:</strong> {dice}{parsed.damageType ? ` ${parsed.damageType}` : ''}</span>}
                  </div>
                )}
                {meta.desc ? (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{meta.desc}</div>
                ) : (
                  <div style={{ color: '#aaa', fontStyle: 'italic' }}>No description available.</div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
function AttackRow({ name, subtitle, detail, attackLabel, damageLabel, damageType, extra }: {
  name: string;
  subtitle: string;
  detail?: string;
  attackLabel: string;
  damageLabel: string;
  damageType?: string;
  extra?: string;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.5rem 0.75rem',
      background: '#fafafa',
      borderRadius: 6,
      border: '1px solid #eee',
    }}>
      <div>
        <span style={{ fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: '0.8rem', color: '#999', marginLeft: '0.5rem' }}>{subtitle}</span>
        {detail && <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: '0.1rem' }}>{detail}</div>}
      </div>
      <div style={{ textAlign: 'center', minWidth: 48 }}>
        <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>Attack</div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{attackLabel}</div>
      </div>
      <div style={{ textAlign: 'center', minWidth: 80 }}>
        <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>Damage</div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
          {damageLabel}
          {damageType && <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#666', marginLeft: '0.25rem' }}>{damageType}</span>}
        </div>
        {extra && <div style={{ fontSize: '0.75rem', color: '#888' }}>{extra}</div>}
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
