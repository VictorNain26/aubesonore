// Client API types — shared between frontend and mobile
// These are the shapes returned by the API to clients (simpler than DB models in auth.ts)

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface AuthResponse {
  user: User;
  session: Session;
}

export interface PlatformLinks {
  spotify?: string;
  appleMusic?: string;
  deezer?: string;
  youtubeMusic?: string;
  tidal?: string;
  amazonMusic?: string;
  soundcloud?: string;
}

// Canonical list of preferred platforms — single source of truth.
// Derive the `PreferredPlatform` type from this array so adding a platform
// only takes one edit (no chance of the type and validator drifting).
export const PREFERRED_PLATFORMS = [
  'spotify',
  'appleMusic',
  'deezer',
  'youtubeMusic',
  'tidal',
  'amazonMusic',
  'soundcloud',
  'youtube',
] as const;

export type PreferredPlatform = (typeof PREFERRED_PLATFORMS)[number];

export interface ClientLikedTrack {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  youtubeUrl: string;
  isrc?: string | null;
  songlinkUrl?: string | null;
  platformLinks?: PlatformLinks | null;
  createdAt: string;
  userId: string;
}

export interface UserPreferences {
  userId: string;
  preferredPlatform: PreferredPlatform;
  updatedAt: string;
}

export interface LikeTrackRequest {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  youtubeUrl: string;
  isrc?: string;
}

export interface CheckLikedRequest {
  title: string;
  artist: string;
}

export interface CheckLikedResponse {
  liked: boolean;
  track?: ClientLikedTrack;
}

/** The two languages the site is published in. */
export type SiteLocale = 'fr' | 'en';

export type ArtistPlatform =
  | 'deezer'
  | 'spotify'
  | 'appleMusic'
  | 'bandcamp'
  | 'soundcloud'
  | 'official';

export interface ArtistLink {
  platform: ArtistPlatform;
  url: string;
}

export interface ArtistRadioPlay {
  title: string;
  artist: string;
  /** ISO timestamp of the play. */
  playedAt: string;
}

/** What MusicBrainz states about the artist, nothing inferred. */
export interface ArtistFacts {
  kind: 'person' | 'group' | 'orchestra' | 'choir' | null;
  /** Where a group was formed; never a person's birthplace. */
  place: string | null;
  /** ISO 3166-1 alpha-2, localised by the client. */
  country: string | null;
  /** Formation and dissolution years of a group; never a person's birth or death. */
  formed: number | null;
  ended: number | null;
  /** MusicBrainz says the group has not ended; false when it ended, even without a date. */
  active: boolean;
}

/** The opening sentences of the artist's Wikipedia article, CC BY-SA. */
export interface ArtistSummary {
  text: string;
  /** The page language when the article exists in it, the other one otherwise. */
  lang: SiteLocale;
  url: string;
}

export interface ArtistProfile {
  id: string;
  name: string;
  slug: string;
  /** Absolute https Deezer URL, hotlinked — never re-hosted. */
  image: string | null;
  facts: ArtistFacts | null;
  summary: ArtistSummary | null;
  links: ArtistLink[];
  /** What the antenna actually played — the one section no upstream can supply. */
  playedOnRadio: ArtistRadioPlay[];
  /** MusicBrainz id, null when MusicBrainz declares no Deezer link: keys the frieze (`/api/frieze/artist/:mbid`). */
  mbid: string | null;
}

export const PLATFORM_NAMES: Record<PreferredPlatform, string> = {
  spotify: 'Spotify',
  appleMusic: 'Apple Music',
  deezer: 'Deezer',
  youtubeMusic: 'YouTube Music',
  tidal: 'Tidal',
  amazonMusic: 'Amazon Music',
  soundcloud: 'SoundCloud',
  youtube: 'YouTube',
};

// Convenience: the same data shaped as a list for `<select>` / `<Picker>` UIs.
// Stable ordering matches PREFERRED_PLATFORMS.
export const PLATFORMS: ReadonlyArray<{ id: PreferredPlatform; name: string }> =
  PREFERRED_PLATFORMS.map((id) => ({ id, name: PLATFORM_NAMES[id] }));

/** The address of an artist page: only artists the antenna played have one. */
export interface ArtistPageRef {
  id: string;
  slug: string;
}

/**
 * The frieze reads musilogy's tables, loaded into the site database:
 * MusicBrainz (genres CC-BY-NC-SA 3.0) and ListenBrainz listen counts (CC0).
 * Every derived value travels with its provenance, and an absence stays null.
 * Artists are keyed by MBID; `played` links to the artist page when the
 * antenna played them (docs/vision.md §4.4).
 */
export interface FriezeGenre {
  mbid: string;
  name: string;
  /** Artists carrying the genre, people included. */
  artists: number;
}

export interface FriezeOverview {
  /** Only the genres the density keeps; the others stay reachable through a window. */
  genres: FriezeGenre[];
  /** Columnar: cell i is genre `genres[genre[i]]`, `present[i]` groups in `year[i]`. */
  density: { genre: number[]; year: number[]; present: number[] };
  /**
   * Distinct groups present each year, in the same population: a genre is
   * read as its share of the year, never in absolute counts, which only
   * follow MusicBrainz's growth.
   */
  activity: { year: number[]; groups: number[] };
}

export interface FriezeArtistRef {
  mbid: string;
  name: string;
  /** MusicBrainz's own way of telling homonyms apart. */
  disambiguation: string | null;
  y0: number | null;
  played: ArtistPageRef | null;
}

export interface FriezeLifeline extends FriezeArtistRef {
  type: string;
  y0: number;
  yEnd: number | null;
  /** `declared` or `last_album`: a derived end is not a stated one. */
  yEndSource: string | null;
  ended: boolean | null;
  /** The end bounded by the dump year; equals y0 when no end is known. */
  yPresenceEnd: number;
  /** Null when ListenBrainz has no listen of the artist, not zero. */
  listenCount: number | null;
}

export interface FriezeWindow {
  /** Everyone present; the page holds the most listened first. */
  total: number;
  artists: FriezeLifeline[];
}

export interface FriezeGenreVote {
  mbid: string;
  name: string;
  votes: number;
}

export interface FriezeCard extends FriezeArtistRef {
  type: string;
  country: string | null;
  beginArea: string | null;
  /** A person's begin: a birth, never the start of a career. */
  yBirth: number | null;
  y0Source: string | null;
  yEnd: number | null;
  yEndSource: string | null;
  ended: boolean | null;
  genres: FriezeGenreVote[];
  /** `declared`, or `albums` when the genres come from the artist's own albums. */
  genreSource: string | null;
  listenCount: number | null;
  userCount: number | null;
}

export interface FriezeLink {
  /** MusicBrainz's relation name (`member of band`, `teacher`…), worded by the client. */
  type: string;
  /** `forward` when the artist is the source of the relation. */
  direction: 'forward' | 'backward';
  artist: FriezeArtistRef;
  yBegin: number | null;
  yEnd: number | null;
}

export interface FriezeLineage {
  side: 'inspiration' | 'descendant';
  artist: FriezeArtistRef & { yEnd: number | null };
  /** `mb_teacher`, `mb_tribute`, `mb_named_after`: the client shows the source's own term. */
  source: string;
}

export interface FriezeContemporary {
  artist: FriezeArtistRef & { yPresenceEnd: number };
  /** Same begin area, or same country when the artist has none. */
  scene: 'begin_area' | 'country';
  /** The reason for the link, in the contemporary's own genre order. */
  sharedGenres: string[];
  jaccard: number;
}

export interface FriezeArtist {
  card: FriezeCard;
  links: FriezeLink[];
  lineage: FriezeLineage[];
  contemporaries: { total: number; offset: number; items: FriezeContemporary[] };
}
