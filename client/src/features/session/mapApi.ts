import { apiFetch } from '../../lib/api';
import type { MapData } from './types';

export async function listMaps(campaignId: number): Promise<{ maps: MapData[]; active_map_id: number | null }> {
  return apiFetch(`/maps?campaign_id=${campaignId}`);
}

export async function createMap(data: {
  campaign_id: number;
  name: string;
  image_url: string;
  grid_size?: number;
  grid_offset_x?: number;
  grid_offset_y?: number;
  folder_id?: number | null;
}): Promise<MapData> {
  const res = await apiFetch<{ map: MapData }>('/maps', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.map;
}

export async function updateMap(id: number, patch: Partial<Omit<MapData, 'id' | 'campaign_id' | 'created_at'>>): Promise<MapData> {
  const res = await apiFetch<{ map: MapData }>(`/maps/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.map;
}

export async function deleteMap(id: number): Promise<void> {
  await apiFetch(`/maps/${id}`, { method: 'DELETE' });
}

export async function activateMap(id: number): Promise<MapData> {
  const res = await apiFetch<{ map: MapData }>(`/maps/${id}/activate`, { method: 'POST' });
  return res.map;
}

export async function toggleFog(id: number): Promise<MapData> {
  const res = await apiFetch<{ map: MapData }>(`/maps/${id}/fog/toggle`, { method: 'POST' });
  return res.map;
}

export async function resetFog(id: number): Promise<void> {
  await apiFetch(`/maps/${id}/fog/reset`, { method: 'POST' });
}
