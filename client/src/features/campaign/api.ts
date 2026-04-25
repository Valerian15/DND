import { apiFetch } from '../../lib/api';
import type { Campaign, CampaignSettings } from './types';

export async function listCampaigns(): Promise<Campaign[]> {
  const data = await apiFetch<{ campaigns: Campaign[] }>('/campaigns');
  return data.campaigns;
}

export async function getCampaign(id: number): Promise<Campaign> {
  const data = await apiFetch<{ campaign: Campaign }>(`/campaigns/${id}`);
  return data.campaign;
}

export async function createCampaign(name: string, description?: string): Promise<Campaign> {
  const data = await apiFetch<{ campaign: Campaign }>('/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name, description: description ?? '' }),
  });
  return data.campaign;
}

export async function updateCampaign(
  id: number,
  patch: { name?: string; description?: string; settings?: Partial<CampaignSettings> },
): Promise<Campaign> {
  const data = await apiFetch<{ campaign: Campaign }>(`/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.campaign;
}

export async function deleteCampaign(id: number): Promise<void> {
  await apiFetch(`/campaigns/${id}`, { method: 'DELETE' });
}

export async function joinCampaign(invite_code: string, character_id: number): Promise<{ campaign_id: number }> {
  const data = await apiFetch<{ ok: boolean; campaign_id: number }>('/campaigns/join', {
    method: 'POST',
    body: JSON.stringify({ invite_code, character_id }),
  });
  return { campaign_id: data.campaign_id };
}

export async function removeMember(campaign_id: number, character_id: number): Promise<void> {
  await apiFetch(`/campaigns/${campaign_id}/members/${character_id}`, { method: 'DELETE' });
}
