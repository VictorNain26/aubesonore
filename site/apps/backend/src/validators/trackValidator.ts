import { object, string, url, minLength, pipe, check } from 'valibot';

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
  title: pipe(string(), minLength(1, 'Titre requis')),
  artist: pipe(string(), minLength(1, 'Artiste requis')),
  youtubeUrl,
  // No ISRC: a kept track takes its play's (trackService.linkKeptTrack), never a caller's.
});
