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
