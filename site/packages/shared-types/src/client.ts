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
  appleMusic?: string;
  deezer?: string;
  youtubeMusic?: string;
  tidal?: string;
  amazonMusic?: string;
  soundcloud?: string;
}

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
  /** The artist of the play the track was kept from; null when no play is known. */
  artistId: string | null;
  /** That artist's page, in the listing only: a track just kept is tied a moment later. */
  artistPage?: KeptArtistPage | null;
}

/** Where a kept track's artist lives on the site, under the name the antenna gave it. */
export interface KeptArtistPage {
  slug: string;
  name: string;
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

/**
 * What a Wikimedia Commons photo's licence asks to credit (docs/vision.md §2.5):
 * shown where the photo opens large.
 */
export interface ImageCredit {
  /** The author as the file names them; null when it names none. */
  author: string | null;
  licence: string;
  licenceUrl: string | null;
  /** The file's page on Commons. */
  source: string;
}

export interface ArtistPhoto {
  url: string;
  /** The size Commons gives for `url`, so the large view opens at its shape. */
  width: number | null;
  height: number | null;
  credit: ImageCredit;
}

/** The cover of the artist's first record, with what it is. */
export interface ArtistCover {
  url: string;
  title: string;
  year: number | null;
}

export type ArtistImage = ({ kind: 'photo' } & ArtistPhoto) | ({ kind: 'cover' } & ArtistCover);

export interface ArtistProfile {
  id: string;
  name: string;
  slug: string;
  /** The MusicBrainz id, the way into Musilogy; null when none is known. */
  mbid: string | null;
  /**
   * False for an artist the antenna never played: a page by MBID, made from
   * what Musilogy knows, whose slug is its MBID (docs/vision.md §5).
   */
  played: boolean;
  /**
   * The artist's images, the first to show first: the photo of its Wikidata
   * item on Wikimedia Commons, then the cover of its first record at the Cover
   * Art Archive; absolute https, hotlinked, never re-hosted. The page shows the
   * next when one fails to load, and draws the artist's dawn past the last.
   */
  images: ArtistImage[];
  facts: ArtistFacts | null;
  summary: ArtistSummary | null;
  links: ArtistLink[];
}

export const PLATFORM_NAMES: Record<keyof PlatformLinks, string> = {
  appleMusic: 'Apple Music',
  deezer: 'Deezer',
  youtubeMusic: 'YouTube Music',
  tidal: 'Tidal',
  amazonMusic: 'Amazon Music',
  soundcloud: 'SoundCloud',
};

/** The address of an artist page: only artists the antenna played have one. */
export interface ArtistPageRef {
  id: string;
  slug: string;
}

/**
 * A release group's front cover at the Cover Art Archive, hotlinked. The
 * archive answers a redirect to the image, or 404 when the community chose none
 * (musicbrainz.org/doc/Cover_Art_Archive/API).
 */
export function coverArtUrl(releaseGroup: string, size: 250 | 500): string {
  return `https://coverartarchive.org/release-group/${releaseGroup}/front-${size}`;
}

/**
 * Musilogy (docs/vision.md §2) reads musilogy's SQL functions over a
 * MusicBrainz dump (genres CC BY-NC-SA 3.0), ListenBrainz snapshots (CC0) and
 * Wikidata (CC0). Artists are keyed by MBID; `played` leads to the artist page
 * when the antenna played them. An absence stays null.
 */
export interface MusilogyArtistRef {
  mbid: string;
  name: string;
  /** MusicBrainz's own way of telling homonyms apart. */
  disambiguation: string | null;
  /** The start of the career: declared, else the first album's year. */
  y0: number | null;
  played: ArtistPageRef | null;
  /** Never played, the slug its page was given at the indexing threshold; else null. */
  slug: string | null;
}

export interface MusilogyCard extends MusilogyArtistRef {
  /** Null for a character, an "other" or an artist without a type. */
  kind: ArtistFacts['kind'];
  /** `declared` or `first_album`: an inferred start is not a stated one. */
  y0Source: string | null;
  yEnd: number | null;
  yEndSource: string | null;
  ended: boolean | null;
  genres: string[];
}

/** A neighbour of « Même son »: listened to by the same public, of the same colour. */
export interface MusilogyNeighbour extends MusilogyArtistRef {
  yEnd: number | null;
  /** MusicBrainz says it has ended, even without a date. */
  ended: boolean;
  /** Its place among the artist's neighbours, from 1: the order that counts, ties settled. */
  rank: number;
  /** The style or genre the two share most: why it is close. */
  term: string;
}

/** A record of the artist's work (docs/vision.md §2.4). */
export interface MusilogyRelease {
  /** The MusicBrainz release group: its cover is at the Cover Art Archive. */
  mbid: string;
  title: string;
  type: 'album' | 'ep';
  /** A soundtrack the artist composed. */
  soundtrack: boolean;
  remix: boolean;
  /** Null when MusicBrainz has no legible date. */
  year: number | null;
}

/** A member of a group, or a group of a person, with the years declared. */
export interface MusilogyBandmate extends MusilogyArtistRef {
  yBegin: number | null;
  yEnd: number | null;
}

/** Members of a group, or groups a person is part of. */
export interface MusilogyBands {
  members: MusilogyBandmate[];
  groups: MusilogyBandmate[];
}

/** Another group or name of the members, two steps away: always one with a record. */
export interface MusilogyProject extends MusilogyArtistRef {
  /** The members who lead there. */
  via: string[];
}

/**
 * 'alias': a name the person performs under; 'person': the person behind
 * this name; 'former' and 'later': the name before and after a change.
 */
export interface MusilogyOtherName extends MusilogyArtistRef {
  kind: 'alias' | 'person' | 'former' | 'later';
}

export interface MusilogyArtist {
  card: MusilogyCard;
  /**
   * The artist's close artists, by their rank, the closest first. Null, like every section
   * below, while the data behind it is not loaded yet; empty when it holds none.
   */
  neighbours: MusilogyNeighbour[] | null;
  /** Null while the data behind a section is not loaded yet; empty when it holds none. */
  releases: MusilogyRelease[] | null;
  bands: MusilogyBands | null;
  memberProjects: MusilogyProject[] | null;
  otherNames: MusilogyOtherName[] | null;
}

export interface MusilogySearchHit {
  mbid: string;
  name: string;
  disambiguation: string | null;
  kind: ArtistFacts['kind'];
  y0: number | null;
}
