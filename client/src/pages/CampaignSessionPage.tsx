import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../features/session/types';

// ---- wall-editor helpers ------------------------------------------------

function snapToGrid(px: number, py: number, map: MapData): { x: number; y: number } {
  const gs = map.grid_size;
  const ox = ((map.grid_offset_x % gs) + gs) % gs;
  const oy = ((map.grid_offset_y % gs) + gs) % gs;
  return { x: ox + Math.round((px - ox) / gs) * gs, y: oy + Math.round((py - oy) / gs) * gs };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getCampaign } from '../features/campaign/api';
import { useSession } from '../features/session/useSession';
import { listMaps, createMap, deleteMap, activateMap, updateMap, toggleFog, resetFog } from '../features/session/mapApi';
import { listCampaignNpcs, listTokenCategories, createToken, deleteToken, updateTokenHp, updateTokenConditions } from '../features/session/tokenApi';
import { createWall, deleteWall, clearWalls } from '../features/session/wallApi';
import type { WallSegment } from '../features/session/types';
import { InGameSheet, CONDITION_COLORS } from '../features/session/InGameSheet';
import { socket } from '../lib/socket';
import type { Campaign } from '../features/campaign/types';
import type { MapData, TokenData, CampaignNpc, TokenCategory } from '../features/session/types';

const SIZE_CELLS: Record<string, number> = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

function tokenPixelPos(token: { col: number; row: number; size: string }, map: MapData) {
  const gs = map.grid_size;
  const ox = ((map.grid_offset_x % gs) + gs) % gs;
  const oy = ((map.grid_offset_y % gs) + gs) % gs;
  const cells = SIZE_CELLS[token.size] ?? 1;
  return { left: ox + token.col * gs, top: oy + token.row * gs, size: cells * gs };
}

function pxToCell(px: number, py: number, map: MapData) {
  const gs = map.grid_size;
  const ox = ((map.grid_offset_x % gs) + gs) % gs;
  const oy = ((map.grid_offset_y % gs) + gs) % gs;
  return {
    col: Math.max(0, Math.floor((px - ox) / gs)),
    row: Math.max(0, Math.floor((py - oy) / gs)),
  };
}

function GridOverlay({ map, width, height, color, bold }: { map: MapData; width: number; height: number; color: string; bold: boolean }) {
  const { grid_size: gs, grid_offset_x: ox, grid_offset_y: oy } = map;
  if (gs <= 0) return null;
  const sw = bold ? 2.5 : 1;
  const fgOpacity = bold ? 0.85 : 0.55;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = ((ox % gs) + gs) % gs; x <= width; x += gs) xs.push(x);
  for (let y = ((oy % gs) + gs) % gs; y <= height; y += gs) ys.push(y);
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} width={width} height={height}>
      {/* White halo — makes lines visible on dark backgrounds */}
      <g stroke="white" strokeWidth={sw + 2} strokeOpacity={0.35}>
        {xs.map((x) => <line key={`vb${x}`} x1={x} y1={0} x2={x} y2={height} />)}
        {ys.map((y) => <line key={`hb${y}`} x1={0} y1={y} x2={width} y2={y} />)}
      </g>
      {/* Foreground color line */}
      <g stroke={color} strokeWidth={sw} strokeOpacity={fgOpacity}>
        {xs.map((x) => <line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} />)}
        {ys.map((y) => <line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} />)}
      </g>
    </svg>
  );
}

interface TokenOnMapProps {
  token: TokenData;
  map: MapData;
  isDragging: boolean;
  dragCol?: number;
  dragRow?: number;
  canMove: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

function TokenOnMap({ token, map, isDragging, dragCol, dragRow, canMove, onPointerDown }: TokenOnMapProps) {
  const displayCol = isDragging && dragCol !== undefined ? dragCol : token.col;
  const displayRow = isDragging && dragRow !== undefined ? dragRow : token.row;
  const { left, top, size } = tokenPixelPos({ col: displayCol, row: displayRow, size: token.size }, map);
  const hp = token.hp_max > 0 ? Math.max(0, Math.min(1, token.hp_current / token.hp_max)) : 0;
  const hpColor = hp > 0.5 ? '#4a4' : hp > 0.25 ? '#aa4' : '#a44';
  const activeConditions = token.conditions ?? [];

  return (
    <div
      style={{
        position: 'absolute', left, top, width: size, height: size,
        cursor: canMove ? (isDragging ? 'grabbing' : 'grab') : 'default',
        zIndex: isDragging ? 20 : 5,
        touchAction: 'none', userSelect: 'none',
        outline: isDragging ? '2px solid #4a8' : 'none', outlineOffset: 1,
      }}
      onPointerDown={onPointerDown}
    >
      {token.portrait_url ? (
        <img src={token.portrait_url} alt={token.label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', border: '2px solid #fff', boxSizing: 'border-box', display: 'block' }} draggable={false} />
      ) : (
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: token.token_type === 'pc' ? '#4a8' : '#a44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: Math.max(10, size * 0.35), border: '2px solid #fff', boxSizing: 'border-box' }}>
          {token.label[0]?.toUpperCase()}
        </div>
      )}
      {/* Label above the token */}
      <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none', marginBottom: 3, zIndex: 21 }}>
        {token.label}
      </div>
      {/* HP bar below the token */}
      {token.hp_visible && token.hp_max > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: '10%', right: '10%', marginTop: 4, height: 6, background: '#555', borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${hp * 100}%`, background: hpColor, borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      )}
      {/* Condition badges */}
      {activeConditions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: token.hp_visible && token.hp_max > 0 ? 14 : 4, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2, pointerEvents: 'none', zIndex: 21, maxWidth: Math.max(size, 80) }}>
          {activeConditions.map((cond) => (
            <div key={cond} style={{ background: CONDITION_COLORS[cond] ?? '#555', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 2, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
              {cond}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NpcTemplateRow({ npc }: { npc: CampaignNpc }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'npc', campaignNpcId: npc.id }))}
      style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', cursor: 'grab', borderBottom: '1px solid #f0f0f0', background: '#fff' }}
    >
      {npc.portrait_url ? (
        <img src={npc.portrait_url} alt={npc.label} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#a44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
          {npc.label[0]?.toUpperCase()}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{npc.label}</div>
        <div style={{ fontSize: '0.72rem', color: '#888' }}>{npc.size} · {npc.hp_max} HP</div>
      </div>
    </div>
  );
}

function ChatMsgItem({ msg, myUserId }: { msg: ChatMessage; myUserId: number }) {
  const isMe = msg.user_id === myUserId;
  if (msg.type === 'roll' && msg.data) {
    const { expression, dice, modifier, total } = msg.data;
    const modStr = modifier !== 0 ? ` ${modifier > 0 ? '+' : ''}${modifier}` : '';
    return (
      <div style={{ background: '#f5f0e8', border: '1px solid #e4d5b8', borderRadius: 5, padding: '0.35rem 0.5rem' }}>
        <div style={{ fontSize: '0.7rem', color: '#886', fontWeight: 600, marginBottom: 2 }}>{msg.username} rolled {expression}</div>
        <div style={{ fontSize: '0.78rem', color: '#666' }}>[{dice.join(', ')}]{modStr}</div>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333' }}>= {total}</div>
      </div>
    );
  }
  return (
    <div>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isMe ? '#4a8' : '#668' }}>{msg.username}: </span>
      <span style={{ fontSize: '0.78rem', color: '#333' }}>{msg.body}</span>
    </div>
  );
}

export default function CampaignSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [maps, setMaps] = useState<MapData[]>([]);
  const [activeMapId, setActiveMapId] = useState<number | null>(null);
  const [npcs, setNpcs] = useState<CampaignNpc[]>([]);
  const [categories, setCategories] = useState<TokenCategory[]>([]);

  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [leftTab, setLeftTab] = useState<'maps' | 'templates'>('maps');

  const [addingMap, setAddingMap] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapUrl, setNewMapUrl] = useState('');
  const [newMapGridSize, setNewMapGridSize] = useState(50);
  const [savingMap, setSavingMap] = useState(false);

  const [editingGrid, setEditingGrid] = useState(false);
  const [gridSize, setGridSize] = useState(50);
  const [gridOffsetX, setGridOffsetX] = useState(0);
  const [gridOffsetY, setGridOffsetY] = useState(0);
  const [savingGrid, setSavingGrid] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const innerMapRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const ZOOM_STEP = 0.25;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3;

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ tokenId: number; ghostCol: number; ghostRow: number } | null>(null);
  const [pointerDown, setPointerDown] = useState<{ token: TokenData; startX: number; startY: number } | null>(null);

  // Grid style
  const [gridColor, setGridColor] = useState('#000000');
  const [gridBold, setGridBold] = useState(false);

  // Wall editor
  const [wallMode, setWallMode] = useState(false);
  const [wallDrawStart, setWallDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [wallDrawEnd, setWallDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const wallDrawStartRef = useRef<{ x: number; y: number } | null>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);

  // Initiative editing
  const [editingInitiativeId, setEditingInitiativeId] = useState<number | null>(null);
  const [editingInitiativeValue, setEditingInitiativeValue] = useState('');
  const [addingInitiative, setAddingInitiative] = useState(false);
  const [addInitiativeLabel, setAddInitiativeLabel] = useState('');
  const [addInitiativeValue, setAddInitiativeValue] = useState('');

  // Panel: character sheet for PC tokens, NPC HP panel for NPC tokens
  type PanelState =
    | { type: 'character'; characterId: number; tokenId: number; canEdit: boolean }
    | { type: 'npc'; token: TokenData };
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [npcHp, setNpcHp] = useState(0);
  const [npcHpSaving, setNpcHpSaving] = useState(false);

  const { online, connected, activeMap, setActiveMap, tokens, messages, initiative, walls, fogVisible, fogExplored } = useSession(Number(id));
  const isDmOrAdmin = campaign ? (campaign.dm_id === user!.id || user!.role === 'admin') : false;
  const previewMap: MapData | null = activeMap
    ? { ...activeMap, grid_size: gridSize, grid_offset_x: gridOffsetX, grid_offset_y: gridOffsetY }
    : null;

  useEffect(() => {
    getCampaign(Number(id))
      .then(setCampaign)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);


  useEffect(() => {
    if (!isDmOrAdmin || !campaign) return;
    Promise.all([
      listMaps(campaign.id),
      listCampaignNpcs(campaign.id),
      listTokenCategories(campaign.id),
    ]).then(([mapsData, npcData, catData]) => {
      setMaps(mapsData.maps);
      setActiveMapId(mapsData.active_map_id);
      setNpcs(npcData);
      setCategories(catData);
    }).catch(() => {});
  }, [campaign?.id, isDmOrAdmin]);

  useEffect(() => {
    if (activeMap) {
      setGridSize(activeMap.grid_size);
      setGridOffsetX(activeMap.grid_offset_x);
      setGridOffsetY(activeMap.grid_offset_y);
      setActiveMapId(activeMap.id);
      setImgSize({ w: 0, h: 0 });
      setZoom(1);
    } else {
      setActiveMapId(null);
      setImgSize({ w: 0, h: 0 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMap?.id]);

  // Catch cached images: if the img is already complete by the time the effect runs, onLoad won't fire
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, [activeMap?.id]);

  // Chat auto-scroll
  useEffect(() => {
    if (chatLogRef.current && chatOpen) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages, chatOpen]);

  // Unread badge: only counts messages that arrive after initial history load
  useEffect(() => {
    if (messages.length > prevMsgCount.current && prevMsgCount.current > 0 && !chatOpen) {
      setHasUnread(true);
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, chatOpen]);

  function sendChat() {
    const body = chatInput.trim();
    if (!body) return;
    socket.emit('chat:send', { body });
    setChatInput('');
  }

  function commitInitiativeEdit(id: number) {
    const val = parseInt(editingInitiativeValue, 10);
    if (!isNaN(val)) socket.emit('initiative:set', { id, initiative: val });
    setEditingInitiativeId(null);
  }

  // Fog canvas — redraws whenever fog state or image size changes
  useEffect(() => {
    if (isDmOrAdmin) return;
    const canvas = fogCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !previewMap || !img) return;
    const w = img.naturalWidth || imgSize.w;
    const h = img.naturalHeight || imgSize.h;
    if (!w || !h) return;

    const fogOn = !!activeMap?.fog_enabled;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!fogOn) {
      // Fog disabled — clear canvas so map is fully visible
      ctx.clearRect(0, 0, w, h);
      return;
    }

    const gs = previewMap.grid_size;
    if (gs <= 0) return;
    const ox = ((previewMap.grid_offset_x % gs) + gs) % gs;
    const oy = ((previewMap.grid_offset_y % gs) + gs) % gs;
    const visibleSet = new Set(fogVisible.map(([c, r]) => `${c},${r}`));
    const exploredSet = new Set(fogExplored.map(([c, r]) => `${c},${r}`));

    // Start fully black (unseen)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, w, h);

    // Currently visible: fully transparent (map shows through)
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = 'rgba(0,0,0,0)';
    for (const [c, r] of fogVisible) {
      ctx.fillRect(ox + c * gs, oy + r * gs, gs, gs);
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [fogVisible, fogExplored, imgSize, previewMap, isDmOrAdmin, activeMap?.fog_enabled]);

  // Wall editor pointer handlers — all three live on the same element (innerMapRef)
  // so pointer capture works reliably without cross-element handoff.
  function handleWallPointerDown(e: React.PointerEvent) {
    if (!activeMap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const snapped = snapToGrid((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom, activeMap);
    wallDrawStartRef.current = snapped;
    setWallDrawStart(snapped);
    setWallDrawEnd(snapped);
  }

  function handleWallPointerMove(e: React.PointerEvent) {
    if (!wallDrawStartRef.current || !activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const snapped = snapToGrid((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom, activeMap);
    setWallDrawEnd(snapped);
  }

  function handleWallPointerUp(e: React.PointerEvent) {
    const start = wallDrawStartRef.current;
    if (!start || !activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const snap = snapToGrid((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom, activeMap);
    const moved = Math.hypot(snap.x - start.x, snap.y - start.y);
    if (moved < 2) {
      const px = (e.clientX - rect.left) / zoom;
      const py = (e.clientY - rect.top) / zoom;
      const hit = walls.reduce<{ wall: WallSegment | null; dist: number }>(
        (best, w) => { const d = distToSegment(px, py, w.x1, w.y1, w.x2, w.y2); return d < best.dist ? { wall: w, dist: d } : best; },
        { wall: null, dist: 12 }
      );
      if (hit.wall) deleteWall(activeMap.id, hit.wall.id).catch((err: Error) => setError(err.message));
    } else {
      createWall(activeMap.id, { x1: start.x, y1: start.y, x2: snap.x, y2: snap.y })
        .catch((err: Error) => setError(err.message));
    }
    wallDrawStartRef.current = null;
    setWallDrawStart(null);
    setWallDrawEnd(null);
  }

  function canMoveToken(token: TokenData): boolean {
    if (!campaign) return false;
    if (isDmOrAdmin) return true;
    if (token.token_type === 'pc' && campaign.members?.some((m) => m.character_id === token.character_id && m.owner_id === user!.id)) return true;
    return Array.isArray(token.controlled_by) && token.controlled_by.includes(user!.id);
  }

  async function handleAddMap(e: React.FormEvent) {
    e.preventDefault();
    setSavingMap(true);
    try {
      const m = await createMap({ campaign_id: Number(id), name: newMapName.trim(), image_url: newMapUrl.trim(), grid_size: newMapGridSize });
      setMaps((prev) => [...prev, m]);
      setNewMapName(''); setNewMapUrl(''); setNewMapGridSize(50); setAddingMap(false);
    } catch (e: any) { setError(e.message); }
    finally { setSavingMap(false); }
  }

  async function handleDeleteMap(mapId: number) {
    if (!confirm('Delete this map?')) return;
    try {
      await deleteMap(mapId);
      setMaps((prev) => prev.filter((m) => m.id !== mapId));
      if (activeMapId === mapId) setActiveMap(null);
    } catch (e: any) { setError(e.message); }
  }

  async function handleActivateMap(mapId: number) {
    try {
      const m = await activateMap(mapId);
      setActiveMap(m);
      setActiveMapId(m.id);
    } catch (e: any) { setError(e.message); }
  }

  async function handleSaveGrid(e: React.FormEvent) {
    e.preventDefault();
    if (!activeMap) return;
    setSavingGrid(true);
    try {
      const updated = await updateMap(activeMap.id, { grid_size: gridSize, grid_offset_x: gridOffsetX, grid_offset_y: gridOffsetY });
      setActiveMap(updated);
      setEditingGrid(false);
    } catch (e: any) { setError(e.message); }
    finally { setSavingGrid(false); }
  }

  function handleMapDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!activeMap || !innerMapRef.current) return;
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    let data: { type: string; characterId?: number; campaignNpcId?: number };
    try { data = JSON.parse(raw); } catch { return; }
    const rect = innerMapRef.current.getBoundingClientRect();
    const { col, row } = pxToCell((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom, activeMap);
    if (data.type === 'pc' && data.characterId) {
      createToken({ map_id: activeMap.id, token_type: 'pc', character_id: data.characterId, col, row }).catch((e) => setError(e.message));
    } else if (data.type === 'npc' && data.campaignNpcId) {
      createToken({ map_id: activeMap.id, token_type: 'npc', campaign_npc_id: data.campaignNpcId, col, row }).catch((e) => setError(e.message));
    }
  }

  function handleTokenPointerDown(e: React.PointerEvent, token: TokenData) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPointerDown({ token, startX: e.clientX, startY: e.clientY });
    if (canMoveToken(token)) {
      setDrag({ tokenId: token.id, ghostCol: token.col, ghostRow: token.row });
    }
  }

  function handleViewportPointerMove(e: React.PointerEvent) {
    if (!drag || !activeMap || !innerMapRef.current) return;
    const rect = innerMapRef.current.getBoundingClientRect();
    const { col, row } = pxToCell((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom, activeMap);
    setDrag((d) => d ? { ...d, ghostCol: col, ghostRow: row } : null);
  }

  function handleViewportPointerUp(e: React.PointerEvent) {
    if (pointerDown) {
      const dist = Math.hypot(e.clientX - pointerDown.startX, e.clientY - pointerDown.startY);
      if (dist < 6) {
        handleTokenClick(pointerDown.token);
      } else if (drag) {
        socket.emit('token:move', { token_id: drag.tokenId, col: drag.ghostCol, row: drag.ghostRow });
      }
    }
    setDrag(null);
    setPointerDown(null);
  }

  function handleTokenClick(token: TokenData) {
    if (token.token_type === 'pc' && token.character_id !== null) {
      const isMyChar = campaign?.members?.some((m) => m.character_id === token.character_id && m.owner_id === user!.id);
      if (isMyChar || isDmOrAdmin) {
        setPanel({ type: 'character', characterId: token.character_id, tokenId: token.id, canEdit: !!isMyChar || isDmOrAdmin });
      }
    } else if (token.token_type === 'npc' && isDmOrAdmin) {
      setNpcHp(token.hp_current);
      setPanel({ type: 'npc', token });
    }
  }

  async function handleNpcHpCommit(tokenId: number, hp: number) {
    setNpcHpSaving(true);
    try {
      const result = await updateTokenHp(tokenId, hp);
      setNpcHp(result.hp_current);
      setPanel((p) => p?.type === 'npc' ? { ...p, token: { ...p.token, hp_current: result.hp_current } } : p);
    } catch (e: any) { setError(e.message); }
    finally { setNpcHpSaving(false); }
  }

  async function handleTokenConditionsChange(tokenId: number, conditions: string[]) {
    try { await updateTokenConditions(tokenId, conditions); }
    catch (e: any) { setError(e.message); }
  }

  async function handleRemoveToken(tokenId: number) {
    try { await deleteToken(tokenId); } catch (e: any) { setError(e.message); }
  }

  function toggleSection(key: string) {
    setCollapsedSections((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading session…</div>;
  if (error && !campaign) return <div style={{ padding: '2rem', color: 'crimson' }}>{error}</div>;
  if (!campaign) return null;

  const npcCategories = categories.filter((c) => c.sort_order !== 0);

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
            <button onClick={() => setShowLeftPanel(!showLeftPanel)} style={{ padding: '0.3rem 0.75rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: showLeftPanel ? '#333' : '#fff', color: showLeftPanel ? '#fff' : '#333', fontSize: '0.85rem' }}>
              DM Bar
            </button>
          )}
          {isDmOrAdmin && (
            <button onClick={() => socket.emit('initiative:roll')} title="Roll initiative for all map tokens" style={{ padding: '0.3rem 0.75rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff', color: '#333', fontSize: '0.85rem' }}>
              ⚔ Initiative
            </button>
          )}
          {isDmOrAdmin && activeMap && (
            <button
              onClick={() => setWallMode((w) => !w)}
              title={wallMode ? 'Exit wall editor (click wall to delete, drag to draw)' : 'Enter wall editor'}
              style={{ padding: '0.3rem 0.75rem', cursor: 'pointer', border: `1px solid ${wallMode ? '#c44' : '#ccc'}`, borderRadius: 4, background: wallMode ? '#fdecea' : '#fff', color: wallMode ? '#c44' : '#333', fontSize: '0.85rem', fontWeight: wallMode ? 700 : 400 }}
            >
              🧱 {wallMode ? 'Walls ON' : 'Walls'}
            </button>
          )}
          {isDmOrAdmin && activeMap && walls.length > 0 && (
            <button onClick={() => { if (confirm('Clear all walls on this map?')) clearWalls(activeMap.id).catch((e: Error) => setError(e.message)); }} style={{ padding: '0.3rem 0.6rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, background: '#fff', color: 'crimson', fontSize: '0.8rem' }} title="Delete all walls">
              Clear walls
            </button>
          )}
          {isDmOrAdmin && activeMap && (
            <>
              <button
                onClick={() => toggleFog(activeMap.id).then((m) => setActiveMap(m)).catch((e: Error) => setError(e.message))}
                title={activeMap.fog_enabled ? 'Fog ON — click to disable' : 'Fog OFF — click to enable'}
                style={{ padding: '0.3rem 0.75rem', cursor: 'pointer', border: `1px solid ${activeMap.fog_enabled ? '#448' : '#ccc'}`, borderRadius: 4, background: activeMap.fog_enabled ? '#eef' : '#fff', color: activeMap.fog_enabled ? '#448' : '#333', fontSize: '0.85rem', fontWeight: activeMap.fog_enabled ? 700 : 400 }}
              >
                🌫 {activeMap.fog_enabled ? 'Fog ON' : 'Fog OFF'}
              </button>
              {activeMap.fog_enabled ? (
                <button
                  onClick={() => { if (confirm('Reset fog? All explored cells will be cleared.')) resetFog(activeMap.id).catch((e: Error) => setError(e.message)); }}
                  style={{ padding: '0.3rem 0.6rem', cursor: 'pointer', border: '1px solid #cce', borderRadius: 4, background: '#fff', color: '#448', fontSize: '0.8rem' }}
                  title="Clear all explored fog"
                >
                  Reset fog
                </button>
              ) : null}
            </>
          )}
          {activeMap && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Grid colour">
              <label style={{ fontSize: '0.78rem', color: '#555', cursor: 'pointer' }}>
                Grid
                <input type="color" value={gridColor} onChange={(e) => setGridColor(e.target.value)}
                  style={{ marginLeft: '0.3rem', width: 28, height: 22, padding: 1, border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer', verticalAlign: 'middle' }} />
              </label>
              <button
                onClick={() => setGridBold((b) => !b)}
                title={gridBold ? 'Bold grid (click for thin)' : 'Thin grid (click for bold)'}
                style={{ padding: '0.2rem 0.5rem', cursor: 'pointer', border: `1px solid ${gridBold ? '#555' : '#ccc'}`, borderRadius: 4, background: gridBold ? '#333' : '#fff', color: gridBold ? '#fff' : '#555', fontSize: '0.8rem', fontWeight: 700 }}
              >B</button>
            </span>
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

        {/* DM Bar */}
        {isDmOrAdmin && showLeftPanel && (
          <div style={{ width: 260, background: '#fafafa', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>

            <div style={{ display: 'flex', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
              {(['maps', 'templates'] as const).map((tab) => (
                <button key={tab} onClick={() => setLeftTab(tab)} style={{ flex: 1, padding: '0.6rem', border: 'none', borderBottom: leftTab === tab ? '2px solid #333' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: leftTab === tab ? 600 : 400, color: leftTab === tab ? '#333' : '#888' }}>
                  {tab === 'maps' ? 'Maps' : 'Templates'}
                </button>
              ))}
            </div>

            {/* Maps tab */}
            {leftTab === 'maps' && (
              <>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <strong style={{ fontSize: '0.9rem' }}>Maps</strong>
                  <button onClick={() => setAddingMap(!addingMap)} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}>+ Add</button>
                </div>

                {addingMap && (
                  <form onSubmit={handleAddMap} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
                    <input value={newMapName} onChange={(e) => setNewMapName(e.target.value)} placeholder="Map name" required style={{ padding: '0.4rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }} />
                    <input value={newMapUrl} onChange={(e) => setNewMapUrl(e.target.value)} placeholder="Image URL" required style={{ padding: '0.4rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.85rem' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                      <label>Grid size (px):</label>
                      <input type="number" value={newMapGridSize} onChange={(e) => setNewMapGridSize(Number(e.target.value))} min={10} max={200} style={{ width: 60, padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4 }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="submit" disabled={savingMap} style={{ flex: 1, padding: '0.4rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}>{savingMap ? 'Saving…' : 'Add map'}</button>
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
                          <button onClick={() => handleActivateMap(m.id)} style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem', cursor: 'pointer', background: '#333', color: '#fff', border: 'none', borderRadius: 4 }}>Show</button>
                        ) : (
                          <span style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem', textAlign: 'center', color: '#4a6', fontWeight: 500 }}>Active</span>
                        )}
                        <button onClick={() => handleDeleteMap(m.id)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, color: 'crimson', background: '#fff' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                {activeMap && (
                  <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #eee', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#666' }}>Grid settings</span>
                      <button onClick={() => setEditingGrid(!editingGrid)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}>{editingGrid ? 'Cancel' : 'Edit'}</button>
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
                      <div style={{ fontSize: '0.78rem', color: '#888' }}>{activeMap.grid_size}px · offset ({activeMap.grid_offset_x}, {activeMap.grid_offset_y})</div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Templates tab */}
            {leftTab === 'templates' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {npcs.length === 0 ? (
                  <div style={{ padding: '1rem', fontSize: '0.85rem', color: '#aaa' }}>No NPC templates. Add them on the campaign detail page.</div>
                ) : (
                  <>
                    <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: '#888', borderBottom: '1px solid #eee' }}>Drag an NPC onto the map to place it.</div>
                    {npcCategories.map((cat) => {
                      const catNpcs = npcs.filter((n) => n.category_id === cat.id);
                      if (catNpcs.length === 0) return null;
                      return (
                        <div key={cat.id}>
                          <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f0f0f0' }}>{cat.name}</div>
                          {catNpcs.map((npc) => <NpcTemplateRow key={npc.id} npc={npc} />)}
                        </div>
                      );
                    })}
                    {npcs.filter((n) => n.category_id === null).length > 0 && (
                      <div>
                        <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f0f0f0' }}>Uncategorized</div>
                        {npcs.filter((n) => n.category_id === null).map((npc) => <NpcTemplateRow key={npc.id} npc={npc} />)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Map viewport */}
        <div
          style={{ flex: 1, background: '#e8e8e8', overflow: 'auto', position: 'relative' }}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
        >
          {previewMap ? (
            <>
              <div style={{ position: 'sticky', bottom: 12, left: 12, zIndex: 10, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.92)', border: '1px solid #ccc', borderRadius: 6, padding: '0.25rem 0.4rem', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', marginLeft: 12, marginBottom: 12 }}>
                <button onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))} disabled={zoom <= ZOOM_MIN} style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: zoom <= ZOOM_MIN ? 'not-allowed' : 'pointer', fontSize: '1rem', color: zoom <= ZOOM_MIN ? '#bbb' : '#333', lineHeight: 1 }}>−</button>
                <button onClick={() => setZoom(1)} title="Reset to 100%" style={{ minWidth: 44, height: 26, border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: '#555', fontWeight: 500 }}>{Math.round(zoom * 100)}%</button>
                <button onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))} disabled={zoom >= ZOOM_MAX} style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: zoom >= ZOOM_MAX ? 'not-allowed' : 'pointer', fontSize: '1rem', color: zoom >= ZOOM_MAX ? '#bbb' : '#333', lineHeight: 1 }}>+</button>
              </div>

              <div style={{ width: imgSize.w * zoom || '100%', height: imgSize.h * zoom || '100%', position: 'relative', minWidth: imgSize.w ? undefined : '100%', minHeight: imgSize.h ? undefined : '100%' }}>
                {wallMode && (
                  <div style={{ position: 'sticky', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'inline-block', background: 'rgba(200,50,50,0.92)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, padding: '0.3rem 0.8rem', borderRadius: 12, pointerEvents: 'none', whiteSpace: 'nowrap', marginTop: 8 }}>
                    🧱 Wall mode — drag to draw, click a wall to delete
                  </div>
                )}
                <div
                  ref={innerMapRef}
                  style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleMapDrop}
                >
                  <img
                    key={previewMap.id}
                    ref={imgRef}
                    src={previewMap.image_url}
                    alt={previewMap.name}
                    onLoad={(e) => { const img = e.currentTarget; setImgSize({ w: img.naturalWidth, h: img.naturalHeight }); }}
                    style={{ display: 'block', maxWidth: 'none' }}
                    draggable={false}
                  />
                  {imgSize.w > 0 && <GridOverlay map={previewMap} width={imgSize.w} height={imgSize.h} color={gridColor} bold={gridBold} />}
                  {tokens.map((token) => (
                    <TokenOnMap
                      key={token.id}
                      token={token}
                      map={previewMap}
                      isDragging={drag?.tokenId === token.id}
                      dragCol={drag?.tokenId === token.id ? drag.ghostCol : undefined}
                      dragRow={drag?.tokenId === token.id ? drag.ghostRow : undefined}
                      canMove={canMoveToken(token)}
                      onPointerDown={wallMode ? undefined : (e) => handleTokenPointerDown(e, token)}
                    />
                  ))}
                  {/* Fog of war canvas — players only, always mounted so effect can fill black immediately */}
                  {!isDmOrAdmin && (
                    <canvas
                      ref={fogCanvasRef}
                      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 8 }}
                      width={imgSize.w}
                      height={imgSize.h}
                    />
                  )}
                  {/* Wall lines SVG — DM only, pointer-events none so overlay below handles input */}
                  {isDmOrAdmin && imgSize.w > 0 && (walls.length > 0 || (wallDrawStart && wallDrawEnd)) && (
                    <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 9 }} width={imgSize.w} height={imgSize.h}>
                      {walls.map((w) => (
                        <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#dd2222" strokeWidth={3} strokeLinecap="round" />
                      ))}
                      {wallDrawStart && wallDrawEnd && (
                        <line x1={wallDrawStart.x} y1={wallDrawStart.y} x2={wallDrawEnd.x} y2={wallDrawEnd.y} stroke="#dd2222" strokeWidth={3} strokeLinecap="round" strokeDasharray="8 4" />
                      )}
                    </svg>
                  )}
                  {/* Wall drawing capture overlay — transparent div that sits on top in wall mode */}
                  {wallMode && imgSize.w > 0 && (
                    <div
                      style={{ position: 'absolute', top: 0, left: 0, width: imgSize.w, height: imgSize.h, zIndex: 20, cursor: 'crosshair', touchAction: 'none' }}
                      onPointerDown={handleWallPointerDown}
                      onPointerMove={handleWallPointerMove}
                      onPointerUp={handleWallPointerUp}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', userSelect: 'none' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗺</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>{isDmOrAdmin ? 'Add a map and click "Show" to begin' : 'Waiting for DM to load a map…'}</div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ width: 240, background: '#fff', borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Initiative tracker — shown when active, at the top */}
          {initiative.length > 0 && (
            <div style={{ borderBottom: '1px solid #eee' }}>
              <div onClick={() => toggleSection('initiative')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', cursor: 'pointer', background: '#fff8e8', userSelect: 'none' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#776', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚔ Initiative</span>
                <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{collapsedSections.has('initiative') ? '▶' : '▼'}</span>
              </div>
              {!collapsedSections.has('initiative') && (
                <div style={{ padding: '0.25rem 0.5rem 0.5rem' }}>
                  {initiative.map((entry, idx) => (
                    <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.25rem', borderBottom: '1px solid #f5f5f5' }}>
                      <span style={{ fontSize: '0.68rem', color: '#bbb', width: 14, textAlign: 'right', flexShrink: 0 }}>{idx + 1}.</span>
                      <span style={{ flex: 1, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</span>
                      {isDmOrAdmin && editingInitiativeId === entry.id ? (
                        <input type="number" value={editingInitiativeValue}
                          onChange={(e) => setEditingInitiativeValue(e.target.value)}
                          onBlur={() => commitInitiativeEdit(entry.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitInitiativeEdit(entry.id); if (e.key === 'Escape') setEditingInitiativeId(null); }}
                          autoFocus style={{ width: 38, padding: '0.1rem', border: '1px solid #aaa', borderRadius: 3, fontSize: '0.8rem', textAlign: 'center' }} />
                      ) : (
                        <span onClick={isDmOrAdmin ? () => { setEditingInitiativeId(entry.id); setEditingInitiativeValue(String(entry.initiative)); } : undefined}
                          style={{ fontSize: '0.85rem', fontWeight: 700, color: '#333', minWidth: 22, textAlign: 'center', cursor: isDmOrAdmin ? 'text' : 'default' }}>
                          {entry.initiative}
                        </span>
                      )}
                      {isDmOrAdmin && (
                        <button onClick={() => socket.emit('initiative:remove', { id: entry.id })}
                          style={{ flexShrink: 0, padding: '0.1rem 0.25rem', fontSize: '0.65rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff' }}>✕</button>
                      )}
                    </div>
                  ))}
                  {isDmOrAdmin && (
                    addingInitiative ? (
                      <div style={{ display: 'flex', gap: '0.25rem', padding: '0.4rem 0.25rem', alignItems: 'center' }}>
                        <input value={addInitiativeLabel} onChange={(e) => setAddInitiativeLabel(e.target.value)}
                          placeholder="Name" style={{ flex: 1, padding: '0.2rem', border: '1px solid #ddd', borderRadius: 3, fontSize: '0.75rem', minWidth: 0 }} />
                        <input type="number" value={addInitiativeValue} onChange={(e) => setAddInitiativeValue(e.target.value)}
                          placeholder="Init" style={{ width: 38, padding: '0.2rem', border: '1px solid #ddd', borderRadius: 3, fontSize: '0.75rem' }} />
                        <button onClick={() => {
                          const init = parseInt(addInitiativeValue, 10);
                          if (addInitiativeLabel.trim() && !isNaN(init)) {
                            socket.emit('initiative:add', { label: addInitiativeLabel.trim(), initiative: init });
                            setAddInitiativeLabel(''); setAddInitiativeValue(''); setAddingInitiative(false);
                          }
                        }} style={{ padding: '0.2rem 0.35rem', fontSize: '0.72rem', background: '#333', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>+</button>
                        <button onClick={() => setAddingInitiative(false)} style={{ padding: '0.2rem 0.35rem', fontSize: '0.72rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3 }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.35rem', padding: '0.4rem 0.25rem' }}>
                        <button onClick={() => setAddingInitiative(true)} style={{ flex: 1, padding: '0.25rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff' }}>+ Add</button>
                        <button onClick={() => socket.emit('initiative:clear')} style={{ flex: 1, padding: '0.25rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff' }}>End Combat</button>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Player Characters */}
          <div>
            <div onClick={() => toggleSection('pc')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid #eee', cursor: 'pointer', background: '#fafafa', userSelect: 'none' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Players ({campaign.members?.length ?? 0})
              </span>
              <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{collapsedSections.has('pc') ? '▶' : '▼'}</span>
            </div>

            {!collapsedSections.has('pc') && (
              <div style={{ padding: '0.5rem' }}>
                {(!campaign.members || campaign.members.length === 0) && (
                  <div style={{ fontSize: '0.82rem', color: '#bbb', padding: '0.3rem 0.5rem' }}>No players yet.</div>
                )}
                {campaign.members?.map((m) => {
                  const isOnline = online.some((o) => o.user_id === m.owner_id);
                  const isMyChar = m.owner_id === user!.id;
                  const myToken = tokens.find((t) => t.token_type === 'pc' && t.character_id === m.character_id);
                  const draggable = isDmOrAdmin || isMyChar;
                  return (
                    <div
                      key={m.character_id}
                      draggable={draggable}
                      onDragStart={draggable ? (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'pc', characterId: m.character_id })) : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: 6, cursor: draggable ? 'grab' : 'default', background: isMyChar ? '#f0f8ff' : 'transparent', marginBottom: '0.2rem', opacity: myToken ? 1 : 0.6 }}
                      title={draggable ? (myToken ? 'Drag to move token' : 'Drag onto map to place') : undefined}
                    >
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        {m.portrait_url ? (
                          <img src={m.portrait_url} alt={m.character_name} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} draggable={false} />
                        ) : (
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#4a8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: '#fff', fontWeight: 700 }}>{m.character_name[0]}</div>
                        )}
                        <span style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#4a4' : '#ccc', border: '1.5px solid #fff' }} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.character_name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#888' }}>Lv {m.level} {m.class_slug ?? '—'}</div>
                      </div>
                      {myToken && (isDmOrAdmin || isMyChar) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveToken(myToken.id); }}
                          style={{ flexShrink: 0, padding: '0.1rem 0.3rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff' }}
                          title="Remove from map"
                        >✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DM presence */}
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #eee' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>DM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: online.some((o) => o.user_id === campaign.dm_id) ? '#4a4' : '#ccc', display: 'inline-block' }} />
              {campaign.dm_username}
            </div>
          </div>

          {/* NPC sections (DM only) */}
          {isDmOrAdmin && npcCategories.map((cat) => {
            const catTokens = tokens.filter((t) => t.token_type === 'npc' && t.category_id === cat.id);
            return (
              <div key={cat.id} style={{ borderTop: '1px solid #eee' }}>
                <div onClick={() => toggleSection(`cat-${cat.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', cursor: 'pointer', background: '#fafafa', userSelect: 'none' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat.name} ({catTokens.length})</span>
                  <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{collapsedSections.has(`cat-${cat.id}`) ? '▶' : '▼'}</span>
                </div>
                {!collapsedSections.has(`cat-${cat.id}`) && (
                  <div style={{ padding: '0.5rem' }}>
                    {catTokens.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: '#bbb', padding: '0.3rem 0.5rem' }}>No tokens on map.</div>
                    ) : catTokens.map((token) => (
                      <div key={token.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: 6, marginBottom: '0.2rem' }}>
                        {token.portrait_url ? (
                          <img src={token.portrait_url} alt={token.label} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#a44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>{token.label[0]?.toUpperCase()}</div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{token.label}</div>
                          <div style={{ fontSize: '0.72rem', color: '#888' }}>{token.hp_current}/{token.hp_max} HP</div>
                        </div>
                        <button onClick={() => handleRemoveToken(token.id)} style={{ flexShrink: 0, padding: '0.1rem 0.3rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Uncategorized NPC tokens (DM only) */}
          {isDmOrAdmin && (() => {
            const uncatTokens = tokens.filter((t) => t.token_type === 'npc' && t.category_id === null);
            if (uncatTokens.length === 0) return null;
            return (
              <div style={{ borderTop: '1px solid #eee' }}>
                <div onClick={() => toggleSection('uncat')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', cursor: 'pointer', background: '#fafafa', userSelect: 'none' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Other ({uncatTokens.length})</span>
                  <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{collapsedSections.has('uncat') ? '▶' : '▼'}</span>
                </div>
                {!collapsedSections.has('uncat') && (
                  <div style={{ padding: '0.5rem' }}>
                    {uncatTokens.map((token) => (
                      <div key={token.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: 6, marginBottom: '0.2rem' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#a44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>{token.label[0]?.toUpperCase()}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{token.label}</div>
                          <div style={{ fontSize: '0.72rem', color: '#888' }}>{token.hp_current}/{token.hp_max} HP</div>
                        </div>
                        <button onClick={() => handleRemoveToken(token.id)} style={{ flexShrink: 0, padding: '0.1rem 0.3rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

        </div>{/* end scrollable section */}

          {/* Chat mini-window — fixed at bottom of sidebar */}
          <div style={{ flexShrink: 0, borderTop: '1px solid #ddd' }}>
            <div
              onClick={() => { setChatOpen((o) => !o); if (!chatOpen) setHasUnread(false); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 1rem', cursor: 'pointer', background: '#fafafa', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💬 Chat</span>
                {hasUnread && !chatOpen && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e53', display: 'inline-block' }} />
                )}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{chatOpen ? '▼' : '▲'}</span>
            </div>
            {chatOpen && (
              <div style={{ height: 260, display: 'flex', flexDirection: 'column', borderTop: '1px solid #eee' }}>
                <div ref={chatLogRef} style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {messages.length === 0 && <div style={{ fontSize: '0.78rem', color: '#ccc', textAlign: 'center', marginTop: '0.5rem' }}>No messages yet.</div>}
                  {messages.map((msg) => <ChatMsgItem key={msg.id} msg={msg} myUserId={user!.id} />)}
                </div>
                <div style={{ padding: '0.4rem 0.5rem', borderTop: '1px solid #eee', flexShrink: 0 }}>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                    placeholder="Message or /roll 1d20+5"
                    style={{ width: '100%', padding: '0.38rem 0.5rem', border: '1px solid #ddd', borderRadius: 4, fontSize: '0.8rem', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* In-game character sheet panel */}
      {panel?.type === 'character' && (() => {
        const token = tokens.find((t) => t.id === panel.tokenId);
        return (
          <InGameSheet
            characterId={panel.characterId}
            tokenId={panel.tokenId}
            canEditHp={panel.canEdit}
            canEditConditions={isDmOrAdmin}
            conditions={token?.conditions ?? []}
            onConditionsChange={(conditions) => handleTokenConditionsChange(panel.tokenId, conditions)}
            onClose={() => setPanel(null)}
          />
        );
      })()}

      {/* NPC HP panel (DM only) */}
      {panel?.type === 'npc' && (
        <>
          <div onClick={() => setPanel(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.2)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 101, background: '#fff', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.2)', padding: '1.5rem', width: 280, fontFamily: 'system-ui' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <strong style={{ fontSize: '1rem' }}>{panel.token.label}</strong>
              <button onClick={() => setPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#888' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#888', marginBottom: '0.75rem' }}>{panel.token.size} · {panel.token.token_type === 'npc' ? 'NPC' : 'PC'}</div>
            <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: '#666' }}>HP</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {[-10, -5, -1].map((d) => (
                <button key={d} onClick={() => handleNpcHpCommit(panel.token.id, npcHp + d)} disabled={npcHpSaving || npcHp === 0} style={{ padding: '0.3rem 0.45rem', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: '#fff' }}>{d}</button>
              ))}
              <span style={{ fontWeight: 700, fontSize: '1.2rem', minWidth: 32, textAlign: 'center' }}>{npcHp}</span>
              {[+1, +5, +10].map((d) => (
                <button key={d} onClick={() => handleNpcHpCommit(panel.token.id, npcHp + d)} disabled={npcHpSaving || npcHp >= panel.token.hp_max} style={{ padding: '0.3rem 0.45rem', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: '#fff' }}>+{d}</button>
              ))}
            </div>
            <div style={{ height: 8, background: '#ddd', borderRadius: 4, marginBottom: '0.4rem' }}>
              <div style={{ height: '100%', borderRadius: 4, background: npcHp / panel.token.hp_max > 0.5 ? '#4a4' : npcHp / panel.token.hp_max > 0.25 ? '#aa4' : '#a44', width: `${Math.max(0, Math.min(100, (npcHp / panel.token.hp_max) * 100))}%`, transition: 'width 0.2s' }} />
            </div>
            <div style={{ fontSize: '0.78rem', color: '#888', textAlign: 'center' }}>{npcHp} / {panel.token.hp_max}</div>
            <div style={{ marginTop: '1rem', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#666' }}>Conditions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {(['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
                'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
                'prone', 'restrained', 'stunned', 'unconscious'] as const).map((cond) => {
                const active = (tokens.find((t) => t.id === panel.token.id)?.conditions ?? panel.token.conditions).includes(cond);
                return (
                  <button key={cond} disabled={npcHpSaving}
                    onClick={() => {
                      const cur = tokens.find((t) => t.id === panel.token.id)?.conditions ?? panel.token.conditions;
                      const next = active ? cur.filter((c) => c !== cond) : [...cur, cond];
                      handleTokenConditionsChange(panel.token.id, next);
                    }}
                    style={{
                      padding: '0.15rem 0.4rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: active ? 700 : 400,
                      border: `1px solid ${active ? CONDITION_COLORS[cond] : '#ddd'}`,
                      background: active ? CONDITION_COLORS[cond] : '#f9f9f9',
                      color: active ? '#fff' : '#888',
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}>
                    {cond}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
