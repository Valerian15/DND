import { apiFetch } from '../../lib/api';

export interface SavedEncounter {
  id: number;
  campaign_id: number;
  name: string;
  created_at: number;
}

export function listEncounters(campaignId: number): Promise<SavedEncounter[]> {
  return apiFetch<{ encounters: SavedEncounter[] }>(`/campaigns/${campaignId}/encounters`).then((r) => r.encounters);
}

export function saveEncounter(campaignId: number, name: string): Promise<SavedEncounter> {
  return apiFetch<{ encounter: SavedEncounter }>(`/campaigns/${campaignId}/encounters`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then((r) => r.encounter);
}

export function deleteEncounter(campaignId: number, encounterId: number): Promise<void> {
  return apiFetch<{ ok: boolean }>(`/campaigns/${campaignId}/encounters/${encounterId}`, {
    method: 'DELETE',
  }).then(() => {});
}

export function restoreEncounter(campaignId: number, encounterId: number): Promise<{ id: number; name: string }> {
  return apiFetch<{ ok: boolean; encounter: { id: number; name: string } }>(`/campaigns/${campaignId}/encounters/${encounterId}/restore`, {
    method: 'POST',
  }).then((r) => r.encounter);
}
