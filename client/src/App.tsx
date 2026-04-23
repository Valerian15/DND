import { useEffect, useState } from 'react';

function App() {
  const [message, setMessage] = useState('Loading...');
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/hello')
      .then((r) => r.json())
      .then((d) => setMessage(d.message))
      .catch((e) => setMessage(`Error: ${e.message}`));

    fetch('http://localhost:3001/api/users/count')
      .then((r) => r.json())
      .then((d) => setUserCount(d.count))
      .catch(() => setUserCount(null));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>DND VTT</h1>
      <p>{message}</p>
      <p>Users in database: {userCount === null ? '(error)' : userCount}</p>
    </div>
  );
}

export default App;
