import type { ArtistProfile, MusilogyArtist } from '@aubesonore/shared-types/client';
import type { ArtistPageState } from '../artist/ArtistPageView';
import type { Locale } from '@/paraglide/runtime.js';
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
