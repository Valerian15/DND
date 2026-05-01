import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getCampaign, updateCampaign, deleteCampaign, removeMember } from '../features/campaign/api';
import type { Campaign } from '../features/campaign/types';
import type { CampaignNpc, TokenCategory } from '../features/session/types';
import {
  listCampaignNpcs, createCampaignNpc, updateCampaignNpc, deleteCampaignNpc,
  listTokenCategories, createTokenCategory, updateTokenCategory, deleteTokenCategory,
} from '../features/session/tokenApi';
import { NpcForm, type NpcFormData } from '../features/session/NpcForm';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editRolledHp, setEditRolledHp] = useState(false);
  const [editAutomation, setEditAutomation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // NPC prep state (DM only)
  const [npcs, setNpcs] = useState<CampaignNpc[]>([]);
  const [categories, setCategories] = useState<TokenCategory[]>([]);
  const [addingNpcCatId, setAddingNpcCatId] = useState<number | null>(null);
  const [savingNpc, setSavingNpc] = useState(false);
  const [editingNpcId, setEditingNpcId] = useState<number | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [renamingCatId, setRenamingCatId] = useState<number | null>(null);
  const [renameCatName, setRenameCatName] = useState('');

  useEffect(() => {
    getCampaign(Number(id))
      .then((c) => {
        setCampaign(c);
        setEditName(c.name);
        setEditDesc(c.description);
        setEditRolledHp(c.settings.rolled_hp);
        setEditAutomation(c.settings.combat_automation ?? false);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const isDmOrAdmin = campaign ? (campaign.dm_id === user!.id || user!.role === 'admin') : false;

  useEffect(() => {
    if (!isDmOrAdmin || !campaign) return;
    Promise.all([listCampaignNpcs(campaign.id), listTokenCategories(campaign.id)]).then(([n, c]) => {
      setNpcs(n);
      setCategories(c);
    });
  }, [campaign?.id, isDmOrAdmin]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading campaign…</div>;
  if (error && !campaign) return <div style={{ padding: '2rem', color: 'crimson' }}>{error}</div>;
  if (!campaign) return null;

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    setSaving(true);
    try {
      const updated = await updateCampaign(campaign.id, {
        name: editName,
        description: editDesc,
        settings: { rolled_hp: editRolledHp, combat_automation: editAutomation },
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

  async function handleAddNpc(data: NpcFormData, catId: number | null) {
    if (!campaign) return;
    setSavingNpc(true);
    try {
      const npc = await createCampaignNpc({
        campaign_id: campaign.id,
        category_id: catId,
        label: data.label,
        size: data.size,
        hp_max: data.hp_max,
        ac: data.ac,
        speed: data.speed,
        abilities: data.abilities,
        saving_throws: data.saving_throws,
        attacks: data.attacks,
        traits: data.traits,
        resistances: data.resistances,
        vulnerabilities: data.vulnerabilities,
        immunities: data.immunities,
        portrait_url: data.portrait_url,
        notes: data.notes,
        dm_notes: data.dm_notes,
        spells: data.spells,
        spell_slots: data.spell_slots,
        spell_save_dc: data.spell_save_dc,
        spell_attack_bonus: data.spell_attack_bonus,
      });
      setNpcs((prev) => [...prev, npc]);
      setAddingNpcCatId(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingNpc(false);
    }
  }

  async function handleSaveNpcEdit(data: NpcFormData, npc: CampaignNpc) {
    try {
      const updated = await updateCampaignNpc(npc.id, {
        label: data.label,
        size: data.size,
        hp_max: data.hp_max,
        ac: data.ac,
        speed: data.speed,
        abilities: data.abilities,
        saving_throws: data.saving_throws,
        attacks: data.attacks,
        traits: data.traits,
        resistances: data.resistances,
        vulnerabilities: data.vulnerabilities,
        immunities: data.immunities,
        portrait_url: data.portrait_url,
        notes: data.notes,
        dm_notes: data.dm_notes,
        spells: data.spells,
        spell_slots: data.spell_slots,
        spell_save_dc: data.spell_save_dc,
        spell_attack_bonus: data.spell_attack_bonus,
      });
      setNpcs((prev) => prev.map((n) => n.id === updated.id ? updated : n));
      setEditingNpcId(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDeleteNpc(npcId: number) {
    if (!confirm('Delete this NPC?')) return;
    try {
      await deleteCampaignNpc(npcId);
      setNpcs((prev) => prev.filter((n) => n.id !== npcId));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign || !newCatName.trim()) return;
    try {
      const cat = await createTokenCategory(campaign.id, newCatName.trim());
      setCategories((prev) => [...prev, cat]);
      setNewCatName('');
      setAddingCategory(false);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRenameCategory(e: React.FormEvent, catId: number) {
    e.preventDefault();
    if (!renameCatName.trim()) return;
    try {
      const updated = await updateTokenCategory(catId, renameCatName.trim());
      setCategories((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      setRenamingCatId(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDeleteCategory(catId: number, catName: string) {
    if (!confirm(`Delete category "${catName}"? NPCs will be moved to uncategorized.`)) return;
    try {
      await deleteTokenCategory(catId);
      setCategories((prev) => prev.filter((c) => c.id !== catId));
    } catch (e: any) {
      setError(e.message);
    }
  }

  const npcCategories = categories.filter((c) => c.sort_order !== 0);

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
          <span>Combat: <strong>{campaign.settings.combat_automation ? 'Automatic' : 'Manual'}</strong></span>
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
              onClick={() => { setShowEdit(!showEdit); setEditName(campaign.name); setEditDesc(campaign.description); setEditRolledHp(campaign.settings.rolled_hp); setEditAutomation(campaign.settings.combat_automation ?? false); }}
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
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={editAutomation} onChange={(e) => setEditAutomation(e.target.checked)} />
              <span>
                <strong>Combat automation</strong>
                <span style={{ fontSize: '0.85rem', color: '#666', display: 'block', marginTop: '0.15rem' }}>
                  When enabled, casting damage spells with selected targets auto-rolls each target's save and applies damage end-to-end. Otherwise the dice-log apply buttons are used.
                </span>
              </span>
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
      <div style={{ background: '#fff', padding: '1.25rem', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.25rem' }}>
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

      {/* NPC Templates (DM only) */}
      {isDmOrAdmin && (
        <div style={{ background: '#fff', padding: '1.25rem', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>My NPCs</h2>
            <button
              onClick={() => { setAddingCategory(true); setNewCatName(''); }}
              style={{ padding: '0.3rem 0.75rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }}
            >
              + Category
            </button>
          </div>

          {addingCategory && (
            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" required autoFocus style={{ flex: 1, padding: '0.4rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }} />
              <button type="submit" style={{ padding: '0.4rem 0.75rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}>Add</button>
              <button type="button" onClick={() => setAddingCategory(false)} style={{ padding: '0.4rem 0.6rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }}>✕</button>
            </form>
          )}

          {npcCategories.length === 0 && npcs.length === 0 && (
            <p style={{ color: '#999', margin: 0, fontSize: '0.9rem' }}>No NPCs yet. Add a category to get started.</p>
          )}

          {npcCategories.map((cat) => {
            const catNpcs = npcs.filter((n) => n.category_id === cat.id);
            return (
              <div key={cat.id} style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {renamingCatId === cat.id ? (
                    <form onSubmit={(e) => handleRenameCategory(e, cat.id)} style={{ display: 'flex', gap: '0.4rem', flex: 1 }}>
                      <input value={renameCatName} onChange={(e) => setRenameCatName(e.target.value)} autoFocus required style={{ flex: 1, padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }} />
                      <button type="submit" style={{ padding: '0.3rem 0.6rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                      <button type="button" onClick={() => setRenamingCatId(null)} style={{ padding: '0.3rem 0.5rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.8rem' }}>✕</button>
                    </form>
                  ) : (
                    <>
                      <strong style={{ fontSize: '0.95rem' }}>{cat.name}</strong>
                      {!cat.is_default && (
                        <>
                          <button onClick={() => { setRenamingCatId(cat.id); setRenameCatName(cat.name); }} style={{ padding: '0.2rem 0.5rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, fontSize: '0.75rem', background: '#fff' }}>Rename</button>
                          <button onClick={() => handleDeleteCategory(cat.id, cat.name)} style={{ padding: '0.2rem 0.5rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, fontSize: '0.75rem', color: 'crimson', background: '#fff' }}>Delete</button>
                        </>
                      )}
                    </>
                  )}
                </div>

                {catNpcs.length === 0 && (
                  <p style={{ fontSize: '0.82rem', color: '#bbb', margin: '0 0 0.5rem 0' }}>No NPCs in this category.</p>
                )}

                {catNpcs.map((npc) => (
                  <div key={npc.id}>
                    {editingNpcId === npc.id ? (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <NpcForm
                          initial={npc}
                          onSave={(data) => handleSaveNpcEdit(data, npc)}
                          onCancel={() => setEditingNpcId(null)}
                          submitting={false}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f9f9f9', borderRadius: 6, marginBottom: '0.4rem', border: '1px solid #eee' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          {npc.portrait_url ? (
                            <img src={npc.portrait_url} alt={npc.label} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#a44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                              {npc.label[0]?.toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{npc.label}</div>
                            <div style={{ fontSize: '0.75rem', color: '#888' }}>
                              {npc.size} · AC {npc.ac ?? 10} · {npc.hp_max} HP
                              {(npc.attacks?.length ?? 0) > 0 && ` · ${npc.attacks.length} attack${npc.attacks.length > 1 ? 's' : ''}`}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button onClick={() => setEditingNpcId(npc.id)} style={{ padding: '0.25rem 0.5rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, fontSize: '0.75rem' }}>Edit</button>
                          <button onClick={() => handleDeleteNpc(npc.id)} style={{ padding: '0.25rem 0.5rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, fontSize: '0.75rem', color: 'crimson', background: '#fff' }}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {addingNpcCatId === cat.id ? (
                  <NpcForm
                    onSave={(data) => handleAddNpc(data, cat.id)}
                    onCancel={() => setAddingNpcCatId(null)}
                    submitting={savingNpc}
                  />
                ) : (
                  <button onClick={() => setAddingNpcCatId(cat.id)} style={{ padding: '0.3rem 0.75rem', cursor: 'pointer', border: '1px dashed #ccc', borderRadius: 4, fontSize: '0.82rem', background: '#fafafa', color: '#666', width: '100%' }}>
                    + Add NPC to {cat.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
