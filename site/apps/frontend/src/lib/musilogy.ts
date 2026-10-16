import type {
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import { HttpError, readKnown } from './api';
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
  try {
    return await readKnown<T>(`/api/musilogy${path}`, signal);
  } catch (error) {
    if (error instanceof HttpError && error.status === 503) throw new MusilogyUnavailableError();
    throw error;
  }
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
