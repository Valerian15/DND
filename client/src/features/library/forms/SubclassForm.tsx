import { useEffect, useState } from 'react';
import { listLibrary } from '../api';
import type { LibraryListItem } from '../types';
import type { FormProps } from './types';

export default function SubclassForm({ data, onChange }: FormProps) {
  const [classes, setClasses] = useState<LibraryListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listLibrary('classes')
      .then(setClasses)
      .finally(() => setLoading(false));
  }, []);

  function set(key: string, value: string) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <Field label="Parent class" hint="Required. Determines which class this subclass belongs to.">
        {loading ? (
          <div style={{ color: '#888' }}>Loading classes…</div>
        ) : (
          <select
            value={asString(data.class_slug)}
            onChange={(e) => set('class_slug', e.target.value)}
            style={input}
          >
            <option value="">— select a class —</option>
            {classes.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Description / features" hint="Full text of all subclass features. Plain text or Markdown is fine.">
        <textarea
          value={asString(data.desc)}
          onChange={(e) => set('desc', e.target.value)}
          rows={16}
          style={{ ...textarea, fontFamily: 'inherit' }}
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
