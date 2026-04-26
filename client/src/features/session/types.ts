export interface MapData {
  id: number;
  campaign_id: number;
  name: string;
  image_url: string;
  grid_size: number;
  grid_offset_x: number;
  grid_offset_y: number;
  created_at: number;
}

export interface TokenData {
  id: number;
  map_id: number;
  token_type: 'pc' | 'npc';
  character_id: number | null;
  campaign_npc_id: number | null;
  category_id: number | null;
  label: string;
  portrait_url: string | null;
  size: string;
  col: number;
  row: number;
  hp_current: number;
  hp_max: number;
  hp_visible: boolean;
  controlled_by: number[];
  conditions: string[];
  created_at: number;
}

export interface CampaignNpc {
  id: number;
  campaign_id: number;
  category_id: number | null;
  label: string;
  portrait_url: string | null;
  size: string;
  hp_max: number;
  notes: string;
  created_at: number;
}

export interface ChatMessage {
  id: number;
  campaign_id: number;
  user_id: number;
  username: string;
  body: string;
  type: 'chat' | 'roll';
  data?: { expression: string; dice: number[]; modifier: number; total: number };
  created_at: number;
}

export interface InitiativeEntry {
  id: number;
  campaign_id: number;
  token_id: number | null;
  label: string;
  initiative: number;
  dex_score: number;
}

export interface TokenCategory {
  id: number;
  campaign_id: number;
  name: string;
  is_default: number;
  sort_order: number;
  created_at: number;
}
