import { apiFetch } from '../../lib/api';
import type { MapTemplate, TemplateShape } from './types';

export async function listTemplates(mapId: number): Promise<MapTemplate[]> {
  const res = await apiFetch<{ templates: MapTemplate[] }>(`/maps/${mapId}/templates`);
  return res.templates;
}

export async function createTemplate(mapId: number, body: {
  shape: TemplateShape;
  origin_x: number; origin_y: number;
  end_x: number; end_y: number;
  color: string;
}): Promise<MapTemplate> {
  const res = await apiFetch<{ template: MapTemplate }>(`/maps/${mapId}/templates`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.template;
}

export async function deleteTemplate(mapId: number, templateId: number): Promise<void> {
  await apiFetch(`/maps/${mapId}/templates/${templateId}`, { method: 'DELETE' });
}

export async function clearTemplates(mapId: number): Promise<void> {
  await apiFetch(`/maps/${mapId}/templates`, { method: 'DELETE' });
}
