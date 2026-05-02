import { useEffect, useState } from 'react';
import { addEntryTag, deleteLibraryEntry, getEntryTags, getLibraryDetail, removeEntryTag } from './api';
import { Statblock } from './Statblock';
import type { ContentType, LibraryDetail } from './types';

interface Props {
  type: ContentType;
  slug: string;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (entry: LibraryDetail) => void;
  onDeleted: () => void;
}

export default function DetailModal({ type, slug, isAdmin, onClose, onEdit, onDeleted }: Props) {
  const [entry, setEntry] = useState<LibraryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLibraryDetail(type, slug)
      .then((data) => { if (!cancelled) setEntry(data); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    getEntryTags(type, slug).then((t) => { if (!cancelled) setTags(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [type, slug]);

  async function addTag() {
    const t = newTagInput.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) { setNewTagInput(''); return; }
    setTags((prev) => [...prev, t].sort());
    setNewTagInput('');
    try { await addEntryTag(type, slug, t); }
    catch { setTags((prev) => prev.filter((x) => x !== t)); }
  }

  async function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
    try { await removeEntryTag(type, slug, t); }
    catch { setTags((prev) => [...prev, t].sort()); }
  }

  async function handleDelete() {
    if (!entry) return;
    if (!confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteLibraryEntry(type, slug);
      onDeleted();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
    }
  }

  const isSrd = entry?.source === 'srd-2014';
  const canModify = isAdmin && entry && !isSrd;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            {loading ? (
              <h2 style={{ margin: 0 }}>Loading…</h2>
            ) : entry ? (
              <>
                <h2 style={{ margin: 0 }}>{entry.name}</h2>
                <div style={{ fontSize: '0.8rem', color: isSrd ? '#888' : '#27a', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: '0.25rem' }}>
                  {isSrd ? 'SRD' : entry.source} · slug: {entry.slug}
                </div>
              </>
            ) : (
              <h2 style={{ margin: 0, color: '#c00' }}>Error</h2>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}>×</button>
        </div>

        {error && (
          <div style={{ color: '#c00', padding: '0.5rem', background: '#fee', borderRadius: 4, fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {entry && (
          <>
            {/* Tags row — admins can add/remove; everyone sees the chips. */}
            <div style={{ marginBottom: '0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.7rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tags</span>
              {tags.map((t) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.15rem 0.45rem', background: '#eef0f5', border: '1px solid #d8dde6', borderRadius: 12, fontSize: '0.72rem', color: '#446' }}>
                  #{t}
                  {isAdmin && (
                    <button onClick={() => removeTag(t)} title="Remove tag"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#88a', padding: 0, fontSize: '0.8rem', lineHeight: 1 }}>×</button>
                  )}
                </span>
              ))}
              {isAdmin && (
                <input value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="+ tag"
                  style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem', border: '1px solid #ccc', borderRadius: 12, width: 90, outline: 'none' }} />
              )}
              {!isAdmin && tags.length === 0 && <span style={{ fontSize: '0.72rem', color: '#bbb', fontStyle: 'italic' }}>No tags.</span>}
            </div>

            <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
              <Statblock type={type} name={entry.name} data={entry.data ?? {}} />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', alignItems: 'center' }}>
          {entry && isAdmin && isSrd && (
            <span style={{ marginRight: 'auto', color: '#888', fontSize: '0.85rem' }}>
              SRD content cannot be edited or deleted.
            </span>
          )}
          {canModify && (
            <>
              <button onClick={handleDelete} disabled={deleting} style={btn('danger')}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => entry && onEdit(entry)} disabled={deleting} style={btn('primary')}>
                Edit
              </button>
            </>
          )}
          <button onClick={onClose} style={btn('secondary')}>Close</button>
        </div>
      </div>
    </div>
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

function btn(variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  if (variant === 'danger') {
    return {
      padding: '0.5rem 1.25rem',
      background: '#fff', color: '#c00',
      border: '1px solid #c00', borderRadius: 4, cursor: 'pointer', fontSize: '0.95rem',
    };
  }
  if (variant === 'primary') {
    return {
      padding: '0.5rem 1.25rem',
      background: '#333', color: '#fff',
      border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: '0.95rem',
    };
  }
  return {
    padding: '0.5rem 1.25rem',
    background: '#fff', color: '#333',
    border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: '0.95rem',
  };
}
