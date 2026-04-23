import { apiFetch } from '../../lib/api';
import type { Character, LibraryItem } from './types';

export async function listCharacters(): Promise<Character[]> {
  const data = await apiFetch<{ characters: Character[] }>('/characters');
  return data.characters;
}

export async function getCharacter(id: number): Promise<Character> {
  const data = await apiFetch<{ character: Character }>(`/characters/${id}`);
  return data.character;
}

export async function createCharacter(name?: string): Promise<Character> {
  const data = await apiFetch<{ character: Character }>('/characters', {
    method: 'POST',
    body: JSON.stringify({ name: name ?? 'Unnamed Hero' }),
  });
  return data.character;
}

export async function updateCharacter(
  id: number,
  patch: Partial<Character>,
): Promise<Character> {
  const data = await apiFetch<{ character: Character }>(`/characters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.character;
}

export async function deleteCharacter(id: number): Promise<void> {
  await apiFetch(`/characters/${id}`, { method: 'DELETE' });
}

export async function listLibrary(type: string): Promise<LibraryItem[]> {
  const data = await apiFetch<{ items: LibraryItem[] }>(`/library/${type}`);
  return data.items;
}

export async function getLibraryItem<T = any>(
  type: string,
  slug: string,
): Promise<T> {
  return apiFetch<T>(`/library/${type}/${slug}`);
}
