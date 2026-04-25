import { apiFetch } from '../../lib/api';
import type { ContentType, LibraryDetail, LibraryListItem } from './types';

export async function listLibrary(type: ContentType): Promise<LibraryListItem[]> {
  const data = await apiFetch<{ items: LibraryListItem[] }>(`/library/${type}`);
  return data.items;
}

export async function getLibraryDetail(
  type: ContentType,
  slug: string,
): Promise<LibraryDetail> {
  return apiFetch<LibraryDetail>(`/library/${type}/${slug}`);
}

export async function createLibraryEntry(
  type: ContentType,
  body: { slug: string; name: string; data: Record<string, unknown>; source?: string },
): Promise<LibraryDetail> {
  return apiFetch<LibraryDetail>(`/library/${type}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateLibraryEntry(
  type: ContentType,
  slug: string,
  body: { name?: string; data?: Record<string, unknown> },
): Promise<LibraryDetail> {
  return apiFetch<LibraryDetail>(`/library/${type}/${slug}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteLibraryEntry(type: ContentType, slug: string): Promise<void> {
  await apiFetch(`/library/${type}/${slug}`, { method: 'DELETE' });
}
