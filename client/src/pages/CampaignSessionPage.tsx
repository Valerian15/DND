import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getCampaign } from '../features/campaign/api';
import { useSession } from '../features/session/useSession';
import { listMaps, createMap, deleteMap, activateMap, updateMap } from '../features/session/mapApi';
import type { Campaign } from '../features/campaign/types';
import type { MapData } from '../features/session/types';

// SVG grid overlay drawn over the map image
function GridOverlay({ map, width, height }: { map: MapData; width: number; height: number }) {
  const lines: React.ReactNode[] = [];
  const { grid_size: gs, grid_offset_x: ox, grid_offset_y: oy } = map;

  // Vertical lines
  for (let x = ox % gs; x <= width; x += gs) {
    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke="#333" strokeWidth={0.5} strokeOpacity={0.5} />);
  }
  // Horizontal lines
  for (let y = oy % gs; y <= height; y += gs) {
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke="#333" strokeWidth={0.5} strokeOpacity={0.5} />);
  }

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} width={width} height={height}>
      {lines}
    </svg>
  );
}

export default function CampaignSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map manager state (DM only)
  const [maps, setMaps] = useState<MapData[]>([]);
  const [activeMapId, setActiveMapId] = useState<number | null>(null);
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [addingMap, setAddingMap] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapUrl, setNewMapUrl] = useState('');
  const [newMapGridSize, setNewMapGridSize] = useState(50);
  const [savingMap, setSavingMap] = useState(false);

  // Grid editor (for the active map)
  const [editingGrid, setEditingGrid] = useState(false);
  const [gridSize, setGridSize] = useState(50);
  const [gridOffsetX, setGridOffsetX] = useState(0);
  const [gridOffsetY, setGridOffsetY] = useState(0);
  const [savingGrid, setSavingGrid] = useState(false);

  // Map image natural size + zoom (local per client, not synced)
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);

  const ZOOM_STEP = 0.25;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3;

  const { online, connected, activeMap, setActiveMap } = useSession(Number(id));

  const isDmOrAdmin = campaign ? (campaign.dm_id === user!.id || user!.role === 'admin') : false;

  useEffect(() => {
    getCampaign(Number(id))
      .then(setCampaign)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!isDmOrAdmin) return;
    listMaps(Number(id)).then(({ maps: m, active_map_id }) => {
      setMaps(m);
      setActiveMapId(active_map_id);
    });
  }, [id, isDmOrAdmin]);

  // Sync grid editor inputs when active map changes via socket
  useEffect(() => {
    if (activeMap) {
      setGridSize(activeMap.grid_size);
      setGridOffsetX(activeMap.grid_offset_x);
      setGridOffsetY(activeMap.grid_offset_y);
      setActiveMapId(activeMap.id);
    } else {
      setActiveMapId(null);
    }
    setImgSize({ w: 0, h: 0 });
    setZoom(1);
  }, [activeMap]);

  async function handleAddMap(e: React.FormEvent) {
    e.preventDefault();
    if (!newMapName.trim() || !newMapUrl.trim()) return;
    setSavingMap(true);
    try {
      const m = await createMap({
        campaign_id: Number(id),
        name: newMapName.trim(),
        image_url: newMapUrl.trim(),
        grid_size: newMapGridSize,
      });
      setMaps((prev) => [...prev, m]);
      setNewMapName('');
      setNewMapUrl('');
      setNewMapGridSize(50);
      setAddingMap(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingMap(false);
    }
  }

  async function handleDeleteMap(mapId: number) {
    if (!confirm('Delete this map?')) return;
    try {
      await deleteMap(mapId);
      setMaps((prev) => prev.filter((m) => m.id !== mapId));
      if (activeMapId === mapId) setActiveMap(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleActivateMap(mapId: number) {
    try {
      const m = await activateMap(mapId);
      setActiveMap(m);
      setActiveMapId(m.id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleSaveGrid(e: React.FormEvent) {
    e.preventDefault();
    if (!activeMap) return;
    setSavingGrid(true);
    try {
      const updated = await updateMap(activeMap.id, {
        grid_size: gridSize,
        grid_offset_x: gridOffsetX,
        grid_offset_y: gridOffsetY,
      });
      setActiveMap(updated);
      setEditingGrid(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingGrid(false);
    }
  }

  // Live preview map — uses local state while editing, activeMap otherwise
  const previewMap: MapData | null = activeMap
    ? { ...activeMap, grid_size: gridSize, grid_offset_x: gridOffsetX, grid_offset_y: gridOffsetY }
    : null;

  if (loading) return <div style={{ padding: '2rem' }}>Loading session…</div>;
  if (error && !campaign) return <div style={{ padding: '2rem', color: 'crimson' }}>{error}</div>;
  if (!campaign) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui' }}>

      {/* Top bar */}
      <div style={{ padding: '0.6rem 1.25rem', background: '#fff', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
          <button onClick={() => navigate(`/campaigns/${campaign.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, flexShrink: 0 }}>← Back</button>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</strong>
          {isDmOrAdmin && <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#333', color: '#fff', borderRadius: 10, flexShrink: 0 }}>DM</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: connected ? '#4a4' : '#a44', flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#4a4' : '#a44', display: 'inline-block' }} />
            {connected ? 'Connected' : 'Connecting…'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {isDmOrAdmin && (
            <button
              onClick={() => setShowMapPanel(!showMapPanel)}
              style={{ padding: '0.3rem 0.75rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: showMapPanel ? '#333' : '#fff', color: showMapPanel ? '#fff' : '#333', fontSize: '0.85rem' }}
            >
              🗺 Maps
            </button>
          )}
          <span style={{ fontSize: '0.8rem', color: '#888' }}>Online:</span>
          {online.map((u) => (
            <div key={u.user_id} title={`${u.username} (${u.role})`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', padding: '0.2rem 0.5rem', background: '#f0f0f0', borderRadius: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4a4', display: 'inline-block' }} />
              {u.username}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.5rem 1.25rem', background: '#fee', borderBottom: '1px solid #fcc', color: 'crimson', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'crimson' }}>✕</button>
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* DM map panel */}
        {isDmOrAdmin && showMapPanel && (
          <div style={{ width: 260, background: '#fafafa', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.9rem' }}>Maps</strong>
              <button onClick={() => setAddingMap(!addingMap)} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}>+ Add</button>
            </div>

            {addingMap && (
              <form onSubmit={handleAddMap} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input value={newMapName} onChange={(e) => setNewMapName(e.target.value)} placeholder="Map name" required style={{ padding: '0.4rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }} />
                <input value={newMapUrl} onChange={(e) => setNewMapUrl(e.target.value)} placeholder="Image URL" required style={{ padding: '0.4rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <label>Grid size (px):</label>
                  <input type="number" value={newMapGridSize} onChange={(e) => setNewMapGridSize(Number(e.target.value))} min={10} max={200} style={{ width: 60, padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button type="submit" disabled={savingMap} style={{ flex: 1, padding: '0.4rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}>
                    {savingMap ? 'Saving…' : 'Add map'}
                  </button>
                  <button type="button" onClick={() => setAddingMap(false)} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                </div>
              </form>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
              {maps.length === 0 && <div style={{ fontSize: '0.85rem', color: '#aaa', padding: '0.5rem' }}>No maps yet.</div>}
              {maps.map((m) => (
                <div key={m.id} style={{ padding: '0.6rem 0.75rem', borderRadius: 6, marginBottom: '0.4rem', background: activeMapId === m.id ? '#e8f0fe' : '#fff', border: `1px solid ${activeMapId === m.id ? '#4a6' : '#e0e0e0'}` }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {activeMapId !== m.id ? (
                      <button onClick={() => handleActivateMap(m.id)} style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem', cursor: 'pointer', background: '#333', color: '#fff', border: 'none', borderRadius: 4 }}>
                        Show
                      </button>
                    ) : (
                      <span style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem', textAlign: 'center', color: '#4a6', fontWeight: 500 }}>Active</span>
                    )}
                    <button onClick={() => handleDeleteMap(m.id)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, color: 'crimson', background: '#fff' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Grid editor for active map */}
            {activeMap && isDmOrAdmin && (
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#666' }}>Grid settings</span>
                  <button onClick={() => setEditingGrid(!editingGrid)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}>
                    {editingGrid ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {editingGrid ? (
                  <form onSubmit={handleSaveGrid} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {[
                      { label: 'Cell size (px)', val: gridSize, set: setGridSize, min: 10, max: 200 },
                      { label: 'Offset X (px)', val: gridOffsetX, set: setGridOffsetX, min: -200, max: 200 },
                      { label: 'Offset Y (px)', val: gridOffsetY, set: setGridOffsetY, min: -200, max: 200 },
                    ].map(({ label, val, set, min, max }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.78rem', color: '#555' }}>{label}</label>
                        <input type="number" value={val} onChange={(e) => set(Number(e.target.value))} min={min} max={max} style={{ width: 60, padding: '0.25rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.8rem' }} />
                      </div>
                    ))}
                    <button type="submit" disabled={savingGrid} style={{ padding: '0.4rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                      {savingGrid ? 'Saving…' : 'Save grid'}
                    </button>
                  </form>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: '#888' }}>
                    {activeMap.grid_size}px · offset ({activeMap.grid_offset_x}, {activeMap.grid_offset_y})
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Map viewport */}
        <div style={{ flex: 1, background: '#e8e8e8', overflow: 'auto', position: 'relative' }}>
          {previewMap ? (
            <>
              {/* Zoom controls — float over bottom-left of the map area */}
              <div style={{ position: 'sticky', bottom: 12, left: 12, zIndex: 10, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.92)', border: '1px solid #ccc', borderRadius: 6, padding: '0.25rem 0.4rem', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', marginLeft: 12, marginBottom: 12 }}>
                <button
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
                  disabled={zoom <= ZOOM_MIN}
                  style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: zoom <= ZOOM_MIN ? 'not-allowed' : 'pointer', fontSize: '1rem', color: zoom <= ZOOM_MIN ? '#bbb' : '#333', lineHeight: 1 }}
                >−</button>
                <button
                  onClick={() => setZoom(1)}
                  title="Reset to 100%"
                  style={{ minWidth: 44, height: 26, border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: '#555', fontWeight: 500 }}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
                  disabled={zoom >= ZOOM_MAX}
                  style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: zoom >= ZOOM_MAX ? 'not-allowed' : 'pointer', fontSize: '1rem', color: zoom >= ZOOM_MAX ? '#bbb' : '#333', lineHeight: 1 }}
                >+</button>
              </div>

              {/* Scaled map — outer div sets the scrollable area size, inner div is the scaled content */}
              <div style={{ width: imgSize.w * zoom || '100%', height: imgSize.h * zoom || '100%', position: 'relative', minWidth: imgSize.w ? undefined : '100%', minHeight: imgSize.h ? undefined : '100%' }}>
                <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 }}>
                  <img
                    ref={imgRef}
                    src={previewMap.image_url}
                    alt={previewMap.name}
                    onLoad={() => {
                      if (imgRef.current) setImgSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
                    }}
                    style={{ display: 'block', maxWidth: 'none' }}
                    draggable={false}
                  />
                  {imgSize.w > 0 && (
                    <GridOverlay map={previewMap} width={imgSize.w} height={imgSize.h} />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', userSelect: 'none' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗺</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {isDmOrAdmin ? 'Add a map and click "Show" to begin' : 'Waiting for DM to load a map…'}
              </div>
            </div>
          )}
        </div>

        {/* Side panel — characters */}
        <div style={{ width: 200, background: '#fff', borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
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
                          <img src={m.portrait_url} alt={m.character_name} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: '#888' }}>
                            {m.character_name[0]}
                          </div>
                        )}
                        <span style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#4a4' : '#ccc', border: '1.5px solid #fff' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.character_name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#888' }}>Lv {m.level} {m.class_slug ?? '—'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>DM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: online.some((o) => o.user_id === campaign.dm_id) ? '#4a4' : '#ccc', display: 'inline-block' }} />
              {campaign.dm_username}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
