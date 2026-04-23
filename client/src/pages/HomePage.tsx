import { useAuth } from '../features/auth/AuthContext';

export default function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>DND VTT</h1>
        <div>
          Logged in as <strong>{user?.username}</strong> ({user?.role}){' '}
          <button onClick={logout} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>
      <p>Welcome, {user?.username}. The real app content lands here in the next phases.</p>
    </div>
  );
}
