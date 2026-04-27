import type { ContentType } from '../types';

export interface FormProps {
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export const TYPES_WITH_FORM = new Set<ContentType>(['backgrounds', 'subclasses', 'spells', 'weapons']);
