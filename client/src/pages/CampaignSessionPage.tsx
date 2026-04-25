import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCampaign } from '../features/campaign/api';
import type { Campaign } from '../features/campaign/types';

export default function CampaignSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCampaign(Number(id))
      .then(setCampaign)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading session…</div>;
  if (error) return <div style={{ padding: '2rem', color: 'crimson' }}>{error}</div>;
  if (!campaign) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui' }}>
      {/* Top bar */}
      <div style={{ padding: '0.75rem 1.5rem', background: '#1a1a1a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate(`/campaigns/${campaign.id}`)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: 0 }}>
            ← Back
          </button>
          <strong>{campaign.name}</strong>
          <span style={{ color: '#666', fontSize: '0.85rem' }}>DM: {campaign.dm_username}</span>
        </div>

        {/* Member portraits */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {campaign.members?.map((m) => (
            <div key={m.character_id} title={`${m.character_name} (${m.owner_username}) — Level ${m.level} ${m.class_slug ?? ''}`}>
              {m.portrait_url ? (
                <img src={m.portrait_url} alt={m.character_name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #444' }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '0.8rem', border: '2px solid #555' }}>
                  {m.character_name[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex' }}>
        {/* Map placeholder */}
        <div style={{ flex: 1, background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🗺️</div>
            <div style={{ fontSize: '1.1rem' }}>Map coming in Phase 4</div>
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Real-time token sync via Socket.io</div>
          </div>
        </div>

        {/* Side panel — member list */}
        <div style={{ width: 240, background: '#111', color: '#ddd', padding: '1rem', overflowY: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.85rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Players</div>
          {(!campaign.members || campaign.members.length === 0) ? (
            <div style={{ color: '#555', fontSize: '0.85rem' }}>No players yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {campaign.members.map((m) => (
                <div key={m.character_id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {m.portrait_url ? (
                    <img src={m.portrait_url} alt={m.character_name} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                      {m.character_name[0]}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{m.character_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>Lv {m.level} {m.class_slug ?? '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
