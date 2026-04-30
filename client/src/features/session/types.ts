export interface MapData {
  id: number;
  campaign_id: number;
  name: string;
  image_url: string;
  grid_size: number;
  grid_offset_x: number;
  grid_offset_y: number;
  fog_enabled: number;
  folder_id: number | null;
  scene_tag: string;
  created_at: number;
}

export interface TokenEffect {
  name: string;
  rounds: number;
  indefinite?: boolean;
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
  hidden: boolean;
  effects: TokenEffect[];
  monster_slug: string | null;
  aura_radius: number | null;
  aura_color: string | null;
  created_at: number;
}

export interface NpcAbilities {
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
}

export interface NpcAttack {
  name: string;
  to_hit: number;
  damage: string;
  damage_type: string;
  description?: string;
}

export interface NpcTrait {
  name: string;
  description: string;
}

export interface CampaignNpc {
  id: number;
  campaign_id: number;
  category_id: number | null;
  label: string;
  portrait_url: string | null;
  size: string;
  hp_max: number;
  ac: number;
  speed: string;
  abilities: NpcAbilities;
  saving_throws: string[];
  attacks: NpcAttack[];
  traits: NpcTrait[];
  resistances: string[];
  vulnerabilities: string[];
  immunities: string[];
  notes: string;
  /** DM-only — server only includes this field when the requester is admin or the campaign DM. */
  dm_notes?: string;
  created_at: number;
}

export interface WallSegment {
  id: number;
  map_id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  created_at: number;
}

export type TemplateShape = 'circle' | 'square' | 'cone' | 'line';

export interface MapTemplate {
  id: number;
  map_id: number;
  shape: TemplateShape;
  origin_x: number;
  origin_y: number;
  end_x: number;
  end_y: number;
  color: string;
  created_at: number;
}

export interface MapDrawing {
  id: number;
  map_id: number;
  path: [number, number][];
  color: string;
  stroke_width: number;
  created_at: number;
}

export interface ChatMessage {
  id: number;
  campaign_id: number;
  user_id: number;
  username: string;
  body: string;
  type: 'chat' | 'roll' | 'action' | 'whisper';
  data?: {
    expression?: string;
    dice?: number[];
    modifier?: number;
    total?: number;
    label?: string;
    rollMode?: 'advantage' | 'disadvantage';
    /** Whisper recipient metadata — only present when type === 'whisper'. */
    whisper?: { to_user_id: number; to_name: string };
    /** Undo metadata baked onto damage/heal rolls by the server's combat resolvers. */
    target_token_id?: number;
    prev_hp?: number;
    undone?: boolean;
  };
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

export interface InitiativeState {
  entries: InitiativeEntry[];
  current_id: number | null;
  round: number;
}

export interface TokenCategory {
  id: number;
  campaign_id: number;
  name: string;
  is_default: number;
  sort_order: number;
  created_at: number;
}

export interface MapFolder {
  id: number;
  campaign_id: number;
  name: string;
  parent_id: number | null;
  created_at: number;
}
