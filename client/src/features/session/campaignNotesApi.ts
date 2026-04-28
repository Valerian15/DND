import { apiFetch } from '../../lib/api';

export interface CampaignNote {
  id: number;
  campaign_id: number;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
}

export function listNotes(campaignId: number): Promise<CampaignNote[]> {
  return apiFetch<{ notes: CampaignNote[] }>(`/campaigns/${campaignId}/notes`).then((r) => r.notes);
}

export function createNote(campaignId: number, title?: string): Promise<CampaignNote> {
  return apiFetch<{ note: CampaignNote }>(`/campaigns/${campaignId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ title: title ?? 'New Note', body: '' }),
  }).then((r) => r.note);
}

export function updateNote(campaignId: number, noteId: number, patch: { title?: string; body?: string }): Promise<CampaignNote> {
  return apiFetch<{ note: CampaignNote }>(`/campaigns/${campaignId}/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then((r) => r.note);
}

export function deleteNote(campaignId: number, noteId: number): Promise<void> {
  return apiFetch(`/campaigns/${campaignId}/notes/${noteId}`, { method: 'DELETE' }).then(() => {});
}
