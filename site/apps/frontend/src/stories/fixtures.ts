import type { TrendEntry } from '@aubesonore/shared-types/client';
import type { NowPlaying, SongEntry } from '../lib/azuracast';

// The catalogue's sample data (.storybook/): real records, their covers at the Cover Art Archive
// in the form the antenna and the kept tracks give them (lib/artwork.ts turns them into the cover
// store's /covers/caa/ files, which Storybook's server sends back to the archive). Release groups
// checked on 2026-10-30.

/** A release group's front cover, as the site receives it. */
const cover = (releaseGroup: string) =>
  `https://coverartarchive.org/release-group/${releaseGroup}/front`;

export interface SampleTrack {
  title: string;
  artist: string;
  album: string;
  art: string | undefined;
}

export const TRACKS = {
  growlers: {
    title: 'I’ll Be Around',
    artist: 'The Growlers',
    album: 'City Club',
    art: cover('4c2efec8-83eb-47f4-b522-3dbcccce0558'),
  },
  danny: {
    title: 'Really Doe',
    artist: 'Danny Brown',
    album: 'Atrocity Exhibition',
    art: cover('88f4f8e5-ee88-4050-84ad-cf73f7c2b19a'),
  },
  gesaffelstein: {
    title: 'Ever Now',
    artist: 'Gesaffelstein',
    album: 'Hyperion',
    art: cover('341005c2-14ee-4be3-a421-57e9cf9bae61'),
  },
  starsailor: {
    title: 'Four to the Floor',
    artist: 'Starsailor',
    album: 'Silence Is Easy',
    art: cover('2616001b-cf53-38cd-9ab7-32497896f381'),
  },
  bowie: {
    title: 'Ashes to Ashes',
    artist: 'David Bowie',
    album: 'Scary Monsters (and Super Creeps)',
    art: cover('bb13cb45-254c-3a61-89a5-15d22a97e6d6'),
  },
  tame: {
    title: 'Let It Happen',
    artist: 'Tame Impala',
    album: 'Currents',
    art: cover('08aa7a6c-3e43-4459-87b2-e47faf3a088a'),
  },
  umo: {
    title: 'Multi-Love',
    artist: 'Unknown Mortal Orchestra',
    album: 'Multi-Love',
    art: cover('92bb3a03-b694-43b2-95b4-7c6e61aab422'),
  },
  lorde: {
    title: 'Green Light',
    artist: 'Lorde',
    album: 'Melodrama',
    art: cover('668e80e0-b35e-4471-9788-0a3d797fe42c'),
  },
  daft: {
    title: 'Instant Crush',
    artist: 'Daft Punk',
    album: 'Random Access Memories',
    art: cover('aa997ea0-2936-40bd-884d-3af8a0e064dc'),
  },
  radiohead: {
    title: 'Weird Fishes/Arpeggi',
    artist: 'Radiohead',
    album: 'In Rainbows',
    art: cover('6e335887-60ba-38f0-95af-fae7774336bf'),
  },
} satisfies Record<string, SampleTrack>;

/**
 * A track without a cover and with a title as long as one the hero cut short in production
 * (audit of 2026-10-29, R3): the hero must say it whole. Not a real record.
 */
export const LONG_UNCOVERED: SampleTrack = {
  title: 'What We Are and What We Are Meant to Be (Extended Version)',
  artist: 'Un artiste d’exemple',
  album: '',
  art: undefined,
};

/**
 * A title longer still, with a word wider than a phone's line (a place's name, 85 letters): the
 * hero takes the lines it needs and breaks the word rather than cut or overflow. Not a real record.
 */
export const LONG_WORD: SampleTrack = {
  title:
    'Taumatawhakatangihangakoauauotamateaturipukakapikimaungahoronukupokaiwhenuakitanatahu (Version longue pour la nuit)',
  artist: 'Un artiste d’exemple',
  album: '',
  art: undefined,
};

/** The week's most kept, the most kept first, as /api/trends ranks them. */
export const WEEK: TrendEntry[] = [
  TRACKS.umo,
  TRACKS.tame,
  TRACKS.lorde,
  TRACKS.daft,
  TRACKS.bowie,
  TRACKS.radiohead,
  TRACKS.starsailor,
  TRACKS.gesaffelstein,
].map((track, rank) => ({
  title: track.title,
  artist: track.artist,
  artworkUrl: track.art ?? null,
  likes: 9 - rank,
  artistPage: null,
}));

function songEntry(track: SampleTrack, shId: number, playedAt: number): SongEntry {
  return {
    sh_id: shId,
    played_at: playedAt,
    duration: 240,
    playlist: 'Grille',
    streamer: '',
    is_request: false,
    song: {
      id: String(shId),
      art: track.art ?? '',
      text: `${track.artist} - ${track.title}`,
      artist: track.artist,
      title: track.title,
      album: track.album,
      genre: '',
      isrc: '',
      lyrics: '',
    },
  };
}

/** AzuraCast's answer while `onAir` plays, `before` having played just before it. */
export function nowPlayingPayload(
  onAir: SampleTrack,
  before: SampleTrack | null,
  isOnline = true
): NowPlaying {
  const now = Math.floor(Date.now() / 1000);
  return {
    station: {},
    listeners: { total: 12, unique: 12, current: 12 },
    live: { is_live: false, streamer_name: '', broadcast_start: null, art: null },
    now_playing: { ...songEntry(onAir, 2, now - 60), elapsed: 60, remaining: 180 },
    playing_next: null,
    song_history: before ? [songEntry(before, 1, now - 300)] : [],
    is_online: isOnline,
  };
}
