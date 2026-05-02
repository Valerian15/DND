import { useState } from 'react';
import { socket } from '../../lib/socket';
import { CONDITIONS } from './InGameSheet';

interface Props {
  /** The token doing the casting (Lich, NPC, etc.). */
  casterTokenId: number;
  /** Currently-selected target tokens (set in the session page via the targeting UI). */
  selectedTargetIds: number[];
  /** Whether combat automation is enabled for this campaign — needed for auto-resolve to fire. */
  combatAutomation: boolean;
  /** Default DC and attack bonus pulled from the caster's stat block (Lich = DC 20, +12). */
  defaultDc?: number;
  defaultAttackBonus?: number;
  onClose: () => void;
}

type CastMode = 'attack' | 'save' | 'auto_hit' | 'heal';

const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
];

const SAVE_ABILITIES = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
] as const;

// Free-form spell-cast modal usable from any non-PC sheet (monster, NPC). Funnels into the same
// `combat:resolve_*` events PCs use, so damage / saves / conditions / undo all work identically.
export function CastSpellModal({ casterTokenId, selectedTargetIds, combatAutomation, defaultDc, defaultAttackBonus, onClose }: Props) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<CastMode>('save');
  const [dc, setDc] = useState(defaultDc ?? 13);
  const [saveAbility, setSaveAbility] = useState<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>('dex');
  const [attackBonus, setAttackBonus] = useState(defaultAttackBonus ?? 5);
  const [hitCount, setHitCount] = useState(1);
  const [damageDice, setDamageDice] = useState('1d8');
  const [damageType, setDamageType] = useState('fire');
  const [halfOnSave, setHalfOnSave] = useState(true);
  const [conditions, setConditions] = useState<Set<string>>(new Set());
  // Slot level the spell is cast at — used by Counterspell (DC 10 + level for L4+ spells).
  // Cantrips cast at L0 internally; we store 0 for them. Default 1 for leveled spells.
  const [castLevel, setCastLevel] = useState(1);

  function toggleCondition(c: string) {
    setConditions((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selectedTargetIds.length === 0 && mode !== 'heal') return;

    if (mode === 'attack') {
      socket.emit('combat:resolve_attack', {
        caster_token_id: casterTokenId,
        target_token_ids: selectedTargetIds,
        attack_name: trimmed,
        attack_bonus: attackBonus,
        damage_dice: damageDice.trim(),
        damage_type: damageType,
        is_spell: true,
        cast_level: castLevel,
      });
    } else if (mode === 'save') {
      socket.emit('combat:resolve_spell', {
        caster_token_id: casterTokenId,
        target_token_ids: selectedTargetIds,
        spell_name: trimmed,
        save_ability: saveAbility,
        save_dc: dc,
        damage_dice: damageDice.trim() || '0d0',
        damage_type: damageType,
        half_on_save: halfOnSave,
        conditions_on_fail: [...conditions],
        cast_level: castLevel,
      });
    } else if (mode === 'auto_hit') {
      socket.emit('combat:resolve_auto_hit', {
        caster_token_id: casterTokenId,
        target_token_ids: selectedTargetIds,
        attack_name: trimmed,
        hit_count: Math.max(1, hitCount),
        damage_dice: damageDice.trim(),
        damage_type: damageType,
        cast_level: castLevel,
      });
    } else if (mode === 'heal') {
      socket.emit('combat:resolve_heal', {
        caster_token_id: casterTokenId,
        target_token_ids: selectedTargetIds,
        spell_name: trimmed,
        heal_dice: damageDice.trim(),
      });
    }
    onClose();
  }

  const noTargets = selectedTargetIds.length === 0;

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 380, background: '#fff', borderRadius: 6, padding: '0.75rem 1rem', boxShadow: '0 6px 22px rgba(0,0,0,0.3)', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <strong style={{ fontSize: '0.95rem' }}>🪄 Cast Spell</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {!combatAutomation && (
          <div style={{ background: '#fee8c8', border: '1px solid #f0c98a', borderRadius: 4, padding: '0.4rem', fontSize: '0.72rem', color: '#7a5500', marginBottom: '0.5rem' }}>
            Combat automation is off — the spell will be announced but the server won't resolve attacks/saves/damage.
          </div>
        )}

        <Field label="Spell name">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Power Word Stun, Fireball, …"
            autoFocus
            style={fieldStyle} />
        </Field>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Field label="Mode" flex={3}>
            <select value={mode} onChange={(e) => setMode(e.target.value as CastMode)} style={fieldStyle}>
              <option value="save">Save (DC) — Fireball, Hold Person, etc.</option>
              <option value="attack">Spell attack — Disintegrate, Ray of Frost, etc.</option>
              <option value="auto_hit">Auto-hit — Magic Missile, etc.</option>
              <option value="heal">Heal — Cure Wounds, etc.</option>
            </select>
          </Field>
          <Field label="Slot lvl" flex={1}>
            <input type="number" min={0} max={9} value={castLevel}
              onChange={(e) => setCastLevel(Math.max(0, Math.min(9, Number(e.target.value) || 0)))}
              style={fieldStyle} />
          </Field>
        </div>

        {mode === 'save' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Field label="DC" flex={1}>
              <input type="number" value={dc} onChange={(e) => setDc(Number(e.target.value) || 0)} style={fieldStyle} />
            </Field>
            <Field label="Save" flex={2}>
              <select value={saveAbility} onChange={(e) => setSaveAbility(e.target.value as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha')} style={fieldStyle}>
                {SAVE_ABILITIES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </div>
        )}

        {mode === 'attack' && (
          <Field label="Attack bonus">
            <input type="number" value={attackBonus} onChange={(e) => setAttackBonus(Number(e.target.value) || 0)} style={fieldStyle} />
          </Field>
        )}

        {mode === 'auto_hit' && (
          <Field label="Hit count">
            <input type="number" min={1} value={hitCount} onChange={(e) => setHitCount(Number(e.target.value) || 1)} style={fieldStyle} />
          </Field>
        )}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Field label={mode === 'heal' ? 'Heal dice' : 'Damage dice'} flex={1}>
            <input value={damageDice} onChange={(e) => setDamageDice(e.target.value)}
              placeholder={mode === 'heal' ? '4d8+4' : '8d6'}
              style={fieldStyle} />
          </Field>
          {mode !== 'heal' && (
            <Field label="Type" flex={1}>
              <select value={damageType} onChange={(e) => setDamageType(e.target.value)} style={fieldStyle}>
                {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          )}
        </div>

        {mode === 'save' && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0.5rem 0', fontSize: '0.78rem', color: '#444' }}>
              <input type="checkbox" checked={halfOnSave} onChange={(e) => setHalfOnSave(e.target.checked)} />
              Half damage on successful save
            </label>

            <Field label="Apply to failed saves (optional)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '0.3rem', border: '1px solid #ddd', borderRadius: 3, background: '#fafafa' }}>
                {CONDITIONS.map((c) => {
                  const active = conditions.has(c);
                  return (
                    <button key={c} type="button" onClick={() => toggleCondition(c)}
                      style={{
                        padding: '0.1rem 0.4rem', fontSize: '0.7rem', borderRadius: 3, cursor: 'pointer',
                        border: `1px solid ${active ? '#446' : '#ccc'}`,
                        background: active ? '#446' : '#fff', color: active ? '#fff' : '#666',
                        fontWeight: active ? 700 : 400, textTransform: 'capitalize',
                      }}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        )}

        <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.5rem', background: noTargets && mode !== 'heal' ? '#fee' : '#f5f5f5', border: `1px solid ${noTargets && mode !== 'heal' ? '#fcc' : '#ddd'}`, borderRadius: 3, fontSize: '0.72rem', color: noTargets && mode !== 'heal' ? '#a44' : '#666' }}>
          {selectedTargetIds.length > 0
            ? `🎯 ${selectedTargetIds.length} target${selectedTargetIds.length > 1 ? 's' : ''} selected`
            : mode === 'heal'
              ? 'Heal with no selected ally targets — pick targets on the map first.'
              : 'No targets selected. Click target tokens on the map first.'}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
          <button onClick={submit} disabled={!name.trim() || (noTargets && mode !== 'heal') || selectedTargetIds.length === 0}
            style={{ flex: 1, padding: '0.5rem', background: name.trim() && selectedTargetIds.length > 0 ? '#446' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: name.trim() && selectedTargetIds.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
            Cast
          </button>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return (
    <div style={{ marginBottom: '0.4rem', flex }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.82rem', boxSizing: 'border-box',
};
