import type { FormProps } from './types';

const SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
];

const CLASS_OPTIONS = [
  'bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard',
];

export default function SpellForm({ data, onChange }: FormProps) {
  function set(key: string, value: unknown) {
    onChange({ ...data, [key]: value });
  }

  const level = typeof data.level_int === 'number' ? data.level_int : (typeof data.level === 'number' ? data.level : 0);
  const lists: string[] = Array.isArray(data.spell_lists) ? (data.spell_lists as string[]) : [];

  function toggleClass(slug: string) {
    const next = lists.includes(slug) ? lists.filter((s) => s !== slug) : [...lists, slug];
    onChange({ ...data, spell_lists: next });
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Level" hint="0 = cantrip, 1–9 for leveled spells.">
          <select
            value={String(level)}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({ ...data, level_int: n, level: n });
            }}
            style={input}
          >
            <option value="0">0 (cantrip)</option>
            {[1,2,3,4,5,6,7,8,9].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>

        <Field label="School">
          <select value={asString(data.school)} onChange={(e) => set('school', e.target.value)} style={input}>
            <option value="">— select —</option>
            {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Casting time" hint='e.g. "1 action" or "1 bonus action"'>
          <input type="text" value={asString(data.casting_time)} onChange={(e) => set('casting_time', e.target.value)} style={input} />
        </Field>
        <Field label="Range" hint='e.g. "60 feet" or "Touch"'>
          <input type="text" value={asString(data.range)} onChange={(e) => set('range', e.target.value)} style={input} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Components" hint='e.g. "V, S, M"'>
          <input type="text" value={asString(data.components)} onChange={(e) => set('components', e.target.value)} style={input} />
        </Field>
        <Field label="Duration" hint='e.g. "Instantaneous" or "Concentration, up to 1 minute"'>
          <input type="text" value={asString(data.duration)} onChange={(e) => set('duration', e.target.value)} style={input} />
        </Field>
      </div>

      <Field label="Material component (optional)" hint="If components include M, describe the material here.">
        <input type="text" value={asString(data.material)} onChange={(e) => set('material', e.target.value)} style={input} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Concentration?" hint="Either yes or no.">
          <select value={asString(data.concentration) || 'no'} onChange={(e) => set('concentration', e.target.value)} style={input}>
            <option value="no">no</option>
            <option value="yes">yes</option>
          </select>
        </Field>
        <Field label="Ritual?">
          <select value={asString(data.ritual) || 'no'} onChange={(e) => set('ritual', e.target.value)} style={input}>
            <option value="no">no</option>
            <option value="yes">yes</option>
          </select>
        </Field>
      </div>

      <Field label="Class spell lists" hint="Pick all classes that can cast this spell. Determines which spells appear in each character's picker.">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4, background: '#fafafa' }}>
          {CLASS_OPTIONS.map((slug) => {
            const on = lists.includes(slug);
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggleClass(slug)}
                style={{
                  padding: '0.3rem 0.7rem',
                  borderRadius: 16,
                  border: on ? '1px solid #2a7' : '1px solid #ccc',
                  background: on ? '#e0f5e0' : '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  textTransform: 'capitalize',
                }}
              >
                {slug}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Description">
        <textarea
          value={asString(data.desc)}
          onChange={(e) => set('desc', e.target.value)}
          rows={6}
          style={textarea}
        />
      </Field>

      <Field label="At higher levels" hint="What happens when the spell is cast using a higher-level slot. Leave blank for cantrips.">
        <textarea
          value={asString(data.higher_level)}
          onChange={(e) => set('higher_level', e.target.value)}
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
