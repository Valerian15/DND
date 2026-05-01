import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { socket } from '../../lib/socket';
import { getCharacter, getLibraryItem, updateCharacter } from '../character/api';
import { abilityModifier, formatModifier } from '../character/pointBuy';
import { proficiencyBonus } from '../character/rules';
import { getCasterConfig } from '../character/casters';
import { isWeaponProficient } from '../character/weaponProficiency';
import { parseSpellForAttack, scaleCantripDice } from '../character/attackUtils';
import { isHealingSpell, buildHealDice } from './spellEffects';
import type { Character, ClassResource } from '../character/types';

type RollMode = 'advantage' | 'normal' | 'disadvantage';

interface Props {
  characterId: number;
  tokenId: number;
  selectedTargetIds: number[];
  combatAutomation: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  /** Reports the bar's actual rendered height (in px) so the page can lift fixed overlays
   *  (dice log, etc.) above it. Fires on mount + whenever the bar resizes (e.g. row 1 toggles). */
  onHeightChange?: (h: number) => void;
}

interface WeaponData {
  slug: string;
  name: string;
  category: string;
  weapon_type: string;
  damage_dice: string;
  damage_type: string;
  properties: string[];
  versatile_dice?: string;
}

interface SpellMeta {
  slug: string;
  name: string;
  level: number;
  desc?: string;
  higher_level?: string;
  concentration?: boolean;
}

// Find the lowest unspent slot of at least the given level. Cantrips return 0.
function lowestAvailableSlot(
  baseLevel: number,
  spellSlots: Record<string, number>,
  slotsUsed: Record<string, number>,
): number | null {
  if (baseLevel === 0) return 0;
  for (let l = baseLevel; l <= 9; l++) {
    const max = spellSlots[String(l)] ?? 0;
    const used = slotsUsed[String(l)] ?? 0;
    if (max > used) return l;
  }
  return null;
}

// Mirrors the upcast scaling in InGameSheet.buildCastDice.
function buildCastDice(baseDice: string, hl: string | undefined, baseLevel: number, castLevel: number): string {
  if (!hl || castLevel <= baseLevel) return baseDice;
  const extra = castLevel - baseLevel;
  const m = hl.match(/(\d+)d(\d+)\s+(?:for each|per)\s+(?:slot\s+)?level\s+above/i);
  const bonus = m ? { n: parseInt(m[1]), die: parseInt(m[2]) } : null;
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

export function QuickCastHotbar({ characterId, tokenId, selectedTargetIds, combatAutomation, hidden, onToggleHidden, onHeightChange }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [weaponData, setWeaponData] = useState<Record<string, WeaponData>>({});
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Report the bar's actual rendered height on mount + whenever it resizes. Uses useLayoutEffect
  // so the measurement happens before paint — otherwise the dice log can overlap the hotbar for
  // a frame after the bar grows (e.g. spells finish loading, row 1 toggles).
  // ResizeObserver catches genuine size changes; the layoutEffect re-runs whenever React commits
  // a render so async content updates also report correctly.
  useLayoutEffect(() => {
    if (!onHeightChange) return;
    const el = wrapperRef.current;
    if (!el) { onHeightChange(0); return; }
    const measure = () => onHeightChange(Math.ceil(el.getBoundingClientRect().height));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => { ro.disconnect(); };
  });
  const [spellMeta, setSpellMeta] = useState<Record<string, SpellMeta>>({});
  // Roll mode: 'advantage' / 'normal' / 'disadvantage'. Resets to 'normal' after the next cast/attack.
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  // Upcast picker — when set, render a popover at (x, y) listing available slot levels for `slug`.
  const [upcastPicker, setUpcastPicker] = useState<{ slug: string; x: number; y: number } | null>(null);

  useEffect(() => {
    getCharacter(characterId).then(setCharacter).catch(() => setCharacter(null));
  }, [characterId]);

  // Refetch character when the player opens then closes the InGameSheet, since slot/HP edits
  // happen there. Cheap heuristic: refetch on window focus.
  useEffect(() => {
    function refetch() { getCharacter(characterId).then(setCharacter).catch(() => {}); }
    window.addEventListener('focus', refetch);
    return () => window.removeEventListener('focus', refetch);
  }, [characterId]);

  // Auto-refetch character when the server resets this character's per-turn flags (start of turn).
  useEffect(() => {
    function onTurnReset(data: { character_id: number }) {
      if (data.character_id !== characterId) return;
      getCharacter(characterId).then(setCharacter).catch(() => {});
    }
    socket.on('character:turn_reset', onTurnReset);
    return () => { socket.off('character:turn_reset', onTurnReset); };
  }, [characterId]);

  useEffect(() => {
    if (!character) return;
    const slugs = character.weapons ?? [];
    // The library endpoint returns weapon stats nested under `data` — flatten them here so
    // the rest of the hotbar can treat the WeaponData shape as flat.
    Promise.all(slugs.map((s) =>
      getLibraryItem<{ slug: string; name: string; category: string; weapon_type: string; data: Record<string, unknown> }>('weapons', s)
        .then((r): WeaponData => ({
          slug: r.slug,
          name: r.name,
          category: r.category ?? '',
          weapon_type: r.weapon_type ?? '',
          damage_dice: String(r.data.damage_dice ?? ''),
          damage_type: String(r.data.damage_type ?? ''),
          properties: Array.isArray(r.data.properties) ? (r.data.properties as string[]) : [],
          versatile_dice: r.data.versatile_dice ? String(r.data.versatile_dice) : undefined,
        }))
        .catch(() => null)
    )).then((results) => {
      const next: Record<string, WeaponData> = {};
      for (const r of results) if (r) next[r.slug] = r;
      setWeaponData(next);
    });
  }, [character?.weapons]);

  useEffect(() => {
    if (!character) return;
    const slugs = Array.from(new Set([...(character.spells_known ?? []), ...(character.spells_prepared ?? [])]));
    // Library spells nest desc/higher_level/concentration under `data`. Flatten + unwrap.
    Promise.all(slugs.map((s) =>
      getLibraryItem<{ slug: string; name: string; level: number; data?: { desc?: string; higher_level?: string; concentration?: boolean | string; duration?: string } }>('spells', s)
        .then((r): SpellMeta => {
          const conc = r.data?.concentration;
          const isConc = typeof conc === 'boolean' ? conc
            : typeof conc === 'string' ? (conc !== '' && conc !== 'no')
            : !!(r.data?.duration?.toLowerCase().includes('concentration'));
          return {
            slug: r.slug,
            name: r.name,
            level: r.level,
            desc: r.data?.desc,
            higher_level: r.data?.higher_level,
            concentration: isConc,
          };
        })
        .catch(() => null)
    )).then((results) => {
      const next: Record<string, SpellMeta> = {};
      for (const r of results) if (r) next[r.slug] = r;
      setSpellMeta(next);
    });
  }, [character?.spells_known, character?.spells_prepared]);

  if (!character || !tokenId) return null;

  // ───────── Derived caster stats ─────────
  const config = getCasterConfig(character.class_slug);
  const castMod = config ? abilityModifier(character.abilities[config.ability]) : 0;
  const profBonus = proficiencyBonus(character.level);
  const spellAtk = config ? castMod + profBonus : 0;
  const spellDc = config ? 8 + castMod + profBonus : 0;
  const strMod = abilityModifier(character.abilities.str);
  const dexMod = abilityModifier(character.abilities.dex);
  const slotsUsed = (character.spell_slots_used ?? {}) as Record<string, number>;

  // ───────── Action handlers ─────────
  // Read current rollMode and reset it back to 'normal' — used right before emitting an attack.
  function consumeRollMode(): RollMode {
    const m = rollMode;
    if (m !== 'normal') setRollMode('normal');
    return m;
  }

  // Optimistically increment spell_slots_used[level] locally + persist via PATCH. Used by castSpell
  // for any non-cantrip cast so the slot badge updates immediately in the UI.
  async function spendSlot(level: number) {
    if (!character || level < 1) return;
    const cur = (character.spell_slots_used ?? {}) as Record<string, number>;
    const next = { ...cur, [String(level)]: (cur[String(level)] ?? 0) + 1 };
    setCharacter({ ...character, spell_slots_used: next });
    try { await updateCharacter(character.id, { spell_slots_used: next }); }
    catch { getCharacter(character.id).then(setCharacter).catch(() => {}); }
  }

  // Toggle one of the three per-turn action-economy flags (action / bonus / reaction).
  // Optimistic local update + persist via PATCH; rollback on failure.
  async function toggleEconomy(field: 'action_used' | 'bonus_used' | 'reaction_used') {
    if (!character) return;
    const next = character[field] ? 0 : 1;
    setCharacter({ ...character, [field]: next });
    try { await updateCharacter(character.id, { [field]: next }); }
    catch { getCharacter(character.id).then(setCharacter).catch(() => {}); }
  }

  // Persist a resource change (Rage, Bardic Inspiration, etc.). Optimistic + rollback on failure.
  async function changeResource(idx: number, delta: number) {
    if (!character) return;
    const arr = character.resources ?? [];
    const r = arr[idx]; if (!r) return;
    const nextCurrent = Math.max(0, Math.min(r.max, r.current + delta));
    if (nextCurrent === r.current) return;
    const nextArr = arr.map((x, i) => i === idx ? { ...x, current: nextCurrent } : x);
    setCharacter({ ...character, resources: nextArr });
    try { await updateCharacter(character.id, { resources: nextArr }); }
    catch { getCharacter(character.id).then(setCharacter).catch(() => {}); }
  }

  function castWeapon(w: WeaponData) {
    if (!character) return;
    const isFinesse = w.properties.includes('finesse');
    const isRanged = w.weapon_type === 'Ranged';
    const proficient = isWeaponProficient(character.class_slug, w.slug, w.category);
    const abilityMod = isRanged ? dexMod : isFinesse ? Math.max(strMod, dexMod) : strMod;
    const damageMod = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod;
    const attackBonus = abilityMod + (proficient ? profBonus : 0);
    const dmgExpr = w.damage_dice
      ? `${w.damage_dice}${damageMod !== 0 ? formatModifier(damageMod) : ''}`
      : null;
    const mode = consumeRollMode();

    if (combatAutomation && selectedTargetIds.length > 0 && dmgExpr) {
      socket.emit('combat:resolve_attack', {
        caster_token_id: tokenId,
        target_token_ids: selectedTargetIds,
        attack_name: w.name,
        attack_bonus: attackBonus,
        damage_dice: dmgExpr,
        damage_type: w.damage_type,
        roll_mode: mode,
      });
    } else {
      // Fallback: post atk + dmg rolls in chat without auto-resolve. We bake adv/dis into the dice
      // expression so /roll honours it server-side.
      const advSuffix = mode === 'advantage' ? 'adv' : mode === 'disadvantage' ? 'dis' : '';
      const atkExpr = `1d20${advSuffix}${formatModifier(attackBonus)}`;
      socket.emit('chat:send', { body: `/roll ${atkExpr}`, label: `${w.name} — Attack` });
      if (dmgExpr) setTimeout(() => socket.emit('chat:send', { body: `/roll ${dmgExpr}`, label: `${w.name} — Damage` }), 80);
    }
  }

  // Cast `meta` at a specific slot level. Used by both the default click (lowest available) and
  // by the right-click upcast picker.
  function castSpellAtLevel(meta: SpellMeta, castLevel: number) {
    if (!character || !config) return;
    const slug = meta.slug;
    const baseLevel = meta.level;
    const isCantrip = baseLevel === 0;
    const lvlSuffix = !isCantrip && castLevel > baseLevel ? ` (${slotLabel(castLevel)})` : '';
    const parsed = meta.desc ? parseSpellForAttack(meta.desc) : null;
    const baseDice = (isCantrip && parsed?.damageDice)
      ? scaleCantripDice(parsed.damageDice, character.level)
      : parsed?.damageDice ?? null;
    const finalDice = baseDice ? buildCastDice(baseDice, meta.higher_level, baseLevel, castLevel) : null;
    const mode = consumeRollMode();

    let emitted = false;

    // Healing spells
    if (combatAutomation && isHealingSpell(slug) && selectedTargetIds.length > 0) {
      const healDice = buildHealDice(slug, castLevel, baseLevel, castMod);
      if (healDice) {
        socket.emit('combat:resolve_heal', {
          caster_token_id: tokenId,
          target_token_ids: selectedTargetIds,
          spell_name: `${meta.name}${lvlSuffix}`,
          heal_dice: healDice,
        });
        emitted = true;
      }
    }
    // Magic Missile auto-hit
    else if (combatAutomation && slug === 'magic-missile' && finalDice && selectedTargetIds.length > 0) {
      const dartCount = Math.max(3, castLevel + 2);
      socket.emit('combat:resolve_auto_hit', {
        caster_token_id: tokenId,
        target_token_ids: selectedTargetIds,
        attack_name: `${meta.name}${lvlSuffix}`,
        hit_count: dartCount,
        damage_dice: finalDice,
        damage_type: parsed?.damageType ?? 'force',
      });
      emitted = true;
    }
    // Spell attack (Fire Bolt, Eldritch Blast)
    else if (combatAutomation && parsed?.mode === 'spell_attack' && finalDice && selectedTargetIds.length > 0) {
      socket.emit('combat:resolve_attack', {
        caster_token_id: tokenId,
        target_token_ids: selectedTargetIds,
        attack_name: `${meta.name}${lvlSuffix}`,
        attack_bonus: spellAtk,
        damage_dice: finalDice,
        damage_type: parsed.damageType ?? '',
        is_spell: true,
        roll_mode: mode,
      });
      emitted = true;
    }
    // Save-based damage (Fireball, Sacred Flame)
    else if (combatAutomation && parsed?.mode === 'save' && finalDice && parsed.saveAbility && selectedTargetIds.length > 0) {
      const saveAbility = parsed.saveAbility.toLowerCase() as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
      socket.emit('combat:resolve_spell', {
        caster_token_id: tokenId,
        target_token_ids: selectedTargetIds,
        spell_name: `${meta.name}${lvlSuffix}`,
        save_ability: saveAbility,
        save_dc: spellDc,
        damage_dice: finalDice,
        damage_type: parsed.damageType ?? '',
        half_on_save: true,
      });
      emitted = true;
    }
    // Fallback / utility spell — just announce the cast in chat. Player handles effects manually.
    else {
      socket.emit('chat:send', { body: `/action ${character.name} casts ${meta.name}${lvlSuffix}.` });
      emitted = true;
    }

    // Spend the slot if a non-cantrip was actually emitted.
    if (emitted && !isCantrip) spendSlot(castLevel);
  }

  // Default click — cast at the lowest available slot.
  function castSpell(meta: SpellMeta) {
    if (!character) return;
    const castLevel = lowestAvailableSlot(meta.level, character.spell_slots ?? {}, slotsUsed);
    if (castLevel === null) return;
    castSpellAtLevel(meta, castLevel);
  }

  // ───────── Buttons to render ─────────
  const weapons = (character.weapons ?? [])
    .map((slug) => weaponData[slug])
    .filter((w): w is WeaponData => !!w);

  const knownSlugs = (character.spells_known ?? []) as string[];
  const preparedSlugs = (character.spells_prepared ?? []) as string[];
  const isPreparedModel = config?.model !== 'known';

  // For prepared casters: cantrips (level 0) always available + currently prepared spells.
  // For known casters: everything in spells_known is castable.
  const castable = knownSlugs
    .map((s) => spellMeta[s])
    .filter((m): m is SpellMeta => !!m)
    .filter((m) => m.level === 0 || (isPreparedModel ? preparedSlugs.includes(m.slug) : true))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const cantrips = castable.filter((m) => m.level === 0);
  const leveledSpells = castable.filter((m) => m.level > 0);

  // ───────── Render ─────────
  // When hidden the bar takes no layout space — the user toggles it via the top-bar button.
  if (hidden) return null;

  const totalButtons = weapons.length + cantrips.length + leveledSpells.length;
  if (totalButtons === 0) return null;

  const resources: ClassResource[] = character.resources ?? [];

  // Normal block at the bottom of the page-flex column. Containers above (main-area) shrink to
  // make room, so chat / DM notes / map controls all sit above the hotbar instead of behind it.
  return (
    <>
      <div ref={wrapperRef} style={{
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'rgba(28,26,22,0.95)', borderTop: '1px solid #4a4538', color: '#fff',
      }}>
        {/* Row 1 — state strip: always shown so Adv/Dis chips are reachable for every character.
            Resource trackers appear here only when the character has any. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.6rem', borderBottom: '1px solid #3a342b', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.6rem', color: '#776', textTransform: 'uppercase', fontWeight: 700 }}>Roll</span>
            {(['advantage', 'normal', 'disadvantage'] as const).map((m) => (
              <button key={m} onClick={() => setRollMode(m)}
                title={m === 'advantage' ? '2d20 take high — resets after next roll' : m === 'disadvantage' ? '2d20 take low — resets after next roll' : 'Standard 1d20'}
                style={{
                  padding: '0.15rem 0.45rem', fontSize: '0.7rem', borderRadius: 3, cursor: 'pointer',
                  border: `1px solid ${rollMode === m ? (m === 'advantage' ? '#5d5' : m === 'disadvantage' ? '#d55' : '#88a') : '#4a4538'}`,
                  background: rollMode === m ? (m === 'advantage' ? '#1f3a1f' : m === 'disadvantage' ? '#3a1f1f' : '#1f2540') : 'transparent',
                  color: rollMode === m ? '#fff' : '#888', fontWeight: rollMode === m ? 700 : 500,
                }}>
                {m === 'advantage' ? 'Adv' : m === 'normal' ? 'Norm' : 'Dis'}
              </button>
            ))}
            <span style={{ width: 1, height: 16, background: '#3a342b', margin: '0 0.2rem' }} />
            {([
              { field: 'action_used' as const, label: 'Action', short: '⚔' },
              { field: 'bonus_used' as const, label: 'Bonus', short: '◆' },
              { field: 'reaction_used' as const, label: 'Reaction', short: '↺' },
            ]).map(({ field, label, short }) => {
              const used = !!character[field];
              return (
                <button key={field} onClick={() => toggleEconomy(field)}
                  title={`${label} ${used ? 'used — click to recover' : 'available — click to spend'} (auto-resets at the start of your turn)`}
                  style={{
                    padding: '0.15rem 0.4rem', fontSize: '0.7rem', borderRadius: 3, cursor: 'pointer',
                    border: `1px solid ${used ? '#5a3a2a' : '#3a4a3a'}`,
                    background: used ? '#2a1f18' : '#1f2a1f',
                    color: used ? '#a55' : '#7c7', fontWeight: 600, textDecoration: used ? 'line-through' : undefined,
                  }}>
                  {short} {label}
                </button>
              );
            })}
            {resources.length > 0 && <span style={{ width: 1, height: 16, background: '#3a342b', margin: '0 0.2rem' }} />}
            {resources.map((r, idx) => (
              <div key={r.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.1rem 0.35rem', borderRadius: 3, border: '1px solid #4a4538', background: r.current === 0 ? '#2a1818' : '#1f1c18', flexShrink: 0 }}>
                <button onClick={() => changeResource(idx, -1)} disabled={r.current === 0}
                  title={`Spend 1 ${r.name}`}
                  style={{ width: 16, height: 16, padding: 0, fontSize: '0.7rem', border: 'none', borderRadius: 2, background: r.current === 0 ? 'transparent' : '#3a342b', color: r.current === 0 ? '#555' : '#cbb', cursor: r.current === 0 ? 'not-allowed' : 'pointer', lineHeight: 1 }}>−</button>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: r.current === 0 ? '#a55' : '#cbb' }}>{r.name} {r.current}/{r.max}</span>
                <button onClick={() => changeResource(idx, +1)} disabled={r.current === r.max}
                  title={`Recover 1 ${r.name}`}
                  style={{ width: 16, height: 16, padding: 0, fontSize: '0.7rem', border: 'none', borderRadius: 2, background: r.current === r.max ? 'transparent' : '#3a342b', color: r.current === r.max ? '#555' : '#cbb', cursor: r.current === r.max ? 'not-allowed' : 'pointer', lineHeight: 1 }}>+</button>
              </div>
            ))}
            <button onClick={onToggleHidden} title="Hide hotbar"
              style={{ marginLeft: 'auto', flexShrink: 0, padding: '0.15rem 0.5rem', fontSize: '0.7rem', borderRadius: 3, background: 'transparent', color: '#888', border: '1px solid #444', cursor: 'pointer' }}>
              ✕
            </button>
          </div>

        {/* Row 2 — left column: Weapons stacked over Cantrips. Right column: Spells, taking the
            remaining horizontal space so they can wrap into multiple lines without scrolling. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.35rem 0.6rem' }}>
          {(weapons.length > 0 || cantrips.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flexShrink: 0 }}>
              {weapons.length > 0 && (
                <SectionGroup label="Weapons">
                  {weapons.map((w) => {
                    const proficient = isWeaponProficient(character.class_slug, w.slug, w.category);
                    const isFinesse = w.properties.includes('finesse');
                    const isRanged = w.weapon_type === 'Ranged';
                    const abilityMod = isRanged ? dexMod : isFinesse ? Math.max(strMod, dexMod) : strMod;
                    const atk = abilityMod + (proficient ? profBonus : 0);
                    return (
                      <HotbarButton key={w.slug}
                        title={`${w.name} — ${formatModifier(atk)} to hit, ${w.damage_dice} ${w.damage_type}${selectedTargetIds.length === 0 ? ' (select targets to auto-resolve)' : ''}`}
                        color="#8a5a4a"
                        onClick={() => castWeapon(w)}>
                        ⚔ {w.name} <Badge>{formatModifier(atk)}</Badge>
                      </HotbarButton>
                    );
                  })}
                </SectionGroup>
              )}
              {cantrips.length > 0 && (
                <SectionGroup label="Cantrips">
                  {cantrips.map((m) => (
                    <HotbarButton key={m.slug}
                      title={`${m.name}${m.concentration ? ' (concentration)' : ''}`}
                      color="#5a7aa0"
                      onClick={() => castSpell(m)}>
                      ⚡ {m.name}
                    </HotbarButton>
                  ))}
                </SectionGroup>
              )}
            </div>
          )}
          {leveledSpells.length > 0 && (
            // Spells get their own column that takes the remaining horizontal space and wraps
            // its buttons. The label sits above; every spell-button row starts at the same x
            // (the column's left edge), so wrapping looks like a tidy grid instead of jumping back to 0.
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '0.6rem', color: '#776', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Spells</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                {leveledSpells.map((m) => {
                  const slot = lowestAvailableSlot(m.level, character.spell_slots ?? {}, slotsUsed);
                  const noSlot = slot === null;
                  // Available upcast levels for the picker — anything ≥ baseLevel with a free slot.
                  const availableLevels: number[] = [];
                  for (let l = m.level; l <= 9; l++) {
                    const max = (character.spell_slots ?? {})[String(l)] ?? 0;
                    const used = slotsUsed[String(l)] ?? 0;
                    if (max > used) availableLevels.push(l);
                  }
                  const canUpcast = availableLevels.length > 1;
                  return (
                    <HotbarButton key={m.slug}
                      title={
                        noSlot
                          ? `${m.name} — no L${m.level}+ slot available`
                          : `${m.name} — casts at ${slotLabel(slot!)}${canUpcast ? ' (right-click to pick slot)' : ''}${m.concentration ? ' · concentration' : ''}`
                      }
                      color="#7a5a9a"
                      disabled={noSlot}
                      onClick={() => castSpell(m)}
                      onContextMenu={canUpcast ? (e) => {
                        e.preventDefault();
                        setUpcastPicker({ slug: m.slug, x: e.clientX, y: e.clientY });
                      } : undefined}>
                      📜 {m.name} <Badge>L{slot ?? m.level}</Badge>
                    </HotbarButton>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upcast picker — popover near right-clicked spell button. */}
      {upcastPicker && (() => {
        const meta = spellMeta[upcastPicker.slug];
        if (!meta) return null;
        const levels: number[] = [];
        for (let l = meta.level; l <= 9; l++) {
          const max = (character.spell_slots ?? {})[String(l)] ?? 0;
          const used = slotsUsed[String(l)] ?? 0;
          if (max > used) levels.push(l);
        }
        return (
          <>
            {/* Backdrop catches outside clicks to close. */}
            <div onClick={() => setUpcastPicker(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'transparent' }} />
            <div style={{
              position: 'fixed', left: Math.max(8, upcastPicker.x - 80), top: Math.max(8, upcastPicker.y - 90),
              zIndex: 50, background: '#1f1c18', border: '1px solid #4a4538', borderRadius: 5, padding: '0.4rem',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '0.2rem',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#998', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                Cast {meta.name} at:
              </div>
              {levels.map((l) => (
                <button key={l} onClick={() => { castSpellAtLevel(meta, l); setUpcastPicker(null); }}
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer', border: '1px solid #5a4538', borderRadius: 3, background: l > meta.level ? '#3a2d3a' : '#2a261f', color: '#fff', textAlign: 'left' }}>
                  {slotLabel(l)} {l > meta.level && <span style={{ color: '#aaa', fontSize: '0.7rem' }}>↑ upcast</span>}
                </button>
              ))}
            </div>
          </>
        );
      })()}
    </>
  );
}

function SectionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
      <span style={{ fontSize: '0.6rem', color: '#776', textTransform: 'uppercase', fontWeight: 700, marginRight: '0.2rem' }}>{label}</span>
      {children}
    </div>
  );
}

function HotbarButton({ title, color, onClick, disabled, children }: {
  title: string; color: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        padding: '0.3rem 0.55rem', fontSize: '0.78rem', borderRadius: 4,
        background: disabled ? '#2c2a26' : color, color: disabled ? '#666' : '#fff',
        border: `1px solid ${disabled ? '#3a3833' : color}`, cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
      }}>
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '0.65rem', padding: '0.05rem 0.3rem', borderRadius: 3, background: 'rgba(255,255,255,0.18)', fontWeight: 700 }}>
      {children}
    </span>
  );
}
