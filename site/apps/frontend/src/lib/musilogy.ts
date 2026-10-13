import type {
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import { API_BASE_URL } from './config';
import { artistPath } from './artistProfile';

/** Musilogy is not loaded on the server. */
export class MusilogyUnavailableError extends Error {}

/**
 * One page per artist, at its address (docs/vision.md §5): its slug, played on the antenna or not;
 * its MBID while it has none yet.
 */
export function pagePathOf(artist: Pick<MusilogyArtistRef, 'mbid' | 'slug'>): string {
  return artistPath({ slug: artist.slug ?? artist.mbid });
}

async function read<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetch(`${API_BASE_URL}/api/musilogy${path}`, { signal: signal ?? null });
  // 400: a malformed MBID, from a truncated link — as unknown as a 404.
  if (response.status === 404 || response.status === 400) return null;
  if (response.status === 503) throw new MusilogyUnavailableError();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export function fetchMusilogyArtist(
  mbid: string,
  signal?: AbortSignal
): Promise<MusilogyArtist | null> {
  return read<MusilogyArtist>(`/artist/${encodeURIComponent(mbid)}`, signal);
}

export async function searchMusilogy(
  query: string,
  signal?: AbortSignal
): Promise<MusilogySearchHit[]> {
  return (await read<MusilogySearchHit[]>(`/search?q=${encodeURIComponent(query)}`, signal)) ?? [];
}
