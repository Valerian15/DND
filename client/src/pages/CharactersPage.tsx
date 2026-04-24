import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Character } from '../features/character/types';
import { createCharacter, deleteCharacter, listCharacters } from '../features/character/api';
import { useAuth } from '../features/auth/AuthContext';

export default function CharactersPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listCharacters();
      setCharacters(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load characters');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const c = await createCharacter('Unnamed Hero');
      navigate(`/characters/${c.id}/edit`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create character');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(c: Character) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await deleteCharacter(c.id);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Characters</h1>
          <Link to="/" style={{ fontSize: '0.9rem' }}>← Home</Link>
        </div>
        <div>
          Logged in as <strong>{user?.username}</strong>{' '}
          <button onClick={logout} style={{ marginLeft: '0.5rem', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={creating}
        style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', marginBottom: '1.5rem' }}
      >
        {creating ? 'Creating…' : '+ New character'}
      </button>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {!loading && !error && characters.length === 0 && (
        <p style={{ color: '#888' }}>No characters yet. Click "New character" to create one.</p>
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {characters.map((c) => (
          <div
            key={c.id}
            style={{
              padding: '1rem',
              background: '#fff',
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Link to={`/characters/${c.id}`} style={{ textDecoration: 'none', color: '#333', flex: 1 }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{c.name}</div>
              <div style={{ fontSize: '0.85rem', color: '#666' }}>
                Level {c.level}
                {c.race_slug && ` · ${c.race_slug}`}
                {c.class_slug && ` · ${c.class_slug}`}
              </div>
            </Link>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link
                to={`/characters/${c.id}`}
                style={{ padding: '0.5rem 1rem', background: '#fff', color: '#333', border: '1px solid #333', borderRadius: 4, textDecoration: 'none' }}
              >
                View
              </Link>
              <Link
                to={`/characters/${c.id}/edit`}
                style={{ padding: '0.5rem 1rem', background: '#333', color: '#fff', borderRadius: 4, textDecoration: 'none' }}
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(c)}
                style={{ padding: '0.5rem 1rem', cursor: 'pointer', color: 'crimson' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
