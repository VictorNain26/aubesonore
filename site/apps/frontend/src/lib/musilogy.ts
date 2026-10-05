import type {
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import { localizeHref } from '@/paraglide/runtime.js';
import { API_BASE_URL } from '../utils/config';
import { artistPath } from './artistProfile';

/** Musilogy is not loaded on the server, or is being reloaded. */
export class MusilogyUnavailableError extends Error {}

/** A readable tail for the URL; the MBID alone identifies the artist. */
function slugOf(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** The Musilogy page of an artist, in the current language. */
export function musilogyPath(artist: { mbid: string; name: string }): string {
  const slug = slugOf(artist.name);
  return localizeHref(`/musilogy/${artist.mbid}${slug ? `/${slug}` : ''}`);
}

/** One page per artist: the antenna's page when it played them, Musilogy's otherwise. */
export function pagePathOf(artist: MusilogyArtistRef): string {
  return artist.played ? artistPath(artist.played) : musilogyPath(artist);
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
