// AzuraCast API types

export interface Song {
  id: string;
  art: string;
  text: string;
  artist: string;
  title: string;
  album: string;
  genre: string;
  isrc: string;
  lyrics: string;
}

export interface SongEntry {
  sh_id: number;
  played_at: number;
  duration: number;
  playlist: string;
  streamer: string;
  is_request: boolean;
  song: Song;
  elapsed?: number;
  remaining?: number;
}

export interface Mount {
  id: number;
  name: string;
  url: string;
  bitrate: number;
  format: string;
  listeners: {
    total: number;
    unique: number;
    current: number;
  };
  path: string;
  is_default: boolean;
}

export interface Station {
  id: number;
  name: string;
  shortcode: string;
  description: string;
  frontend: string;
  backend: string;
  timezone: string;
  listen_url: string;
  url: string;
  public_player_url: string;
  playlist_pls_url: string;
  playlist_m3u_url: string;
  is_public: boolean;
  requests_enabled: boolean;
  mounts: Mount[];
  remotes: unknown[];
  hls_enabled: boolean;
  hls_url: string | null;
}

export interface Listeners {
  total: number;
  unique: number;
  current: number;
}

export interface LiveStatus {
  is_live: boolean;
  streamer_name: string;
  broadcast_start: number | null;
  art: string | null;
}

export interface NowPlaying {
  station: Station;
  listeners: Listeners;
  live: LiveStatus;
  now_playing: SongEntry;
  playing_next: SongEntry | null;
  song_history: SongEntry[];
  is_online: boolean;
}
