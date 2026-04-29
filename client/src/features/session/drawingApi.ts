import { apiFetch } from '../../lib/api';
import type { MapDrawing } from './types';

export async function listDrawings(mapId: number): Promise<MapDrawing[]> {
  const res = await apiFetch<{ drawings: MapDrawing[] }>(`/maps/${mapId}/drawings`);
  return res.drawings;
}

export async function createDrawing(mapId: number, body: {
  path: [number, number][];
  color: string;
  stroke_width: number;
}): Promise<MapDrawing> {
  const res = await apiFetch<{ drawing: MapDrawing }>(`/maps/${mapId}/drawings`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.drawing;
}

export async function deleteDrawing(mapId: number, drawingId: number): Promise<void> {
  await apiFetch(`/maps/${mapId}/drawings/${drawingId}`, { method: 'DELETE' });
}

export async function clearDrawings(mapId: number): Promise<void> {
  await apiFetch(`/maps/${mapId}/drawings`, { method: 'DELETE' });
}
