import { apiFetch } from '../../lib/api';
import type { WallSegment } from './types';

export async function listWalls(mapId: number): Promise<WallSegment[]> {
  const res = await apiFetch<{ walls: WallSegment[] }>(`/maps/${mapId}/walls`);
  return res.walls;
}

export async function createWall(mapId: number, wall: { x1: number; y1: number; x2: number; y2: number }): Promise<WallSegment> {
  const res = await apiFetch<{ wall: WallSegment }>(`/maps/${mapId}/walls`, {
    method: 'POST',
    body: JSON.stringify(wall),
  });
  return res.wall;
}

export async function deleteWall(mapId: number, wallId: number): Promise<void> {
  await apiFetch(`/maps/${mapId}/walls/${wallId}`, { method: 'DELETE' });
}

export async function clearWalls(mapId: number): Promise<void> {
  await apiFetch(`/maps/${mapId}/walls`, { method: 'DELETE' });
}

export async function getFog(mapId: number): Promise<{ visible: [number, number][]; explored: [number, number][] }> {
  return apiFetch(`/maps/${mapId}/fog`);
}
