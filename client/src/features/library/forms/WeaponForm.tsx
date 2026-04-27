import type { FormProps } from './types';

const DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning'];

const ALL_PROPERTIES = [
  'finesse', 'light', 'heavy', 'reach', 'thrown',
  'two-handed', 'versatile', 'loading', 'ammunition',
];

const DAMAGE_DICE_OPTIONS = ['1d4', '1d6', '1d8', '1d10', '1d12', '2d6'];

export default function WeaponForm({ data, onChange }: FormProps) {
  function set(key: string, value: unknown) {
    onChange({ ...data, [key]: value });
  }

  const properties: string[] = Array.isArray(data.properties) ? (data.properties as string[]) : [];
  const isVersatile = properties.includes('versatile');
  const isRanged = data.weapon_type === 'Ranged' || properties.includes('thrown');

  function toggleProperty(prop: string) {
    const next = properties.includes(prop)
      ? properties.filter((p) => p !== prop)
      : [...properties, prop];
    onChange({ ...data, properties: next });
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Category">
          <select value={asString(data.category)} onChange={(e) => set('category', e.target.value)} style={input}>
            <option value="">— select —</option>
            <option value="Simple">Simple</option>
            <option value="Martial">Martial</option>
          </select>
        </Field>

        <Field label="Type">
          <select value={asString(data.weapon_type)} onChange={(e) => set('weapon_type', e.target.value)} style={input}>
            <option value="">— select —</option>
            <option value="Melee">Melee</option>
            <option value="Ranged">Ranged</option>
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Damage dice">
          <select value={asString(data.damage_dice)} onChange={(e) => set('damage_dice', e.target.value)} style={input}>
            <option value="">— none —</option>
            {DAMAGE_DICE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            <option value="custom">custom…</option>
          </select>
          {data.damage_dice === 'custom' && (
            <input
              type="text"
              placeholder="e.g. 2d4"
              style={{ ...input, marginTop: '0.4rem' }}
              onChange={(e) => set('damage_dice', e.target.value || 'custom')}
            />
          )}
        </Field>

        <Field label="Damage type">
          <select value={asString(data.damage_type)} onChange={(e) => set('damage_type', e.target.value)} style={input}>
            <option value="">— select —</option>
            {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>

      {isVersatile && (
        <Field label="Versatile damage dice" hint="Damage when wielded two-handed.">
          <select value={asString(data.versatile_dice)} onChange={(e) => set('versatile_dice', e.target.value)} style={input}>
            <option value="">— select —</option>
            {DAMAGE_DICE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      )}

      {isRanged && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field label="Normal range (ft)" hint="Attack at disadvantage beyond this.">
            <input
              type="number"
              min={0}
              value={asNumber(data.range_normal)}
              onChange={(e) => set('range_normal', Number(e.target.value))}
              style={input}
            />
          </Field>
          <Field label="Long range (ft)" hint="Max range, attacks have disadvantage.">
            <input
              type="number"
              min={0}
              value={asNumber(data.range_long)}
              onChange={(e) => set('range_long', Number(e.target.value))}
              style={input}
            />
          </Field>
        </div>
      )}

      <Field label="Properties">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4, background: '#fafafa' }}>
          {ALL_PROPERTIES.map((prop) => {
            const on = properties.includes(prop);
            return (
              <button
                key={prop}
                type="button"
                onClick={() => toggleProperty(prop)}
                style={{
                  padding: '0.3rem 0.7rem',
                  borderRadius: 16,
                  border: on ? '1px solid #2a7' : '1px solid #ccc',
                  background: on ? '#e0f5e0' : '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {prop}
              </button>
            );
          })}
        </div>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Cost" hint='e.g. "15 gp"'>
          <input type="text" value={asString(data.cost)} onChange={(e) => set('cost', e.target.value)} style={input} />
        </Field>
        <Field label="Weight" hint='e.g. "3 lb."'>
          <input type="text" value={asString(data.weight)} onChange={(e) => set('weight', e.target.value)} style={input} />
        </Field>
      </div>

      <Field label="Description (optional)">
        <textarea
          value={asString(data.desc)}
          onChange={(e) => set('desc', e.target.value)}
          rows={3}
          style={textarea}
        />
      </Field>
    </div>
  );
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asNumber(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.85rem', color: '#444', marginBottom: '0.2rem' }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.15rem' }}>{hint}</div>}
    </label>
  );
}

const input: React.CSSProperties = {
  width: '100%', padding: '0.5rem', fontSize: '0.95rem',
  border: '1px solid #ddd', borderRadius: 4, boxSizing: 'border-box',
};

const textarea: React.CSSProperties = {
  ...input, fontFamily: 'inherit', resize: 'vertical',
};
