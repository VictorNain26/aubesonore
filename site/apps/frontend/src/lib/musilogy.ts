import type {
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import { API_BASE_URL } from '../utils/config';
import { artistPath } from './artistProfile';

/** Musilogy is not loaded on the server, or is being reloaded. */
export class MusilogyUnavailableError extends Error {}

/**
 * One page per artist: at its slug when the antenna played it, at its MBID
 * otherwise (docs/vision.md §5).
 */
export function pagePathOf(artist: MusilogyArtistRef): string {
  return artistPath(artist.played ?? { slug: artist.mbid });
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
