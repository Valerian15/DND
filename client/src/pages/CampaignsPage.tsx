import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { listCampaigns, createCampaign, joinCampaign } from '../features/campaign/api';
import { listCharacters } from '../features/character/api';
import type { Campaign } from '../features/campaign/types';
import type { Character } from '../features/character/types';

export default function CampaignsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // join form state
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinCharId, setJoinCharId] = useState<number | ''>('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    Promise.all([listCampaigns(), listCharacters()])
      .then(([c, ch]) => {
        setCampaigns(c);
        setCharacters(ch);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Characters that aren't already in a campaign (no campaign_id on the character itself,
  // but we can check if their id appears in any campaign's members — simpler: just show all and
  // let the server reject if they're already in one)
  const myCharacters = characters.filter((c) => c.owner_id === user!.id);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const campaign = await createCampaign(createName.trim(), createDesc.trim());
      setCampaigns((prev) => [campaign, ...prev]);
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim() || joinCharId === '') return;
    setJoining(true);
    try {
      const { campaign_id } = await joinCampaign(joinCode.trim(), Number(joinCharId));
      navigate(`/campaigns/${campaign_id}`);
    } catch (e: any) {
      setError(e.message);
      setJoining(false);
    }
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading campaigns…</div>;

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Campaigns</h1>
        <a href="/" style={{ color: '#666', textDecoration: 'none' }}>← Home</a>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fee', border: '1px solid #fcc', borderRadius: 6, color: 'crimson' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '1rem', cursor: 'pointer', background: 'none', border: 'none', color: 'crimson' }}>✕</button>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => { setShowCreate(!showCreate); setShowJoin(false); }}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: showCreate ? '#333' : '#fff', color: showCreate ? '#fff' : '#333', border: '1px solid #ccc', borderRadius: 4 }}
        >
          + Create campaign
        </button>
        <button
          onClick={() => { setShowJoin(!showJoin); setShowCreate(false); }}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: showJoin ? '#333' : '#fff', color: showJoin ? '#fff' : '#333', border: '1px solid #ccc', borderRadius: 4 }}
        >
          Join via invite code
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ marginBottom: '1.5rem', padding: '1.25rem', background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0 }}>New campaign</h3>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Name *</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Tyranny of Dragons"
              required
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Description</label>
            <textarea
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="A short summary of the campaign…"
              rows={3}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={creating} style={{ padding: '0.5rem 1.25rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: creating ? 'not-allowed' : 'pointer' }}>
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Join form */}
      {showJoin && (
        <form onSubmit={handleJoin} style={{ marginBottom: '1.5rem', padding: '1.25rem', background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0 }}>Join a campaign</h3>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Invite code *</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABC123"
              required
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '0.1em' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Character to bring *</label>
            {myCharacters.length === 0 ? (
              <p style={{ color: '#999', margin: 0 }}>You have no characters yet. <a href="/characters">Create one first.</a></p>
            ) : (
              <select
                value={joinCharId}
                onChange={(e) => setJoinCharId(Number(e.target.value))}
                required
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }}
              >
                <option value="">Select a character…</option>
                {myCharacters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Level {c.level} {c.class_slug ?? 'No class'})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={joining || myCharacters.length === 0} style={{ padding: '0.5rem 1.25rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: joining ? 'not-allowed' : 'pointer' }}>
              {joining ? 'Joining…' : 'Join'}
            </button>
            <button type="button" onClick={() => setShowJoin(false)} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <p style={{ color: '#999' }}>No campaigns yet. Create one or join with an invite code.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {campaigns.map((c) => {
            const isDm = c.dm_id === user!.id || user!.role === 'admin';
            return (
              <div
                key={c.id}
                onClick={() => navigate(`/campaigns/${c.id}`)}
                style={{ padding: '1.25rem', background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{c.name}</strong>
                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: 12, background: isDm ? '#333' : '#e8e8e8', color: isDm ? '#fff' : '#555' }}>
                      {isDm ? 'DM' : 'Player'}
                    </span>
                  </div>
                  {c.description && <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>{c.description}</p>}
                  <p style={{ margin: '0.25rem 0 0', color: '#999', fontSize: '0.8rem' }}>DM: {c.dm_username} · {c.member_count ?? 0} player{c.member_count !== 1 ? 's' : ''}</p>
                </div>
                <span style={{ color: '#ccc', fontSize: '1.2rem' }}>›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
