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

function minDistToPath(px: number, py: number, path: [number, number][]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return Math.hypot(px - path[0][0], py - path[0][1]);
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegment(px, py, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

function pathToD(path: [number, number][]): string {
  if (path.length === 0) return '';
  return path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
}
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getCampaign } from '../features/campaign/api';
import { useSession } from '../features/session/useSession';
import { listMaps, createMap, deleteMap, activateMap, updateMap, toggleFog, resetFog } from '../features/session/mapApi';
import { listCampaignNpcs, listTokenCategories, createToken, deleteToken, updateTokenConditions, setTokenHidden, updateTokenHp } from '../features/session/tokenApi';
import { createWall, deleteWall, clearWalls } from '../features/session/wallApi';
import { createTemplate, deleteTemplate, clearTemplates } from '../features/session/templateApi';
import { createDrawing, deleteDrawing, clearDrawings } from '../features/session/drawingApi';
import { crToXp, partyThresholds, encounterMultiplier, difficultyOf, DIFFICULTY_COLOR } from '../features/session/encounterMath';
import { listMapFolders, createMapFolder, renameMapFolder, deleteMapFolder } from '../features/session/mapFolderApi';
import { listNotes, createNote, updateNote, deleteNote } from '../features/session/campaignNotesApi';
import type { CampaignNote } from '../features/session/campaignNotesApi';
import type { WallSegment, MapTemplate, TemplateShape, MapDrawing } from '../features/session/types';
import { InGameSheet, CONDITION_COLORS } from '../features/session/InGameSheet';
import { MonsterSheet } from '../features/session/MonsterSheet';
import { NpcSheet } from '../features/session/NpcSheet';
import { apiFetch } from '../lib/api';
import { updateCharacter } from '../features/character/api';
import { socket } from '../lib/socket';
import type { Campaign } from '../features/campaign/types';
import type { MapData, TokenData, CampaignNpc, TokenCategory, MapFolder } from '../features/session/types';

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
  isTarget?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

function TokenOnMap({ token, map, isDragging, dragCol, dragRow, canMove, isTarget, onPointerDown }: TokenOnMapProps) {
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
        outline: isDragging ? '2px solid #4a8' : token.hidden ? '2px dashed #888' : 'none', outlineOffset: 1,
        opacity: token.hidden ? 0.45 : 1,
        boxShadow: isTarget ? '0 0 0 3px #c44, 0 0 0 5px rgba(255,255,255,0.7)' : undefined,
        borderRadius: '50%',
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
      {token.hidden && (
        <div style={{ position: 'absolute', top: -2, right: -2, background: '#666', color: '#fff', fontSize: 11, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', zIndex: 22 }} title="Hidden from players">👁</div>
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
      {/* Condition badges + effect timers */}
      {(activeConditions.length > 0 || (token.effects?.length ?? 0) > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: token.hp_visible && token.hp_max > 0 ? 14 : 4, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2, pointerEvents: 'none', zIndex: 21, maxWidth: Math.max(size, 80) }}>
          {activeConditions.map((cond) => (
            <div key={cond} style={{ background: CONDITION_COLORS[cond] ?? '#555', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 2, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
              {cond}
            </div>
          ))}
          {(token.effects ?? []).map((eff) => (
            <div key={`eff-${eff.name}`}
              title={eff.indefinite ? `${eff.name} — active (no timer)` : `${eff.name} — ${eff.rounds} round${eff.rounds === 1 ? '' : 's'} left`}
              style={{ background: '#446', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 2, whiteSpace: 'nowrap', display: 'inline-flex', gap: 2, alignItems: 'center' }}>
              {eff.name}
              {!eff.indefinite && (
                <span style={{ background: eff.rounds <= 2 ? '#c44' : '#668', padding: '0 2px', borderRadius: 2, fontSize: 7 }}>{eff.rounds}r</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface MonsterListItem {
  slug: string;
  name: string;
  cr: number | null;
  monster_type: string | null;
  hp_max: number;
  ac: number | null;
  size: string | null;
  source: string;
  isNpc?: boolean;
  npcId?: number;
}

interface EncounterEntry {
  uid: string;
  slug: string;
  npcId?: number;
  name: string;
  hp_current: number;
  hp_max: number;
  ac: number | null;
  cr: number | null;
  monster_type: string | null;
}

function crLabel(cr: number | null): string {
  if (cr === null) return '';
  if (cr === 0.125) return 'CR ⅛';
  if (cr === 0.25) return 'CR ¼';
  if (cr === 0.5) return 'CR ½';
  return `CR ${cr}`;
}

function renderTemplateLabel(t: { shape: TemplateShape; origin_x: number; origin_y: number; end_x: number; end_y: number; color: string }, key: string | number, gridSize: number, emphasized = false) {
  const dx = t.end_x - t.origin_x;
  const dy = t.end_y - t.origin_y;
  const len = Math.hypot(dx, dy);
  if (len < 4 || gridSize <= 0) return null;
  const ftPerPx = 5 / gridSize;
  let labelText = '';
  let cx = 0, cy = 0;
  if (t.shape === 'circle') {
    labelText = `r ${Math.round(len * ftPerPx)} ft`;
    cx = t.origin_x; cy = t.origin_y;
  } else if (t.shape === 'square') {
    labelText = `${Math.round(len * 2 * ftPerPx)} ft`;
    cx = t.origin_x; cy = t.origin_y;
  } else if (t.shape === 'cone' || t.shape === 'line') {
    labelText = `${Math.round(len * ftPerPx)} ft`;
    cx = (t.origin_x + t.end_x) / 2; cy = (t.origin_y + t.end_y) / 2;
  }
  return (
    <g key={`${key}-label`}>
      <rect x={cx - 22} y={cy - 9} width={44} height={18} rx={3}
        fill="rgba(0,0,0,0.7)" stroke={emphasized ? '#fff' : 'transparent'} strokeWidth={emphasized ? 1 : 0} />
      <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight={emphasized ? 700 : 600} fontFamily="system-ui">{labelText}</text>
    </g>
  );
}

function renderTemplateShape(t: { shape: TemplateShape; origin_x: number; origin_y: number; end_x: number; end_y: number; color: string }, key: string | number, dashed = false) {
  const dx = t.end_x - t.origin_x;
  const dy = t.end_y - t.origin_y;
  const len = Math.hypot(dx, dy);
  const fillOpacity = dashed ? 0.18 : 0.28;
  const strokeOpacity = dashed ? 0.5 : 0.85;
  const strokeDash = dashed ? '6 4' : undefined;

  if (t.shape === 'circle') {
    return <circle key={key} cx={t.origin_x} cy={t.origin_y} r={Math.max(2, len)} fill={t.color} fillOpacity={fillOpacity} stroke={t.color} strokeOpacity={strokeOpacity} strokeWidth={2} strokeDasharray={strokeDash} />;
  }
  if (t.shape === 'square') {
    // Centered on origin, side = 2 * len
    const side = Math.max(4, len * 2);
    return <rect key={key} x={t.origin_x - side / 2} y={t.origin_y - side / 2} width={side} height={side} fill={t.color} fillOpacity={fillOpacity} stroke={t.color} strokeOpacity={strokeOpacity} strokeWidth={2} strokeDasharray={strokeDash} />;
  }
  if (t.shape === 'cone') {
    // 60° cone (5e standard): apex at origin, axis from origin toward end
    if (len < 1) return null;
    const ux = dx / len, uy = dy / len;
    // Half-angle for 60° cone is 30° => tan(30°) ≈ 0.5774
    const halfWidth = len * 0.5774;
    // Perpendicular unit vector
    const px = -uy, py = ux;
    const x1 = t.end_x + px * halfWidth, y1 = t.end_y + py * halfWidth;
    const x2 = t.end_x - px * halfWidth, y2 = t.end_y - py * halfWidth;
    return <polygon key={key} points={`${t.origin_x},${t.origin_y} ${x1},${y1} ${x2},${y2}`} fill={t.color} fillOpacity={fillOpacity} stroke={t.color} strokeOpacity={strokeOpacity} strokeWidth={2} strokeDasharray={strokeDash} />;
  }
  if (t.shape === 'line') {
    // 5ft-wide line from origin to end (approximated as fixed pixel width — caller can adjust)
    if (len < 1) return null;
    const ux = dx / len, uy = dy / len;
    const halfW = 12; // px — half of standard 5ft line width; scales with grid_size in practice
    const px = -uy * halfW, py = ux * halfW;
    const points = `${t.origin_x + px},${t.origin_y + py} ${t.end_x + px},${t.end_y + py} ${t.end_x - px},${t.end_y - py} ${t.origin_x - px},${t.origin_y - py}`;
    return <polygon key={key} points={points} fill={t.color} fillOpacity={fillOpacity} stroke={t.color} strokeOpacity={strokeOpacity} strokeWidth={2} strokeDasharray={strokeDash} />;
  }
  return null;
}

interface MapRowProps {
  map: MapData; activeMapId: number | null; folders: MapFolder[];
  onActivate: (id: number) => void; onDelete: (id: number) => void;
  onMove: (folderId: number | null) => void;
}
function MapRow({ map, activeMapId, folders, onActivate, onDelete, onMove }: MapRowProps) {
  return (
    <div style={{ padding: '0.5rem 0.6rem', borderRadius: 5, marginBottom: '0.3rem', background: activeMapId === map.id ? '#e8f0fe' : '#fff', border: `1px solid ${activeMapId === map.id ? '#4a6' : '#e0e0e0'}` }}>
      <div style={{ fontWeight: 500, fontSize: '0.85rem', marginBottom: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{map.name}</div>
      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
        {activeMapId !== map.id ? (
          <button onClick={() => onActivate(map.id)} style={{ flex: 1, padding: '0.25rem', fontSize: '0.72rem', cursor: 'pointer', background: '#333', color: '#fff', border: 'none', borderRadius: 3 }}>Show</button>
        ) : (
          <span style={{ flex: 1, padding: '0.25rem', fontSize: '0.72rem', textAlign: 'center', color: '#4a6', fontWeight: 500 }}>Active</span>
        )}
        {folders.length > 0 && (
          <select value={map.folder_id ?? ''} onChange={(e) => onMove(e.target.value ? Number(e.target.value) : null)}
            style={{ fontSize: '0.7rem', padding: '0.2rem', border: '1px solid #ddd', borderRadius: 3, maxWidth: 80 }}>
            <option value="">No folder</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <button onClick={() => onDelete(map.id)} style={{ padding: '0.25rem 0.4rem', fontSize: '0.72rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff' }}>✕</button>
      </div>
    </div>
  );
}

interface FolderTreeProps {
  folders: MapFolder[]; maps: MapData[]; activeMapId: number | null; parentId: number | null;
  expandedFolders: Set<number>; renamingFolderId: number | null; renamingFolderName: string;
  campaignId: number;
  onToggleExpand: (id: number) => void;
  onStartRename: (f: MapFolder) => void;
  onRename: (fid: number, name: string) => void;
  onCancelRename: () => void;
  onSetRenamingName: (name: string) => void;
  onAddSubfolder: (parentId: number) => void;
  onDeleteFolder: (fid: number, parentId: number | null) => void;
  onActivateMap: (id: number) => void;
  onDeleteMap: (id: number) => void;
  onMoveMap: (mapId: number, folderId: number | null) => void;
  depth?: number;
}
function FolderTree({ folders, maps, activeMapId, parentId, expandedFolders, renamingFolderId, renamingFolderName, campaignId, onToggleExpand, onStartRename, onRename, onCancelRename, onSetRenamingName, onAddSubfolder, onDeleteFolder, onActivateMap, onDeleteMap, onMoveMap, depth = 0 }: FolderTreeProps) {
  const children = folders.filter((f) => f.parent_id === parentId);
  if (children.length === 0) return null;
  return (
    <>
      {children.map((folder) => {
        const isExpanded = expandedFolders.has(folder.id);
        const folderMaps = maps.filter((m) => m.folder_id === folder.id);
        const isRenaming = renamingFolderId === folder.id;
        return (
          <div key={folder.id} style={{ marginLeft: depth * 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.4rem', borderRadius: 4, marginBottom: 2, background: '#f5f5f5', border: '1px solid #e8e8e8' }}>
              <button onClick={() => onToggleExpand(folder.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.7rem', color: '#666', padding: '0 2px', lineHeight: 1 }}>{isExpanded ? '▾' : '▸'}</button>
              {isRenaming ? (
                <input autoFocus value={renamingFolderName} onChange={(e) => onSetRenamingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRename(folder.id, renamingFolderName);
                    if (e.key === 'Escape') onCancelRename();
                  }}
                  style={{ flex: 1, fontSize: '0.8rem', padding: '0.1rem 0.3rem', border: '1px solid #aac', borderRadius: 3 }} />
              ) : (
                <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onDoubleClick={() => onStartRename(folder)}>
                  📁 {folder.name}
                </span>
              )}
              <button onClick={() => onAddSubfolder(folder.id)} title="Add subfolder" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.68rem', color: '#888', padding: '0 2px' }}>+</button>
              <button onClick={() => onStartRename(folder)} title="Rename" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.68rem', color: '#888', padding: '0 2px' }}>✎</button>
              <button onClick={() => onDeleteFolder(folder.id, folder.parent_id)} title="Delete folder" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.68rem', color: '#c44', padding: '0 2px' }}>✕</button>
            </div>
            {isExpanded && (
              <div style={{ marginLeft: 12, marginBottom: 2 }}>
                <FolderTree folders={folders} maps={maps} activeMapId={activeMapId} parentId={folder.id}
                  expandedFolders={expandedFolders} renamingFolderId={renamingFolderId} renamingFolderName={renamingFolderName}
                  campaignId={campaignId} onToggleExpand={onToggleExpand} onStartRename={onStartRename}
                  onRename={onRename} onCancelRename={onCancelRename} onSetRenamingName={onSetRenamingName}
                  onAddSubfolder={onAddSubfolder} onDeleteFolder={onDeleteFolder}
                  onActivateMap={onActivateMap} onDeleteMap={onDeleteMap} onMoveMap={onMoveMap} depth={0} />
                {folderMaps.map((m) => (
                  <MapRow key={m.id} map={m} activeMapId={activeMapId} folders={folders}
                    onActivate={onActivateMap} onDelete={onDeleteMap}
                    onMove={(folderId) => onMoveMap(m.id, folderId)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ChatMsgItem({ msg, myUserId, targetCount, onApply }: { msg: ChatMessage; myUserId: number; targetCount: number; onApply?: (amount: number, mode: 'damage' | 'half' | 'heal') => void }) {
  const isMe = msg.user_id === myUserId;
  if (msg.type === 'roll' && msg.data) {
    const { expression, dice, modifier, total, label, rollMode } = msg.data;
    const modStr = modifier !== 0 ? ` ${modifier > 0 ? '+' : ''}${modifier}` : '';
    const isAdvDis = rollMode && dice.length === 3;
    const chosen = isAdvDis ? dice[2] : null;
    let diceDisplay: React.ReactNode;
    if (isAdvDis) {
      diceDisplay = (
        <span>[
          {[dice[0], dice[1]].map((d, i) => (
            <span key={i} style={{ fontWeight: d === chosen ? 700 : 400, color: d === chosen ? '#333' : '#aaa', textDecoration: d !== chosen ? 'line-through' : undefined }}>
              {i > 0 ? ', ' : ''}{d}
            </span>
          ))}
        ]</span>
      );
    } else {
      diceDisplay = <span>[{dice.join(', ')}]</span>;
    }
    const showApply = targetCount > 0 && onApply;
    return (
      <div style={{ background: '#f5f0e8', border: '1px solid #e4d5b8', borderRadius: 5, padding: '0.35rem 0.5rem' }}>
        <div style={{ fontSize: '0.7rem', color: '#886', fontWeight: 600, marginBottom: 2 }}>
          {msg.username}{label ? <span style={{ color: '#a86' }}> — {label}</span> : <span> rolled {expression}</span>}
          {rollMode && <span style={{ marginLeft: 4, fontSize: '0.65rem', color: rollMode === 'advantage' ? '#2a6' : '#a24', fontWeight: 700 }}>{rollMode === 'advantage' ? 'ADV' : 'DIS'}</span>}
        </div>
        {label && <div style={{ fontSize: '0.7rem', color: '#999', marginBottom: 2 }}>{expression}</div>}
        <div style={{ fontSize: '0.78rem', color: '#666' }}>{diceDisplay}{modStr}</div>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#333' }}>= {total}</div>
        {showApply && (
          <div style={{ display: 'flex', gap: '0.2rem', marginTop: 4, flexWrap: 'wrap' }}>
            <button onClick={() => onApply!(total, 'damage')} title={`Apply ${total} damage to ${targetCount} target${targetCount > 1 ? 's' : ''}`}
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.68rem', border: '1px solid #c44', borderRadius: 3, background: '#c44', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>−{total} dmg</button>
            <button onClick={() => onApply!(Math.floor(total / 2), 'half')} title={`Apply ${Math.floor(total / 2)} (half) damage`}
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.68rem', border: '1px solid #c84', borderRadius: 3, background: '#fff', color: '#c84', cursor: 'pointer', fontWeight: 600 }}>−½ ({Math.floor(total / 2)})</button>
            <button onClick={() => onApply!(total, 'heal')} title={`Heal ${total}`}
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.68rem', border: '1px solid #4a4', borderRadius: 3, background: '#fff', color: '#4a4', cursor: 'pointer', fontWeight: 600 }}>+{total} hp</button>
          </div>
        )}
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
  const [folders, setFolders] = useState<MapFolder[]>([]);
  const [pcStats, setPcStats] = useState<Record<number, { passive_perception: number; inspiration: number }>>({});
  const [notes, setNotes] = useState<CampaignNote[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [newMapFolderId, setNewMapFolderId] = useState<number | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<number | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');

  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [leftTab, setLeftTab] = useState<'maps' | 'monsters' | 'notes'>('maps');

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
  const [pointerDown, setPointerDown] = useState<{ token: TokenData; startX: number; startY: number; shiftKey: boolean } | null>(null);
  const [targetIds, setTargetIds] = useState<Set<number>>(new Set());

  // Grid style
  const [gridColor, setGridColor] = useState('#000000');
  const [gridBold, setGridBold] = useState(false);

  // Wall editor
  const [wallMode, setWallMode] = useState(false);
  const [wallDrawStart, setWallDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [wallDrawEnd, setWallDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const wallDrawStartRef = useRef<{ x: number; y: number } | null>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);

  // AOE templates
  const [templateMode, setTemplateMode] = useState(false);
  const [templateShape, setTemplateShape] = useState<TemplateShape>('circle');
  const [templateColor, setTemplateColor] = useState('#ff6b6b');
  const [templateDrawStart, setTemplateDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [templateDrawEnd, setTemplateDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const templateDrawStartRef = useRef<{ x: number; y: number } | null>(null);

  // Measurement tool (local only)
  const [measureMode, setMeasureMode] = useState(false);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);
  const measureStartRef = useRef<{ x: number; y: number } | null>(null);

  // Drawing tool (freehand pen, persisted + synced)
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState('#ffeb3b');
  const [drawWidth, setDrawWidth] = useState(3);
  const [activeDrawPath, setActiveDrawPath] = useState<[number, number][] | null>(null);
  const activeDrawPathRef = useRef<[number, number][] | null>(null);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const [diceLogOpen, setDiceLogOpen] = useState(true);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);

  // Initiative editing
  const [editingInitiativeId, setEditingInitiativeId] = useState<number | null>(null);
  const [editingInitiativeValue, setEditingInitiativeValue] = useState('');
  const [addingInitiative, setAddingInitiative] = useState(false);
  const [addInitiativeLabel, setAddInitiativeLabel] = useState('');
  const [addInitiativeValue, setAddInitiativeValue] = useState('');
  const [initiativeConditionPicker, setInitiativeConditionPicker] = useState<number | null>(null);

  type PanelState =
    | { type: 'character'; characterId: number; tokenId: number; canEdit: boolean }
    | { type: 'monster'; slug: string; tokenId?: number; hp: number; hpMax: number; encounterUid?: string }
    | { type: 'npc'; npcId: number; tokenId?: number; hp: number; hpMax: number };
  const [panel, setPanel] = useState<PanelState | null>(null);

  // Monster/encounter tracker
  const [monsterSearch, setMonsterSearch] = useState('');
  const [monsterLibrary, setMonsterLibrary] = useState<MonsterListItem[]>([]);
  const [encounterEntries, setEncounterEntries] = useState<EncounterEntry[]>([]);

  const { online, connected, activeMap, setActiveMap, tokens, messages, initiative, walls, templates, drawings, fogVisible, fogExplored } = useSession(Number(id));
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
      listMapFolders(campaign.id),
      apiFetch<{ characters: Array<{ id: number; passive_perception: number; inspiration: number }> }>(`/campaigns/${campaign.id}/characters`),
      listNotes(campaign.id),
    ]).then(([mapsData, npcData, catData, folderData, charData, notesData]) => {
      setMaps(mapsData.maps);
      setActiveMapId(mapsData.active_map_id);
      setNpcs(npcData);
      setCategories(catData);
      setFolders(folderData);
      const statsMap: Record<number, { passive_perception: number; inspiration: number }> = {};
      for (const c of charData.characters) statsMap[c.id] = { passive_perception: c.passive_perception, inspiration: c.inspiration };
      setPcStats(statsMap);
      setNotes(notesData);
    }).catch(() => {});
  }, [campaign?.id, isDmOrAdmin]);

  useEffect(() => {
    if (leftTab !== 'monsters' || monsterLibrary.length > 0) return;
    apiFetch<{ items: MonsterListItem[] }>('/library/monsters')
      .then((r) => setMonsterLibrary(r.items))
      .catch(() => {});
  }, [leftTab]);

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

  // Sync monster/npc panel HP when the token is updated via socket
  useEffect(() => {
    if (!panel || !('tokenId' in panel) || !panel.tokenId) return;
    const t = tokens.find((tk) => tk.id === panel.tokenId);
    if (!t || t.hp_current === panel.hp) return;
    if (panel.type === 'monster') setPanel((p) => p?.type === 'monster' ? { ...p, hp: t.hp_current } : p);
    if (panel.type === 'npc') setPanel((p) => p?.type === 'npc' ? { ...p, hp: t.hp_current } : p);
  }, [tokens]);

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

    // Step 1: fill entire canvas black (unseen areas)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Step 2: punch transparent holes for every explored + visible cell
    for (const [c, r] of fogExplored) {
      ctx.clearRect(ox + c * gs, oy + r * gs, gs, gs);
    }
    for (const [c, r] of fogVisible) {
      ctx.clearRect(ox + c * gs, oy + r * gs, gs, gs);
    }

    // Step 3: re-paint explored-but-not-visible cells as dark grey
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    for (const [c, r] of fogExplored) {
      if (!visibleSet.has(`${c},${r}`)) {
        ctx.fillRect(ox + c * gs, oy + r * gs, gs, gs);
      }
    }
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

  // Template pointer handlers — drag from origin to set size+direction
  function handleTemplatePointerDown(e: React.PointerEvent) {
    if (!activeMap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    templateDrawStartRef.current = pt;
    setTemplateDrawStart(pt);
    setTemplateDrawEnd(pt);
  }

  function handleTemplatePointerMove(e: React.PointerEvent) {
    if (!templateDrawStartRef.current || !activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTemplateDrawEnd({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom });
  }

  function handleTemplatePointerUp(e: React.PointerEvent) {
    const start = templateDrawStartRef.current;
    if (!start || !activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const end = { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    const moved = Math.hypot(end.x - start.x, end.y - start.y);
    if (moved < 5) {
      // Click without drag → check for hit on existing template to delete
      const hit = templates.find((t) => {
        const dx = end.x - t.origin_x, dy = end.y - t.origin_y;
        const dist = Math.hypot(dx, dy);
        const radius = Math.hypot(t.end_x - t.origin_x, t.end_y - t.origin_y);
        return dist < Math.max(20, radius);
      });
      if (hit) deleteTemplate(activeMap.id, hit.id).catch((err: Error) => setError(err.message));
    } else {
      createTemplate(activeMap.id, {
        shape: templateShape,
        origin_x: start.x, origin_y: start.y,
        end_x: end.x, end_y: end.y,
        color: templateColor,
      }).catch((err: Error) => setError(err.message));
    }
    templateDrawStartRef.current = null;
    setTemplateDrawStart(null);
    setTemplateDrawEnd(null);
  }

  // Measurement pointer handlers — local only, clears on release
  function handleMeasurePointerDown(e: React.PointerEvent) {
    if (!activeMap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    measureStartRef.current = pt;
    setMeasureStart(pt);
    setMeasureEnd(pt);
  }

  function handleMeasurePointerMove(e: React.PointerEvent) {
    if (!measureStartRef.current || !activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setMeasureEnd({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom });
  }

  function handleMeasurePointerUp() {
    measureStartRef.current = null;
    setMeasureStart(null);
    setMeasureEnd(null);
  }

  // Drawing pointer handlers — accumulate path, save on release
  function handleDrawPointerDown(e: React.PointerEvent) {
    if (!activeMap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const pt: [number, number] = [(e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom];
    activeDrawPathRef.current = [pt];
    setActiveDrawPath([pt]);
  }

  function handleDrawPointerMove(e: React.PointerEvent) {
    if (!activeDrawPathRef.current || !activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt: [number, number] = [(e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom];
    // Skip points too close to previous one to keep path size reasonable
    const last = activeDrawPathRef.current[activeDrawPathRef.current.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 3) return;
    activeDrawPathRef.current = [...activeDrawPathRef.current, pt];
    setActiveDrawPath(activeDrawPathRef.current);
  }

  function handleDrawPointerUp(e: React.PointerEvent) {
    const path = activeDrawPathRef.current;
    activeDrawPathRef.current = null;
    setActiveDrawPath(null);
    if (!path || !activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const endPt: [number, number] = [(e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom];
    if (path.length < 2) {
      // Tap (no drag) — try to delete the nearest drawing within range
      const hit = drawings
        .map((d) => ({ d, dist: minDistToPath(endPt[0], endPt[1], d.path) }))
        .reduce((best, cur) => (cur.dist < best.dist ? cur : best), { d: null as MapDrawing | null, dist: 12 });
      if (hit.d) deleteDrawing(activeMap.id, hit.d.id).catch((err: Error) => setError(err.message));
      return;
    }
    createDrawing(activeMap.id, { path, color: drawColor, stroke_width: drawWidth })
      .catch((err: Error) => setError(err.message));
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
      const m = await createMap({ campaign_id: Number(id), name: newMapName.trim(), image_url: newMapUrl.trim(), grid_size: newMapGridSize, folder_id: newMapFolderId });
      setMaps((prev) => [...prev, m]);
      setNewMapName(''); setNewMapUrl(''); setNewMapGridSize(50); setNewMapFolderId(null); setAddingMap(false);
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
    let data: { type: string; characterId?: number; campaignNpcId?: number; monsterSlug?: string };
    try { data = JSON.parse(raw); } catch { return; }
    const rect = innerMapRef.current.getBoundingClientRect();
    const { col, row } = pxToCell((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom, activeMap);
    if (data.type === 'pc' && data.characterId) {
      createToken({ map_id: activeMap.id, token_type: 'pc', character_id: data.characterId, col, row }).catch((e) => setError(e.message));
    } else if (data.type === 'npc' && data.campaignNpcId) {
      createToken({ map_id: activeMap.id, token_type: 'npc', campaign_npc_id: data.campaignNpcId, col, row }).catch((e) => setError(e.message));
    } else if (data.type === 'monster' && data.monsterSlug) {
      createToken({ map_id: activeMap.id, token_type: 'npc', monster_slug: data.monsterSlug, col, row }).catch((e) => setError(e.message));
    }
  }

  function handleTokenPointerDown(e: React.PointerEvent, token: TokenData) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPointerDown({ token, startX: e.clientX, startY: e.clientY, shiftKey: e.shiftKey });
    if (canMoveToken(token) && !e.shiftKey) {
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
        if (pointerDown.shiftKey) {
          // Shift+click toggles target selection
          const id = pointerDown.token.id;
          setTargetIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        } else {
          handleTokenClick(pointerDown.token);
        }
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
      if (token.monster_slug) {
        setPanel({ type: 'monster', slug: token.monster_slug, tokenId: token.id, hp: token.hp_current, hpMax: token.hp_max });
      } else if (token.campaign_npc_id !== null) {
        setPanel({ type: 'npc', npcId: token.campaign_npc_id, tokenId: token.id, hp: token.hp_current, hpMax: token.hp_max });
      }
    }
  }

  async function applyToTargets(amount: number, mode: 'damage' | 'half' | 'heal') {
    if (targetIds.size === 0 || amount === 0) return;
    const value = mode === 'half' ? Math.floor(amount / 2) : amount;
    const ops: Promise<unknown>[] = [];
    for (const id of targetIds) {
      const tok = tokens.find((t) => t.id === id);
      if (!tok) continue;
      const next = mode === 'heal'
        ? Math.min(tok.hp_max, tok.hp_current + value)
        : Math.max(0, tok.hp_current - value);
      if (next !== tok.hp_current) ops.push(updateTokenHp(id, next).catch(() => {}));
    }
    await Promise.all(ops);
  }

  async function handleTokenConditionsChange(tokenId: number, conditions: string[]) {
    try { await updateTokenConditions(tokenId, conditions); }
    catch (e: any) { setError(e.message); }
  }

  async function handleRemoveToken(tokenId: number) {
    try { await deleteToken(tokenId); } catch (e: any) { setError(e.message); }
  }

  async function handleToggleInspiration(characterId: number) {
    const current = pcStats[characterId]?.inspiration ?? 0;
    const next = current ? 0 : 1;
    setPcStats((prev) => ({ ...prev, [characterId]: { ...prev[characterId], inspiration: next } }));
    try { await updateCharacter(characterId, { inspiration: next }); }
    catch { setPcStats((prev) => ({ ...prev, [characterId]: { ...prev[characterId], inspiration: current } })); }
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
          {activeMap && (
            <button onClick={() => setMeasureMode((m) => !m)}
              title={measureMode ? 'Exit measurement mode' : 'Drag on map to measure distance'}
              style={{ padding: '0.25rem 0.55rem', cursor: 'pointer', border: `1px solid ${measureMode ? '#39c' : '#ccc'}`, borderRadius: 4, background: measureMode ? '#e0f0ff' : '#fff', color: measureMode ? '#39c' : '#333', fontSize: '0.78rem', fontWeight: measureMode ? 700 : 400 }}>
              📏 {measureMode ? 'Measure ON' : 'Measure'}
            </button>
          )}
          {activeMap && (
            <button onClick={() => setDrawMode((m) => !m)}
              title={drawMode ? 'Exit draw mode' : 'Freehand draw on the map'}
              style={{ padding: '0.25rem 0.55rem', cursor: 'pointer', border: `1px solid ${drawMode ? '#a3a' : '#ccc'}`, borderRadius: 4, background: drawMode ? '#fae8ff' : '#fff', color: drawMode ? '#a3a' : '#333', fontSize: '0.78rem', fontWeight: drawMode ? 700 : 400 }}>
              ✏ {drawMode ? 'Draw ON' : 'Draw'}
            </button>
          )}
          {activeMap && (
            <button onClick={() => setTemplateMode((m) => !m)}
              title={templateMode ? 'Exit AOE mode' : 'Place AOE templates'}
              style={{ padding: '0.25rem 0.55rem', cursor: 'pointer', border: `1px solid ${templateMode ? '#c70' : '#ccc'}`, borderRadius: 4, background: templateMode ? '#fff4e0' : '#fff', color: templateMode ? '#c70' : '#333', fontSize: '0.78rem', fontWeight: templateMode ? 700 : 400 }}>
              ✨ {templateMode ? 'AOE ON' : 'AOE'}
            </button>
          )}
          {activeMap && templateMode && (
            <>
              <select value={templateShape} onChange={(e) => setTemplateShape(e.target.value as TemplateShape)}
                style={{ padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.75rem', background: '#fff' }}>
                <option value="circle">○ Sphere</option>
                <option value="square">□ Cube</option>
                <option value="cone">◢ Cone</option>
                <option value="line">▬ Line</option>
              </select>
              <input type="color" value={templateColor} onChange={(e) => setTemplateColor(e.target.value)}
                title="Template colour" style={{ width: 28, height: 22, padding: 1, border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }} />
            </>
          )}
          {activeMap && templates.length > 0 && (
            <button onClick={() => { if (confirm('Clear all AOE templates on this map?')) clearTemplates(activeMap.id).catch((e: Error) => setError(e.message)); }}
              style={{ padding: '0.25rem 0.5rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, background: '#fff', color: 'crimson', fontSize: '0.75rem' }} title="Delete all templates">
              Clear AOE
            </button>
          )}
          {activeMap && drawMode && (
            <>
              <input type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)}
                title="Draw colour" style={{ width: 28, height: 22, padding: 1, border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }} />
              <select value={drawWidth} onChange={(e) => setDrawWidth(Number(e.target.value))}
                title="Stroke width" style={{ padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.75rem', background: '#fff' }}>
                <option value={2}>Thin</option>
                <option value={4}>Medium</option>
                <option value={7}>Thick</option>
              </select>
            </>
          )}
          {activeMap && drawings.length > 0 && (
            <button onClick={() => { if (confirm('Clear all drawings on this map?')) clearDrawings(activeMap.id).catch((e: Error) => setError(e.message)); }}
              style={{ padding: '0.25rem 0.5rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, background: '#fff', color: 'crimson', fontSize: '0.75rem' }} title="Delete all drawings">
              Clear drawings
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

        {/* DM Bar — always rendered for DM/admin, collapsible via arrow on bar */}
        {isDmOrAdmin && (
          <div style={{ display: 'flex', flexShrink: 0 }}>
            {/* Collapse arrow strip */}
            <button onClick={() => setShowLeftPanel((p) => !p)} title={showLeftPanel ? 'Collapse DM bar' : 'Expand DM bar'}
              style={{ width: 20, background: '#f0f0f0', border: 'none', borderRight: '1px solid #ddd', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#888', flexShrink: 0, padding: 0 }}>
              {showLeftPanel ? '◀' : '▶'}
            </button>

          {showLeftPanel && (
          <div style={{ width: 260, background: '#fafafa', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>

            {/* Tools section */}
            <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', flexShrink: 0 }}>
              <button onClick={() => socket.emit('initiative:roll')} title="Roll initiative for all map tokens"
                style={{ padding: '0.25rem 0.55rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff', color: '#333', fontSize: '0.78rem' }}>
                ⚔ Initiative
              </button>
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const [kind, key] = v.split(':');
                  if (kind === 'skill' || kind === 'save' || kind === 'ability') {
                    socket.emit('group:roll', { kind, key });
                  }
                  e.target.value = '';
                }}
                title="Roll a check or save for every PC at once"
                style={{ padding: '0.25rem 0.4rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff', color: '#333', fontSize: '0.78rem' }}>
                <option value="">🎲 Group Roll…</option>
                <optgroup label="Saving Throws">
                  <option value="save:str">STR Save</option>
                  <option value="save:dex">DEX Save</option>
                  <option value="save:con">CON Save</option>
                  <option value="save:int">INT Save</option>
                  <option value="save:wis">WIS Save</option>
                  <option value="save:cha">CHA Save</option>
                </optgroup>
                <optgroup label="Skill Checks">
                  <option value="skill:acrobatics">Acrobatics (DEX)</option>
                  <option value="skill:animal-handling">Animal Handling (WIS)</option>
                  <option value="skill:arcana">Arcana (INT)</option>
                  <option value="skill:athletics">Athletics (STR)</option>
                  <option value="skill:deception">Deception (CHA)</option>
                  <option value="skill:history">History (INT)</option>
                  <option value="skill:insight">Insight (WIS)</option>
                  <option value="skill:intimidation">Intimidation (CHA)</option>
                  <option value="skill:investigation">Investigation (INT)</option>
                  <option value="skill:medicine">Medicine (WIS)</option>
                  <option value="skill:nature">Nature (INT)</option>
                  <option value="skill:perception">Perception (WIS)</option>
                  <option value="skill:performance">Performance (CHA)</option>
                  <option value="skill:persuasion">Persuasion (CHA)</option>
                  <option value="skill:religion">Religion (INT)</option>
                  <option value="skill:sleight-of-hand">Sleight of Hand (DEX)</option>
                  <option value="skill:stealth">Stealth (DEX)</option>
                  <option value="skill:survival">Survival (WIS)</option>
                </optgroup>
                <optgroup label="Ability Checks (no proficiency)">
                  <option value="ability:str">STR</option>
                  <option value="ability:dex">DEX</option>
                  <option value="ability:con">CON</option>
                  <option value="ability:int">INT</option>
                  <option value="ability:wis">WIS</option>
                  <option value="ability:cha">CHA</option>
                </optgroup>
              </select>
              {activeMap && (
                <button onClick={() => setWallMode((w) => !w)}
                  title={wallMode ? 'Exit wall editor' : 'Enter wall editor'}
                  style={{ padding: '0.25rem 0.55rem', cursor: 'pointer', border: `1px solid ${wallMode ? '#c44' : '#ccc'}`, borderRadius: 4, background: wallMode ? '#fdecea' : '#fff', color: wallMode ? '#c44' : '#333', fontSize: '0.78rem', fontWeight: wallMode ? 700 : 400 }}>
                  🧱 {wallMode ? 'Walls ON' : 'Walls'}
                </button>
              )}
              {activeMap && walls.length > 0 && (
                <button onClick={() => { if (confirm('Clear all walls on this map?')) clearWalls(activeMap.id).catch((e: Error) => setError(e.message)); }}
                  style={{ padding: '0.25rem 0.5rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 4, background: '#fff', color: 'crimson', fontSize: '0.75rem' }} title="Delete all walls">
                  Clear walls
                </button>
              )}
              {activeMap && (
                <button onClick={() => toggleFog(activeMap.id).then((m) => setActiveMap(m)).catch((e: Error) => setError(e.message))}
                  title={activeMap.fog_enabled ? 'Fog ON — click to disable' : 'Fog OFF — click to enable'}
                  style={{ padding: '0.25rem 0.55rem', cursor: 'pointer', border: `1px solid ${activeMap.fog_enabled ? '#448' : '#ccc'}`, borderRadius: 4, background: activeMap.fog_enabled ? '#eef' : '#fff', color: activeMap.fog_enabled ? '#448' : '#333', fontSize: '0.78rem', fontWeight: activeMap.fog_enabled ? 700 : 400 }}>
                  🌫 {activeMap.fog_enabled ? 'Fog ON' : 'Fog'}
                </button>
              )}
              {!!activeMap?.fog_enabled && (
                <button onClick={() => { if (confirm('Reset fog? All explored cells will be cleared.')) resetFog(activeMap.id).catch((e: Error) => setError(e.message)); }}
                  style={{ padding: '0.25rem 0.5rem', cursor: 'pointer', border: '1px solid #cce', borderRadius: 4, background: '#fff', color: '#448', fontSize: '0.75rem' }} title="Clear all explored fog">
                  Reset fog
                </button>
              )}
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
              {(['maps', 'monsters', 'notes'] as const).map((tab) => (
                <button key={tab} onClick={() => setLeftTab(tab)} style={{ flex: 1, padding: '0.6rem', border: 'none', borderBottom: leftTab === tab ? '2px solid #333' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: leftTab === tab ? 600 : 400, color: leftTab === tab ? '#333' : '#888' }}>
                  {tab === 'maps' ? 'Maps' : tab === 'monsters' ? 'Monsters' : 'Notes'}
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
                    {folders.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                        <label>Folder:</label>
                        <select value={newMapFolderId ?? ''} onChange={(e) => setNewMapFolderId(e.target.value ? Number(e.target.value) : null)} style={{ flex: 1, padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.8rem' }}>
                          <option value="">No folder</option>
                          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="submit" disabled={savingMap} style={{ flex: 1, padding: '0.4rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}>{savingMap ? 'Saving…' : 'Add map'}</button>
                      <button type="button" onClick={() => setAddingMap(false)} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                    </div>
                  </form>
                )}

                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                  {/* New folder row */}
                  {newFolderParentId !== undefined && (
                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem', padding: '0.3rem 0.5rem', background: '#f0f4ff', borderRadius: 4, border: '1px solid #ccd' }}>
                      <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newFolderName.trim()) {
                            createMapFolder(campaign!.id, newFolderName.trim(), newFolderParentId).then((f) => {
                              setFolders((prev) => [...prev, f]);
                              setExpandedFolders((prev) => { const n = new Set(prev); if (f.parent_id) n.add(f.parent_id); return n; });
                            }).catch(() => {});
                            setNewFolderParentId(undefined); setNewFolderName('');
                          }
                          if (e.key === 'Escape') { setNewFolderParentId(undefined); setNewFolderName(''); }
                        }}
                        placeholder={newFolderParentId ? 'Subfolder name…' : 'Folder name…'}
                        style={{ flex: 1, padding: '0.25rem', border: '1px solid #aac', borderRadius: 3, fontSize: '0.82rem' }} />
                      <button onClick={() => { setNewFolderParentId(undefined); setNewFolderName(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#aaa', fontSize: '0.9rem' }}>✕</button>
                    </div>
                  )}

                  {/* New folder button */}
                  {newFolderParentId === undefined && (
                    <button onClick={() => { setNewFolderParentId(null); setNewFolderName(''); }}
                      style={{ width: '100%', marginBottom: '0.4rem', padding: '0.25rem', fontSize: '0.75rem', border: '1px dashed #ccc', borderRadius: 4, background: '#fafafa', color: '#888', cursor: 'pointer', textAlign: 'left' }}>
                      + New folder
                    </button>
                  )}

                  {/* Folder tree then unassigned maps */}
                  <FolderTree
                    folders={folders} maps={maps} activeMapId={activeMapId} parentId={null}
                    expandedFolders={expandedFolders} renamingFolderId={renamingFolderId}
                    renamingFolderName={renamingFolderName}
                    campaignId={campaign!.id}
                    onToggleExpand={(id) => setExpandedFolders((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                    onStartRename={(f) => { setRenamingFolderId(f.id); setRenamingFolderName(f.name); }}
                    onRename={(fid, name) => {
                      renameMapFolder(campaign!.id, fid, name)
                        .then((f) => setFolders((prev) => prev.map((x) => x.id === fid ? f : x)))
                        .catch(() => {});
                      setRenamingFolderId(null);
                    }}
                    onCancelRename={() => setRenamingFolderId(null)}
                    onSetRenamingName={setRenamingFolderName}
                    onAddSubfolder={(parentId) => { setNewFolderParentId(parentId); setNewFolderName(''); }}
                    onDeleteFolder={(fid, parentId) => {
                      const hasMaps = maps.some((m) => m.folder_id === fid);
                      const hasChildren = folders.some((f) => f.parent_id === fid);
                      if (hasMaps || hasChildren) {
                        const del = confirm('Delete maps inside this folder too?\nOK = delete maps, Cancel = move maps to parent');
                        deleteMapFolder(campaign!.id, fid, del).then(() => {
                          setFolders((prev) => prev.filter((f) => f.id !== fid && f.parent_id !== fid));
                          if (del) setMaps((prev) => prev.filter((m) => m.folder_id !== fid));
                          else setMaps((prev) => prev.map((m) => m.folder_id === fid ? { ...m, folder_id: parentId } : m));
                        }).catch(() => {});
                      } else {
                        deleteMapFolder(campaign!.id, fid, false).then(() => setFolders((prev) => prev.filter((f) => f.id !== fid))).catch(() => {});
                      }
                    }}
                    onActivateMap={handleActivateMap}
                    onDeleteMap={handleDeleteMap}
                    onMoveMap={(mapId, folderId) => {
                      updateMap(mapId, { folder_id: folderId }).then((m) => setMaps((prev) => prev.map((x) => x.id === mapId ? m : x))).catch(() => {});
                    }}
                  />

                  {/* Unassigned maps */}
                  {maps.filter((m) => !m.folder_id).length > 0 && (
                    <div>
                      {folders.length > 0 && <div style={{ fontSize: '0.68rem', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.4rem 0 0.25rem 0.25rem' }}>Unassigned</div>}
                      {maps.filter((m) => !m.folder_id).map((m) => (
                        <MapRow key={m.id} map={m} activeMapId={activeMapId} folders={folders}
                          onActivate={handleActivateMap} onDelete={handleDeleteMap}
                          onMove={(folderId) => {
                            updateMap(m.id, { folder_id: folderId }).then((upd) => setMaps((prev) => prev.map((x) => x.id === m.id ? upd : x))).catch(() => {});
                          }} />
                      ))}
                    </div>
                  )}
                  {maps.length === 0 && folders.length === 0 && <div style={{ fontSize: '0.85rem', color: '#aaa', padding: '0.5rem' }}>No maps yet.</div>}
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
            {leftTab === 'monsters' && (() => {
              const searchLower = monsterSearch.toLowerCase();
              const allResults = monsterSearch.length < 1 ? [] : monsterLibrary.filter((m) => m.name.toLowerCase().includes(searchLower));

              const addToEncounter = (item: MonsterListItem) => {
                const sameCount = encounterEntries.filter((e) => e.name === item.name || e.name.startsWith(item.name + ' ')).length;
                const name = sameCount > 0 ? `${item.name} ${sameCount + 1}` : item.name;
                setEncounterEntries((prev) => [...prev, {
                  uid: `${item.slug}-${Date.now()}`,
                  slug: item.isNpc ? '' : item.slug,
                  npcId: item.isNpc ? item.npcId : undefined,
                  name, hp_current: item.hp_max, hp_max: item.hp_max,
                  ac: item.ac, cr: item.cr, monster_type: item.monster_type,
                }]);
              };

              return (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {/* Encounter tracker */}
                  {encounterEntries.length > 0 && (() => {
                    const partyLevels = (campaign.members ?? []).map((m) => m.level).filter((l) => l > 0);
                    const totalXp = encounterEntries.reduce((sum, e) => sum + crToXp(e.cr), 0);
                    const mult = encounterMultiplier(encounterEntries.length);
                    const adjXp = Math.round(totalXp * mult);
                    const thresholds = partyThresholds(partyLevels);
                    const difficulty = partyLevels.length > 0 && totalXp > 0 ? difficultyOf(adjXp, thresholds) : null;
                    const diffColor = difficulty ? DIFFICULTY_COLOR[difficulty] : '#888';
                    return (
                    <div style={{ borderBottom: '1px solid #e0e0e0', background: '#fafafa' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', borderBottom: '1px solid #eee' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚔ Encounter ({encounterEntries.length})</span>
                        <button onClick={() => setEncounterEntries([])} style={{ fontSize: '0.68rem', color: '#a44', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear all</button>
                      </div>
                      {totalXp > 0 && (
                        <div style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}
                          title={`${totalXp} raw XP × ${mult} group multiplier = ${adjXp} adjusted XP`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#666' }}>
                              <strong style={{ color: '#333' }}>{adjXp}</strong> XP
                              <span style={{ color: '#999' }}> ({totalXp} × {mult})</span>
                            </span>
                            {difficulty && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: diffColor, padding: '0.05rem 0.4rem', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {difficulty}
                              </span>
                            )}
                          </div>
                          {partyLevels.length > 0 && (
                            <div style={{ fontSize: '0.62rem', color: '#999', display: 'flex', justifyContent: 'space-between' }}>
                              <span>Party {partyLevels.length} × avg L{Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length)}</span>
                              <span>E {thresholds.easy} · M {thresholds.medium} · H {thresholds.hard} · D {thresholds.deadly}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {encounterEntries.map((entry) => {
                        const pct = entry.hp_max > 0 ? entry.hp_current / entry.hp_max : 0;
                        const barColor = pct > 0.5 ? '#4a4' : pct > 0.25 ? '#aa4' : '#a44';
                        const canOpen = !!entry.slug;
                        return (
                          <div key={entry.uid}
                            draggable={!!activeMap}
                            onDragStart={activeMap ? (e) => e.dataTransfer.setData('text/plain', JSON.stringify(
                              entry.npcId
                                ? { type: 'npc', campaignNpcId: entry.npcId }
                                : { type: 'monster', monsterSlug: entry.slug }
                            )) : undefined}
                            style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid #eee', cursor: activeMap ? 'grab' : 'default' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                              <span
                                onClick={() => canOpen ? setPanel({ type: 'monster', slug: entry.slug, hp: entry.hp_current, hpMax: entry.hp_max, encounterUid: entry.uid }) : undefined}
                                style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem', cursor: canOpen ? 'pointer' : 'default', textDecoration: canOpen ? 'underline dotted' : 'none', textUnderlineOffset: 2 }}>
                                {entry.name}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                {entry.ac !== null && <span style={{ fontSize: '0.63rem', color: '#888' }}>AC {entry.ac}</span>}
                                {entry.cr !== null && <span style={{ fontSize: '0.63rem', color: '#888' }}>{crLabel(entry.cr)}</span>}
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: pct === 0 ? '#a44' : '#555' }}>{entry.hp_current}/{entry.hp_max}</span>
                                <button onClick={() => setEncounterEntries((p) => p.filter((e) => e.uid !== entry.uid))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: '0.85rem', lineHeight: 1, padding: 0 }}>✕</button>
                              </div>
                            </div>
                            <div style={{ height: 5, background: '#e8e8e8', borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${pct * 100}%`, background: barColor, borderRadius: 3, transition: 'width 0.2s' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    );
                  })()}

                  {/* My NPCs — permanent list, draggable to map */}
                  {npcs.length > 0 && (
                    <div style={{ borderBottom: '1px solid #e0e0e0', background: '#fafafa' }}>
                      <div style={{ padding: '0.45rem 0.75rem', borderBottom: '1px solid #eee' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>My NPCs</span>
                      </div>
                      {npcCategories.map((cat) => {
                        const catNpcs = npcs.filter((n) => n.category_id === cat.id);
                        if (catNpcs.length === 0) return null;
                        return (
                          <div key={cat.id}>
                            {!cat.is_default && (
                              <div style={{ padding: '0.25rem 0.75rem', fontSize: '0.68rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f5f5f5', borderBottom: '1px solid #eee' }}>
                                {cat.name}
                              </div>
                            )}
                            {catNpcs.map((npc) => (
                              <div key={npc.id}
                                draggable={!!activeMap}
                                onDragStart={activeMap ? (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'npc', campaignNpcId: npc.id })) : undefined}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', borderBottom: '1px solid #f0f0f0', cursor: activeMap ? 'grab' : 'default' }}>
                                {npc.portrait_url
                                  ? <img src={npc.portrait_url} alt={npc.label} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                  : <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#a44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.7rem', flexShrink: 0 }}>{npc.label[0]?.toUpperCase()}</div>
                                }
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.83rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{npc.label}</div>
                                  <div style={{ fontSize: '0.68rem', color: '#888' }}>{npc.size} · {npc.hp_max} HP{activeMap ? ' · drag to map' : ''}</div>
                                </div>
                                <button onClick={() => addToEncounter({ slug: `npc-${npc.id}`, name: npc.label, cr: null, monster_type: 'NPC', hp_max: npc.hp_max, ac: null, size: npc.size, source: 'campaign', isNpc: true, npcId: npc.id })} style={{ padding: '0.2rem 0.45rem', fontSize: '0.8rem', border: '1px solid #4a8', borderRadius: 4, background: '#e8f5e8', color: '#336633', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>+</button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Search */}
                  <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #eee', flexShrink: 0 }}>
                    <input
                      value={monsterSearch}
                      onChange={(e) => setMonsterSearch(e.target.value)}
                      placeholder="Search monsters…"
                      style={{ width: '100%', padding: '0.35rem 0.5rem', border: '1px solid #ddd', borderRadius: 4, fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>

                  {monsterSearch.length < 1 ? (
                    <div style={{ padding: '1rem 0.75rem', fontSize: '0.8rem', color: '#bbb', textAlign: 'center' }}>
                      Type to search {monsterLibrary.length > 0 ? `${monsterLibrary.length} monsters` : 'monsters'}
                    </div>
                  ) : allResults.length === 0 ? (
                    <div style={{ padding: '1rem 0.75rem', fontSize: '0.8rem', color: '#bbb', textAlign: 'center' }}>No results</div>
                  ) : (
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {allResults.map((item) => (
                        <div key={item.slug}
                          draggable={!!activeMap}
                          onDragStart={activeMap ? (e) => e.dataTransfer.setData('text/plain', JSON.stringify(
                            item.isNpc
                              ? { type: 'npc', campaignNpcId: item.npcId }
                              : { type: 'monster', monsterSlug: item.slug }
                          )) : undefined}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', borderBottom: '1px solid #f0f0f0', cursor: activeMap ? 'grab' : 'default' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.83rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ fontSize: '0.68rem', color: '#888' }}>
                              {[item.size, item.monster_type, crLabel(item.cr), `${item.hp_max} HP`].filter(Boolean).join(' · ')}
                              {item.ac ? ` · AC ${item.ac}` : ''}
                              {activeMap && <span style={{ color: '#aaa', marginLeft: 4 }}>· drag to map</span>}
                            </div>
                          </div>
                          <button onClick={() => addToEncounter(item)} style={{ padding: '0.2rem 0.45rem', fontSize: '0.8rem', border: '1px solid #4a8', borderRadius: 4, background: '#e8f5e8', color: '#336633', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>+</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {leftTab === 'notes' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {editingNoteId === null ? (
                  <>
                    <div style={{ padding: '0.5rem', borderBottom: '1px solid #eee', flexShrink: 0 }}>
                      <button onClick={async () => {
                        if (!campaign) return;
                        const n = await createNote(campaign.id);
                        setNotes((prev) => [n, ...prev]);
                        setEditingNoteId(n.id);
                        setNoteTitle(n.title);
                        setNoteBody(n.body);
                      }} style={{ width: '100%', padding: '0.4rem', fontSize: '0.82rem', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff', fontWeight: 600 }}>
                        + New Note
                      </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {notes.length === 0 && <div style={{ padding: '1rem', fontSize: '0.85rem', color: '#aaa' }}>No notes yet.</div>}
                      {notes.map((note) => (
                        <div key={note.id} style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
                          onClick={() => { setEditingNoteId(note.id); setNoteTitle(note.title); setNoteBody(note.body); }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#333' }}>{note.title || 'Untitled'}</div>
                            <div style={{ fontSize: '0.72rem', color: '#aaa', marginTop: 2 }}>
                              {note.body ? note.body.slice(0, 60) + (note.body.length > 60 ? '…' : '') : 'Empty'}
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); if (!campaign) return; deleteNote(campaign.id, note.id).then(() => setNotes((prev) => prev.filter((n) => n.id !== note.id))); }}
                            style={{ flexShrink: 0, padding: '0.1rem 0.3rem', fontSize: '0.7rem', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff', cursor: 'pointer', marginLeft: '0.5rem' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.5rem', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => setEditingNoteId(null)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', border: '1px solid #ddd', borderRadius: 3, cursor: 'pointer', background: '#fff', color: '#666' }}>← Back</button>
                      <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)}
                        onBlur={async () => {
                          if (!campaign || editingNoteId === null) return;
                          setNoteSaving(true);
                          const updated = await updateNote(campaign.id, editingNoteId, { title: noteTitle }).catch(() => null);
                          if (updated) setNotes((prev) => prev.map((n) => n.id === editingNoteId ? updated : n));
                          setNoteSaving(false);
                        }}
                        style={{ flex: 1, padding: '0.3rem 0.5rem', border: '1px solid #ddd', borderRadius: 4, fontSize: '0.85rem', fontWeight: 600 }} placeholder="Note title" />
                      {noteSaving && <span style={{ fontSize: '0.7rem', color: '#aaa' }}>saving…</span>}
                    </div>
                    <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)}
                      onBlur={async () => {
                        if (!campaign || editingNoteId === null) return;
                        setNoteSaving(true);
                        const updated = await updateNote(campaign.id, editingNoteId, { body: noteBody }).catch(() => null);
                        if (updated) setNotes((prev) => prev.map((n) => n.id === editingNoteId ? updated : n));
                        setNoteSaving(false);
                      }}
                      style={{ flex: 1, padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4, fontSize: '0.83rem', resize: 'none', fontFamily: 'system-ui', lineHeight: 1.5 }}
                      placeholder="Write your session notes here…" />
                  </div>
                )}
              </div>
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
                {targetIds.size > 0 && (
                  <div style={{ position: 'sticky', top: 8, right: 8, zIndex: 31, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(196,68,68,0.92)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, padding: '0.3rem 0.6rem 0.3rem 0.8rem', borderRadius: 12, marginTop: 8, marginRight: 8, float: 'right', clear: 'both' }}>
                    🎯 {targetIds.size} target{targetIds.size > 1 ? 's' : ''}: {[...targetIds].map((id) => tokens.find((t) => t.id === id)?.label ?? '?').join(', ')}
                    <button onClick={() => setTargetIds(new Set())} style={{ padding: '0.05rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.6)', borderRadius: 3, background: 'transparent', color: '#fff' }}>Clear</button>
                  </div>
                )}
                {wallMode && (
                  <div style={{ position: 'sticky', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'inline-block', background: 'rgba(200,50,50,0.92)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, padding: '0.3rem 0.8rem', borderRadius: 12, pointerEvents: 'none', whiteSpace: 'nowrap', marginTop: 8 }}>
                    🧱 Wall mode — drag to draw, click a wall to delete
                  </div>
                )}
                {templateMode && (
                  <div style={{ position: 'sticky', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'inline-block', background: 'rgba(200,120,0,0.92)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, padding: '0.3rem 0.8rem', borderRadius: 12, pointerEvents: 'none', whiteSpace: 'nowrap', marginTop: 8 }}>
                    ✨ AOE mode — drag from origin, click an existing template to delete
                  </div>
                )}
                {measureMode && (
                  <div style={{ position: 'sticky', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'inline-block', background: 'rgba(50,150,210,0.92)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, padding: '0.3rem 0.8rem', borderRadius: 12, pointerEvents: 'none', whiteSpace: 'nowrap', marginTop: 8 }}>
                    📏 Measure mode — drag on the map to measure distance
                  </div>
                )}
                {drawMode && (
                  <div style={{ position: 'sticky', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'inline-block', background: 'rgba(170,60,170,0.92)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, padding: '0.3rem 0.8rem', borderRadius: 12, pointerEvents: 'none', whiteSpace: 'nowrap', marginTop: 8 }}>
                    ✏ Draw mode — drag to draw, tap on a drawing to delete
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
                      isTarget={targetIds.has(token.id)}
                      onPointerDown={wallMode ? undefined : (e) => handleTokenPointerDown(e, token)}
                    />
                  ))}
                  {/* Fog of war canvas — players only */}
                  {!isDmOrAdmin && (
                    <canvas
                      ref={fogCanvasRef}
                      width={imgSize.w}
                      height={imgSize.h}
                      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 8 }}
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
                  {/* Drawings SVG — visible to all */}
                  {imgSize.w > 0 && (drawings.length > 0 || activeDrawPath) && (
                    <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 9 }} width={imgSize.w} height={imgSize.h}>
                      {drawings.map((d) => (
                        <path key={d.id} d={pathToD(d.path)} stroke={d.color} strokeWidth={d.stroke_width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      ))}
                      {activeDrawPath && activeDrawPath.length > 1 && (
                        <path d={pathToD(activeDrawPath)} stroke={drawColor} strokeWidth={drawWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
                      )}
                    </svg>
                  )}
                  {/* Drawing capture overlay — anyone in draw mode */}
                  {drawMode && imgSize.w > 0 && (
                    <div
                      style={{ position: 'absolute', top: 0, left: 0, width: imgSize.w, height: imgSize.h, zIndex: 21, cursor: 'crosshair', touchAction: 'none' }}
                      onPointerDown={handleDrawPointerDown}
                      onPointerMove={handleDrawPointerMove}
                      onPointerUp={handleDrawPointerUp}
                    />
                  )}
                  {/* Templates SVG — visible to all */}
                  {imgSize.w > 0 && (templates.length > 0 || (templateDrawStart && templateDrawEnd)) && activeMap && (
                    <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 9 }} width={imgSize.w} height={imgSize.h}>
                      {templates.map((t) => renderTemplateShape(t, t.id))}
                      {templates.map((t) => renderTemplateLabel(t, t.id, activeMap.grid_size))}
                      {templateDrawStart && templateDrawEnd && renderTemplateShape({ shape: templateShape, origin_x: templateDrawStart.x, origin_y: templateDrawStart.y, end_x: templateDrawEnd.x, end_y: templateDrawEnd.y, color: templateColor }, 'preview', true)}
                      {templateDrawStart && templateDrawEnd && renderTemplateLabel({ shape: templateShape, origin_x: templateDrawStart.x, origin_y: templateDrawStart.y, end_x: templateDrawEnd.x, end_y: templateDrawEnd.y, color: templateColor }, 'preview', activeMap.grid_size, true)}
                    </svg>
                  )}
                  {/* Template drawing capture overlay — anyone in template mode */}
                  {templateMode && imgSize.w > 0 && (
                    <div
                      style={{ position: 'absolute', top: 0, left: 0, width: imgSize.w, height: imgSize.h, zIndex: 21, cursor: 'crosshair', touchAction: 'none' }}
                      onPointerDown={handleTemplatePointerDown}
                      onPointerMove={handleTemplatePointerMove}
                      onPointerUp={handleTemplatePointerUp}
                    />
                  )}
                  {/* Measurement SVG — visible while dragging, anyone can use */}
                  {imgSize.w > 0 && measureStart && measureEnd && activeMap && (() => {
                    const dx = measureEnd.x - measureStart.x;
                    const dy = measureEnd.y - measureStart.y;
                    const distPx = Math.hypot(dx, dy);
                    const distFt = Math.round((distPx / activeMap.grid_size) * 5);
                    const midX = (measureStart.x + measureEnd.x) / 2;
                    const midY = (measureStart.y + measureEnd.y) / 2;
                    return (
                      <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 22 }} width={imgSize.w} height={imgSize.h}>
                        <line x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y} stroke="#fff" strokeWidth={5} strokeLinecap="round" />
                        <line x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y} stroke="#3399cc" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="6 4" />
                        <circle cx={measureStart.x} cy={measureStart.y} r={5} fill="#3399cc" stroke="#fff" strokeWidth={2} />
                        <circle cx={measureEnd.x} cy={measureEnd.y} r={5} fill="#3399cc" stroke="#fff" strokeWidth={2} />
                        <rect x={midX - 28} y={midY - 12} width={56} height={20} rx={4} fill="#3399cc" stroke="#fff" strokeWidth={1.5} />
                        <text x={midX} y={midY + 4} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700" fontFamily="system-ui">{distFt} ft</text>
                      </svg>
                    );
                  })()}
                  {/* Measurement capture overlay */}
                  {measureMode && imgSize.w > 0 && (
                    <div
                      style={{ position: 'absolute', top: 0, left: 0, width: imgSize.w, height: imgSize.h, zIndex: 22, cursor: 'crosshair', touchAction: 'none' }}
                      onPointerDown={handleMeasurePointerDown}
                      onPointerMove={handleMeasurePointerMove}
                      onPointerUp={handleMeasurePointerUp}
                    />
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
          {initiative.entries.length > 0 && (
            <div style={{ borderBottom: '1px solid #eee' }}>
              <div onClick={() => toggleSection('initiative')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', cursor: 'pointer', background: '#fff8e8', userSelect: 'none' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#776', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚔ Initiative
                  {initiative.round > 0 && (
                    <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.4rem', background: '#cc7700', color: '#fff', borderRadius: 3, fontSize: '0.68rem', letterSpacing: '0.02em' }}>
                      Round {initiative.round}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{collapsedSections.has('initiative') ? '▶' : '▼'}</span>
              </div>
              {!collapsedSections.has('initiative') && (
                <div style={{ padding: '0.25rem 0.5rem 0.5rem' }}>
                  {initiative.entries.map((entry, idx) => {
                    const entryToken = entry.token_id ? tokens.find((t) => t.id === entry.token_id) : null;
                    const entryConditions = entryToken?.conditions ?? [];
                    const showPicker = initiativeConditionPicker === entry.id;
                    const isCurrentTurn = initiative.current_id === entry.id;
                    return (
                      <div key={entry.id} style={{
                        borderBottom: '1px solid #f5f5f5',
                        background: isCurrentTurn ? '#fff4d0' : 'transparent',
                        borderLeft: isCurrentTurn ? '3px solid #cc7700' : '3px solid transparent',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.25rem' }}>
                          {isCurrentTurn && <span style={{ fontSize: '0.7rem', flexShrink: 0 }}>▶</span>}
                          <span style={{ fontSize: '0.68rem', color: '#bbb', width: 14, textAlign: 'right', flexShrink: 0 }}>{idx + 1}.</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</div>
                            {entryConditions.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.15rem', marginTop: '0.15rem' }}>
                                {entryConditions.map((cond) => (
                                  <span key={cond} style={{ fontSize: '0.6rem', padding: '0.05rem 0.25rem', borderRadius: 3, background: CONDITION_COLORS[cond] ?? '#888', color: '#fff', fontWeight: 600, textTransform: 'capitalize' }}>{cond}</span>
                                ))}
                              </div>
                            )}
                          </div>
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
                          {isDmOrAdmin && entryToken && (
                            <button onClick={() => setInitiativeConditionPicker(showPicker ? null : entry.id)}
                              title="Conditions" style={{ flexShrink: 0, padding: '0.1rem 0.25rem', fontSize: '0.65rem', cursor: 'pointer', border: `1px solid ${showPicker ? '#aac' : '#ddd'}`, borderRadius: 3, background: showPicker ? '#eef' : '#fff', color: '#668' }}>
                              ±
                            </button>
                          )}
                          {isDmOrAdmin && (
                            <button onClick={() => socket.emit('initiative:remove', { id: entry.id })}
                              style={{ flexShrink: 0, padding: '0.1rem 0.25rem', fontSize: '0.65rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff' }}>✕</button>
                          )}
                        </div>
                        {showPicker && entryToken && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', padding: '0.3rem 0.5rem', background: '#f5f5ff', borderTop: '1px solid #eee' }}>
                            {(Object.keys(CONDITION_COLORS) as string[]).map((cond) => {
                              const active = entryConditions.includes(cond);
                              return (
                                <button key={cond} onClick={() => {
                                  const next = active ? entryConditions.filter((c) => c !== cond) : [...entryConditions, cond];
                                  handleTokenConditionsChange(entryToken.id, next);
                                }} style={{
                                  padding: '0.15rem 0.35rem', fontSize: '0.65rem', borderRadius: 3, cursor: 'pointer',
                                  border: `1px solid ${active ? CONDITION_COLORS[cond] : '#ddd'}`,
                                  background: active ? CONDITION_COLORS[cond] : '#fff',
                                  color: active ? '#fff' : '#888', fontWeight: active ? 700 : 400,
                                  textTransform: 'capitalize',
                                }}>{cond}</button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.4rem 0.25rem' }}>
                        {initiative.round > 0 && (
                          <button onClick={() => socket.emit('initiative:next_turn')} style={{ padding: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #c70', borderRadius: 3, background: '#cc7700', color: '#fff' }}>Next Turn ▶</button>
                        )}
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button onClick={() => setAddingInitiative(true)} style={{ flex: 1, padding: '0.25rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff' }}>+ Add</button>
                          {initiative.round > 0 && (
                            <button onClick={() => socket.emit('initiative:end_combat')} style={{ flex: 1, padding: '0.25rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 3, background: '#fff', color: '#666' }}>End Combat</button>
                          )}
                          <button onClick={() => socket.emit('initiative:clear')} style={{ flex: 1, padding: '0.25rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #fcc', borderRadius: 3, color: 'crimson', background: '#fff' }}>Clear</button>
                        </div>
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
                  const canViewSheet = isMyChar || isDmOrAdmin;
                  return (
                    <div
                      key={m.character_id}
                      draggable={draggable}
                      onDragStart={draggable ? (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'pc', characterId: m.character_id })) : undefined}
                      onClick={() => {
                        if (!m.character_id || !canViewSheet) return;
                        setPanel({ type: 'character', characterId: m.character_id, tokenId: myToken?.id ?? 0, canEdit: (!!isMyChar || isDmOrAdmin) });
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: 6, cursor: canViewSheet ? 'pointer' : 'default', background: isMyChar ? '#f0f8ff' : 'transparent', marginBottom: '0.2rem', opacity: myToken ? 1 : 0.6 }}
                      title={canViewSheet ? (myToken ? 'Open sheet · Drag to move' : 'Open sheet · Drag to place') : undefined}
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
                        <div style={{ fontSize: '0.72rem', color: '#888', display: 'flex', gap: '0.5rem' }}>
                          <span>Lv {m.level} {m.class_slug ?? '—'}</span>
                          {pcStats[m.character_id] && (
                            <span title="Passive Perception">PP {pcStats[m.character_id].passive_perception}</span>
                          )}
                        </div>
                      </div>
                      {isDmOrAdmin && m.character_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleInspiration(m.character_id!); }}
                          title={pcStats[m.character_id]?.inspiration ? 'Revoke Inspiration' : 'Grant Inspiration'}
                          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem', opacity: pcStats[m.character_id]?.inspiration ? 1 : 0.3 }}
                        >{pcStats[m.character_id]?.inspiration ? '⭐' : '☆'}</button>
                      )}
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
                        <button onClick={() => setTokenHidden(token.id, !token.hidden).catch((e: Error) => setError(e.message))}
                          title={token.hidden ? 'Hidden from players — click to reveal' : 'Visible to players — click to hide'}
                          style={{ flexShrink: 0, padding: '0.1rem 0.3rem', fontSize: '0.7rem', cursor: 'pointer', border: `1px solid ${token.hidden ? '#888' : '#ddd'}`, borderRadius: 3, color: token.hidden ? '#fff' : '#666', background: token.hidden ? '#666' : '#fff' }}>👁</button>
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
                        <button onClick={() => setTokenHidden(token.id, !token.hidden).catch((e: Error) => setError(e.message))}
                          title={token.hidden ? 'Hidden from players — click to reveal' : 'Visible to players — click to hide'}
                          style={{ flexShrink: 0, padding: '0.1rem 0.3rem', fontSize: '0.7rem', cursor: 'pointer', border: `1px solid ${token.hidden ? '#888' : '#ddd'}`, borderRadius: 3, color: token.hidden ? '#fff' : '#666', background: token.hidden ? '#666' : '#fff' }}>👁</button>
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
                  {messages.filter(m => m.type === 'chat').length === 0 && <div style={{ fontSize: '0.78rem', color: '#ccc', textAlign: 'center', marginTop: '0.5rem' }}>No messages yet.</div>}
                  {messages.filter(m => m.type === 'chat').map((msg) => <ChatMsgItem key={msg.id} msg={msg} myUserId={user!.id} targetCount={targetIds.size} onApply={applyToTargets} />)}
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

      {/* Floating Dice Log — always visible, bottom-left */}
      {(() => {
        const logEntries = messages.filter((m) => m.type === 'roll' || m.type === 'action');
        if (logEntries.length === 0) return null;
        const recent = logEntries.slice(-8);
        return (
          <div style={{ position: 'fixed', bottom: 12, right: panel?.type === 'character' ? 388 : 252, zIndex: 50, width: 230, fontFamily: 'system-ui', pointerEvents: 'auto', transition: 'right 0.25s' }}>
            <div
              onClick={() => setDiceLogOpen((o) => !o)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: '#2a2a2a', color: '#fff', borderRadius: diceLogOpen ? '6px 6px 0 0' : 6, cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em' }}>🎲 Dice Log</span>
              <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{diceLogOpen ? '▼' : '▲'}</span>
            </div>
            {diceLogOpen && (
              <div style={{ background: 'rgba(30,30,30,0.95)', borderRadius: '0 0 6px 6px', overflow: 'hidden', border: '1px solid #444', borderTop: 'none' }}>
                {recent.map((msg) => {
                  if (msg.type === 'action') {
                    const text = msg.body.replace(/^\/action\s+/, '');
                    return (
                      <div key={msg.id} style={{ padding: '0.35rem 0.6rem', borderBottom: '1px solid #333' }}>
                        <div style={{ fontSize: '0.72rem', color: '#b8a', fontStyle: 'italic', lineHeight: 1.35 }}>{text}</div>
                      </div>
                    );
                  }
                  const { label, expression, total, dice, modifier } = msg.data!;
                  const modStr = modifier !== 0 ? ` ${modifier > 0 ? '+' : ''}${modifier}` : '';
                  const showApply = targetIds.size > 0;
                  return (
                    <div key={msg.id} style={{ padding: '0.35rem 0.6rem', borderBottom: '1px solid #333' }}>
                      <div style={{ fontSize: '0.68rem', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#7ac' }}>{msg.username}</span>
                        {label ? <span style={{ color: '#ca8' }}> — {label}</span> : <span style={{ color: '#888' }}> · {expression}</span>}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#777' }}>[{dice.join(', ')}]{modStr}</div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#eee' }}>= {total}</div>
                      {showApply && (
                        <div style={{ display: 'flex', gap: '0.2rem', marginTop: 4, flexWrap: 'wrap' }}>
                          <button onClick={() => applyToTargets(total, 'damage')}
                            title={`Apply ${total} damage to ${targetIds.size} target${targetIds.size > 1 ? 's' : ''}`}
                            style={{ padding: '0.12rem 0.35rem', fontSize: '0.65rem', border: '1px solid #c44', borderRadius: 3, background: '#c44', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>−{total}</button>
                          <button onClick={() => applyToTargets(total, 'half')}
                            title={`Apply ${Math.floor(total / 2)} (half) damage`}
                            style={{ padding: '0.12rem 0.35rem', fontSize: '0.65rem', border: '1px solid #a64', borderRadius: 3, background: '#3a2a1a', color: '#fa8', cursor: 'pointer', fontWeight: 600 }}>−½ ({Math.floor(total / 2)})</button>
                          <button onClick={() => applyToTargets(total, 'heal')}
                            title={`Heal ${total}`}
                            style={{ padding: '0.12rem 0.35rem', fontSize: '0.65rem', border: '1px solid #4a4', borderRadius: 3, background: '#1a3a1a', color: '#8f8', cursor: 'pointer', fontWeight: 600 }}>+{total}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* In-game character sheet panel */}
      {panel?.type === 'character' && (() => {
        const token = tokens.find((t) => t.id === panel.tokenId);
        return (
          <InGameSheet
            characterId={panel.characterId}
            tokenId={panel.tokenId}
            canEditHp={panel.canEdit && !!token}
            canEditConditions={isDmOrAdmin && !!token}
            conditions={token?.conditions ?? []}
            effects={token?.effects ?? []}
            currentRound={initiative.round}
            selectedTargetIds={[...targetIds]}
            combatAutomation={!!campaign.settings.combat_automation}
            onConditionsChange={(conditions) => handleTokenConditionsChange(panel.tokenId, conditions)}
            onTargetConditionsChange={(tid, conditions) => handleTokenConditionsChange(tid, conditions)}
            getTokenConditions={(tid) => tokens.find((t) => t.id === tid)?.conditions ?? []}
            onClose={() => setPanel(null)}
          />
        );
      })()}

      {/* Monster sheet panel (DM only) */}
      {panel?.type === 'monster' && (() => {
        const tok = panel.tokenId !== undefined ? tokens.find((t) => t.id === panel.tokenId) : undefined;
        return (
          <MonsterSheet
            slug={panel.slug}
            tokenId={panel.tokenId}
            hpCurrent={panel.hp}
            hpMax={panel.hpMax}
            effects={tok?.effects ?? []}
            onHpChange={(hp) => {
              if (panel.encounterUid) {
                setEncounterEntries((prev) => prev.map((e) => e.uid === panel.encounterUid ? { ...e, hp_current: hp } : e));
                setPanel((p) => p?.type === 'monster' ? { ...p, hp } : p);
              }
            }}
            onClose={() => setPanel(null)}
          />
        );
      })()}

      {/* Campaign NPC sheet panel (DM only) */}
      {panel?.type === 'npc' && (() => {
        const npc = npcs.find((n) => n.id === panel.npcId);
        if (!npc) return null;
        const tok = panel.tokenId !== undefined ? tokens.find((t) => t.id === panel.tokenId) : undefined;
        return (
          <NpcSheet
            npc={npc}
            tokenId={panel.tokenId}
            hpCurrent={panel.hp}
            hpMax={panel.hpMax}
            effects={tok?.effects ?? []}
            onHpChange={(hp) => setPanel((p) => p?.type === 'npc' ? { ...p, hp } : p)}
            onClose={() => setPanel(null)}
          />
        );
      })()}

    </div>
  );
}
