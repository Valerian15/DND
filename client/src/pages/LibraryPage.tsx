import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { listLibrary } from '../features/library/api';
import EntryFormModal from '../features/library/EntryFormModal';
import DetailModal from '../features/library/DetailModal';
import { CONTENT_TYPES, type ContentType, type LibraryDetail, type LibraryListItem } from '../features/library/types';

type Modal =
  | { kind: 'none' }
  | { kind: 'detail'; slug: string }
  | { kind: 'create' }
  | { kind: 'edit'; entry: LibraryDetail };

export default function LibraryPage() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeType, setActiveType] = useState<ContentType>('races');
  const [items, setItems] = useState<LibraryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>({ kind: 'none' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLibrary(activeType)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeType, reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to="/" style={{ textDecoration: 'none', color: '#666', fontSize: '0.9rem' }}>← Home</Link>
          <h1 style={{ margin: '0.25rem 0 0' }}>Library</h1>
        </div>
        <div>
          Logged in as <strong>{user?.username}</strong> ({user?.role}){' '}
          {isAdmin && (
            <Link to="/admin" style={{ marginLeft: '1rem' }}>Admin panel</Link>
          )}
          <button onClick={logout} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', borderBottom: '1px solid #ddd', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        {CONTENT_TYPES.map((t) => {
          const active = t.type === activeType;
          return (
            <button
              key={t.type}
              onClick={() => setActiveType(t.type)}
              style={{
                padding: '0.6rem 1rem',
                background: active ? '#fff' : 'transparent',
                border: '1px solid',
                borderColor: active ? '#ddd' : 'transparent',
                borderBottomColor: active ? '#fff' : 'transparent',
                marginBottom: -1,
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
                color: active ? '#222' : '#666',
                borderRadius: '6px 6px 0 0',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ color: '#666', fontSize: '0.9rem' }}>
            {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}
          </div>
          {isAdmin && (
            <button
              onClick={() => setModal({ kind: 'create' })}
              style={{
                padding: '0.5rem 1rem',
                background: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              + Add new
            </button>
          )}
        </div>

        {error && <div style={{ color: '#c00' }}>Error: {error}</div>}
        {!loading && !error && items.length === 0 && (
          <div style={{ color: '#666' }}>No entries yet.</div>
        )}
        {!loading && !error && items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {items.map((item) => {
              const isSrd = item.source === 'srd-2014';
              return (
                <button
                  key={item.id}
                  onClick={() => setModal({ kind: 'detail', slug: item.slug })}
                  style={{
                    textAlign: 'left',
                    padding: '0.9rem 1rem',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#222' }}>{item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: isSrd ? '#888' : '#27a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {isSrd ? 'SRD' : item.source}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {modal.kind === 'detail' && (
        <DetailModal
          type={activeType}
          slug={modal.slug}
          isAdmin={isAdmin}
          onClose={() => setModal({ kind: 'none' })}
          onEdit={(entry) => setModal({ kind: 'edit', entry })}
          onDeleted={() => {
            setModal({ kind: 'none' });
            reload();
          }}
        />
      )}

      {modal.kind === 'create' && (
        <EntryFormModal
          type={activeType}
          mode="create"
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            reload();
          }}
        />
      )}

      {modal.kind === 'edit' && (
        <EntryFormModal
          type={activeType}
          mode="edit"
          existing={modal.entry}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            reload();
          }}
        />
      )}
    </div>
  );
}
