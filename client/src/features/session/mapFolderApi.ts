import { apiFetch } from '../../lib/api';
import type { MapFolder } from './types';

export function listMapFolders(campaignId: number): Promise<MapFolder[]> {
  return apiFetch<{ folders: MapFolder[] }>(`/campaigns/${campaignId}/map-folders`).then((r) => r.folders);
}

export function createMapFolder(campaignId: number, name: string, parentId?: number | null): Promise<MapFolder> {
  return apiFetch<{ folder: MapFolder }>(`/campaigns/${campaignId}/map-folders`, {
    method: 'POST',
    body: JSON.stringify({ name, parent_id: parentId ?? null }),
  }).then((r) => r.folder);
}

export function renameMapFolder(campaignId: number, folderId: number, name: string): Promise<MapFolder> {
  return apiFetch<{ folder: MapFolder }>(`/campaigns/${campaignId}/map-folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  }).then((r) => r.folder);
}

export function moveMapFolder(campaignId: number, folderId: number, parentId: number | null): Promise<MapFolder> {
  return apiFetch<{ folder: MapFolder }>(`/campaigns/${campaignId}/map-folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ parent_id: parentId }),
  }).then((r) => r.folder);
}

export function deleteMapFolder(campaignId: number, folderId: number, deleteContents: boolean): Promise<void> {
  return apiFetch<{ ok: boolean }>(`/campaigns/${campaignId}/map-folders/${folderId}?deleteContents=${deleteContents}`, {
    method: 'DELETE',
  }).then(() => {});
}
