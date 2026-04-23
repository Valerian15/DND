import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';

interface ManagedUser {
  id: number;
  username: string;
  role: 'admin' | 'player';
  created_at: number;
}

export default function AdminPage() {
  const { user: currentUser, logout } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'player'>('player');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ users: ManagedUser[] }>('/users');
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      setFormSuccess(`Created user "${newUsername}"`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('player');
      loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(userId: number, username: string) {
    const newPw = prompt(`New password for "${username}" (min 6 characters):`);
    if (!newPw) return;
    try {
      await apiFetch(`/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPw }),
      });
      alert(`Password reset for "${username}".`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset password');
    }
  }

  async function handleDelete(userId: number, username: string) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/users/${userId}`, { method: 'DELETE' });
      loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin — Users</h1>
          <Link to="/" style={{ fontSize: '0.9rem' }}>← Back to home</Link>
        </div>
        <div>
          Logged in as <strong>{currentUser?.username}</strong>{' '}
          <button onClick={logout} style={{ marginLeft: '0.5rem', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      <section style={{ marginBottom: '2.5rem', padding: '1.5rem', background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0 }}>Create user</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Username</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              minLength={3}
              maxLength={32}
              style={{ padding: '0.5rem', fontSize: '1rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Password</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              style={{ padding: '0.5rem', fontSize: '1rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'player')}
              style={{ padding: '0.5rem', fontSize: '1rem' }}
            >
              <option value="player">Player</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={submitting} style={{ padding: '0.5rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </form>
        {formError && <p style={{ color: 'crimson', marginTop: '1rem', marginBottom: 0 }}>{formError}</p>}
        {formSuccess && <p style={{ color: 'green', marginTop: '1rem', marginBottom: 0 }}>{formSuccess}</p>}
      </section>

      <section>
        <h2>All users</h2>
        {loading && <p>Loading…</p>}
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        {!loading && !error && (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <thead>
              <tr style={{ background: '#eee', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>Username</th>
                <th style={{ padding: '0.75rem' }}>Role</th>
                <th style={{ padding: '0.75rem' }}>Created</th>
                <th style={{ padding: '0.75rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem' }}>{u.username}{isSelf && ' (you)'}</td>
                    <td style={{ padding: '0.75rem' }}>{u.role}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
                      {new Date(u.created_at * 1000).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <button onClick={() => handleResetPassword(u.id, u.username)} style={{ marginRight: '0.5rem', cursor: 'pointer' }}>
                        Reset password
                      </button>
                      <button
                        onClick={() => handleDelete(u.id, u.username)}
                        disabled={isSelf}
                        style={{ cursor: isSelf ? 'not-allowed' : 'pointer', color: isSelf ? '#999' : 'crimson' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
