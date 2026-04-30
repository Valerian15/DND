import { useState } from 'react';
import { abilityModifier, formatModifier } from '../character/pointBuy';
import type { CampaignNpc, NpcAttack, NpcTrait } from './types';

const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const SAVE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const SAVE_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

export interface NpcFormData {
  label: string;
  size: string;
  portrait_url: string | null;
  hp_max: number;
  ac: number;
  speed: string;
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  saving_throws: string[];
  attacks: NpcAttack[];
  traits: NpcTrait[];
  resistances: string[];
  vulnerabilities: string[];
  immunities: string[];
  notes: string;
}

function formDataFromNpc(npc: CampaignNpc): NpcFormData {
  return {
    label: npc.label,
    size: npc.size,
    portrait_url: npc.portrait_url,
    hp_max: npc.hp_max,
    ac: npc.ac ?? 10,
    speed: npc.speed || '30 ft.',
    abilities: npc.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saving_throws: npc.saving_throws ?? [],
    attacks: npc.attacks ? npc.attacks.map((a) => ({ ...a })) : [],
    traits: npc.traits ? npc.traits.map((t) => ({ ...t })) : [],
    resistances: npc.resistances ?? [],
    vulnerabilities: npc.vulnerabilities ?? [],
    immunities: npc.immunities ?? [],
    notes: npc.notes,
  };
}

const EMPTY: NpcFormData = {
  label: '', size: 'medium', portrait_url: null,
  hp_max: 10, ac: 10, speed: '30 ft.',
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saving_throws: [], attacks: [], traits: [],
  resistances: [], vulnerabilities: [], immunities: [],
  notes: '',
};

const EMPTY_ATTACK: NpcAttack = { name: '', to_hit: 0, damage: '1d6', damage_type: 'slashing' };
const EMPTY_TRAIT: NpcTrait = { name: '', description: '' };

interface Props {
  initial?: CampaignNpc;
  onSave: (data: NpcFormData) => void;
  onCancel: () => void;
  submitting: boolean;
}

function AbilityInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const mod = abilityModifier(value);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#555', marginBottom: 2 }}>{label}</div>
      <input
        type="number" value={value} min={1} max={30}
        onChange={(e) => onChange(Math.max(1, Math.min(30, Number(e.target.value) || 10)))}
        style={{ width: '100%', padding: '0.3rem 0.2rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem', textAlign: 'center', boxSizing: 'border-box' }}
      />
      <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 1 }}>{formatModifier(mod)}</div>
    </div>
  );
}

export function NpcForm({ initial, onSave, onCancel, submitting }: Props) {
  const [form, setForm] = useState<NpcFormData>(() => initial ? formDataFromNpc(initial) : { ...EMPTY });
  const [attacks, setAttacks] = useState<NpcAttack[]>(() => initial?.attacks?.map((a) => ({ ...a })) ?? []);
  const [traits, setTraits] = useState<NpcTrait[]>(() => initial?.traits?.map((t) => ({ ...t })) ?? []);

  function setAbility(key: keyof typeof EMPTY.abilities, v: number) {
    setForm((f) => ({ ...f, abilities: { ...f.abilities, [key]: v } }));
  }

  function toggleSave(key: string) {
    setForm((f) => ({
      ...f,
      saving_throws: f.saving_throws.includes(key)
        ? f.saving_throws.filter((s) => s !== key)
        : [...f.saving_throws, key],
    }));
  }

  function addAttack() { setAttacks((a) => [...a, { ...EMPTY_ATTACK }]); }
  function removeAttack(i: number) { setAttacks((a) => a.filter((_, j) => j !== i)); }
  function updateAttack(i: number, patch: Partial<NpcAttack>) {
    setAttacks((a) => a.map((atk, j) => j === i ? { ...atk, ...patch } : atk));
  }

  function addTrait() { setTraits((t) => [...t, { ...EMPTY_TRAIT }]); }
  function removeTrait(i: number) { setTraits((t) => t.filter((_, j) => j !== i)); }
  function updateTrait(i: number, patch: Partial<NpcTrait>) {
    setTraits((t) => t.map((tr, j) => j === i ? { ...tr, ...patch } : tr));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...form, attacks, traits });
  }

  const fieldStyle = { padding: '0.38rem 0.5rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontSize: '0.75rem', fontWeight: 600 as const, color: '#555', marginBottom: 2 };
  const sectionHeadStyle = { fontSize: '0.72rem', fontWeight: 700 as const, color: '#8b0000', textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0.85rem 0 0.4rem' };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', background: '#fafafa', borderRadius: 6, border: '1px solid #e0e0e0' }}>

      {/* Identity */}
      <div style={sectionHeadStyle}>Identity</div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Name *</label>
          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required placeholder="e.g. Orc Warchief" style={{ ...fieldStyle, width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Size</label>
          <select value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} style={{ ...fieldStyle, width: '100%' }}>
            {SIZES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Portrait URL</label>
        <input value={form.portrait_url ?? ''} onChange={(e) => setForm((f) => ({ ...f, portrait_url: e.target.value || null }))} placeholder="https://…" style={{ ...fieldStyle, width: '100%' }} />
      </div>

      {/* Core stats */}
      <div style={sectionHeadStyle}>Core Stats</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '0.5rem' }}>
        <div>
          <label style={labelStyle}>AC</label>
          <input type="number" value={form.ac} min={1} max={30} onChange={(e) => setForm((f) => ({ ...f, ac: Number(e.target.value) || 10 }))} style={{ ...fieldStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>HP Max</label>
          <input type="number" value={form.hp_max} min={1} onChange={(e) => setForm((f) => ({ ...f, hp_max: Number(e.target.value) || 10 }))} style={{ ...fieldStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Speed</label>
          <input value={form.speed} onChange={(e) => setForm((f) => ({ ...f, speed: e.target.value }))} placeholder="30 ft." style={{ ...fieldStyle, width: '100%' }} />
        </div>
      </div>

      {/* Ability scores */}
      <div style={sectionHeadStyle}>Ability Scores</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem' }}>
        {SAVE_KEYS.map((key) => (
          <AbilityInput key={key} label={SAVE_LABELS[key]} value={form.abilities[key]} onChange={(v) => setAbility(key, v)} />
        ))}
      </div>

      {/* Saving throw proficiencies */}
      <div style={sectionHeadStyle}>Save Proficiencies</div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {SAVE_KEYS.map((key) => {
          const checked = form.saving_throws.includes(key);
          return (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={() => toggleSave(key)} />
              {SAVE_LABELS[key]}
            </label>
          );
        })}
      </div>

      {/* Damage modifiers */}
      <div style={sectionHeadStyle}>Damage Modifiers</div>
      <div style={{ fontSize: '0.7rem', color: '#888', marginTop: -8, marginBottom: 4 }}>
        Half / double / zero damage of the chosen type. Used by combat automation.
      </div>
      {(['resistances', 'vulnerabilities', 'immunities'] as const).map((kind) => {
        const labels = { resistances: 'Resistances (½×)', vulnerabilities: 'Vulnerabilities (2×)', immunities: 'Immunities (0×)' };
        const colors = { resistances: '#3a8', vulnerabilities: '#c63', immunities: '#669' };
        const selected = form[kind];
        const toggle = (dt: string) => {
          setForm((f) => ({ ...f, [kind]: f[kind].includes(dt) ? f[kind].filter((x) => x !== dt) : [...f[kind], dt] }));
        };
        return (
          <div key={kind} style={{ marginBottom: '0.4rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: colors[kind], marginBottom: 3 }}>{labels[kind]}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {DAMAGE_TYPES.map((dt) => {
                const active = selected.includes(dt);
                return (
                  <button key={dt} type="button" onClick={() => toggle(dt)}
                    style={{
                      padding: '0.15rem 0.4rem', fontSize: '0.7rem',
                      border: `1px solid ${active ? colors[kind] : '#ddd'}`,
                      background: active ? colors[kind] : '#fff',
                      color: active ? '#fff' : '#666', borderRadius: 3, cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}>{dt}</button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Attacks */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...{margin: '0.85rem 0 0.4rem'} }}>
        <span style={sectionHeadStyle}>Attacks</span>
        <button type="button" onClick={addAttack} style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', border: '1px solid #4a8', borderRadius: 3, background: '#e8f5e8', color: '#336633', cursor: 'pointer' }}>+ Add</button>
      </div>
      {attacks.map((atk, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 5, padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Name</label>
              <input value={atk.name} onChange={(e) => updateAttack(i, { name: e.target.value })} placeholder="e.g. Greataxe" style={{ ...fieldStyle, width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>To Hit</label>
              <input type="number" value={atk.to_hit} onChange={(e) => updateAttack(i, { to_hit: Number(e.target.value) })} style={{ ...fieldStyle, width: '100%' }} />
            </div>
            <button type="button" onClick={() => removeAttack(i)} style={{ marginTop: 18, padding: '0.25rem 0.5rem', border: '1px solid #fcc', borderRadius: 3, background: '#fff', color: 'crimson', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Damage</label>
              <input value={atk.damage} onChange={(e) => updateAttack(i, { damage: e.target.value })} placeholder="1d6+3" style={{ ...fieldStyle, width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <select value={atk.damage_type} onChange={(e) => updateAttack(i, { damage_type: e.target.value })} style={{ ...fieldStyle, width: '100%' }}>
                {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Description (optional)</label>
            <input value={atk.description ?? ''} onChange={(e) => updateAttack(i, { description: e.target.value || undefined })} placeholder="Reach 5 ft., one target." style={{ ...fieldStyle, width: '100%' }} />
          </div>
        </div>
      ))}

      {/* Traits */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...{margin: '0.4rem 0 0.4rem'} }}>
        <span style={sectionHeadStyle}>Traits</span>
        <button type="button" onClick={addTrait} style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', border: '1px solid #4a8', borderRadius: 3, background: '#e8f5e8', color: '#336633', cursor: 'pointer' }}>+ Add</button>
      </div>
      {traits.map((tr, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 5, padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Name</label>
              <input value={tr.name} onChange={(e) => updateTrait(i, { name: e.target.value })} placeholder="e.g. Aggressive" style={{ ...fieldStyle, width: '100%' }} />
            </div>
            <button type="button" onClick={() => removeTrait(i)} style={{ marginTop: 18, padding: '0.25rem 0.5rem', border: '1px solid #fcc', borderRadius: 3, background: '#fff', color: 'crimson', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0 }}>✕</button>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={tr.description} onChange={(e) => updateTrait(i, { description: e.target.value })} rows={2} placeholder="As a bonus action, the NPC can move up to its speed toward a hostile creature it can see." style={{ ...fieldStyle, width: '100%', resize: 'vertical' }} />
          </div>
        </div>
      ))}

      {/* Notes */}
      <div style={sectionHeadStyle}>Notes</div>
      <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Any additional notes…" style={{ ...fieldStyle, width: '100%', resize: 'vertical' }} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
        <button type="submit" disabled={submitting} style={{ flex: 1, padding: '0.45rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create NPC'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '0.45rem 0.9rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}>Cancel</button>
      </div>
    </form>
  );
}
