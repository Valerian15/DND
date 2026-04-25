import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getCampaign } from '../features/campaign/api';
import { useSession } from '../features/session/useSession';
import type { Campaign } from '../features/campaign/types';

export default function CampaignSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { online, connected } = useSession(Number(id));

  useEffect(() => {
    getCampaign(Number(id))
      .then(setCampaign)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading session…</div>;
  if (error) return <div style={{ padding: '2rem', color: 'crimson' }}>{error}</div>;
  if (!campaign) return null;

  const isDmOrAdmin = campaign.dm_id === user!.id || user!.role === 'admin';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui' }}>
      {/* Top bar */}
      <div style={{ padding: '0.6rem 1.25rem', background: '#fff', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate(`/campaigns/${campaign.id}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0 }}
          >
            ← Back
          </button>
          <strong>{campaign.name}</strong>
          {isDmOrAdmin && (
            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#333', color: '#fff', borderRadius: 10 }}>DM</span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: connected ? '#4a4' : '#a44' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#4a4' : '#a44', display: 'inline-block' }} />
            {connected ? 'Connected' : 'Connecting…'}
          </span>
        </div>

        {/* Online users */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#888' }}>Online:</span>
          {online.map((u) => (
            <div
              key={u.user_id}
              title={`${u.username} (${u.role})`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', padding: '0.2rem 0.5rem', background: '#f0f0f0', borderRadius: 12 }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4a4', display: 'inline-block' }} />
              {u.username}
            </div>
          ))}
          {online.length === 0 && <span style={{ fontSize: '0.85rem', color: '#aaa' }}>—</span>}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Map area — light grey so dark grid lines are visible */}
        <div style={{ flex: 1, background: '#e8e8e8', position: 'relative', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#aaa', userSelect: 'none' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗺</div>
            <div style={{ fontSize: '1rem', fontWeight: 500 }}>Map coming in Phase 4b</div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>DM will upload a map and place tokens here</div>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ width: 220, background: '#fff', borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Characters in session */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #eee' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Players ({campaign.members?.length ?? 0})
            </div>
            {(!campaign.members || campaign.members.length === 0) ? (
              <div style={{ fontSize: '0.85rem', color: '#bbb' }}>No players yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {campaign.members.map((m) => {
                  const isOnline = online.some((o) => o.user_id === m.owner_id);
                  return (
                    <div key={m.character_id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        {m.portrait_url ? (
                          <img src={m.portrait_url} alt={m.character_name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: '#888' }}>
                            {m.character_name[0]}
                          </div>
                        )}
                        <span style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#4a4' : '#ccc', border: '1.5px solid #fff' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.character_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>Lv {m.level} {m.class_slug ?? '—'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DM */}
          <div style={{ padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>DM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: online.some((o) => o.user_id === campaign.dm_id) ? '#4a4' : '#ccc', display: 'inline-block' }} />
              {campaign.dm_username}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
