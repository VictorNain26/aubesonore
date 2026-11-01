import type { LikedTrack } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { LONG_UNCOVERED, TRACKS, type SampleTrack } from './fixtures';

// The account pages' sample data (.storybook/). The tracks are the catalogue's real records
// (fixtures.ts), their covers at the Cover Art Archive; the dates they were kept, their ids and
// the artist pages they lead to are examples, as is the account.

/** An example listener, at an address no one reads. */
export const ACCOUNT = { name: 'Camille', email: 'camille@example.fr' };

/**
 * A page as a listener not signed in reaches it (the header asks the auth store), then the store
 * back to its first state: the next story starts clean.
 */
export function signedOut(): () => void {
  useAuthStore.setState({ isLoading: false, isAuthenticated: false, user: null });
  return () => useAuthStore.setState(useAuthStore.getInitialState(), true);
}

/** The year the sample dates are read from: a track kept in another shows its year. */
export const THIS_YEAR = 2026;

function kept(
  track: SampleTrack,
  createdAt: string,
  artistPage: { slug: string; name: string } | null,
  artist = track.artist
): LikedTrack {
  return {
    id: `kept-${createdAt}`,
    title: track.title,
    artist,
    album: track.album || null,
    artworkUrl: track.art ?? null,
    // What a track kept without a direct link carries (lib/pendingKeep.ts).
    youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.title} ${artist}`)}`,
    createdAt,
    userId: 'example-user',
    artistId: artistPage ? `example-${artistPage.slug}` : null,
    artistPage,
  };
}

/**
 * A library as the API lists it, unsorted: covers and one without, two years, artists with a page
 * and without, a credit with a featured artist filed under its page's name.
 */
export const KEPT: readonly LikedTrack[] = [
  kept(TRACKS.growlers, '2026-10-28T21:14:00.000Z', { slug: 'the-growlers', name: 'The Growlers' }),
  kept(TRACKS.umo, '2026-10-12T08:02:00.000Z', null),
  kept(
    TRACKS.daft,
    '2026-09-30T19:45:00.000Z',
    { slug: 'daft-punk', name: 'Daft Punk' },
    'Daft Punk feat. Julian Casablancas'
  ),
  kept(LONG_UNCOVERED, '2026-07-04T12:30:00.000Z', null),
  kept(TRACKS.tame, '2026-03-21T23:10:00.000Z', { slug: 'tame-impala', name: 'Tame Impala' }),
  kept(TRACKS.bowie, '2025-12-08T17:55:00.000Z', { slug: 'david-bowie', name: 'David Bowie' }),
  kept(TRACKS.lorde, '2025-06-16T10:20:00.000Z', null),
];
