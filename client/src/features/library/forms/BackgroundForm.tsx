import type { FormProps } from './types';

export default function BackgroundForm({ data, onChange }: FormProps) {
  function set(key: string, value: string) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <Field label="Description" hint="Flavor text for the background.">
        <textarea
          value={asString(data.desc)}
          onChange={(e) => set('desc', e.target.value)}
          rows={3}
          style={textarea}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Skill proficiencies" hint='e.g. "Insight, Religion"'>
          <input
            type="text"
            value={asString(data.skill_proficiencies)}
            onChange={(e) => set('skill_proficiencies', e.target.value)}
            style={input}
          />
        </Field>
        <Field label="Tool proficiencies" hint='e.g. "Calligrapher\u2019s supplies"'>
          <input
            type="text"
            value={asString(data.tool_proficiencies)}
            onChange={(e) => set('tool_proficiencies', e.target.value)}
            style={input}
          />
        </Field>
      </div>

      <Field label="Languages" hint='e.g. "Two of your choice"'>
        <input
          type="text"
          value={asString(data.languages)}
          onChange={(e) => set('languages', e.target.value)}
          style={input}
        />
      </Field>

      <Field label="Equipment" hint="Starting equipment from this background.">
        <textarea
          value={asString(data.equipment)}
          onChange={(e) => set('equipment', e.target.value)}
          rows={3}
          style={textarea}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
        <Field label="Feature name">
          <input
            type="text"
            value={asString(data.feature)}
            onChange={(e) => set('feature', e.target.value)}
            style={input}
          />
        </Field>
        <Field label="Feature description">
          <textarea
            value={asString(data.feature_desc)}
            onChange={(e) => set('feature_desc', e.target.value)}
            rows={3}
            style={textarea}
          />
        </Field>
      </div>

      <Field label="Suggested characteristics" hint="Personality traits, ideals, bonds, flaws (optional).">
        <textarea
          value={asString(data.suggested_characteristics)}
          onChange={(e) => set('suggested_characteristics', e.target.value)}
          rows={4}
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
