import { apiFetch } from '../../lib/api';
import type { TokenData, CampaignNpc, TokenCategory, NpcAbilities, NpcAttack, NpcTrait } from './types';

export async function listTokens(mapId: number): Promise<TokenData[]> {
  const res = await apiFetch<{ tokens: TokenData[] }>(`/tokens?map_id=${mapId}`);
  return res.tokens;
}

export async function createToken(body: {
  map_id: number;
  token_type: 'pc' | 'npc';
  character_id?: number;
  campaign_npc_id?: number;
  monster_slug?: string;
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

export async function updateTokenConditions(id: number, conditions: string[]): Promise<{ token_id: number; conditions: string[] }> {
  return apiFetch(`/tokens/${id}/conditions`, {
    method: 'PATCH',
    body: JSON.stringify({ conditions }),
  });
}

export async function setTokenHidden(id: number, hidden: boolean): Promise<{ token_id: number; hidden: boolean }> {
  return apiFetch(`/tokens/${id}/hidden`, {
    method: 'PATCH',
    body: JSON.stringify({ hidden }),
  });
}

// Set or clear a token's visual aura ring. Pass null radius to clear.
export async function setTokenAura(id: number, aura_radius: number | null, aura_color: string | null = null): Promise<{ token_id: number; aura_radius: number | null; aura_color: string | null }> {
  return apiFetch(`/tokens/${id}/aura`, {
    method: 'PATCH',
    body: JSON.stringify({ aura_radius, aura_color }),
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
  ac?: number;
  speed?: string;
  abilities?: NpcAbilities;
  saving_throws?: string[];
  attacks?: NpcAttack[];
  traits?: NpcTrait[];
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
  notes?: string;
  dm_notes?: string;
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
  ac?: number;
  speed?: string;
  abilities?: NpcAbilities;
  saving_throws?: string[];
  attacks?: NpcAttack[];
  traits?: NpcTrait[];
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
  notes?: string;
  dm_notes?: string;
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
