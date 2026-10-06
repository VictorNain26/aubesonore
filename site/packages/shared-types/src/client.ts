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

/** A title of the artist the antenna plays, once, with how often and when it last did. */
export interface ArtistRadioTitle {
  title: string;
  /** As AzuraCast credited the latest play: what a « Garder » names. */
  artist: string;
  /** Plays over the last year. */
  plays: number;
  /** ISO timestamp of the latest play. */
  lastPlayedAt: string;
  /** This very recording on Deezer, from the play's ISRC; null when not shown to be it. */
  deezer: { link: string; cover: string | null } | null;
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
  /** The MusicBrainz id, the way into Musilogy; null when none is known. */
  mbid: string | null;
  /**
   * False for an artist the antenna never played: a page by MBID, made from
   * what Musilogy knows, whose slug is its MBID (docs/vision.md §5).
   */
  played: boolean;
  /**
   * The Deezer portrait, else the cover of the first record at the Cover Art
   * Archive; absolute https, hotlinked, never re-hosted. The page shows its
   * generated wave when it is null or fails to load.
   */
  image: string | null;
  facts: ArtistFacts | null;
  summary: ArtistSummary | null;
  links: ArtistLink[];
  /** What the antenna actually played — the one section no upstream can supply. */
  playedOnRadio: ArtistRadioTitle[];
}

export const PLATFORM_NAMES: Record<keyof PlatformLinks, string> = {
  spotify: 'Spotify',
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
}

export interface MusilogyCard extends MusilogyArtistRef {
  /** MusicBrainz's type: Group, Person, Orchestra, Choir, Character, Other; null when it names none. */
  type: string | null;
  country: string | null;
  beginArea: string | null;
  /** `declared` or `first_album`: an inferred start is not a stated one. */
  y0Source: string | null;
  yEnd: number | null;
  yEndSource: string | null;
  ended: boolean | null;
  genres: string[];
  /** ListenBrainz listeners; null when it counts none, not zero. */
  listeners: number | null;
  /**
   * Whether the proximity snapshot asked about this artist (it asks only the
   * artists with at least 500 listeners); null while no snapshot is loaded.
   */
  proximitySurveyed: boolean | null;
}

/** A neighbour by co-listening: close in sound, never said to be an influence. */
export interface MusilogyNeighbour extends MusilogyArtistRef {
  yEnd: number | null;
  score: number;
}

export interface MusilogyInfluence extends MusilogyArtistRef {
  /** The Wikidata statement that declares it. */
  statement: string;
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

/** Close neighbours who started more than 3 years before, within 3 years, after, or undated. */
export interface MusilogyNeighbours {
  before: MusilogyNeighbour[];
  during: MusilogyNeighbour[];
  after: MusilogyNeighbour[];
  undated: MusilogyNeighbour[];
}

/** Influences the artist declared, and artists who declared it one. */
export interface MusilogyInfluences {
  cites: MusilogyInfluence[];
  citedBy: MusilogyInfluence[];
}

export interface MusilogyArtist {
  card: MusilogyCard;
  /** Null while the data behind a section is not loaded yet; empty when it holds none. */
  neighbours: MusilogyNeighbours | null;
  influences: MusilogyInfluences | null;
  releases: MusilogyRelease[] | null;
  bands: MusilogyBands | null;
  memberProjects: MusilogyProject[] | null;
  otherNames: MusilogyOtherName[] | null;
}

export interface MusilogySearchHit {
  mbid: string;
  name: string;
  disambiguation: string | null;
  type: string | null;
  y0: number | null;
  listeners: number | null;
}
