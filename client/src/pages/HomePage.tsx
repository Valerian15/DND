import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export default function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>DND VTT</h1>
        <div>
          Logged in as <strong>{user?.username}</strong> ({user?.role}){' '}
          {user?.role === 'admin' && (
            <Link to="/admin" style={{ marginLeft: '1rem' }}>Admin panel</Link>
          )}
          <button onClick={logout} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
        <Link
          to="/characters"
          style={{
            padding: '1.5rem',
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textDecoration: 'none',
            color: '#333',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Characters</h3>
          <p style={{ color: '#666', margin: 0 }}>Create and manage your D&D characters.</p>
        </Link>
        <div
          style={{
            padding: '1.5rem',
            background: '#f5f5f5',
            borderRadius: 8,
            color: '#999',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Campaigns</h3>
          <p style={{ margin: 0 }}>Coming in Phase 3.</p>
        </div>
      </div>
    </div>
  );
}
