export interface CampaignSettings {
  rolled_hp: boolean;
}

export interface CampaignMember {
  character_id: number;
  joined_at: number;
  character_name: string;
  class_slug: string | null;
  level: number;
  portrait_url: string | null;
  owner_id: number;
  owner_username: string;
}

export interface Campaign {
  id: number;
  dm_id: number;
  name: string;
  description: string;
  settings: CampaignSettings;
  invite_code: string;
  created_at: number;
  updated_at: number;
  dm_username: string;
  // present on list endpoint
  member_count?: number;
  // present on detail endpoint
  members?: CampaignMember[];
}
