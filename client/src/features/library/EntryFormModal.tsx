import { useState } from 'react';
import { createLibraryEntry, updateLibraryEntry } from './api';
import { CONTENT_TYPES, type ContentType, type LibraryDetail } from './types';
import BackgroundForm from './forms/BackgroundForm';
import SubclassForm from './forms/SubclassForm';
import SpellForm from './forms/SpellForm';
import { TYPES_WITH_FORM } from './forms/types';

interface Props {
  type: ContentType;
  mode: 'create' | 'edit';
  /** Required in edit mode */
  existing?: LibraryDetail;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = 'form' | 'json';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeStringify(obj: unknown): string {
  try { return JSON.stringify(obj, null, 2); } catch { return '{}'; }
}

export default function EntryFormModal({ type, mode, existing, onClose, onSaved }: Props) {
  const typeMeta = CONTENT_TYPES.find((t) => t.type === type);
  const isEdit = mode === 'edit';
  const hasForm = TYPES_WITH_FORM.has(type);

  const [name, setName] = useState(existing?.name ?? '');
  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const initialData: Record<string, unknown> = (existing?.data as Record<string, unknown>) ?? {};
  const [data, setData] = useState<Record<string, unknown>>(initialData);
  const [jsonText, setJsonText] = useState(safeStringify(initialData));
  const [tab, setTab] = useState<Tab>(hasForm ? 'form' : 'json');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  /** Update data from form-mode child component, and keep the JSON text in sync. */
  function onFormDataChange(next: Record<string, unknown>) {
    setData(next);
    setJsonText(safeStringify(next));
  }

  /** When the user types in the JSON box, update both the text and (if parseable) the data object. */
  function onJsonTextChange(text: string) {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setData(parsed as Record<string, unknown>);
      }
    } catch {
      // user is mid-edit, leave data alone
    }
  }

  /** Switching to form tab needs valid JSON in the text box; use whatever data state we have. */
  function switchTab(next: Tab) {
    if (next === 'form') {
      // Make sure jsonText reflects current data (in case user was editing JSON with errors)
      setJsonText(safeStringify(data));
    } else {
      // Switching to JSON: pull from data so any unsaved form edits show up
      setJsonText(safeStringify(data));
    }
    setTab(next);
  }

  async function handleSubmit() {
    setError(null);

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName) return setError('Name is required');
    if (!isEdit) {
      if (!trimmedSlug) return setError('Slug is required');
      if (!/^[a-z0-9-]+$/.test(trimmedSlug)) {
        return setError('Slug must contain only lowercase letters, numbers, and hyphens');
      }
    }

    // Determine final data: if user is on JSON tab, re-parse to catch latest edits
    let finalData: Record<string, unknown> = data;
    if (tab === 'json') {
      try {
        const parsed = JSON.parse(jsonText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return setError('Data must be a JSON object (not an array or primitive)');
        }
        finalData = parsed as Record<string, unknown>;
      } catch (e) {
        return setError('Data must be valid JSON: ' + (e instanceof Error ? e.message : String(e)));
      }
    }

    setSubmitting(true);
    try {
      if (isEdit && existing) {
        await updateLibraryEntry(type, existing.slug, {
          name: trimmedName,
          data: finalData,
        });
      } else {
        await createLibraryEntry(type, {
          slug: trimmedSlug,
          name: trimmedName,
          data: finalData,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  const heading = isEdit
    ? `Edit ${existing?.name ?? 'entry'}`
    : `Add new ${typeMeta?.label.replace(/s$/, '').toLowerCase() ?? type}`;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>{heading}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              autoFocus
              style={inputStyle}
            />
          </Field>
          <Field label={isEdit ? 'Slug (read-only)' : 'Slug (URL identifier)'}>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              placeholder="auto-generated from name"
              disabled={isEdit}
              style={{ ...inputStyle, background: isEdit ? '#f5f5f5' : '#fff', color: isEdit ? '#888' : '#333' }}
            />
          </Field>
        </div>

        {hasForm && (
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem', borderBottom: '1px solid #eee' }}>
            <TabButton active={tab === 'form'} onClick={() => switchTab('form')}>Form</TabButton>
            <TabButton active={tab === 'json'} onClick={() => switchTab('json')}>Raw JSON</TabButton>
          </div>
        )}

        {tab === 'form' && hasForm && (
          <>
            {type === 'backgrounds' && <BackgroundForm data={data} onChange={onFormDataChange} />}
            {type === 'subclasses' && <SubclassForm data={data} onChange={onFormDataChange} />}
            {type === 'spells' && <SpellForm data={data} onChange={onFormDataChange} />}
          </>
        )}

        {tab === 'json' && (
          <>
            <p style={{ color: '#666', fontSize: '0.85rem', marginTop: 0 }}>
              {hasForm
                ? 'Raw JSON is the source of truth. Switching back to Form will reflect changes here.'
                : 'No form is available for this type yet — edit the raw JSON object directly.'}
            </p>
            <textarea
              value={jsonText}
              onChange={(e) => onJsonTextChange(e.target.value)}
              rows={16}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85rem', resize: 'vertical' }}
              spellCheck={false}
            />
          </>
        )}

        {error && (
          <div style={{ color: '#c00', marginTop: '0.75rem', padding: '0.5rem', background: '#fee', borderRadius: 4, fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose} disabled={submitting} style={btn(false)}>Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} style={btn(true)}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>{label}</div>
      {children}
    </label>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.5rem 1rem',
        background: active ? '#fff' : 'transparent',
        border: '1px solid',
        borderColor: active ? '#ddd' : 'transparent',
        borderBottom: active ? '1px solid #fff' : '1px solid transparent',
        marginBottom: -1,
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        color: active ? '#222' : '#666',
        borderRadius: '4px 4px 0 0',
        fontSize: '0.9rem',
      }}
    >
      {children}
    </button>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: '1rem',
};

const dialogStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: '1.5rem',
  maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem', fontSize: '1rem',
  border: '1px solid #ddd', borderRadius: 4, boxSizing: 'border-box',
};

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: '0.5rem 1.25rem',
    background: primary ? '#333' : '#fff',
    color: primary ? '#fff' : '#333',
    border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: '0.95rem',
  };
}
