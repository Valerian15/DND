import { db } from './db/index.js';

interface WallRow { x1: number; y1: number; x2: number; y2: number }
interface MapRow { grid_size: number; grid_offset_x: number; grid_offset_y: number }
interface TokenVision { col: number; row: number; darkvision: number }
interface Point { x: number; y: number }

export interface FogResult {
  visible: [number, number][];
  explored: [number, number][];
}

// Returns t ∈ (0, 1) where ray (ax,ay)→(bx,by) intersects segment (cx,cy)→(dx,dy), or null.
function rayHitT(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number | null {
  const rx = bx - ax, ry = by - ay;
  const sx = dx - cx, sy = dy - cy;
  const cross = rx * sy - ry * sx;
  if (Math.abs(cross) < 1e-10) return null;
  const tx = cx - ax, ty = cy - ay;
  const t = (tx * sy - ty * sx) / cross;
  const u = (tx * ry - ty * rx) / cross;
  if (t > 1e-9 && t < 1 && u >= 0 && u <= 1) return t;
  return null;
}

// Ray-casting point-in-polygon test (handles non-convex polygons).
function inPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Build the exact visibility polygon from (tcx, tcy), blocked by walls, up to maxR pixels.
// Casts rays toward every wall endpoint (± tiny angle offset) so shadow boundaries land
// exactly at corners — no corner leaks possible.
function buildVisibilityPolygon(
  tcx: number, tcy: number, walls: WallRow[], maxR: number,
): Point[] {
  const angleSet = new Set<number>();

  // Critical angles: straight at each wall endpoint, and ±tiny offset to sample both sides
  for (const w of walls) {
    for (const { x, y } of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) {
      const a = Math.atan2(y - tcy, x - tcx);
      angleSet.add(a - 0.00001);
      angleSet.add(a);
      angleSet.add(a + 0.00001);
    }
  }
  // Uniform ring so open areas have a smooth radius boundary (1° steps ≈ 5 px arc at 300 px)
  for (let i = 0; i < 360; i++) angleSet.add((i / 360) * Math.PI * 2 - Math.PI);

  const poly: Point[] = [];
  for (const angle of [...angleSet].sort((a, b) => a - b)) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const farX = tcx + dx * maxR, farY = tcy + dy * maxR;

    let bestT = 1.0;
    for (const w of walls) {
      const t = rayHitT(tcx, tcy, farX, farY, w.x1, w.y1, w.x2, w.y2);
      if (t !== null && t < bestT) bestT = t;
    }
    poly.push({ x: tcx + dx * maxR * bestT, y: tcy + dy * maxR * bestT });
  }
  return poly;
}

const visibleSetCache = new Map<number, Set<string>>();

export function getVisibleSet(mapId: number): Set<string> {
  return visibleSetCache.get(mapId) ?? new Set();
}

export function computeAndSaveFog(mapId: number): FogResult {
  const map = db.prepare(
    'SELECT grid_size, grid_offset_x, grid_offset_y FROM maps WHERE id = ?'
  ).get(mapId) as MapRow | undefined;
  if (!map) return { visible: [], explored: [] };

  const walls = db.prepare(
    'SELECT x1, y1, x2, y2 FROM map_walls WHERE map_id = ?'
  ).all(mapId) as WallRow[];

  const pcTokens = db.prepare(`
    SELECT t.col, t.row, COALESCE(c.darkvision, 0) AS darkvision
    FROM tokens t
    JOIN characters c ON c.id = t.character_id
    WHERE t.map_id = ? AND t.token_type = 'pc' AND t.character_id IS NOT NULL
  `).all(mapId) as TokenVision[];

  const { grid_size: gs, grid_offset_x: gox, grid_offset_y: goy } = map;
  const ox = ((gox % gs) + gs) % gs;
  const oy = ((goy % gs) + gs) % gs;

  const visibleSet = new Set<string>();

  for (const token of pcTokens) {
    const darkvisionCells = Math.ceil((token.darkvision ?? 0) / 5);
    // Base of 6 cells (30 ft torchlight) for characters with no darkvision
    const radius = Math.max(6, darkvisionCells);
    const maxR = radius * gs;

    const tcx = ox + (token.col + 0.5) * gs;
    const tcy = oy + (token.row + 0.5) * gs;

    const poly = buildVisibilityPolygon(tcx, tcy, walls, maxR);

    for (let row = token.row - radius; row <= token.row + radius; row++) {
      if (row < 0) continue;
      for (let col = token.col - radius; col <= token.col + radius; col++) {
        if (col < 0) continue;
        if (Math.hypot(col - token.col, row - token.row) > radius) continue;

        const tx = ox + (col + 0.5) * gs;
        const ty = oy + (row + 0.5) * gs;

        if (inPolygon(tx, ty, poly)) {
          visibleSet.add(`${col},${row}`);
        }
      }
    }
  }

  // Load existing explored cells and persist any newly visible ones
  const existingRows = db.prepare(
    'SELECT col, row FROM map_fog WHERE map_id = ?'
  ).all(mapId) as { col: number; row: number }[];
  const exploredSet = new Set(existingRows.map((r) => `${r.col},${r.row}`));

  if (visibleSet.size > 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO map_fog (map_id, col, row) VALUES (?, ?, ?)');
    const insertAll = db.transaction(() => {
      for (const key of visibleSet) {
        if (!exploredSet.has(key)) {
          const [c, r] = key.split(',').map(Number);
          insert.run(mapId, c, r);
          exploredSet.add(key);
        }
      }
    });
    insertAll();
  }

  visibleSetCache.set(mapId, new Set(visibleSet));
  console.log(`[fog v2] map=${mapId} walls=${walls.length} tokens=${pcTokens.length} visible=${visibleSet.size}`);
  return {
    visible: [...visibleSet].map((k) => k.split(',').map(Number) as [number, number]),
    explored: [...exploredSet].map((k) => k.split(',').map(Number) as [number, number]),
  };
}
