import { useEffect, useRef, useState } from 'react';
import { getCharacter, getLibraryItem, updateCharacter } from '../character/api';
import { abilityModifier, formatModifier } from '../character/pointBuy';
import { proficiencyBonus, initiative, passivePerception } from '../character/rules';
import { getCasterConfig, preparedCount } from '../character/casters';
import type { CasterConfig } from '../character/casters';
import { SKILLS } from '../character/skills';
import { ABILITY_ORDER, ABILITY_NAMES } from '../character/types';
import type { Character, ClassResource, TimedEffect } from '../character/types';
import { parseSpellDurationRounds, getSpellConditions, isHealingSpell, buildHealDice } from './spellEffects';
import { TokenAuraControl } from './TokenAuraControl';
import { isWeaponProficientForClasses } from '../character/weaponProficiency';
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
  duration?: string;
}

interface InventoryItem {
  id: string;
  source?: string;
  name: string;
  quantity: number;
  description?: string;
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
  blinded: '#555', charmed: '#c55a8a', concentration: '#6644aa', deafened: '#7a7a55',
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
  effects: { name: string; rounds: number }[];
  currentRound: number;
  selectedTargetIds: number[];
  /** When true, casting save-based damage spells routes to the server's auto-resolver. */
  combatAutomation: boolean;
  auraRadius?: number | null;
  auraColor?: string | null;
  onConditionsChange: (conditions: string[]) => Promise<void>;
  onTargetConditionsChange?: (tokenId: number, conditions: string[]) => void;
  getTokenConditions?: (tokenId: number) => string[];
  onClose: () => void;
}

const ABILITY_SHORT: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

function slotLabel(n: number): string {
  return ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;
}

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

export function InGameSheet({ characterId, tokenId, canEditHp, canEditConditions, conditions, effects, currentRound, selectedTargetIds, combatAutomation, auraRadius = null, auraColor = null, onConditionsChange, onTargetConditionsChange, getTokenConditions, onClose }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [hpCurrent, setHpCurrent] = useState(0);
  const [hpInput, setHpInput] = useState('');
  const [hpInputMode, setHpInputMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [condSaving, setCondSaving] = useState(false);
  const [weaponData, setWeaponData] = useState<Record<string, WeaponData>>({});
  const [spellMeta, setSpellMeta] = useState<Record<string, SpellMeta>>({});
  const [page, setPage] = useState<'main' | 'inventory' | 'spells'>('main');
  const [localInventory, setLocalInventory] = useState<InventoryItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [localCurrency, setLocalCurrency] = useState<{ pp: number; gp: number; ep: number; sp: number; cp: number }>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  // Action-economy flags now live on the character (DB-backed) so the hotbar and sheet share
  // a single source of truth and the server can auto-reset them on `initiative:next_turn`.
  const [localFeats, setLocalFeats] = useState<string[]>([]);
  const [localPersonality, setLocalPersonality] = useState<{ traits: string; ideals: string; bonds: string; flaws: string }>({ traits: '', ideals: '', bonds: '', flaws: '' });
  const [featDetails, setFeatDetails] = useState<Record<string, { name: string; desc?: string; prerequisite?: string; effects_desc?: string[] }>>({});
  const [preparedSlugs, setPreparedSlugs] = useState<string[]>([]);
  const [preparingSaving, setPreparingSaving] = useState(false);
  const [rollMode, setRollMode] = useState<'advantage' | 'normal' | 'disadvantage'>('normal');
  const [powerAttack, setPowerAttack] = useState(false);
  const [concentratingOn, setConcentratingOn] = useState<string | null>(null);
  const [slotsUsed, setSlotsUsed] = useState<Record<string, number>>({});
  const [hitDiceUsed, setHitDiceUsed] = useState(0);
  const [localResources, setLocalResources] = useState<ClassResource[]>([]);
  const [deathSavesSuccess, setDeathSavesSuccess] = useState(0);
  const [deathSavesFailure, setDeathSavesFailure] = useState(0);
  const [inspiration, setInspiration] = useState(0);
  const [luckyUsed, setLuckyUsed] = useState(0);
  const [exhaustion, setExhaustion] = useState(0);
  const [newEffectName, setNewEffectName] = useState('');
  const [newEffectRounds, setNewEffectRounds] = useState('10');

  useEffect(() => {
    getCharacter(characterId)
      .then((c) => {
        setCharacter(c);
        setHpCurrent(c.hp_current);
        setPreparedSlugs(c.spells_prepared as string[]);
        setSlotsUsed(c.spell_slots_used ?? {});
        setHitDiceUsed(c.hit_dice_used ?? 0);
        setLocalResources(c.resources ?? []);
        setLocalInventory(((c.inventory ?? []) as InventoryItem[]).map((i) => ({
          id: i.id ?? `it-${Date.now()}-${Math.random()}`,
          source: i.source,
          name: i.name ?? 'Unnamed',
          quantity: typeof i.quantity === 'number' ? i.quantity : 1,
          description: i.description,
        })));
        setLocalCurrency({
          pp: c.currency?.pp ?? 0, gp: c.currency?.gp ?? 0, ep: c.currency?.ep ?? 0,
          sp: c.currency?.sp ?? 0, cp: c.currency?.cp ?? 0,
        });
        setDeathSavesSuccess(c.death_saves_success ?? 0);
        setDeathSavesFailure(c.death_saves_failure ?? 0);
        setInspiration(c.inspiration ?? 0);
        setLuckyUsed(c.lucky_used ?? 0);
        setExhaustion(c.exhaustion_level ?? 0);

        setLocalFeats(c.feats ?? []);
        setLocalPersonality({
          traits: c.personality?.traits ?? '',
          ideals: c.personality?.ideals ?? '',
          bonds: c.personality?.bonds ?? '',
          flaws: c.personality?.flaws ?? '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [characterId]);

  // Load detail for any selected feat slug we haven't fetched yet
  useEffect(() => {
    const missing = localFeats.filter((s) => !featDetails[s]);
    if (missing.length === 0) return;
    Promise.all(missing.map((slug) =>
      getLibraryItem<{ name: string; data: { desc?: string; prerequisite?: string; effects_desc?: string[] } }>('feats', slug)
        .then((r) => ({ slug, name: r.name, ...r.data }))
        .catch(() => null),
    )).then((results) => {
      setFeatDetails((prev) => {
        const next = { ...prev };
        for (const r of results) if (r) next[r.slug] = r;
        return next;
      });
    });
  }, [localFeats, featDetails]);

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
            return { slug, name: r.name, level: r.level, desc: r.data?.desc, higher_level: r.data?.higher_level, concentration: isConc, duration: r.data?.duration };
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

  // Reflect HP changes pushed by combat auto-resolvers (damage / heal) on this token
  useEffect(() => {
    if (!tokenId) return;
    function onHp(data: { token_id: number; hp_current: number }) {
      if (data.token_id === tokenId) setHpCurrent(data.hp_current);
    }
    socket.on('token:hp_updated', onHp);
    return () => { socket.off('token:hp_updated', onHp); };
  }, [tokenId]);

  // Refetch character when the server resets per-turn flags so the action-economy chips update.
  useEffect(() => {
    function onTurnReset(data: { character_id: number }) {
      if (data.character_id !== characterId) return;
      getCharacter(characterId).then(setCharacter).catch(() => {});
    }
    socket.on('character:turn_reset', onTurnReset);
    return () => { socket.off('character:turn_reset', onTurnReset); };
  }, [characterId]);

  // Detect concentration removal — send chat notification naming the spell
  useEffect(() => {
    if (concentratingOn && !conditions.includes('concentration')) {
      socket.emit('chat:send', { body: `/action ${character?.name ?? 'Character'} lost concentration on ${concentratingOn}.` });
      setConcentratingOn(null);
    }
  }, [conditions]);

  async function adjustHp(delta: number) {
    if (!character || saving) return;
    const damage = delta < 0 ? Math.abs(delta) : 0;
    await commitHp(Math.max(0, Math.min(character.hp_max, hpCurrent + delta)), damage);
  }

  async function commitHpInput() {
    if (!character) return;
    const val = parseInt(hpInput, 10);
    if (!isNaN(val)) {
      const next = Math.max(0, Math.min(character.hp_max, val));
      const damage = val < hpCurrent ? hpCurrent - val : 0;
      await commitHp(next, damage);
    }
    setHpInputMode(false);
  }

  async function commitHp(next: number, damage = 0) {
    setSaving(true);
    try {
      const result = await updateTokenHp(tokenId, next);
      const resolved = result.hp_current;
      setHpCurrent(resolved);

      if (conditions.includes('concentration')) {
        if (resolved === 0) {
          // Unconscious — concentration ends, no save
          socket.emit('chat:send', { body: `/action ${character!.name} dropped to 0 HP — concentration on ${concentratingOn ?? 'their spell'} ends.` });
          try { await onConditionsChange(conditions.filter((c) => c !== 'concentration')); } catch { /* ignore */ }
        } else if (damage > 0) {
          // Con save: DC = max(10, half damage)
          const conModLocal = abilityModifier(character!.abilities.con);
          const dc = Math.max(10, Math.floor(damage / 2));
          const roll = Math.floor(Math.random() * 20) + 1;
          const total = roll + conModLocal;
          if (total < dc) {
            socket.emit('chat:send', { body: `/action ${character!.name} failed concentration save (rolled ${total} vs DC ${dc}) — ${concentratingOn ?? 'spell'} ends.` });
            try { await onConditionsChange(conditions.filter((c) => c !== 'concentration')); } catch { /* ignore */ }
          } else {
            socket.emit('chat:send', { body: `/action ${character!.name} maintained concentration (rolled ${total} vs DC ${dc}).` });
          }
        }
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function toggleCondition(cond: string) {
    if (!canEditConditions || condSaving) return;
    let next = conditions.includes(cond)
      ? conditions.filter((c) => c !== cond)
      : [...conditions, cond];
    // Conditions that impose Incapacitated → break concentration
    const BREAKS_CONCENTRATION = new Set(['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']);
    if (BREAKS_CONCENTRATION.has(cond) && !conditions.includes(cond) && next.includes('concentration')) {
      socket.emit('chat:send', { body: `/action ${character?.name} became ${cond} — concentration on ${concentratingOn ?? 'their spell'} ends.` });
      next = next.filter((c) => c !== 'concentration');
    }
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

  async function handleSlotClick(lvl: string, filled: boolean, max: number) {
    if (!character) return;
    const used = slotsUsed[lvl] ?? 0;
    const nextUsed = filled ? Math.min(max, used + 1) : Math.max(0, used - 1);
    const next = { ...slotsUsed, [lvl]: nextUsed };
    setSlotsUsed(next);
    try { await updateCharacter(character.id, { spell_slots_used: next }); }
    catch { setSlotsUsed(slotsUsed); }
  }

  /**
   * Roll one hit die. `classSlug` picks which class's pool to spend from (matters for multiclass).
   * Falls back to the character's primary class for legacy single-class.
   */
  async function rollHitDie(classSlug: string) {
    if (!character) return;
    const die = HIT_DIE_BY_CLASS[classSlug] ?? 8;
    const conMod = abilityModifier(character.abilities.con);

    const cls = character.classes ?? [];
    if (cls.length > 0) {
      const target = cls.find((c) => c.slug === classSlug);
      if (!target || target.hit_dice_used >= target.level) return;
      const roll = Math.floor(Math.random() * die) + 1;
      const heal = Math.max(1, roll + conMod);
      const nextHp = Math.min(character.hp_max, hpCurrent + heal);
      const nextClasses = cls.map((c) => c.slug === classSlug ? { ...c, hit_dice_used: c.hit_dice_used + 1 } : c);
      setHpCurrent(nextHp);
      socket.emit('chat:send', { body: `/action ${character.name} uses a ${classSlug} Hit Die: rolls ${roll}${conMod !== 0 ? formatModifier(conMod) : ''} = +${heal} HP.` });
      try {
        await updateCharacter(character.id, { hp_current: nextHp, classes: nextClasses });
        if (tokenId > 0) await updateTokenHp(tokenId, nextHp);
      } catch { /* ignore */ }
      // Mirror the legacy single-class counter for backward-compat consumers.
      if (classSlug === (cls[0]?.slug ?? '')) setHitDiceUsed(target.hit_dice_used + 1);
      return;
    }
    // Legacy single-class path
    const totalHD = character.level;
    if (hitDiceUsed >= totalHD) return;
    const roll = Math.floor(Math.random() * die) + 1;
    const heal = Math.max(1, roll + conMod);
    const nextHp = Math.min(character.hp_max, hpCurrent + heal);
    const nextUsed = hitDiceUsed + 1;
    setHpCurrent(nextHp);
    setHitDiceUsed(nextUsed);
    socket.emit('chat:send', { body: `/action ${character.name} uses a Hit Die: rolls ${roll}${conMod !== 0 ? formatModifier(conMod) : ''} = +${heal} HP.` });
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

  async function saveInventory(next: InventoryItem[]) {
    if (!character) return;
    const prev = localInventory;
    setLocalInventory(next);
    try { await updateCharacter(character.id, { inventory: next }); }
    catch { setLocalInventory(prev); }
  }

  async function adjustItemQty(id: string, delta: number) {
    const next = localInventory
      .map((i) => i.id === id ? { ...i, quantity: i.quantity + delta } : i)
      .filter((i) => i.quantity > 0);
    await saveInventory(next);
  }

  async function removeItem(id: string) {
    await saveInventory(localInventory.filter((i) => i.id !== id));
  }

  async function addItem() {
    const name = newItemName.trim();
    if (!name) return;
    const qty = Math.max(1, Number(newItemQty) || 1);
    const item: InventoryItem = {
      id: `it-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name, quantity: qty,
      description: newItemDesc.trim() || undefined,
    };
    setNewItemName(''); setNewItemQty('1'); setNewItemDesc('');
    await saveInventory([...localInventory, item]);
  }

  async function adjustCurrency(coin: 'pp' | 'gp' | 'ep' | 'sp' | 'cp', delta: number) {
    if (!character) return;
    const next = { ...localCurrency, [coin]: Math.max(0, localCurrency[coin] + delta) };
    const prev = localCurrency;
    setLocalCurrency(next);
    try { await updateCharacter(character.id, { currency: next }); }
    catch { setLocalCurrency(prev); }
  }

  async function setCurrencyValue(coin: 'pp' | 'gp' | 'ep' | 'sp' | 'cp', value: number) {
    if (!character) return;
    const next = { ...localCurrency, [coin]: Math.max(0, Math.floor(value) || 0) };
    const prev = localCurrency;
    setLocalCurrency(next);
    try { await updateCharacter(character.id, { currency: next }); }
    catch { setLocalCurrency(prev); }
  }


  async function handleDeathSave(type: 'success' | 'failure', count = 1) {
    if (!character || hpCurrent > 0) return;
    if (type === 'success') {
      const next = Math.min(3, deathSavesSuccess + count);
      setDeathSavesSuccess(next);
      try { await updateCharacter(character.id, { death_saves_success: next }); } catch { /* ignore */ }
    } else {
      const next = Math.min(3, deathSavesFailure + count);
      setDeathSavesFailure(next);
      try { await updateCharacter(character.id, { death_saves_failure: next }); } catch { /* ignore */ }
    }
  }

  async function rollDeathSave() {
    if (!character || hpCurrent > 0) return;
    if (deathSavesSuccess >= 3 || deathSavesFailure >= 3) return;
    const roll = Math.floor(Math.random() * 20) + 1;
    let label: string;
    if (roll === 20) {
      label = `Death Save — Natural 20! 2 successes`;
      await handleDeathSave('success', 2);
    } else if (roll >= 11) {
      label = `Death Save — ${roll}, success`;
      await handleDeathSave('success', 1);
    } else if (roll === 1) {
      label = `Death Save — Natural 1! 2 failures`;
      await handleDeathSave('failure', 2);
    } else {
      label = `Death Save — ${roll}, failure`;
      await handleDeathSave('failure', 1);
    }
    socket.emit('chat:send', { body: `/action ${character.name}: ${label}` });
  }

  async function resetDeathSaves() {
    if (!character) return;
    setDeathSavesSuccess(0);
    setDeathSavesFailure(0);
    try { await updateCharacter(character.id, { death_saves_success: 0, death_saves_failure: 0 }); } catch { /* ignore */ }
  }

  async function toggleInspiration() {
    if (!character) return;
    const next = inspiration ? 0 : 1;
    setInspiration(next);
    try { await updateCharacter(character.id, { inspiration: next }); } catch { setInspiration(inspiration); }
  }

  // Toggle one of the per-turn action-economy flags. Optimistic; rollback on failure.
  async function toggleEconomy(field: 'action_used' | 'bonus_used' | 'reaction_used') {
    if (!character) return;
    const next = character[field] ? 0 : 1;
    setCharacter({ ...character, [field]: next });
    try { await updateCharacter(character.id, { [field]: next }); }
    catch { getCharacter(character.id).then(setCharacter).catch(() => {}); }
  }

  // Reset all three flags at once (manual override; server already resets on turn start).
  async function resetEconomy() {
    if (!character) return;
    setCharacter({ ...character, action_used: 0, bonus_used: 0, reaction_used: 0 });
    try { await updateCharacter(character.id, { action_used: 0, bonus_used: 0, reaction_used: 0 }); }
    catch { getCharacter(character.id).then(setCharacter).catch(() => {}); }
  }

  function addEffectToSelf() {
    const name = newEffectName.trim();
    const rounds = Math.max(1, Number(newEffectRounds) || 0);
    if (!name || rounds < 1) return;
    setNewEffectName(''); setNewEffectRounds('10');
    socket.emit('token:effect_apply', { token_id: tokenId, name, rounds });
  }

  // Auto-apply timed effect + curated conditions + concentration when a spell is cast.
  // Timer effects skipped outside combat; concentration & curated conditions still applied.
  function autoApplySpellEffects(slug: string, meta: SpellMeta) {
    const rounds = parseSpellDurationRounds(meta.duration);
    const conds = getSpellConditions(slug);
    const isConcentration = !!meta.concentration;

    // Recipients: selected targets if any, otherwise just the caster (self-cast).
    // The caster only gets the effect if they explicitly target themselves.
    const recipientIds = selectedTargetIds.length > 0 ? selectedTargetIds : [tokenId];
    const casterIsRecipient = recipientIds.includes(tokenId);

    // 1. Effect badge on each recipient: timed during combat, indefinite outside it
    if (rounds != null) {
      const inCombat = currentRound > 0;
      for (const id of recipientIds) {
        if (inCombat) {
          socket.emit('token:effect_apply', { token_id: id, name: meta.name, rounds });
        } else {
          socket.emit('token:effect_apply', { token_id: id, name: meta.name, rounds: 1, indefinite: true });
        }
      }
    }

    // 2. Caster's conditions: add 'concentration' (if applicable) + curated (if caster is recipient)
    const casterAdditions: string[] = [];
    if (isConcentration && !conditions.includes('concentration')) casterAdditions.push('concentration');
    if (casterIsRecipient && conds.length > 0) casterAdditions.push(...conds);
    if (casterAdditions.length > 0) {
      const merged = Array.from(new Set([...conditions, ...casterAdditions]));
      onConditionsChange(merged).catch(() => { /* ignore */ });
    }

    // 3. Curated conditions on OTHER targets (caster handled above) — uses socket
    //    so that any campaign member can apply effects to enemies they don't own.
    if (conds.length > 0 && getTokenConditions) {
      for (const id of recipientIds) {
        if (id === tokenId) continue;
        const existing = getTokenConditions(id);
        const merged = Array.from(new Set([...existing, ...conds]));
        socket.emit('token:conditions_set', { token_id: id, conditions: merged });
      }
    }
  }

  async function setExhaustionLevel(level: number) {
    if (!character) return;
    const clamped = Math.max(0, Math.min(6, level));
    const prev = exhaustion;
    setExhaustion(clamped);
    try { await updateCharacter(character.id, { exhaustion_level: clamped }); }
    catch { setExhaustion(prev); return; }
    // Keep the 'exhaustion' condition badge in sync with whether level > 0
    const hasCondition = conditions.includes('exhaustion');
    if (clamped > 0 && !hasCondition) {
      await onConditionsChange([...conditions, 'exhaustion']);
    } else if (clamped === 0 && hasCondition) {
      await onConditionsChange(conditions.filter((c) => c !== 'exhaustion'));
    }
  }

  async function handleShortRest() {
    if (!character) return;
    const prev = localResources;
    const next = localResources.map((r) => r.reset === 'short' ? { ...r, current: r.max } : r);
    setLocalResources(next);
    socket.emit('chat:send', { body: `/action ${character.name} takes a short rest.` });
    try { await updateCharacter(character.id, { resources: next }); }
    catch { setLocalResources(prev); }
  }

  async function handleLongRest() {
    if (!character) return;
    const nextHp = character.hp_max;
    const nextSlotsUsed: Record<string, number> = {};
    const nextHDUsed = 0;
    const nextResources = localResources.map((r) => ({ ...r, current: r.max }));
    // Per-class hit-dice reset (multiclass aware). Falls through harmlessly if classes[] is empty.
    const nextClasses = character.classes && character.classes.length > 0
      ? character.classes.map((c) => ({ ...c, hit_dice_used: 0 }))
      : undefined;
    setHpCurrent(nextHp);
    setSlotsUsed(nextSlotsUsed);
    setHitDiceUsed(nextHDUsed);
    setLocalResources(nextResources);
    setDeathSavesSuccess(0);
    setDeathSavesFailure(0);
    setLuckyUsed(0);
    socket.emit('chat:send', { body: `/action ${character.name} takes a long rest. HP and resources restored.` });
    try {
      await updateCharacter(character.id, {
        hp_current: nextHp, spell_slots_used: nextSlotsUsed,
        hit_dice_used: nextHDUsed, resources: nextResources,
        ...(nextClasses ? { classes: nextClasses } : {}),
        death_saves_success: 0, death_saves_failure: 0,
        lucky_used: 0,
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

  const strMod = abilityModifier(character.abilities.str);
  const dexMod = abilityModifier(character.abilities.dex);
  const spellAtk = config ? prof + configAbilityMod : 0;
  const spellDc  = config ? 8 + spellAtk : 0;
  const hasWeapons = character.weapons?.length > 0;

  const hitDie = HIT_DIE_BY_CLASS[character.class_slug ?? ''] ?? 8;
  const totalHitDice = character.level;
  const remainingHitDice = Math.max(0, totalHitDice - hitDiceUsed);
  const conMod = abilityModifier(character.abilities.con);
  const hasResources = localResources.length > 0;

  const availableTabs: Array<'main' | 'inventory' | 'spells'> = isSpellcaster
    ? ['main', 'inventory', 'spells']
    : ['main', 'inventory'];
  const tabBar = (
    <div style={{ display: 'flex', flexShrink: 0, background: '#fafafa', borderBottom: '1px solid #eee' }}>
      {availableTabs.map((p) => (
        <button key={p} onClick={() => setPage(p)} style={{
          flex: 1, padding: '0.5rem 0', border: 'none',
          borderBottom: `2px solid ${page === p ? '#333' : 'transparent'}`,
          background: page === p ? '#fff' : 'transparent',
          fontWeight: page === p ? 700 : 400,
          cursor: 'pointer', fontSize: '0.82rem',
          color: page === p ? '#333' : '#888',
        }}>
          {p === 'main' ? 'Stats' : p === 'inventory' ? 'Inventory' : 'Spells'}
        </button>
      ))}
    </div>
  );

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

            {/* Inspiration */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={toggleInspiration} style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.6rem', fontSize: '0.78rem', borderRadius: 4,
                border: `1px solid ${inspiration ? '#c8a800' : '#ddd'}`,
                background: inspiration ? '#fff8d0' : '#f9f9f9',
                color: inspiration ? '#8a6c00' : '#aaa',
                cursor: 'pointer', fontWeight: inspiration ? 700 : 400,
              }}>
                <span style={{ fontSize: '0.9rem' }}>{inspiration ? '⭐' : '☆'}</span> Inspiration
              </button>
            </div>

            {/* Death Saves — only when at 0 HP */}
            {hpCurrent === 0 && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', background: '#fdf0f0', borderRadius: 6, border: '1px solid #f0c0c0' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a44', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  {deathSavesSuccess >= 3 ? '✓ Stabilized' : deathSavesFailure >= 3 ? '✗ Dead' : 'Death Saves'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#4a8', fontWeight: 600, marginBottom: '0.25rem' }}>Successes</div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {[0, 1, 2].map((i) => (
                        <button key={i} onClick={() => handleDeathSave('success')}
                          disabled={deathSavesSuccess >= 3 || deathSavesFailure >= 3}
                          style={{
                            width: 22, height: 22, borderRadius: '50%', border: '2px solid',
                            borderColor: i < deathSavesSuccess ? '#4a8' : '#ccc',
                            background: i < deathSavesSuccess ? '#4a8' : 'transparent',
                            cursor: deathSavesSuccess >= 3 || deathSavesFailure >= 3 ? 'default' : 'pointer', padding: 0,
                          }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                    <button onClick={rollDeathSave}
                      disabled={deathSavesSuccess >= 3 || deathSavesFailure >= 3}
                      title="Roll d20 death save"
                      style={{
                        width: 32, height: 32, borderRadius: '50%', border: '2px solid #888',
                        background: deathSavesSuccess >= 3 || deathSavesFailure >= 3 ? '#f0f0f0' : '#333',
                        color: deathSavesSuccess >= 3 || deathSavesFailure >= 3 ? '#bbb' : '#fff',
                        fontSize: '1rem', cursor: deathSavesSuccess >= 3 || deathSavesFailure >= 3 ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
                      }}>🎲</button>
                    <span style={{ fontSize: '0.55rem', color: '#aaa', textAlign: 'center' }}>d20</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#a44', fontWeight: 600, marginBottom: '0.25rem' }}>Failures</div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {[0, 1, 2].map((i) => (
                        <button key={i} onClick={() => handleDeathSave('failure')}
                          disabled={deathSavesSuccess >= 3 || deathSavesFailure >= 3}
                          style={{
                            width: 22, height: 22, borderRadius: '50%', border: '2px solid',
                            borderColor: i < deathSavesFailure ? '#a44' : '#ccc',
                            background: i < deathSavesFailure ? '#a44' : 'transparent',
                            cursor: deathSavesSuccess >= 3 || deathSavesFailure >= 3 ? 'default' : 'pointer', padding: 0,
                          }} />
                      ))}
                    </div>
                  </div>
                  {(deathSavesSuccess > 0 || deathSavesFailure > 0) && (
                    <button onClick={resetDeathSaves} style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.68rem', padding: '0.15rem 0.4rem', border: '1px solid #ddd', borderRadius: 3, cursor: 'pointer', color: '#aaa', background: '#fff' }}>Reset</button>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* Conditions */}
          <Section title={`Conditions${canEditConditions ? '' : ' (view only)'}`}>
            {conditions.includes('concentration') && concentratingOn && (
              <div style={{ marginBottom: '0.5rem', padding: '0.4rem 0.6rem', background: '#fdf3e0', border: '1px solid #ecd87a', borderRadius: 4, fontSize: '0.78rem', color: '#a60' }}>
                <strong>Concentrating on:</strong> {concentratingOn}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {CONDITIONS.filter((c) => c !== 'exhaustion').map((cond) => {
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

          {/* Exhaustion (5e: 0–6 levels with cumulative effects) */}
          <Section title={`Exhaustion${exhaustion > 0 ? ` — Level ${exhaustion}` : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: exhaustion > 0 ? '0.4rem' : 0 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((lvl) => {
                const active = lvl <= exhaustion && lvl > 0;
                const isCurrent = lvl === exhaustion;
                return (
                  <button key={lvl} onClick={() => setExhaustionLevel(lvl)} disabled={!canEditConditions}
                    title={lvl === 0 ? 'No exhaustion' : `Set exhaustion to level ${lvl}`}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', padding: 0,
                      border: `2px solid ${active ? '#7a3a1a' : isCurrent ? '#7a3a1a' : '#ccc'}`,
                      background: active ? '#7a5a3a' : 'transparent',
                      color: active ? '#fff' : '#888',
                      cursor: canEditConditions ? 'pointer' : 'default',
                      fontSize: '0.75rem', fontWeight: 700,
                      flexShrink: 0,
                    }}>{lvl}</button>
                );
              })}
            </div>
            {exhaustion > 0 && (() => {
              const effects = [
                'Disadvantage on ability checks',
                'Speed halved',
                'Disadvantage on attack rolls and saving throws',
                'HP maximum halved',
                'Speed reduced to 0',
                'Death',
              ];
              return (
                <ul style={{ margin: 0, padding: '0 0 0 1.1rem', fontSize: '0.78rem', color: '#7a5a3a' }}>
                  {effects.slice(0, exhaustion).map((e, i) => (
                    <li key={i} style={{ marginBottom: '0.15rem' }}>
                      <strong>L{i + 1}:</strong> {e}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </Section>

          {/* Active timed effects (Bless, Hunter's Mark, etc.) */}
          <Section title={`Active Effects${effects.length > 0 ? ` (${effects.length})` : ''}`}>
            {effects.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.4rem' }}>
                {effects.map((eff, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.5rem', background: '#eef0f5', border: '1px solid #d8dde6', borderRadius: 5 }}>
                    <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: '#334', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eff.name}</span>
                    {eff.indefinite ? (
                      <span title="No round timer (cast outside combat)" style={{ minWidth: 38, textAlign: 'center', fontWeight: 700, fontSize: '0.82rem', color: '#888', fontStyle: 'italic' }}>active</span>
                    ) : (
                      <>
                        <button onClick={() => socket.emit('token:effect_adjust', { token_id: tokenId, name: eff.name, delta: -1 })} title="Decrease rounds (or remove)"
                          style={{ width: 22, height: 22, padding: 0, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff', flexShrink: 0 }}>−</button>
                        <span title="Rounds remaining" style={{ minWidth: 38, textAlign: 'center', fontWeight: 700, fontSize: '0.82rem', color: eff.rounds <= 2 ? '#c44' : '#446' }}>{eff.rounds}r</span>
                        <button onClick={() => socket.emit('token:effect_adjust', { token_id: tokenId, name: eff.name, delta: 1 })} title="Add a round"
                          style={{ width: 22, height: 22, padding: 0, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff', flexShrink: 0 }}>+</button>
                      </>
                    )}
                    <button onClick={() => socket.emit('token:effect_remove', { token_id: tokenId, name: eff.name })} title="Remove effect"
                      style={{ width: 22, height: 22, padding: 0, fontSize: '0.78rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, background: '#fff', color: 'crimson', flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input value={newEffectName} onChange={(e) => setNewEffectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addEffectToSelf(); }}
                placeholder="Effect name (e.g. Bless)"
                style={{ flex: 1, padding: '0.3rem 0.45rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.8rem', boxSizing: 'border-box' }} />
              <input type="number" value={newEffectRounds} onChange={(e) => setNewEffectRounds(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addEffectToSelf(); }}
                min={1} placeholder="r"
                style={{ width: 54, padding: '0.3rem 0.4rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.8rem', boxSizing: 'border-box', textAlign: 'center' }} />
              <button onClick={addEffectToSelf} disabled={!newEffectName.trim()}
                style={{ padding: '0.3rem 0.55rem', background: newEffectName.trim() ? '#446' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: newEffectName.trim() ? 'pointer' : 'not-allowed', fontSize: '0.8rem', fontWeight: 600 }}>+</button>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.35rem' }}>
              Auto-decrements when initiative round advances during combat. 10 rounds = 1 minute.
            </div>
          </Section>

          {/* Aura ring (visible to all on the map). PC owner can set their own. */}
          {tokenId > 0 && (
            <TokenAuraControl tokenId={tokenId} currentRadius={auraRadius} currentColor={auraColor} />
          )}

          {/* Combat */}
          <Section title="Combat">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center', marginBottom: '0.5rem' }}>
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
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              {([
                { key: 'action', label: 'Action', field: 'action_used' as const },
                { key: 'bonus', label: 'Bonus', field: 'bonus_used' as const },
                { key: 'reaction', label: 'Reaction', field: 'reaction_used' as const },
              ] as const).map((c) => {
                const used = !!character[c.field];
                return (
                  <button key={c.key} onClick={() => toggleEconomy(c.field)}
                    title={used ? `${c.label} used — click to mark available` : `${c.label} available — click to mark used`}
                    style={{
                      flex: 1, padding: '0.3rem 0.4rem', fontSize: '0.72rem', fontWeight: 700,
                      border: `1px solid ${used ? '#bbb' : '#3a8'}`,
                      borderRadius: 4,
                      background: used ? '#eee' : '#e0f5ec',
                      color: used ? '#bbb' : '#287',
                      cursor: 'pointer',
                      textDecoration: used ? 'line-through' : 'none',
                    }}>
                    {used ? '✓ ' : '○ '}{c.label}
                  </button>
                );
              })}
              <button onClick={resetEconomy}
                title="Reset all (auto-runs at the start of your turn)"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff', color: '#666' }}>↻</button>
            </div>
          </Section>

          {/* Attacks — weapons only */}
          {hasWeapons && (() => {
            const feats = character.feats ?? [];
            const hasGwm = feats.includes('great-weapon-master');
            const hasSharp = feats.includes('sharpshooter');
            const showPowerAttack = hasGwm || hasSharp;
            return (
            <Section title="Attacks">
              {showPowerAttack && (
                <div style={{ marginBottom: '0.4rem' }}>
                  <button onClick={() => setPowerAttack(!powerAttack)}
                    title={`Power attack: -5 to attack, +10 damage. ${hasGwm ? 'GWM applies on heavy melee weapons. ' : ''}${hasSharp ? 'Sharpshooter applies on ranged weapons.' : ''}`}
                    style={{
                      width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.75rem', borderRadius: 4,
                      border: `1px solid ${powerAttack ? '#a60' : '#ddd'}`,
                      background: powerAttack ? '#fdf3e0' : '#fff',
                      color: powerAttack ? '#a60' : '#888',
                      fontWeight: powerAttack ? 700 : 400, cursor: 'pointer',
                    }}>
                    {powerAttack ? '⚔ Power Attack ON (−5/+10)' : 'Power Attack: off'}
                  </button>
                </div>
              )}
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {character.weapons?.map((slug) => {
                  const w = weaponData[slug];
                  if (!w) return <div key={slug} style={{ fontSize: '0.8rem', color: '#aaa' }}>{slug}</div>;
                  const classSlugs = (character.classes && character.classes.length > 0)
                    ? character.classes.map((c) => c.slug)
                    : (character.class_slug ? [character.class_slug] : []);
                  const proficient = isWeaponProficientForClasses(classSlugs, slug, w.category);
                  const isFinesse = w.properties.includes('finesse');
                  const isRanged = w.weapon_type === 'Ranged';
                  const isHeavy = w.properties.includes('heavy');
                  const powerEligible = (hasGwm && !isRanged && isHeavy) || (hasSharp && isRanged);
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
                    <InGameAttackRow key={slug} name={w.name} tag={`${w.category} ${w.weapon_type}${powerAttack && powerEligible ? ' · −5/+10' : ''}`}
                      attackLabel={formatModifier(attackBonus)} damageLabel={damageStr} damageType={w.damage_type}
                      extra={w.versatile_dice ? `${w.versatile_dice}${formatModifier(damageMod)} 2H` : undefined}
                      onRoll={() => {
                        // AUTO MODE: server resolves attack vs target AC + damage on hit
                        if (combatAutomation && selectedTargetIds.length > 0 && dmgExpr) {
                          const usePower = powerAttack && powerEligible;
                          socket.emit('combat:resolve_attack', {
                            caster_token_id: tokenId,
                            target_token_ids: selectedTargetIds,
                            attack_name: w.name,
                            attack_bonus: attackBonus,
                            damage_dice: dmgExpr,
                            damage_type: w.damage_type,
                            roll_mode: rollMode,
                            power_attack: usePower,
                          });
                          if (rollMode !== 'normal') setRollMode('normal');
                          if (powerAttack) setPowerAttack(false);
                          return;
                        }
                        // MANUAL MODE: existing behavior
                        rollInChat(`${w.name} — Attack`, atkExpr);
                        if (dmgExpr) setTimeout(() => rollInChat(`${w.name} — Damage`, dmgExpr), 80);
                      }} />
                  );
                })}
              </div>
            </Section>
            );
          })()}

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


          {/* Hit Dice Tracker — per-class for multiclass, single-row for legacy */}
          <Section title="Hit Dice">
            {(() => {
              const cls = character.classes ?? [];
              if (cls.length > 0) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {cls.map((c) => {
                      const die = HIT_DIE_BY_CLASS[c.slug] ?? 8;
                      const remaining = Math.max(0, c.level - c.hit_dice_used);
                      return (
                        <div key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', background: '#fafafa', border: '1px solid #eee', borderRadius: 5 }}>
                          <span style={{ flex: 1, fontSize: '0.85rem', color: '#444' }}>
                            <strong style={{ textTransform: 'capitalize' }}>{c.slug}</strong>
                            <span style={{ color: '#888' }}> · d{die} · </span>
                            <strong>{remaining}</strong> / {c.level}
                          </span>
                          <button disabled={remaining === 0} onClick={() => rollHitDie(c.slug)}
                            style={{
                              padding: '0.2rem 0.55rem', fontSize: '0.78rem', border: '1px solid #ccc', borderRadius: 4,
                              cursor: remaining === 0 ? 'not-allowed' : 'pointer',
                              background: remaining === 0 ? '#f5f5f5' : '#fff',
                              color: remaining === 0 ? '#bbb' : '#333', fontWeight: 600,
                            }}>
                            Roll d{die}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              // Legacy single-class fallback
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', color: '#444' }}>
                    d{hitDie} · <strong>{remainingHitDice}</strong> / {totalHitDice} remaining
                  </span>
                  <button disabled={remainingHitDice === 0} onClick={() => rollHitDie(character.class_slug ?? '')}
                    style={{
                      padding: '0.25rem 0.6rem', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: 4,
                      cursor: remainingHitDice === 0 ? 'not-allowed' : 'pointer',
                      background: remainingHitDice === 0 ? '#f5f5f5' : '#fff',
                      color: remainingHitDice === 0 ? '#bbb' : '#333', fontWeight: 600,
                    }}>
                    Roll HD
                  </button>
                </div>
              );
            })()}
          </Section>

          {/* Lucky feat tracker */}
          {(character.feats ?? []).includes('lucky') && (
            <Section title={`🍀 Lucky (${3 - luckyUsed}/3)`}>
              <p style={{ fontSize: '0.78rem', color: '#666', margin: '0 0 0.4rem' }}>
                Spend a luck point to roll an extra d20 (use whichever you prefer). Resets on long rest.
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  disabled={luckyUsed >= 3}
                  onClick={async () => {
                    if (!character || luckyUsed >= 3) return;
                    const next = luckyUsed + 1;
                    setLuckyUsed(next);
                    rollInChat(`🍀 Lucky reroll (${next}/3 spent)`, '1d20');
                    try { await updateCharacter(character.id, { lucky_used: next }); }
                    catch { setLuckyUsed(luckyUsed); }
                  }}
                  style={{
                    padding: '0.3rem 0.65rem', fontSize: '0.82rem', fontWeight: 600,
                    background: luckyUsed >= 3 ? '#f5f5f5' : '#e7f7ec',
                    color: luckyUsed >= 3 ? '#bbb' : '#2a7',
                    border: `1px solid ${luckyUsed >= 3 ? '#ddd' : '#c2e7d0'}`,
                    borderRadius: 4, cursor: luckyUsed >= 3 ? 'not-allowed' : 'pointer',
                  }}>
                  Spend luck → roll 1d20
                </button>
                {luckyUsed > 0 && (
                  <button
                    onClick={async () => {
                      if (!character) return;
                      setLuckyUsed(0);
                      try { await updateCharacter(character.id, { lucky_used: 0 }); }
                      catch { setLuckyUsed(luckyUsed); }
                    }}
                    title="Reset to 3 (auto-runs on long rest)"
                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff', color: '#666' }}>↻</button>
                )}
              </div>
            </Section>
          )}

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

          {/* Feats — read-only; managed in the character wizard */}
          {localFeats.length > 0 && (
            <Section title={`Feats (${localFeats.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {localFeats.map((slug) => {
                  const feat = featDetails[slug];
                  return (
                    <details key={slug} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 5, padding: '0.4rem 0.6rem' }}>
                      <summary style={{ fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', color: '#446' }}>
                        ✦ {feat?.name ?? slug}
                      </summary>
                      {feat && (
                        <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#444', lineHeight: 1.45 }}>
                          {feat.prerequisite && <div style={{ marginBottom: '0.3rem', fontStyle: 'italic', color: '#888' }}>Prerequisite: {feat.prerequisite}</div>}
                          {feat.desc && <div style={{ whiteSpace: 'pre-wrap', marginBottom: feat.effects_desc ? '0.4rem' : 0 }}>{feat.desc}</div>}
                          {feat.effects_desc && feat.effects_desc.length > 0 && (
                            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                              {feat.effects_desc.map((e, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{e}</li>)}
                            </ul>
                          )}
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Personality — read-only; edit in the character wizard */}
          {(localPersonality.traits || localPersonality.ideals || localPersonality.bonds || localPersonality.flaws) && (
            <Section title="Personality">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {([
                  { key: 'traits', label: 'Traits' },
                  { key: 'ideals', label: 'Ideals' },
                  { key: 'bonds', label: 'Bonds' },
                  { key: 'flaws', label: 'Flaws' },
                ] as const).map((f) => localPersonality[f.key] ? (
                  <div key={f.key}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontSize: '0.8rem', color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{localPersonality[f.key]}</div>
                  </div>
                ) : null)}
              </div>
            </Section>
          )}

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
      ) : page === 'inventory' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
          <Section title="Currency">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
              {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((coin) => {
                const colors = { pp: '#cad', gp: '#cb4', ep: '#bbb', sp: '#aab', cp: '#a85' };
                return (
                  <div key={coin} style={{ background: '#fafafa', border: `1px solid ${colors[coin]}`, borderRadius: 6, padding: '0.35rem 0.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: colors[coin], textTransform: 'uppercase', marginBottom: 2 }}>{coin}</div>
                    <input
                      type="number" value={localCurrency[coin]} min={0}
                      onChange={(e) => setCurrencyValue(coin, Number(e.target.value))}
                      style={{ width: '100%', padding: '0.15rem 0.2rem', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.85rem', textAlign: 'center', fontWeight: 700, boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
                      <button onClick={() => adjustCurrency(coin, -1)} disabled={localCurrency[coin] === 0}
                        style={{ flex: 1, padding: '0.1rem', fontSize: '0.7rem', cursor: localCurrency[coin] === 0 ? 'not-allowed' : 'pointer', border: '1px solid #ddd', borderRadius: 2, background: '#fff', color: localCurrency[coin] === 0 ? '#ccc' : '#666' }}>−</button>
                      <button onClick={() => adjustCurrency(coin, 1)}
                        style={{ flex: 1, padding: '0.1rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 2, background: '#fff', color: '#666' }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={`Inventory (${localInventory.length})`}>
            {localInventory.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '0.85rem', padding: '0.5rem 0' }}>No items yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {localInventory.map((item) => (
                  <div key={item.id} style={{ padding: '0.5rem 0.6rem', background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      </div>
                      <button onClick={() => adjustItemQty(item.id, -1)}
                        style={{ width: 22, height: 22, padding: 0, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff', flexShrink: 0 }}>−</button>
                      <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: '0.85rem' }}>{item.quantity}</span>
                      <button onClick={() => adjustItemQty(item.id, 1)}
                        style={{ width: 22, height: 22, padding: 0, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff', flexShrink: 0 }}>+</button>
                      <button onClick={() => removeItem(item.id)}
                        title="Remove item"
                        style={{ width: 22, height: 22, padding: 0, fontSize: '0.78rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, background: '#fff', color: 'crimson', flexShrink: 0 }}>✕</button>
                    </div>
                    {item.description && (
                      <div style={{ fontSize: '0.74rem', color: '#777', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{item.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Add Item">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Item name *"
                  style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem', boxSizing: 'border-box' }} />
                <input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)}
                  min={1} placeholder="Qty"
                  style={{ width: 60, padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem', boxSizing: 'border-box' }} />
              </div>
              <textarea value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)}
                rows={2} placeholder="Description (optional)"
                style={{ padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.82rem', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
              <button onClick={addItem} disabled={!newItemName.trim()}
                style={{ padding: '0.4rem', background: newItemName.trim() ? '#333' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: newItemName.trim() ? 'pointer' : 'not-allowed', fontSize: '0.85rem', fontWeight: 600 }}>
                + Add to inventory
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
          spellAtk={spellAtk}
          spellDc={spellDc}
          slotsUsed={slotsUsed}
          spellSlots={character.spell_slots}
          onSlotClick={handleSlotClick}
          conditions={conditions}
          onConditionsChange={onConditionsChange}
          concentratingOn={concentratingOn}
          setConcentratingOn={setConcentratingOn}
          rollInChat={rollInChat}
          autoApplySpellEffects={autoApplySpellEffects}
          combatAutomation={combatAutomation}
          selectedTargetIds={selectedTargetIds}
          casterTokenId={tokenId}
          currentRound={currentRound}
          rollMode={rollMode}
          clearRollMode={() => setRollMode('normal')}
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
  spellAtk: number;
  spellDc: number;
  slotsUsed: Record<string, number>;
  spellSlots: Record<string, number>;
  onSlotClick: (lvl: string, filled: boolean, max: number) => void;
  conditions: string[];
  onConditionsChange: (c: string[]) => Promise<void>;
  concentratingOn: string | null;
  setConcentratingOn: (s: string | null) => void;
  rollInChat: (label: string, expr: string) => void;
  autoApplySpellEffects: (slug: string, meta: SpellMeta) => void;
  combatAutomation: boolean;
  selectedTargetIds: number[];
  casterTokenId: number;
  currentRound: number;
  rollMode: 'advantage' | 'normal' | 'disadvantage';
  clearRollMode: () => void;
}

function SpellsPageContent({ character, config, spellMeta, preparedSlugs, preparedNonCantrips, maxPrepared, onToggle, saving, spellAtk, spellDc, slotsUsed, spellSlots, onSlotClick, conditions, onConditionsChange, concentratingOn: _concentratingOn, setConcentratingOn, rollInChat, autoApplySpellEffects, combatAutomation, selectedTargetIds, casterTokenId, currentRound, rollMode, clearRollMode }: SpellsPageProps) {
  const [upcastPicker, setUpcastPicker] = useState<string | null>(null);
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
          const lvlKey = String(level);
          const maxSlots = level > 0 ? (spellSlots[lvlKey] ?? 0) : 0;
          const usedSlots = level > 0 ? (slotsUsed[lvlKey] ?? 0) : 0;
          const availableSlots = Math.max(0, maxSlots - usedSlots);
          return (
            <details key={level} open style={{ marginBottom: '0.5rem', borderBottom: '1px solid #eee', paddingBottom: '0.4rem' }}>
              <summary style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', listStyle: 'none', padding: '0.25rem 0' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {levelLabel(level)}
                </span>
                {level > 0 && maxSlots > 0 && (
                  <>
                    <div style={{ display: 'flex', gap: '0.18rem', alignItems: 'center' }} onClick={(e) => e.preventDefault()}>
                      {Array.from({ length: maxSlots }, (_, i) => {
                        const filled = i < availableSlots;
                        return (
                          <button key={i}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSlotClick(lvlKey, filled, maxSlots); }}
                            title={filled ? 'Click to spend slot' : 'Click to recover slot'}
                            style={{
                              width: 14, height: 14, borderRadius: '50%', border: '2px solid',
                              borderColor: filled ? '#4477cc' : '#bbb',
                              background: filled ? '#4477cc' : 'transparent',
                              cursor: 'pointer', padding: 0, flexShrink: 0,
                            }} />
                        );
                      })}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: '#aaa', fontWeight: 600 }}>{availableSlots}/{maxSlots}</span>
                  </>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#bbb' }}>{slugsAtLevel.length}</span>
              </summary>
              <div style={{ display: 'grid', gap: '0.25rem', marginTop: '0.35rem' }}>
                {slugsAtLevel.map((slug) => {
                  const meta = spellMeta[slug];
                  const isCantrip = level === 0;
                  const isPrepared = preparedSlugs.includes(slug);
                  const cannotAdd = !isPrepared && !isCantrip && atLimit;

                  const canRoll = isPrepared || isCantrip;
                  const parsed = meta?.desc ? parseSpellForAttack(meta.desc) : null;
                  const hasAttackData = canRoll && parsed && parsed.mode !== null;
                  const baseDice = (isCantrip && parsed?.damageDice)
                    ? scaleCantripDice(parsed.damageDice, character.level)
                    : parsed?.damageDice;
                  const availableLevels = isCantrip ? [] : Object.entries(character.spell_slots)
                    .filter(([l, c]) => Number(l) >= level && (c - (slotsUsed[l] ?? 0)) > 0)
                    .map(([l]) => Number(l)).sort((a, b) => a - b);
                  const canUpcast = availableLevels.length > 1;
                  const showPicker = upcastPicker === slug;

                  const performSpellRoll = async (castLevel: number) => {
                    const finalDice = baseDice ? buildCastDice(baseDice, meta!.higher_level, level, castLevel) : null;
                    const lvlSuffix = castLevel > level ? ` (${slotLabel(castLevel)})` : '';

                    // ── AUTO MODE: Magic Missile (auto-hit, splittable across targets) ──
                    if (combatAutomation && slug === 'magic-missile' && finalDice && selectedTargetIds.length > 0) {
                      const dartCount = Math.max(3, castLevel + 2); // L1 = 3 darts, +1 per slot above
                      socket.emit('combat:resolve_auto_hit', {
                        caster_token_id: casterTokenId,
                        target_token_ids: selectedTargetIds,
                        attack_name: `${meta!.name}${lvlSuffix}`,
                        hit_count: dartCount,
                        damage_dice: finalDice,
                        damage_type: parsed!.damageType ?? 'force',
                        cast_level: castLevel,
                      });
                      setUpcastPicker(null);
                      return;
                    }

                    // ── AUTO MODE: spell-attack damage spell with selected targets ──
                    // Server rolls d20+spellAtk vs each target's AC; on hit, rolls damage; nat 20 = crit.
                    const canAutoResolveAttack =
                      combatAutomation
                      && parsed!.mode === 'spell_attack'
                      && finalDice
                      && selectedTargetIds.length > 0;

                    if (canAutoResolveAttack) {
                      socket.emit('combat:resolve_attack', {
                        caster_token_id: casterTokenId,
                        target_token_ids: selectedTargetIds,
                        attack_name: `${meta!.name}${lvlSuffix}`,
                        attack_bonus: spellAtk,
                        damage_dice: finalDice!,
                        damage_type: parsed!.damageType ?? '',
                        is_spell: true,
                        roll_mode: rollMode,
                        cast_level: castLevel,
                      });
                      if (rollMode !== 'normal') clearRollMode();
                      if (meta?.concentration) {
                        if (conditions.includes('concentration') && _concentratingOn) {
                          socket.emit('chat:send', { body: `/action ${character.name} drops concentration on ${_concentratingOn}, now concentrating on ${meta.name}.` });
                        }
                        setConcentratingOn(meta.name);
                        if (!conditions.includes('concentration')) {
                          onConditionsChange([...conditions, 'concentration']).catch(() => { /* ignore */ });
                        }
                      }
                      setUpcastPicker(null);
                      return;
                    }

                    // ── AUTO MODE: save-based damage spell with selected targets ──
                    // Server handles save rolls + per-target damage application + condition application.
                    const canAutoResolve =
                      combatAutomation
                      && parsed!.mode === 'save'
                      && finalDice
                      && parsed!.saveAbility
                      && selectedTargetIds.length > 0;

                    if (canAutoResolve) {
                      const conditionsOnFail = getSpellConditions(slug);
                      // parseSpellForAttack returns the save ability as 3-letter UPPERCASE ("DEX");
                      // the server expects lowercase 3-letter ('dex'). Normalize.
                      const saveAbility = parsed!.saveAbility!.toLowerCase() as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
                      socket.emit('combat:resolve_spell', {
                        caster_token_id: casterTokenId,
                        target_token_ids: selectedTargetIds,
                        spell_name: `${meta!.name}${lvlSuffix}`,
                        save_ability: saveAbility,
                        save_dc: spellDc,
                        damage_dice: finalDice!,
                        damage_type: parsed!.damageType ?? '',
                        half_on_save: true, // most 5e save-based damage spells halve on save; per-spell overrides could come later
                        conditions_on_fail: conditionsOnFail,
                        cast_level: castLevel,
                      });
                      // Concentration + timer effect still apply client-side
                      if (meta?.concentration) {
                        if (conditions.includes('concentration') && _concentratingOn) {
                          socket.emit('chat:send', { body: `/action ${character.name} drops concentration on ${_concentratingOn}, now concentrating on ${meta.name}.` });
                        }
                        setConcentratingOn(meta.name);
                      }
                      // Apply timer effect only — skip the manual condition application since the server did it per-target.
                      const rounds = parseSpellDurationRounds(meta!.duration);
                      if (rounds != null) {
                        const inCombat = currentRound > 0;
                        for (const id of selectedTargetIds) {
                          if (inCombat) {
                            socket.emit('token:effect_apply', { token_id: id, name: meta!.name, rounds });
                          } else {
                            socket.emit('token:effect_apply', { token_id: id, name: meta!.name, rounds: 1, indefinite: true });
                          }
                        }
                      }
                      // Caster gets concentration condition added for tracking (existing logic).
                      if (meta?.concentration && !conditions.includes('concentration')) {
                        onConditionsChange([...conditions, 'concentration']).catch(() => { /* ignore */ });
                      }
                      setUpcastPicker(null);
                      return;
                    }

                    // ── MANUAL MODE (existing behavior) ──
                    if (parsed!.mode === 'spell_attack') {
                      rollInChat(`${meta!.name}${lvlSuffix} — Spell Attack`, `1d20${formatModifier(spellAtk)}`);
                      if (finalDice) setTimeout(() => rollInChat(`${meta!.name}${lvlSuffix} — Damage`, finalDice), 80);
                    } else if (parsed!.mode === 'save') {
                      if (finalDice) rollInChat(`${meta!.name}${lvlSuffix} — Damage (DC ${spellDc} ${parsed!.saveAbility})`, finalDice);
                    } else {
                      if (finalDice) rollInChat(`${meta!.name}${lvlSuffix} — Damage`, finalDice);
                    }
                    if (meta?.concentration) {
                      if (conditions.includes('concentration') && _concentratingOn) {
                        socket.emit('chat:send', { body: `/action ${character.name} drops concentration on ${_concentratingOn}, now concentrating on ${meta.name}.` });
                      }
                      setConcentratingOn(meta.name);
                    }
                    autoApplySpellEffects(slug, meta!);
                    setUpcastPicker(null);
                  };

                  const castNonAttack = async (castLevel: number) => {
                    const lvlSuffix = castLevel > level ? ` (${slotLabel(castLevel)})` : '';
                    if (combatAutomation && isHealingSpell(slug) && selectedTargetIds.length > 0) {
                      const spellMod = abilityModifier(character.abilities[config.ability]);
                      const healDice = buildHealDice(slug, castLevel, level, spellMod);
                      if (healDice) {
                        socket.emit('combat:resolve_heal', {
                          caster_token_id: casterTokenId,
                          target_token_ids: selectedTargetIds,
                          spell_name: `${meta!.name}${lvlSuffix}`,
                          heal_dice: healDice,
                        });
                        setUpcastPicker(null);
                        return;
                      }
                    }
                    socket.emit('chat:send', { body: `/action ${character.name} casts ${meta!.name}${lvlSuffix}.` });
                    if (meta?.concentration) {
                      if (conditions.includes('concentration') && _concentratingOn) {
                        socket.emit('chat:send', { body: `/action ${character.name} drops concentration on ${_concentratingOn}, now concentrating on ${meta.name}.` });
                      }
                      setConcentratingOn(meta.name);
                    }
                    autoApplySpellEffects(slug, meta!);
                    setUpcastPicker(null);
                  };

                  const performCastAtLevel = hasAttackData ? performSpellRoll : castNonAttack;

                  const atkLabel = parsed?.mode === 'spell_attack' ? formatModifier(spellAtk)
                    : parsed?.mode === 'save' ? `DC ${spellDc}` : '—';
                  const atkTag = parsed?.mode === 'spell_attack' ? 'spell atk'
                    : parsed?.mode === 'save' ? `${parsed.saveAbility} save` : '';

                  return (
                    <div key={slug} style={{ borderRadius: 4, overflow: 'hidden', border: `1px solid ${(isPrepared || isCantrip) ? '#c8d8f0' : '#eee'}` }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.3rem 0.5rem',
                        background: (isPrepared || isCantrip) ? '#f0f5ff' : '#f9f9f9',
                      }}>
                        <span
                          onClick={() => {
                            if (!meta) return;
                            const lvlText = level === 0 ? 'Cantrip' : `Level ${level}`;
                            const desc = meta.desc?.split('\n')[0].slice(0, 300) ?? '';
                            socket.emit('chat:send', { body: `/action 📖 ${meta.name} (${lvlText})${desc ? ': ' + desc : ''}` });
                          }}
                          title={meta ? 'Click to share spell description in chat' : undefined}
                          style={{ fontSize: '0.85rem', fontWeight: (isPrepared || isCantrip) ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem', cursor: meta ? 'pointer' : 'default', textDecoration: meta ? 'underline dotted' : 'none', textUnderlineOffset: 3 }}>
                          {meta?.name ?? slug}
                          {meta?.concentration && <span style={{ fontSize: '0.65rem', color: '#886', fontStyle: 'italic', marginLeft: '0.3rem' }}>conc.</span>}
                        </span>
                        {isCantrip ? (
                          <span style={{ fontSize: '0.7rem', color: '#7788bb', fontStyle: 'italic', flexShrink: 0 }}>always</span>
                        ) : isPreparedModel ? (
                          <button onClick={() => onToggle(slug)} disabled={saving || cannotAdd} style={{
                            padding: '0.15rem 0.4rem', fontSize: '0.75rem', borderRadius: 3, flexShrink: 0,
                            border: isPrepared ? '1px solid #4488cc' : '1px solid #ccc',
                            background: isPrepared ? '#ddeeff' : cannotAdd ? '#f5f5f5' : '#fff',
                            color: isPrepared ? '#2266aa' : cannotAdd ? '#bbb' : '#555',
                            cursor: saving || cannotAdd ? 'not-allowed' : 'pointer', fontWeight: isPrepared ? 700 : 400,
                          }}>{isPrepared ? '✓ Prep' : 'Prepare'}</button>
                        ) : null}
                      </div>
                      {hasAttackData && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.5rem', background: '#e8eef8', borderTop: '1px solid #cdd8ee' }}>
                          <span style={{ fontSize: '0.68rem', color: '#668', flexShrink: 0 }}>{atkTag}</span>
                          <span style={{ fontWeight: 700, fontSize: '0.82rem', marginLeft: 'auto' }}>{atkLabel}</span>
                          <span style={{ fontSize: '0.68rem', color: '#888' }}>→</span>
                          <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                            {baseDice ?? '—'}{parsed?.damageType ? <span style={{ fontSize: '0.65rem', color: '#888', marginLeft: '0.2rem' }}>{parsed.damageType}</span> : null}
                          </span>
                          <button onClick={() => {
                            if (isCantrip || !canUpcast) performCastAtLevel(availableLevels[0] ?? level);
                            else setUpcastPicker(showPicker ? null : slug);
                          }} style={{ padding: '0.18rem 0.35rem', fontSize: '0.8rem', border: '1px solid #aac', borderRadius: 4, background: '#fff', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>🎲</button>
                        </div>
                      )}
                      {canRoll && !hasAttackData && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.5rem', background: '#f0f5f0', borderTop: '1px solid #d0e4d0' }}>
                          <span style={{ fontSize: '0.68rem', color: '#558', flexShrink: 0 }}>
                            {meta?.concentration ? 'concentration' : isCantrip ? 'cantrip' : 'utility'}
                          </span>
                          <button onClick={() => {
                            if (isCantrip || !canUpcast) castNonAttack(availableLevels[0] ?? level);
                            else setUpcastPicker(showPicker ? null : slug);
                          }} style={{ marginLeft: 'auto', padding: '0.18rem 0.5rem', fontSize: '0.78rem', border: '1px solid #8ab88a', borderRadius: 4, background: '#e8f5e8', cursor: 'pointer', lineHeight: 1, flexShrink: 0, fontWeight: 600, color: '#336633' }}>
                            Cast
                          </button>
                        </div>
                      )}
                      {showPicker && (
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.3rem 0.5rem', background: '#f0f4ff', borderTop: '1px solid #ccd' }}>
                          <span style={{ fontSize: '0.7rem', color: '#558', fontWeight: 600 }}>Cast at:</span>
                          {availableLevels.map((lvl) => (
                            <button key={lvl} onClick={() => performCastAtLevel(lvl)} style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', borderRadius: 3, border: '1px solid #aac', background: lvl > level ? '#e8eeff' : '#fff', cursor: 'pointer', fontWeight: 600, color: '#336' }}>
                              {slotLabel(lvl)}{lvl > level ? ' ↑' : ''}
                            </button>
                          ))}
                          <button onClick={() => setUpcastPicker(null)} style={{ marginLeft: 'auto', padding: '0.15rem 0.35rem', fontSize: '0.7rem', border: '1px solid #ddd', borderRadius: 3, cursor: 'pointer', color: '#999', background: '#fff' }}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
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
