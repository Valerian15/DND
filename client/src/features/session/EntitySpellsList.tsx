import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';
import { getLibraryItem } from '../character/api';
import { parseSpellForAttack, scaleCantripDice } from '../character/attackUtils';
import { isHealingSpell, buildHealDice } from './spellEffects';
import { setTokenSlotsUsed } from './tokenApi';

export interface EntitySpellsProps {
  /** Token doing the casting (Lich, Archmage, NPC, etc.). */
  casterTokenId: number;
  /** Display name used in chat ("The lich casts Fireball"). */
  casterName: string;
  /** Spell save DC for this caster. */
  saveDC: number;
  /** Spell attack bonus for this caster. */
  attackBonus: number;
  /** Flat list of spell slugs. Cantrips and leveled spells are sorted out client-side from
   *  fetched metadata, so callers don't have to pre-group. */
  spells: string[];
  /** Max slots per level — display-only. By design, monster/NPC casts never decrement slots
   *  so the DM can improvise (e.g. lean on a single spell more than the stat block allows).
   *  The bubble row next to each level header is clickable manual marking only. */
  slotsByLevel: Record<number, number>;
  /** Current bubble state per level (filled bubbles = unspent). Persisted on the token. */
  slotsUsed: Record<string, number>;
  /** Targets currently selected on the map. */
  selectedTargetIds: number[];
  /** When true, server resolves attacks/saves/damage. Off = chat-only fallback. */
  combatAutomation: boolean;
  /** Caster level for cantrip damage scaling. Library-monster casters: their CR-equivalent level
   *  (Lich = 18, Archmage = 18, Mage = 9). Default 1 for low-tier. */
  casterLevel?: number;
}

interface SpellMeta {
  slug: string;
  name: string;
  level: number;
  desc?: string;
  higher_level?: string;
  concentration?: boolean;
}

function slotLabel(n: number): string {
  return ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;
}

// Mirrors InGameSheet's buildCastDice — scales spells by upcast difference.
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

// Render a list of spells (cantrips + per-level groups) with cast buttons. Used by both
// MonsterSheet (curated profiles) and NpcSheet (DM-built profiles).
export function EntitySpellsList({
  casterTokenId, casterName, saveDC, attackBonus,
  spells, slotsByLevel, slotsUsed,
  selectedTargetIds, combatAutomation, casterLevel = 1,
}: EntitySpellsProps) {
  const [spellMeta, setSpellMeta] = useState<Record<string, SpellMeta>>({});
  const [upcastPicker, setUpcastPicker] = useState<{ slug: string; x: number; y: number } | null>(null);

  // Click a slot bubble to toggle filled/empty. Pure visual aid; doesn't gate casts.
  function toggleSlot(level: number, idx: number, max: number) {
    const cur = slotsUsed[String(level)] ?? 0;
    const filledCount = max - cur;
    // idx is 0-based bubble index left to right. Filled bubbles come first, empties after.
    // Clicking a filled bubble (idx < filledCount) spends one (cur += 1).
    // Clicking an empty bubble (idx >= filledCount) recovers one (cur -= 1).
    const next = idx < filledCount ? Math.min(max, cur + 1) : Math.max(0, cur - 1);
    if (next === cur) return;
    const updated = { ...slotsUsed, [String(level)]: next };
    setTokenSlotsUsed(casterTokenId, updated).catch(() => { /* socket update will reconcile */ });
  }

  // Fetch metadata for every spell. The library nests fields under `data`, so flatten to SpellMeta.
  useEffect(() => {
    const slugs = Array.from(new Set(spells));
    Promise.all(slugs.map((s) =>
      getLibraryItem<{ slug: string; name: string; level: number; data?: { desc?: string; higher_level?: string; concentration?: boolean | string; duration?: string } }>('spells', s)
        .then((r): SpellMeta => {
          const conc = r.data?.concentration;
          const isConc = typeof conc === 'boolean' ? conc
            : typeof conc === 'string' ? (conc !== '' && conc !== 'no')
            : !!(r.data?.duration?.toLowerCase().includes('concentration'));
          return {
            slug: r.slug, name: r.name, level: r.level,
            desc: r.data?.desc, higher_level: r.data?.higher_level, concentration: isConc,
          };
        })
        .catch(() => null)
    )).then((results) => {
      const next: Record<string, SpellMeta> = {};
      for (const r of results) if (r) next[r.slug] = r;
      setSpellMeta(next);
    });
  }, [spells]);

  // Cast `meta` at the chosen slot level. Picks the right combat:resolve_* event.
  function castSpellAtLevel(meta: SpellMeta, castLevel: number) {
    const slug = meta.slug;
    const baseLevel = meta.level;
    const isCantrip = baseLevel === 0;
    const lvlSuffix = !isCantrip && castLevel > baseLevel ? ` (${slotLabel(castLevel)})` : '';
    const parsed = meta.desc ? parseSpellForAttack(meta.desc) : null;
    const baseDice = (isCantrip && parsed?.damageDice)
      ? scaleCantripDice(parsed.damageDice, casterLevel)
      : parsed?.damageDice ?? null;
    const finalDice = baseDice ? buildCastDice(baseDice, meta.higher_level, baseLevel, castLevel) : null;

    // Healing
    if (combatAutomation && isHealingSpell(slug) && selectedTargetIds.length > 0) {
      // Use INT/WIS/CHA mod equivalent — derived from save DC: dc = 8 + prof + ability_mod;
      // attack_bonus = prof + ability_mod, so ability_mod = attack_bonus - prof_implied.
      // Easier: assume ability_mod ≈ attack_bonus - 2 (ish) is OK for monsters; default 0.
      const healDice = buildHealDice(slug, castLevel, baseLevel, 0);
      if (healDice) {
        socket.emit('combat:resolve_heal', {
          caster_token_id: casterTokenId,
          target_token_ids: selectedTargetIds,
          spell_name: `${meta.name}${lvlSuffix}`,
          heal_dice: healDice,
        });
        return;
      }
    }

    // Magic Missile auto-hit
    if (combatAutomation && slug === 'magic-missile' && finalDice && selectedTargetIds.length > 0) {
      const dartCount = Math.max(3, castLevel + 2);
      socket.emit('combat:resolve_auto_hit', {
        caster_token_id: casterTokenId,
        target_token_ids: selectedTargetIds,
        attack_name: `${meta.name}${lvlSuffix}`,
        hit_count: dartCount,
        damage_dice: finalDice,
        damage_type: parsed?.damageType ?? 'force',
        cast_level: castLevel,
      });
      return;
    }

    // Spell attack
    if (combatAutomation && parsed?.mode === 'spell_attack' && finalDice && selectedTargetIds.length > 0) {
      socket.emit('combat:resolve_attack', {
        caster_token_id: casterTokenId,
        target_token_ids: selectedTargetIds,
        attack_name: `${meta.name}${lvlSuffix}`,
        attack_bonus: attackBonus,
        damage_dice: finalDice,
        damage_type: parsed.damageType ?? '',
        is_spell: true,
        cast_level: castLevel,
      });
      return;
    }

    // Save-based
    if (combatAutomation && parsed?.mode === 'save' && finalDice && parsed.saveAbility && selectedTargetIds.length > 0) {
      const saveAbility = parsed.saveAbility.toLowerCase() as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
      socket.emit('combat:resolve_spell', {
        caster_token_id: casterTokenId,
        target_token_ids: selectedTargetIds,
        spell_name: `${meta.name}${lvlSuffix}`,
        save_ability: saveAbility,
        save_dc: saveDC,
        damage_dice: finalDice,
        damage_type: parsed.damageType ?? '',
        half_on_save: true,
        cast_level: castLevel,
      });
      return;
    }

    // Fallback / utility — just announce.
    socket.emit('chat:send', { body: `/action ${casterName} casts ${meta.name}${lvlSuffix}.` });
  }

  function castSpell(meta: SpellMeta) {
    castSpellAtLevel(meta, meta.level);
  }

  // Bucket spells by level once metadata is in. Slugs without metadata yet are still rendered
  // (best effort — the cast button waits for meta to arrive before doing anything).
  const cantrips: string[] = [];
  const spellsByLevel: Record<number, string[]> = {};
  for (const slug of spells) {
    const m = spellMeta[slug];
    const lvl = m?.level ?? 1;
    if (lvl === 0) cantrips.push(slug);
    else (spellsByLevel[lvl] = spellsByLevel[lvl] ?? []).push(slug);
  }
  const levels = Object.keys(spellsByLevel).map(Number).sort((a, b) => a - b);
  const noTargets = selectedTargetIds.length === 0;

  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#5a3a7a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>Spellcasting</span>
        <span style={{ color: '#888', fontWeight: 500 }}>DC {saveDC} · +{attackBonus}</span>
      </div>

      {noTargets && (
        <div style={{ fontSize: '0.7rem', color: '#a44', marginBottom: '0.3rem', fontStyle: 'italic' }}>
          Select target(s) on the map first.
        </div>
      )}

      {/* Cantrips */}
      {cantrips.length > 0 && (
        <SpellGroup label="Cantrips (at will)">
          {cantrips.map((slug) => {
            const meta = spellMeta[slug];
            return (
              <SpellButton key={slug} disabled={noTargets} title={meta?.name ?? slug}
                onClick={() => meta && castSpell(meta)}>
                ⚡ {meta?.name ?? slug}
              </SpellButton>
            );
          })}
        </SpellGroup>
      )}

      {/* Leveled spells */}
      {levels.map((lvl) => {
        const slugs = spellsByLevel[lvl] ?? [];
        if (slugs.length === 0) return null;
        const slotMax = slotsByLevel[lvl] ?? 0;
        const slotUsed = slotsUsed[String(lvl)] ?? 0;
        const slotsAvail = Math.max(0, slotMax - slotUsed);
        return (
          <SpellGroup key={lvl}
            label={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>{slotLabel(lvl)} level</span>
                {slotMax > 0 && (
                  <>
                    <span style={{ display: 'inline-flex', gap: 3 }}>
                      {Array.from({ length: slotMax }, (_, i) => {
                        const filled = i < slotsAvail;
                        return (
                          <button key={i} onClick={(e) => { e.preventDefault(); toggleSlot(lvl, i, slotMax); }}
                            title={filled ? 'Click to mark spent' : 'Click to recover'}
                            style={{
                              width: 11, height: 11, borderRadius: '50%', border: '1.5px solid',
                              borderColor: filled ? '#7755aa' : '#aaa',
                              background: filled ? '#7755aa' : 'transparent',
                              cursor: 'pointer', padding: 0,
                            }} />
                        );
                      })}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: '#888', fontWeight: 500 }}>{slotsAvail}/{slotMax}</span>
                  </>
                )}
              </span>
            }>

            {slugs.map((slug) => {
              const meta = spellMeta[slug];
              const canUpcast = lvl < 9 && Object.keys(slotsByLevel).map(Number).some((l) => l > lvl);
              return (
                <SpellButton key={slug} disabled={noTargets} title={meta?.name ?? slug}
                  onClick={() => meta && castSpell(meta)}
                  onContextMenu={canUpcast && meta ? (e) => {
                    e.preventDefault();
                    setUpcastPicker({ slug, x: e.clientX, y: e.clientY });
                  } : undefined}>
                  📜 {meta?.name ?? slug}
                </SpellButton>
              );
            })}
          </SpellGroup>
        );
      })}

      {/* Upcast picker popover (right-click on a leveled spell). */}
      {upcastPicker && (() => {
        const meta = spellMeta[upcastPicker.slug];
        if (!meta) return null;
        const upLevels = Object.keys(slotsByLevel).map(Number).filter((l) => l >= meta.level).sort();
        return (
          <>
            <div onClick={() => setUpcastPicker(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'transparent' }} />
            <div style={{
              position: 'fixed', left: Math.max(8, upcastPicker.x - 80), top: Math.max(8, upcastPicker.y - 90),
              zIndex: 50, background: '#fff', border: '1px solid #aac', borderRadius: 5, padding: '0.4rem',
              boxShadow: '0 4px 14px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '0.2rem',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#668', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                Cast {meta.name} at:
              </div>
              {upLevels.map((l) => (
                <button key={l} onClick={() => { castSpellAtLevel(meta, l); setUpcastPicker(null); }}
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer', border: '1px solid #ccd', borderRadius: 3, background: l > meta.level ? '#f0f4ff' : '#fff', textAlign: 'left' }}>
                  {slotLabel(l)} {l > meta.level && <span style={{ color: '#88a', fontSize: '0.7rem' }}>↑ upcast</span>}
                </button>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}

function SpellGroup({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.4rem' }}>
      <div style={{ fontSize: '0.62rem', color: '#888', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>{children}</div>
    </div>
  );
}

function SpellButton({ children, onClick, onContextMenu, title, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} onContextMenu={onContextMenu} disabled={disabled} title={title}
      style={{
        padding: '0.22rem 0.5rem', fontSize: '0.75rem', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
        border: '1px solid #b9a4cf', background: disabled ? '#eee' : '#f3edff', color: disabled ? '#aaa' : '#5a3a7a',
        fontWeight: 600,
      }}>
      {children}
    </button>
  );
}
