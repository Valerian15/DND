import { useEffect, useState } from 'react';
import { getCharacter, getLibraryItem, updateCharacter } from '../character/api';
import { abilityModifier, formatModifier } from '../character/pointBuy';
import { proficiencyBonus, initiative, passivePerception } from '../character/rules';
import { getCasterConfig, preparedCount } from '../character/casters';
import type { CasterConfig } from '../character/casters';
import { SKILLS } from '../character/skills';
import { ABILITY_ORDER, ABILITY_NAMES } from '../character/types';
import type { Character, ClassResource } from '../character/types';
import { isWeaponProficient } from '../character/weaponProficiency';
import { parseSpellForAttack, scaleCantripDice } from '../character/attackUtils';
import { updateTokenHp } from './tokenApi';
import { socket } from '../../lib/socket';

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

interface SpellMeta {
  name: string;
  level: number;
  desc?: string;
  higher_level?: string;
  concentration?: boolean;
}

const HIT_DIE_BY_CLASS: Record<string, number> = {
  barbarian: 12, fighter: 10, paladin: 10, ranger: 10,
  bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
  sorcerer: 6, wizard: 6,
};

export const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious',
] as const;

export type Condition = typeof CONDITIONS[number];

export const CONDITION_COLORS: Record<string, string> = {
  blinded: '#555', charmed: '#c55a8a', deafened: '#7a7a55',
  exhaustion: '#7a5a3a', frightened: '#7a3a8a', grappled: '#7a5a2a',
  incapacitated: '#aa2222', invisible: '#4488aa', paralyzed: '#cc5500',
  petrified: '#5577aa', poisoned: '#228844', prone: '#997722',
  restrained: '#884422', stunned: '#cc6600', unconscious: '#222',
};

interface Props {
  characterId: number;
  tokenId: number;
  canEditHp: boolean;
  canEditConditions: boolean;
  conditions: string[];
  onConditionsChange: (conditions: string[]) => Promise<void>;
  onClose: () => void;
}

const ABILITY_SHORT: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

export function InGameSheet({ characterId, tokenId, canEditHp, canEditConditions, conditions, onConditionsChange, onClose }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [hpCurrent, setHpCurrent] = useState(0);
  const [hpInput, setHpInput] = useState('');
  const [hpInputMode, setHpInputMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [condSaving, setCondSaving] = useState(false);
  const [weaponData, setWeaponData] = useState<Record<string, WeaponData>>({});
  const [spellMeta, setSpellMeta] = useState<Record<string, SpellMeta>>({});
  const [page, setPage] = useState<'main' | 'spells'>('main');
  const [preparedSlugs, setPreparedSlugs] = useState<string[]>([]);
  const [preparingSaving, setPreparingSaving] = useState(false);
  const [upcastPicker, setUpcastPicker] = useState<string | null>(null);
  const [rollMode, setRollMode] = useState<'advantage' | 'normal' | 'disadvantage'>('normal');
  const [concentratingOn, setConcentratingOn] = useState<string | null>(null);
  const [slotsUsed, setSlotsUsed] = useState<Record<string, number>>({});
  const [hitDiceUsed, setHitDiceUsed] = useState(0);
  const [localResources, setLocalResources] = useState<ClassResource[]>([]);

  useEffect(() => {
    getCharacter(characterId)
      .then((c) => {
        setCharacter(c);
        setHpCurrent(c.hp_current);
        setPreparedSlugs(c.spells_prepared as string[]);
        setSlotsUsed(c.spell_slots_used ?? {});
        setHitDiceUsed(c.hit_dice_used ?? 0);
        setLocalResources(c.resources ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [characterId]);

  useEffect(() => {
    if (!character?.weapons?.length) return;
    const missing = character.weapons.filter((s) => !weaponData[s]);
    if (!missing.length) return;
    Promise.all(
      missing.map((slug) =>
        getLibraryItem<{ name: string; category: string; weapon_type: string; data: Record<string, unknown> }>('weapons', slug)
          .then((r) => ({
            slug, name: r.name,
            category: r.category ?? '', weapon_type: r.weapon_type ?? '',
            damage_dice: String(r.data.damage_dice ?? ''),
            damage_type: String(r.data.damage_type ?? ''),
            properties: Array.isArray(r.data.properties) ? (r.data.properties as string[]) : [],
            versatile_dice: r.data.versatile_dice ? String(r.data.versatile_dice) : undefined,
            range_normal: typeof r.data.range_normal === 'number' ? r.data.range_normal : undefined,
            range_long: typeof r.data.range_long === 'number' ? r.data.range_long : undefined,
          }))
          .catch(() => null),
      ),
    ).then((results) => setWeaponData((prev) => {
      const next = { ...prev };
      for (const r of results) if (r) next[r.slug] = r;
      return next;
    }));
  }, [character?.weapons]);

  useEffect(() => {
    if (!character) return;
    const slugs = Array.from(new Set([
      ...(character.spells_known as string[]),
      ...(character.spells_prepared as string[]),
    ]));
    const missing = slugs.filter((s) => !spellMeta[s]);
    if (!missing.length) return;
    Promise.all(
      missing.map((slug) =>
        getLibraryItem<{ name: string; level: number; data?: { desc?: string; higher_level?: string; concentration?: boolean | string; duration?: string } }>('spells', slug)
          .then((r) => {
            const conc = r.data?.concentration;
            const isConc = typeof conc === 'boolean' ? conc
              : typeof conc === 'string' ? (conc !== '' && conc !== 'no')
              : !!(r.data?.duration?.toLowerCase().includes('concentration'));
            return { slug, name: r.name, level: r.level, desc: r.data?.desc, higher_level: r.data?.higher_level, concentration: isConc };
          })
          .catch(() => null),
      ),
    ).then((results) => setSpellMeta((prev) => {
      const next = { ...prev };
      for (const r of results) if (r) next[r.slug] = r;
      return next;
    }));
  }, [character?.spells_known, character?.spells_prepared]);

  // Keep local HP in sync when socket updates arrive via parent
  useEffect(() => {
    if (character) setHpCurrent(character.hp_current);
  }, [character?.hp_current]);

  // Detect concentration removal — send chat notification naming the spell
  useEffect(() => {
    if (concentratingOn && !conditions.includes('concentration')) {
      socket.emit('chat:send', { body: `${character?.name ?? 'Character'} lost concentration on ${concentratingOn}.` });
      setConcentratingOn(null);
    }
  }, [conditions]);

  async function adjustHp(delta: number) {
    if (!character || saving) return;
    await commitHp(Math.max(0, Math.min(character.hp_max, hpCurrent + delta)));
  }

  async function commitHpInput() {
    if (!character) return;
    const val = parseInt(hpInput, 10);
    if (!isNaN(val)) await commitHp(Math.max(0, Math.min(character.hp_max, val)));
    setHpInputMode(false);
  }

  async function commitHp(next: number) {
    setSaving(true);
    try {
      const result = await updateTokenHp(tokenId, next);
      setHpCurrent(result.hp_current);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function toggleCondition(cond: string) {
    if (!canEditConditions || condSaving) return;
    const next = conditions.includes(cond)
      ? conditions.filter((c) => c !== cond)
      : [...conditions, cond];
    setCondSaving(true);
    try { await onConditionsChange(next); }
    finally { setCondSaving(false); }
  }

  async function togglePrepared(slug: string) {
    if (!character || preparingSaving) return;
    const config = getCasterConfig(character.class_slug);
    if (!config || config.model === 'known') return;
    const meta = spellMeta[slug];
    const isCantrip = (meta?.level ?? 0) === 0;
    const isCurrentlyPrepared = preparedSlugs.includes(slug);
    if (!isCurrentlyPrepared && !isCantrip) {
      const abilityMod = abilityModifier(character.abilities[config.ability]);
      const maxP = preparedCount(config, character.level, abilityMod);
      const countNonCantrip = preparedSlugs.filter((s) => (spellMeta[s]?.level ?? 0) > 0).length;
      if (countNonCantrip >= maxP) return;
    }
    const prev = preparedSlugs;
    const next = isCurrentlyPrepared
      ? preparedSlugs.filter((s) => s !== slug)
      : [...preparedSlugs, slug];
    setPreparedSlugs(next);
    setPreparingSaving(true);
    try {
      const updated = await updateCharacter(character.id, { spells_prepared: next });
      setCharacter((c) => c ? { ...c, spells_prepared: updated.spells_prepared } : c);
    } catch {
      setPreparedSlugs(prev);
    } finally {
      setPreparingSaving(false);
    }
  }

  function rollInChat(label: string, expression: string) {
    let expr = expression;
    if (rollMode !== 'normal' && /^1d20/.test(expression)) {
      expr = expression.replace('1d20', `1d20${rollMode === 'advantage' ? 'adv' : 'dis'}`);
    }
    socket.emit('chat:send', { body: `/roll ${expr}`, label });
    setRollMode('normal');
  }

  function parseUpcastBonus(hl: string): { n: number; die: number } | null {
    const m = hl.match(/(\d+)d(\d+)\s+(?:for each|per)\s+(?:slot\s+)?level\s+above/i);
    return m ? { n: parseInt(m[1]), die: parseInt(m[2]) } : null;
  }

  function buildCastDice(baseDice: string, hl: string | undefined, baseLevel: number, castLevel: number): string {
    if (!hl || castLevel <= baseLevel) return baseDice;
    const extra = castLevel - baseLevel;
    const bonus = parseUpcastBonus(hl);
    if (!bonus) return baseDice;
    const baseM = baseDice.match(/^(\d+)d(\d+)(.*)/);
    if (baseM && bonus.die === parseInt(baseM[2])) {
      return `${parseInt(baseM[1]) + bonus.n * extra}d${bonus.die}${baseM[3]}`;
    }
    return baseDice;
  }

  function slotLabel(n: number): string {
    return ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;
  }

  async function handleSlotClick(lvl: string, filled: boolean, max: number) {
    if (!character) return;
    const used = slotsUsed[lvl] ?? 0;
    const nextUsed = filled ? Math.min(max, used + 1) : Math.max(0, used - 1);
    const next = { ...slotsUsed, [lvl]: nextUsed };
    setSlotsUsed(next);
    try { await updateCharacter(character.id, { spell_slots_used: next }); }
    catch { setSlotsUsed(slotsUsed); }
  }

  async function rollHitDie(hitDie: number, conMod: number, totalHD: number) {
    if (!character || hitDiceUsed >= totalHD) return;
    const roll = Math.floor(Math.random() * hitDie) + 1;
    const heal = Math.max(1, roll + conMod);
    const nextHp = Math.min(character.hp_max, hpCurrent + heal);
    const nextUsed = hitDiceUsed + 1;
    setHpCurrent(nextHp);
    setHitDiceUsed(nextUsed);
    socket.emit('chat:send', { body: `${character.name} uses a Hit Die: rolls ${roll}${conMod !== 0 ? formatModifier(conMod) : ''} = +${heal} HP.` });
    try {
      await updateCharacter(character.id, { hp_current: nextHp, hit_dice_used: nextUsed });
      if (tokenId > 0) await updateTokenHp(tokenId, nextHp);
    } catch { /* ignore */ }
  }

  async function adjustResource(index: number, delta: number) {
    if (!character) return;
    const prev = localResources;
    const next = localResources.map((r, i) =>
      i === index ? { ...r, current: Math.max(0, Math.min(r.max, r.current + delta)) } : r
    );
    setLocalResources(next);
    try { await updateCharacter(character.id, { resources: next }); }
    catch { setLocalResources(prev); }
  }

  async function handleShortRest() {
    if (!character) return;
    const prev = localResources;
    const next = localResources.map((r) => r.reset === 'short' ? { ...r, current: r.max } : r);
    setLocalResources(next);
    socket.emit('chat:send', { body: `${character.name} takes a short rest.` });
    try { await updateCharacter(character.id, { resources: next }); }
    catch { setLocalResources(prev); }
  }

  async function handleLongRest() {
    if (!character) return;
    const nextHp = character.hp_max;
    const nextSlotsUsed: Record<string, number> = {};
    const nextHDUsed = 0;
    const nextResources = localResources.map((r) => ({ ...r, current: r.max }));
    setHpCurrent(nextHp);
    setSlotsUsed(nextSlotsUsed);
    setHitDiceUsed(nextHDUsed);
    setLocalResources(nextResources);
    socket.emit('chat:send', { body: `${character.name} takes a long rest. HP and resources restored.` });
    try {
      await updateCharacter(character.id, {
        hp_current: nextHp, spell_slots_used: nextSlotsUsed,
        hit_dice_used: nextHDUsed, resources: nextResources,
      });
      if (tokenId > 0) await updateTokenHp(tokenId, nextHp);
    } catch { /* ignore */ }
  }

  if (loading) return (
    <SheetOverlay onClose={onClose}>
      <div style={{ padding: '2rem', color: '#888' }}>Loading…</div>
    </SheetOverlay>
  );
  if (!character) return null;

  const prof = proficiencyBonus(character.level);
  const init = initiative(character.abilities);
  const profSkills = character.skills as Record<string, { proficient?: boolean }>;
  const profSaves = character.saves as Record<string, { proficient?: boolean }>;
  const perceptionProf = !!profSkills['perception']?.proficient;
  const passive = passivePerception(character.abilities, perceptionProf, prof);
  const hpPct = character.hp_max > 0 ? Math.max(0, Math.min(1, hpCurrent / character.hp_max)) : 0;
  const hpBarColor = hpPct > 0.5 ? '#4a4' : hpPct > 0.25 ? '#aa4' : '#a44';

  const config = getCasterConfig(character.class_slug);
  const isSpellcaster = config !== null;
  const configAbilityMod = config ? abilityModifier(character.abilities[config.ability]) : 0;
  const maxPreparedSpells = config && config.model !== 'known'
    ? preparedCount(config, character.level, configAbilityMod)
    : 0;
  const preparedNonCantrips = preparedSlugs.filter((s) => (spellMeta[s]?.level ?? 0) > 0).length;

  // Attacks section data
  const strMod = abilityModifier(character.abilities.str);
  const dexMod = abilityModifier(character.abilities.dex);
  const spellAtk = config ? prof + configAbilityMod : 0;
  const spellDc  = config ? 8 + spellAtk : 0;
  const spellSlugs = Array.from(new Set([
    ...(character.spells_known as string[]),
    ...(character.spells_prepared as string[]),
  ]));
  const damageSpells = spellSlugs
    .map((slug) => ({ slug, meta: spellMeta[slug] }))
    .filter(({ meta }) => meta?.desc && parseSpellForAttack(meta.desc).mode !== null);
  const hasWeapons = character.weapons?.length > 0;

  const hitDie = HIT_DIE_BY_CLASS[character.class_slug ?? ''] ?? 8;
  const totalHitDice = character.level;
  const remainingHitDice = Math.max(0, totalHitDice - hitDiceUsed);
  const conMod = abilityModifier(character.abilities.con);
  const hasResources = localResources.length > 0;

  const tabBar = isSpellcaster ? (
    <div style={{ display: 'flex', flexShrink: 0, background: '#fafafa', borderBottom: '1px solid #eee' }}>
      {(['main', 'spells'] as const).map((p) => (
        <button key={p} onClick={() => setPage(p)} style={{
          flex: 1, padding: '0.5rem 0', border: 'none',
          borderBottom: `2px solid ${page === p ? '#333' : 'transparent'}`,
          background: page === p ? '#fff' : 'transparent',
          fontWeight: page === p ? 700 : 400,
          cursor: 'pointer', fontSize: '0.82rem',
          color: page === p ? '#333' : '#888',
        }}>
          {p === 'main' ? 'Stats' : 'Spells'}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <SheetOverlay onClose={onClose} extra={tabBar}>
      {/* Header */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #eee', flexShrink: 0 }}>
        {character.portrait_url ? (
          <img src={character.portrait_url} alt={character.name} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #ddd' }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#4a8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.3rem', fontWeight: 700, flexShrink: 0 }}>
            {character.name[0]}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{character.name}</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>
            Level {character.level}{character.class_slug ? ` · ${character.class_slug}` : ''}{character.race_slug ? ` · ${character.race_slug}` : ''}
          </div>
        </div>
      </div>

      {page === 'main' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>

          {/* HP */}
          <Section title="Hit Points">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              {canEditHp && <HpBtn label="−10" onClick={() => adjustHp(-10)} disabled={saving || hpCurrent === 0} />}
              {canEditHp && <HpBtn label="−5" onClick={() => adjustHp(-5)} disabled={saving || hpCurrent === 0} />}
              {canEditHp && <HpBtn label="−1" onClick={() => adjustHp(-1)} disabled={saving || hpCurrent === 0} />}
              {hpInputMode && canEditHp ? (
                <input type="number" value={hpInput} onChange={(e) => setHpInput(e.target.value)}
                  onBlur={commitHpInput}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitHpInput(); if (e.key === 'Escape') setHpInputMode(false); }}
                  autoFocus style={{ width: 52, textAlign: 'center', padding: '0.25rem', border: '1px solid #aaa', borderRadius: 4, fontSize: '1.1rem', fontWeight: 700 }} />
              ) : (
                <div onClick={canEditHp ? () => { setHpInput(String(hpCurrent)); setHpInputMode(true); } : undefined}
                  style={{ minWidth: 52, textAlign: 'center', fontSize: '1.3rem', fontWeight: 700, cursor: canEditHp ? 'text' : 'default', padding: '0.1rem 0.3rem', borderRadius: 4 }}
                  title={canEditHp ? 'Click to set HP directly' : undefined}>
                  {hpCurrent}
                </div>
              )}
              <span style={{ color: '#888', fontSize: '0.9rem' }}>/ {character.hp_max}</span>
              {character.hp_temp > 0 && <span style={{ fontSize: '0.82rem', color: '#55a' }}>+{character.hp_temp} temp</span>}
              {canEditHp && <HpBtn label="+1" onClick={() => adjustHp(1)} disabled={saving || hpCurrent >= character.hp_max} />}
              {canEditHp && <HpBtn label="+5" onClick={() => adjustHp(5)} disabled={saving || hpCurrent >= character.hp_max} />}
              {canEditHp && <HpBtn label="+10" onClick={() => adjustHp(10)} disabled={saving || hpCurrent >= character.hp_max} />}
            </div>
            <div style={{ height: 8, background: '#ddd', borderRadius: 4 }}>
              <div style={{ height: '100%', width: `${hpPct * 100}%`, background: hpBarColor, borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
          </Section>

          {/* Conditions */}
          <Section title={`Conditions${canEditConditions ? '' : ' (view only)'}`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {CONDITIONS.map((cond) => {
                const active = conditions.includes(cond);
                return (
                  <button key={cond} onClick={() => toggleCondition(cond)} disabled={!canEditConditions || condSaving}
                    style={{
                      padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: active ? 700 : 400,
                      border: `1px solid ${active ? CONDITION_COLORS[cond] : '#ddd'}`,
                      background: active ? CONDITION_COLORS[cond] : '#f9f9f9',
                      color: active ? '#fff' : '#888',
                      cursor: canEditConditions ? 'pointer' : 'default',
                      textTransform: 'capitalize',
                    }}>
                    {cond}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Combat */}
          <Section title="Combat">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
              {[
                { label: 'AC', value: character.ac },
                { label: 'Initiative', value: formatModifier(init) },
                { label: 'Prof', value: formatModifier(prof) },
                { label: 'Passive Perc', value: passive },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f5f5f5', borderRadius: 6, padding: '0.4rem 0.25rem' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>{value}</div>
                  <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Attacks */}
          {(hasWeapons || damageSpells.length > 0) && (
            <Section title="Attacks">
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {character.weapons?.map((slug) => {
                  const w = weaponData[slug];
                  if (!w) return <div key={slug} style={{ fontSize: '0.8rem', color: '#aaa' }}>{slug}</div>;
                  const proficient = isWeaponProficient(character.class_slug, slug, w.category);
                  const isFinesse = w.properties.includes('finesse');
                  const isRanged = w.weapon_type === 'Ranged';
                  const abilityMod = isRanged ? dexMod : isFinesse ? Math.max(strMod, dexMod) : strMod;
                  const damageMod  = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod;
                  const attackBonus = abilityMod + (proficient ? prof : 0);
                  const damageStr = w.damage_dice
                    ? `${w.damage_dice}${damageMod !== 0 ? formatModifier(damageMod) : ''}`
                    : '—';
                  const atkExpr = `1d20${formatModifier(attackBonus)}`;
                  const dmgExpr = w.damage_dice
                    ? `${w.damage_dice}${damageMod !== 0 ? formatModifier(damageMod) : ''}`
                    : null;
                  return (
                    <InGameAttackRow key={slug} name={w.name} tag={`${w.category} ${w.weapon_type}`}
                      attackLabel={formatModifier(attackBonus)} damageLabel={damageStr} damageType={w.damage_type}
                      extra={w.versatile_dice ? `${w.versatile_dice}${formatModifier(damageMod)} 2H` : undefined}
                      onRoll={() => {
                        rollInChat(`${w.name} — Attack`, atkExpr);
                        if (dmgExpr) setTimeout(() => rollInChat(`${w.name} — Damage`, dmgExpr), 80);
                      }} />
                  );
                })}

                {damageSpells.map(({ slug, meta }) => {
                  const parsed = parseSpellForAttack(meta!.desc!);
                  const isCantrip = meta!.level === 0;
                  const spellBaseLevel = meta!.level;
                  const baseDice = isCantrip && parsed.damageDice
                    ? scaleCantripDice(parsed.damageDice, character.level)
                    : parsed.damageDice;

                  const slots = character.spell_slots;
                  const availableLevels = isCantrip ? [] : Object.entries(slots)
                    .filter(([l, c]) => Number(l) >= spellBaseLevel && (c - (slotsUsed[l] ?? 0)) > 0)
                    .map(([l]) => Number(l))
                    .sort((a, b) => a - b);
                  const canUpcast = availableLevels.length > 1;
                  const showPicker = upcastPicker === slug;

                  let attackLabel: string;
                  let tag: string;
                  if (parsed.mode === 'spell_attack') {
                    attackLabel = formatModifier(spellAtk);
                    tag = isCantrip ? 'Cantrip · spell atk' : `L${spellBaseLevel} spell · spell atk`;
                  } else if (parsed.mode === 'save') {
                    attackLabel = `DC ${spellDc}`;
                    tag = `${isCantrip ? 'Cantrip' : `L${spellBaseLevel} spell`} · ${parsed.saveAbility} save`;
                  } else {
                    attackLabel = '—';
                    tag = isCantrip ? 'Cantrip' : `L${spellBaseLevel} spell`;
                  }

                  const performRoll = async (castLevel: number) => {
                    const finalDice = baseDice ? buildCastDice(baseDice, meta!.higher_level, spellBaseLevel, castLevel) : null;
                    const lvlSuffix = castLevel > spellBaseLevel ? ` (${slotLabel(castLevel)})` : '';
                    if (parsed.mode === 'spell_attack') {
                      rollInChat(`${meta!.name}${lvlSuffix} — Spell Attack`, `1d20${formatModifier(spellAtk)}`);
                      if (finalDice) setTimeout(() => rollInChat(`${meta!.name}${lvlSuffix} — Damage`, finalDice), 80);
                    } else if (parsed.mode === 'save') {
                      if (finalDice) rollInChat(`${meta!.name}${lvlSuffix} — Damage (DC ${spellDc} ${parsed.saveAbility})`, finalDice);
                    } else {
                      if (finalDice) rollInChat(`${meta!.name}${lvlSuffix} — Damage`, finalDice);
                    }
                    // Concentration: auto-add condition when casting a concentration spell
                    if (meta?.concentration && !conditions.includes('concentration')) {
                      setConcentratingOn(meta.name);
                      try { await onConditionsChange([...conditions, 'concentration']); }
                      catch { /* ignore */ }
                    }
                    setUpcastPicker(null);
                  };

                  return (
                    <div key={slug}>
                      <InGameAttackRow name={meta!.name} tag={tag}
                        attackLabel={attackLabel} damageLabel={baseDice ?? '—'} damageType={parsed.damageType ?? ''}
                        onRoll={() => {
                          if (isCantrip || !canUpcast) {
                            performRoll(availableLevels[0] ?? spellBaseLevel);
                          } else {
                            setUpcastPicker(showPicker ? null : slug);
                          }
                        }} />
                      {showPicker && (
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.3rem 0.5rem', background: '#f0f4ff', borderRadius: 4, border: '1px solid #ccd', marginTop: 2 }}>
                          <span style={{ fontSize: '0.7rem', color: '#558', fontWeight: 600 }}>Cast at:</span>
                          {availableLevels.map((lvl) => (
                            <button key={lvl} onClick={() => performRoll(lvl)}
                              style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', borderRadius: 3, border: '1px solid #aac', background: lvl > spellBaseLevel ? '#e8eeff' : '#fff', cursor: 'pointer', fontWeight: 600, color: '#336' }}>
                              {slotLabel(lvl)}{lvl > spellBaseLevel ? ' ↑' : ''}
                            </button>
                          ))}
                          <button onClick={() => setUpcastPicker(null)} style={{ marginLeft: 'auto', padding: '0.15rem 0.35rem', fontSize: '0.7rem', border: '1px solid #ddd', borderRadius: 3, cursor: 'pointer', color: '#999', background: '#fff' }}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Roll Mode (Advantage / Disadvantage) */}
          <Section title="Roll Mode">
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: rollMode !== 'normal' ? '0.3rem' : 0 }}>
              {(['advantage', 'normal', 'disadvantage'] as const).map((mode) => (
                <button key={mode} onClick={() => setRollMode(mode)} style={{
                  flex: 1, padding: '0.3rem 0.2rem', fontSize: '0.75rem', borderRadius: 4,
                  border: `1px solid ${rollMode === mode ? '#3366cc' : '#ddd'}`,
                  background: rollMode === mode ? (mode === 'advantage' ? '#e0f5e0' : mode === 'disadvantage' ? '#f5e0e0' : '#ddeeff') : '#fff',
                  color: rollMode === mode ? (mode === 'advantage' ? '#2a6' : mode === 'disadvantage' ? '#a24' : '#2244aa') : '#888',
                  fontWeight: rollMode === mode ? 700 : 400, cursor: 'pointer',
                }}>
                  {mode === 'advantage' ? 'Adv' : mode === 'normal' ? '— Normal' : 'Dis'}
                </button>
              ))}
            </div>
            {rollMode !== 'normal' && (
              <div style={{ fontSize: '0.7rem', color: rollMode === 'advantage' ? '#2a6' : '#a24', textAlign: 'center' }}>
                {rollMode === 'advantage' ? '2d20 take high' : '2d20 take low'} — resets after next roll
              </div>
            )}
          </Section>

          {/* Spell Slot Tracker */}
          {isSpellcaster && Object.keys(character.spell_slots).length > 0 && (
            <Section title="Spell Slots">
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {Object.entries(character.spell_slots)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([lvl, max]) => {
                    const used = slotsUsed[lvl] ?? 0;
                    const available = Math.max(0, max - used);
                    return (
                      <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.68rem', color: '#888', minWidth: 26, textAlign: 'right', fontWeight: 600 }}>{slotLabel(Number(lvl))}</span>
                        <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', flex: 1 }}>
                          {Array.from({ length: max }, (_, i) => {
                            const filled = i < available;
                            return (
                              <button key={i} onClick={() => handleSlotClick(lvl, filled, max)}
                                title={filled ? 'Click to spend slot' : 'Click to recover slot'}
                                style={{
                                  width: 18, height: 18, borderRadius: '50%', border: '2px solid',
                                  borderColor: filled ? '#4477cc' : '#ccc',
                                  background: filled ? '#4477cc' : 'transparent',
                                  cursor: 'pointer', padding: 0, flexShrink: 0,
                                }} />
                            );
                          })}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#aaa', minWidth: 28, textAlign: 'right' }}>{available}/{max}</span>
                      </div>
                    );
                  })}
              </div>
            </Section>
          )}

          {/* Hit Dice Tracker */}
          <Section title="Hit Dice">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: '#444' }}>
                d{hitDie} · <strong>{remainingHitDice}</strong> / {totalHitDice} remaining
              </span>
              <button disabled={remainingHitDice === 0} onClick={() => rollHitDie(hitDie, conMod, totalHitDice)}
                style={{
                  padding: '0.25rem 0.6rem', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: 4,
                  cursor: remainingHitDice === 0 ? 'not-allowed' : 'pointer',
                  background: remainingHitDice === 0 ? '#f5f5f5' : '#fff',
                  color: remainingHitDice === 0 ? '#bbb' : '#333', fontWeight: 600,
                }}>
                Roll HD
              </button>
            </div>
          </Section>

          {/* Class Resource Tracker */}
          {hasResources && (
            <Section title="Resources">
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                {localResources.map((res, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <button onClick={() => adjustResource(i, -1)} disabled={res.current <= 0}
                        style={{ width: 22, height: 22, border: '1px solid #ccc', borderRadius: 3, cursor: res.current <= 0 ? 'not-allowed' : 'pointer', background: res.current <= 0 ? '#f5f5f5' : '#fff', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1, padding: 0 }}>−</button>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, minWidth: 36, textAlign: 'center' }}>{res.current}/{res.max}</span>
                      <button onClick={() => adjustResource(i, 1)} disabled={res.current >= res.max}
                        style={{ width: 22, height: 22, border: '1px solid #ccc', borderRadius: 3, cursor: res.current >= res.max ? 'not-allowed' : 'pointer', background: res.current >= res.max ? '#f5f5f5' : '#fff', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1, padding: 0 }}>+</button>
                    </div>
                    <span style={{ fontSize: '0.62rem', color: '#bbb', minWidth: 18, textAlign: 'right' }}>{res.reset === 'long' ? 'LR' : 'SR'}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Abilities */}
          <Section title="Abilities">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem', textAlign: 'center' }}>
              {ABILITY_ORDER.map((key) => {
                const score = character.abilities[key];
                const mod = abilityModifier(score);
                return (
                  <div key={key} style={{ background: '#f5f5f5', borderRadius: 6, padding: '0.4rem 0.2rem' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{formatModifier(mod)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#555' }}>{score}</div>
                    <div style={{ fontSize: '0.6rem', color: '#999', marginTop: 1 }}>{ABILITY_SHORT[key]}</div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Saving Throws */}
          <Section title="Saving Throws">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem 1rem' }}>
              {ABILITY_ORDER.map((key) => {
                const mod = abilityModifier(character.abilities[key]);
                const isProficient = !!(profSaves[key] as any)?.proficient;
                const total = mod + (isProficient ? prof : 0);
                return (
                  <div key={key} onClick={() => rollInChat(`${ABILITY_NAMES[key]} Save`, `1d20${formatModifier(total)}`)}
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.15rem 0.3rem', borderRadius: 3, cursor: 'pointer' }}
                    title={`Roll ${ABILITY_NAMES[key]} saving throw`}>
                    <span style={{ color: '#444', fontWeight: isProficient ? 600 : 400 }}>
                      {isProficient ? '◆ ' : '◇ '}{ABILITY_NAMES[key].slice(0, 3)}
                    </span>
                    <span style={{ fontWeight: 600 }}>{formatModifier(total)}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Skills */}
          <Section title="Skills">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.15rem 1rem' }}>
              {SKILLS.map((sk) => {
                const mod = abilityModifier(character.abilities[sk.ability]);
                const isProficient = !!(profSkills[sk.key] as any)?.proficient;
                const total = mod + (isProficient ? prof : 0);
                return (
                  <div key={sk.key} onClick={() => rollInChat(`${sk.name} Check`, `1d20${formatModifier(total)}`)}
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.1rem 0.3rem', borderRadius: 3, cursor: 'pointer' }}
                    title={`Roll ${sk.name} check`}>
                    <span style={{ color: '#444', fontWeight: isProficient ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isProficient ? '◆ ' : '◇ '}{sk.name}
                    </span>
                    <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>{formatModifier(total)}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          {character.notes && (
            <Section title="Notes">
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#555', whiteSpace: 'pre-wrap' }}>{character.notes}</p>
            </Section>
          )}

          {/* Rests */}
          <Section title="Rests">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleShortRest} style={{
                flex: 1, padding: '0.4rem', fontSize: '0.82rem', border: '1px solid #bbb',
                borderRadius: 4, cursor: 'pointer', background: '#fff', fontWeight: 600, color: '#555',
              }}>
                Short Rest
              </button>
              <button onClick={handleLongRest} style={{
                flex: 1, padding: '0.4rem', fontSize: '0.82rem', border: '1px solid #445',
                borderRadius: 4, cursor: 'pointer', background: '#445', color: '#fff', fontWeight: 700,
              }}>
                Long Rest
              </button>
            </div>
          </Section>
        </div>
      ) : (
        <SpellsPageContent
          character={character}
          config={config!}
          spellMeta={spellMeta}
          preparedSlugs={preparedSlugs}
          preparedNonCantrips={preparedNonCantrips}
          maxPrepared={maxPreparedSpells}
          onToggle={togglePrepared}
          saving={preparingSaving}
        />
      )}
    </SheetOverlay>
  );
}

function SheetOverlay({ children, onClose, extra }: { children: React.ReactNode; onClose: () => void; extra?: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.2)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 101, width: 380, background: '#fff', boxShadow: '-4px 0 16px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderBottom: '1px solid #eee', flexShrink: 0, background: '#fafafa' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Character Sheet</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        {extra}
        {children}
      </div>
    </>
  );
}

interface SpellsPageProps {
  character: Character;
  config: CasterConfig;
  spellMeta: Record<string, SpellMeta>;
  preparedSlugs: string[];
  preparedNonCantrips: number;
  maxPrepared: number;
  onToggle: (slug: string) => void;
  saving: boolean;
}

function SpellsPageContent({ character, config, spellMeta, preparedSlugs, preparedNonCantrips, maxPrepared, onToggle, saving }: SpellsPageProps) {
  const knownSlugs = character.spells_known as string[];
  const isPreparedModel = config.model !== 'known';
  const atLimit = preparedNonCantrips >= maxPrepared;

  const byLevel: Record<number, string[]> = {};
  for (const slug of knownSlugs) {
    const level = spellMeta[slug]?.level;
    if (level === undefined) continue;
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(slug);
  }

  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);

  const levelLabel = (l: number) => {
    if (l === 0) return 'Cantrips';
    const ord = ['1st', '2nd', '3rd'][l - 1] ?? `${l}th`;
    return `${ord} Level`;
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
      {isPreparedModel && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '0.75rem', padding: '0.45rem 0.75rem',
          background: atLimit ? '#f0ffe0' : '#f5f5f5',
          borderRadius: 6,
          border: `1px solid ${atLimit ? '#88cc88' : '#e0e0e0'}`,
        }}>
          <span style={{ fontSize: '0.8rem', color: '#555', fontWeight: 600 }}>
            {config.model === 'spellbook' ? 'Prepared from spellbook' : 'Spells prepared'}
          </span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: atLimit ? '#338833' : '#333' }}>
            {preparedNonCantrips} / {maxPrepared}
          </span>
        </div>
      )}

      {!isPreparedModel && (
        <div style={{ marginBottom: '0.75rem', padding: '0.4rem 0.75rem', background: '#f5f5f5', borderRadius: 6, fontSize: '0.78rem', color: '#666' }}>
          All known spells are always available.
        </div>
      )}

      {levels.length === 0 ? (
        <div style={{ color: '#888', fontSize: '0.85rem', padding: '0.5rem 0' }}>
          No spells yet — add them in the character editor.
        </div>
      ) : (
        levels.map((level) => {
          const slugsAtLevel = [...byLevel[level]].sort((a, b) =>
            (spellMeta[a]?.name ?? a).localeCompare(spellMeta[b]?.name ?? b),
          );
          return (
            <div key={level} style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', borderBottom: '1px solid #eee', paddingBottom: '0.2rem' }}>
                {levelLabel(level)}
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                {slugsAtLevel.map((slug) => {
                  const meta = spellMeta[slug];
                  const isCantrip = level === 0;
                  const isPrepared = preparedSlugs.includes(slug);
                  const cannotAdd = !isPrepared && !isCantrip && atLimit;

                  return (
                    <div key={slug} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.3rem 0.5rem',
                      background: (isPrepared || isCantrip) ? '#f0f5ff' : '#f9f9f9',
                      borderRadius: 4,
                      border: `1px solid ${(isPrepared || isCantrip) ? '#c8d8f0' : '#eee'}`,
                    }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: (isPrepared || isCantrip) ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
                        {meta?.name ?? slug}
                      </span>
                      {isCantrip ? (
                        <span style={{ fontSize: '0.7rem', color: '#7788bb', fontStyle: 'italic', flexShrink: 0 }}>always</span>
                      ) : isPreparedModel ? (
                        <button
                          onClick={() => onToggle(slug)}
                          disabled={saving || cannotAdd}
                          style={{
                            padding: '0.15rem 0.4rem',
                            fontSize: '0.75rem',
                            borderRadius: 3,
                            flexShrink: 0,
                            border: isPrepared ? '1px solid #4488cc' : '1px solid #ccc',
                            background: isPrepared ? '#ddeeff' : cannotAdd ? '#f5f5f5' : '#fff',
                            color: isPrepared ? '#2266aa' : cannotAdd ? '#bbb' : '#555',
                            cursor: saving || cannotAdd ? 'not-allowed' : 'pointer',
                            fontWeight: isPrepared ? 700 : 400,
                          }}
                        >
                          {isPrepared ? '✓ Prep' : 'Prepare'}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function InGameAttackRow({ name, tag, attackLabel, damageLabel, damageType, extra, onRoll }: {
  name: string; tag: string; attackLabel: string;
  damageLabel: string; damageType?: string; extra?: string; onRoll?: () => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.5rem', background: '#f7f7f7', borderRadius: 5, border: '1px solid #eee' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: '0.7rem', color: '#999' }}>{tag}</div>
        {extra && <div style={{ fontSize: '0.7rem', color: '#aaa' }}>{extra}</div>}
      </div>
      <div style={{ textAlign: 'center', minWidth: 40 }}>
        <div style={{ fontSize: '0.6rem', color: '#aaa', textTransform: 'uppercase' }}>Atk</div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{attackLabel}</div>
      </div>
      <div style={{ textAlign: 'center', minWidth: 64 }}>
        <div style={{ fontSize: '0.6rem', color: '#aaa', textTransform: 'uppercase' }}>Dmg</div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          {damageLabel}
          {damageType && <span style={{ fontSize: '0.65rem', fontWeight: 400, color: '#888', marginLeft: '0.2rem' }}>{damageType}</span>}
        </div>
      </div>
      {onRoll && (
        <button onClick={onRoll} title="Roll" style={{ padding: '0.25rem 0.35rem', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>🎲</button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem', borderBottom: '1px solid #eee', paddingBottom: '0.2rem' }}>{title}</div>
      {children}
    </div>
  );
}

function HpBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '0.25rem 0.4rem', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? '#f5f5f5' : '#fff', color: disabled ? '#bbb' : '#333', fontWeight: 600, lineHeight: 1 }}>
      {label}
    </button>
  );
}
