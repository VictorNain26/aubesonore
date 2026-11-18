import { object, string, url, minLength, maxLength, pipe, check } from 'valibot';

/**
 * The longest title or artist name a caller may send (a like, /t, /api/artist/resolve). Far past
 * any real one, and short enough that a like's title and artist fit Postgres's unique btree index
 * (about 2.7 kB an entry): an unbounded one would fail the insert with a 500.
 */
export const MAX_NAME_LENGTH = 300;

// Whitelist YouTube domains. Anything else stored here would be served back
// to the client as a clickable "play on YouTube" link — an open redirect vector.
const YOUTUBE_HOST_RE =
  /^https:\/\/(www\.youtube\.com\/|youtube\.com\/|m\.youtube\.com\/|music\.youtube\.com\/|youtu\.be\/)/i;

const youtubeUrl = pipe(
  string(),
  url('Lien YouTube invalide'),
  check((value) => YOUTUBE_HOST_RE.test(value), 'Doit être une URL YouTube')
);

export const likeTrackSchema = object({
  title: pipe(
    string(),
    minLength(1, 'Titre requis'),
    maxLength(MAX_NAME_LENGTH, 'Titre trop long')
  ),
  artist: pipe(
    string(),
    minLength(1, 'Artiste requis'),
    maxLength(MAX_NAME_LENGTH, 'Artiste trop long')
  ),
  youtubeUrl,
  // No ISRC: a kept track takes its play's (trackService.linkKeptTrack), never a caller's.
});
