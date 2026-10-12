import type { ArtistProfile, MusilogyArtist } from '@aubesonore/shared-types/client';
import type { ArtistPageState } from '../artist/ArtistPageView';
import { baseLocale, extractLocaleFromUrl, type Locale } from '@/paraglide/runtime.js';
import { fetchArtistProfile } from './artistProfile';
import { fetchMusilogyArtist } from './musilogy';
import { seenStore } from './seenPages';

/** What the server rendered an artist page from, embedded in the page for the client to start from. */
export interface ArtistPageData {
  locale: Locale;
  profile: ArtistProfile;
  /** null: the dump does not know the MBID, or Musilogy failed. */
  musilogy: MusilogyArtist | null;
}

/** The id of the `<script type="application/json">` that carries an ArtistPageData. */
export const ARTIST_PAGE_DATA_ID = 'artist-page-data';

export const seenProfiles = seenStore<ArtistPageState>();
// null: the dump does not know the MBID, or Musilogy failed; the page shows without its sections.
export const seenMusilogy = seenStore<MusilogyArtist | null>();

export function profileKey(slug: string, locale: Locale): string {
  return `${slug}:${locale}`;
}

/** The page draws from this data at once, as when the listener comes back to it. */
export function seedArtistPage({ locale, profile, musilogy }: ArtistPageData): void {
  seenProfiles.set(profileKey(profile.slug, locale), { status: 'ready', profile });
  if (profile.mbid) seenMusilogy.set(profile.mbid, musilogy);
}

/** The data a server-rendered artist page arrived with; null on any other page. */
export function readArtistPageData(doc: Document): ArtistPageData | null {
  const raw = doc.getElementById(ARTIST_PAGE_DATA_ID)?.textContent;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArtistPageData;
  } catch {
    return null;
  }
}

/** An artist page's data: its profile's state and what Musilogy holds of the artist. */
export interface ArtistLoaded {
  state: ArtistPageState;
  /** null: no MBID, the dump does not know it, or Musilogy failed: the page shows without it. */
  musilogy: MusilogyArtist | null;
}

/** The page as this tab already holds it, whole (its Musilogy sections included); else null. */
export function seenArtist(slug: string, locale: Locale): ArtistLoaded | null {
  const state = seenProfiles.get(profileKey(slug, locale));
  if (!state) return null;
  const mbid = state.status === 'ready' ? state.profile.mbid : null;
  if (!mbid) return { state, musilogy: null };
  const musilogy = seenMusilogy.get(mbid);
  return musilogy === undefined ? null : { state, musilogy };
}

/**
 * An artist page's data, before the page is drawn (React Router's loader): the page comes at its
 * height, and ScrollRestoration puts the reader back on it. What this tab already holds is drawn
 * at once (a client cache, reactrouter.com/how-to/client-data); a page that fails to load says so
 * and is asked again next time.
 */
export async function artistLoader({
  params,
  request,
}: {
  params: { slug?: string };
  request: Request;
}): Promise<ArtistLoaded> {
  const slug = params.slug ?? '';
  const locale = extractLocaleFromUrl(request.url) ?? baseLocale;
  const seen = seenArtist(slug, locale);
  if (seen) return seen;
  const key = profileKey(slug, locale);
  let state = seenProfiles.get(key);
  if (!state) {
    try {
      const profile = await fetchArtistProfile(slug, request.signal);
      state = profile ? { status: 'ready', profile } : { status: 'missing' };
      seenProfiles.set(key, state);
    } catch {
      return { state: { status: 'error' }, musilogy: null };
    }
  }
  const mbid = state.status === 'ready' ? state.profile.mbid : null;
  if (!mbid) return { state, musilogy: null };
  // A failure or Musilogy not loaded leaves the page without those sections.
  const musilogy = await fetchMusilogyArtist(mbid, request.signal).catch(() => null);
  if (!request.signal.aborted) seenMusilogy.set(mbid, musilogy);
  return { state, musilogy };
}
