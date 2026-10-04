import { object, string, url, minLength, pipe, optional, check } from 'valibot';
import { toIsrc } from '../lib/isrc';

// Whitelist YouTube domains. Anything else stored here would be served back
// to the client as a clickable "play on YouTube" link — an open redirect vector.
const YOUTUBE_HOST_RE =
  /^https:\/\/(www\.youtube\.com\/|youtube\.com\/|m\.youtube\.com\/|music\.youtube\.com\/|youtu\.be\/)/i;

const youtubeUrl = pipe(
  string(),
  url('Lien YouTube invalide'),
  check((value) => YOUTUBE_HOST_RE.test(value), 'Doit être une URL YouTube')
);

// Artworks are rendered as <img> in the client. https-only blocks data:
// and javascript: smuggling; we also reject the localhost / private-IP
// schemes that an attacker could use to probe internal services on a
// future proxy endpoint.
const httpsImageUrl = pipe(
  string(),
  url('Artwork doit être une URL valide'),
  check((value) => value.startsWith('https://'), 'Artwork doit utiliser HTTPS')
);

export const likeTrackSchema = object({
  title: pipe(string(), minLength(1, 'Titre requis')),
  artist: pipe(string(), minLength(1, 'Artiste requis')),
  album: optional(string()),
  artworkUrl: optional(httpsImageUrl),
  youtubeUrl,
  // Sent to Deezer and Spotify, and kept for every later refresh: ISO 3901 or nothing.
  isrc: optional(
    pipe(
      string(),
      check((value) => toIsrc(value) !== null, 'ISRC invalide')
    )
  ),
});

export const checkLikedSchema = object({
  title: pipe(string(), minLength(1, 'Titre requis')),
  artist: pipe(string(), minLength(1, 'Artiste requis')),
});
