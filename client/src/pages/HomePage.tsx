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
      <p>Welcome, {user?.username}. Character creator, campaigns, and sessions land in the next phases.</p>
    </div>
  );
}
