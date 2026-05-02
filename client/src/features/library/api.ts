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

// ──────────────────────────── Tags ────────────────────────────
// Tags are free-form strings the DM applies to library entries (e.g. "urban", "act-2",
// "dragon-encounter"). Used for filtering on the LibraryPage.

export async function listTagsForType(type: ContentType): Promise<{ tag: string; count: number }[]> {
  const data = await apiFetch<{ tags: { tag: string; count: number }[] }>(`/library/${type}/tags`);
  return data.tags;
}

export async function getEntryTags(type: ContentType, slug: string): Promise<string[]> {
  const data = await apiFetch<{ tags: string[] }>(`/library/${type}/${slug}/tags`);
  return data.tags;
}

export async function addEntryTag(type: ContentType, slug: string, tag: string): Promise<void> {
  await apiFetch(`/library/${type}/${slug}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag }),
  });
}

export async function removeEntryTag(type: ContentType, slug: string, tag: string): Promise<void> {
  await apiFetch(`/library/${type}/${slug}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
}
