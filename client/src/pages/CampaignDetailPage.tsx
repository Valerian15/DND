import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getCampaign, updateCampaign, deleteCampaign, removeMember } from '../features/campaign/api';
import type { Campaign } from '../features/campaign/types';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // edit form state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editRolledHp, setEditRolledHp] = useState(false);
  const [saving, setSaving] = useState(false);

  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    getCampaign(Number(id))
      .then((c) => {
        setCampaign(c);
        setEditName(c.name);
        setEditDesc(c.description);
        setEditRolledHp(c.settings.rolled_hp);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading campaign…</div>;
  if (error) return <div style={{ padding: '2rem', color: 'crimson' }}>{error}</div>;
  if (!campaign) return null;

  const isDmOrAdmin = campaign.dm_id === user!.id || user!.role === 'admin';

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    setSaving(true);
    try {
      const updated = await updateCampaign(campaign.id, {
        name: editName,
        description: editDesc,
        settings: { rolled_hp: editRolledHp },
      });
      setCampaign((prev) => ({ ...updated, members: prev?.members }));
      setShowEdit(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!campaign) return;
    if (!confirm(`Delete "${campaign.name}"? This removes all players from the campaign.`)) return;
    try {
      await deleteCampaign(campaign.id);
      navigate('/campaigns');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRemoveMember(characterId: number, characterName: string) {
    if (!campaign) return;
    if (!confirm(`Remove ${characterName} from this campaign?`)) return;
    try {
      await removeMember(campaign.id, characterId);
      setCampaign((prev) =>
        prev ? { ...prev, members: prev.members?.filter((m) => m.character_id !== characterId) } : prev
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  function copyInviteCode() {
    navigator.clipboard.writeText(campaign!.invite_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <a href="/campaigns" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>← Campaigns</a>
          <h1 style={{ margin: '0.25rem 0 0' }}>{campaign.name}</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#666' }}>DM: {campaign.dm_username}</p>
        </div>
        <button
          onClick={() => navigate(`/campaigns/${campaign.id}/session`)}
          style={{ padding: '0.6rem 1.25rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
        >
          Enter session →
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fee', border: '1px solid #fcc', borderRadius: 6, color: 'crimson' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '1rem', cursor: 'pointer', background: 'none', border: 'none', color: 'crimson' }}>✕</button>
        </div>
      )}

      {/* Campaign info */}
      <div style={{ background: '#fff', padding: '1.25rem', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.25rem' }}>
        {campaign.description && <p style={{ margin: '0 0 1rem', color: '#444' }}>{campaign.description}</p>}

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#555' }}>
          <span>HP on level-up: <strong>{campaign.settings.rolled_hp ? 'Rolled' : 'Fixed average'}</strong></span>
        </div>

        {isDmOrAdmin && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f5f5f5', padding: '0.4rem 0.75rem', borderRadius: 4 }}>
              <span style={{ fontFamily: 'monospace', letterSpacing: '0.1em', fontWeight: 600 }}>{campaign.invite_code}</span>
              <button onClick={copyInviteCode} style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#555', padding: 0 }}>
                {codeCopied ? '✓ Copied' : 'Copy invite code'}
              </button>
            </div>
            <button
              onClick={() => { setShowEdit(!showEdit); setEditName(campaign.name); setEditDesc(campaign.description); setEditRolledHp(campaign.settings.rolled_hp); }}
              style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, background: '#fff', color: 'crimson' }}
            >
              Delete campaign
            </button>
          </div>
        )}
      </div>

      {/* Edit form */}
      {showEdit && isDmOrAdmin && (
        <form onSubmit={handleSaveEdit} style={{ background: '#fff', padding: '1.25rem', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.25rem' }}>
          <h3 style={{ marginTop: 0 }}>Edit campaign</h3>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Name</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} required style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Description</label>
            <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={editRolledHp} onChange={(e) => setEditRolledHp(e.target.checked)} />
              Roll HP on level-up (instead of fixed average)
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={saving} style={{ padding: '0.5rem 1.25rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowEdit(false)} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Members */}
      <div style={{ background: '#fff', padding: '1.25rem', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Players ({campaign.members?.length ?? 0})</h2>
        {(!campaign.members || campaign.members.length === 0) ? (
          <p style={{ color: '#999', margin: 0 }}>No players yet. Share the invite code to let someone join.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {campaign.members.map((m) => {
              const isOwnChar = m.owner_id === user!.id;
              return (
                <div key={m.character_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#f9f9f9', borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {m.portrait_url ? (
                      <img src={m.portrait_url} alt={m.character_name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '1.1rem' }}>?</div>
                    )}
                    <div>
                      <strong>{m.character_name}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>Level {m.level} {m.class_slug ?? '—'} · {m.owner_username}</div>
                    </div>
                  </div>
                  {(isDmOrAdmin || isOwnChar) && (
                    <button
                      onClick={() => handleRemoveMember(m.character_id, m.character_name)}
                      style={{ padding: '0.3rem 0.6rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, background: '#fff', color: 'crimson', fontSize: '0.85rem' }}
                    >
                      {isOwnChar && !isDmOrAdmin ? 'Leave' : 'Remove'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
