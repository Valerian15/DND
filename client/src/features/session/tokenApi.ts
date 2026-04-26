import { apiFetch } from '../../lib/api';
import type { TokenData, CampaignNpc, TokenCategory } from './types';

export async function listTokens(mapId: number): Promise<TokenData[]> {
  const res = await apiFetch<{ tokens: TokenData[] }>(`/tokens?map_id=${mapId}`);
  return res.tokens;
}

export async function createToken(body: {
  map_id: number;
  token_type: 'pc' | 'npc';
  character_id?: number;
  campaign_npc_id?: number;
  col: number;
  row: number;
}): Promise<TokenData> {
  const res = await apiFetch<{ token: TokenData }>('/tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.token;
}

export async function deleteToken(id: number): Promise<void> {
  await apiFetch(`/tokens/${id}`, { method: 'DELETE' });
}

export async function updateTokenHp(id: number, hpCurrent: number): Promise<{ token_id: number; hp_current: number }> {
  return apiFetch(`/tokens/${id}/hp`, {
    method: 'PATCH',
    body: JSON.stringify({ hp_current: hpCurrent }),
  });
}

export async function listCampaignNpcs(campaignId: number): Promise<CampaignNpc[]> {
  const res = await apiFetch<{ npcs: CampaignNpc[] }>(`/campaign-npcs?campaign_id=${campaignId}`);
  return res.npcs;
}

export async function createCampaignNpc(body: {
  campaign_id: number;
  category_id?: number | null;
  label: string;
  portrait_url?: string | null;
  size?: string;
  hp_max?: number;
  notes?: string;
}): Promise<CampaignNpc> {
  const res = await apiFetch<{ npc: CampaignNpc }>('/campaign-npcs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.npc;
}

export async function updateCampaignNpc(id: number, body: {
  category_id?: number | null;
  label?: string;
  portrait_url?: string | null;
  size?: string;
  hp_max?: number;
  notes?: string;
}): Promise<CampaignNpc> {
  const res = await apiFetch<{ npc: CampaignNpc }>(`/campaign-npcs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.npc;
}

export async function deleteCampaignNpc(id: number): Promise<void> {
  await apiFetch(`/campaign-npcs/${id}`, { method: 'DELETE' });
}

export async function listTokenCategories(campaignId: number): Promise<TokenCategory[]> {
  const res = await apiFetch<{ categories: TokenCategory[] }>(`/token-categories?campaign_id=${campaignId}`);
  return res.categories;
}

export async function createTokenCategory(campaignId: number, name: string): Promise<TokenCategory> {
  const res = await apiFetch<{ category: TokenCategory }>('/token-categories', {
    method: 'POST',
    body: JSON.stringify({ campaign_id: campaignId, name }),
  });
  return res.category;
}

export async function updateTokenCategory(id: number, name: string): Promise<TokenCategory> {
  const res = await apiFetch<{ category: TokenCategory }>(`/token-categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return res.category;
}

export async function deleteTokenCategory(id: number): Promise<void> {
  await apiFetch(`/token-categories/${id}`, { method: 'DELETE' });
}
