export interface LibraryListItem {
  id: number;
  slug: string;
  name: string;
  source: string;
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
