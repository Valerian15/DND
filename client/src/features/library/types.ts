// Base shape — every type has these.
export interface LibraryListItem {
  id: number;
  slug: string;
  name: string;
  source: string;
  // Type-specific scalars returned by the server alongside the base fields.
  // Optional because not every type has every field; the card UI cherry-picks what's relevant.
  cr?: number;
  monster_type?: string | null;
  hp_max?: number;
  ac?: number;
  size?: string | null;
  image?: string | null;
  level?: number;
  school?: string | null;
  casting_time?: string | null;
  range?: string | null;
  concentration?: boolean;
  ritual?: boolean;
  classes?: string | null; // pipe-separated class list ("Wizard|Sorcerer") on Open5e data
  item_type?: string | null;
  rarity?: string | null;
  requires_attunement?: string | null;
  hit_die?: number;
  hd_alt?: string | null;
  spellcasting_ability?: string | null;
  prerequisite?: string | null;
  speed?: number;
  category?: string;
  weapon_type?: string;
  class_slug?: string;
}

export interface LibraryDetail extends LibraryListItem {
  data: any;
  class_slug?: string;
}

export type ContentType =
  | 'races'
  | 'classes'
  | 'subclasses'
  | 'backgrounds'
  | 'spells'
  | 'items'
  | 'monsters'
  | 'feats'
  | 'conditions'
  | 'weapons';

export interface ContentTypeMeta {
  type: ContentType;
  label: string;
}

export const CONTENT_TYPES: ContentTypeMeta[] = [
  { type: 'races', label: 'Races' },
  { type: 'classes', label: 'Classes' },
  { type: 'subclasses', label: 'Subclasses' },
  { type: 'backgrounds', label: 'Backgrounds' },
  { type: 'spells', label: 'Spells' },
  { type: 'items', label: 'Items' },
  { type: 'weapons', label: 'Weapons' },
  { type: 'monsters', label: 'Monsters' },
  { type: 'feats', label: 'Feats' },
  { type: 'conditions', label: 'Conditions' },
];
