import {
  string,
  number,
  boolean,
  nullable,
  array,
  optional,
  unknown,
  looseObject,
  type InferOutput,
} from 'valibot';

// Use looseObject everywhere so AzuraCast can add new fields without breaking
// the client. The shapes here describe what we READ, not what the API promises.
const SongSchema = looseObject({
  id: string(),
  art: string(),
  text: string(),
  artist: string(),
  title: string(),
  album: string(),
  genre: string(),
  isrc: string(),
  lyrics: string(),
  custom_fields: optional(unknown()),
});

// SongEntry as it appears in now_playing and song_history. Both have sh_id.
export const SongEntrySchema = looseObject({
  sh_id: number(),
  played_at: number(),
  duration: number(),
  playlist: string(),
  streamer: string(),
  is_request: boolean(),
  song: SongSchema,
  elapsed: optional(number()),
  remaining: optional(number()),
});

// playing_next has a different shape: no sh_id (track hasn't played yet),
// no streamer, has cued_at instead. Keep it loose.
const PlayingNextSchema = looseObject({
  cued_at: optional(number()),
  played_at: number(),
  duration: number(),
  playlist: string(),
  is_request: boolean(),
  song: SongSchema,
});

const ListenersSchema = looseObject({
  total: number(),
  unique: number(),
  current: number(),
});

const LiveStatusSchema = looseObject({
  is_live: boolean(),
  streamer_name: string(),
  broadcast_start: nullable(number()),
  art: nullable(string()),
});

export const NowPlayingSchema = looseObject({
  station: unknown(),
  listeners: ListenersSchema,
  live: LiveStatusSchema,
  now_playing: SongEntrySchema,
  playing_next: nullable(PlayingNextSchema),
  song_history: array(SongEntrySchema),
  is_online: boolean(),
});

// The schemas are the one description of AzuraCast's answer: the types are what they let through.
export type SongEntry = InferOutput<typeof SongEntrySchema>;
export type NowPlaying = InferOutput<typeof NowPlayingSchema>;
