import {
  pgTable,
  text,
  integer,
  timestamp,
  unique,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  ArtistFacts,
  ArtistLink,
  ArtistSummary,
  PlatformLinks,
} from '@aubesonore/shared-types/client';
import type { StatsState } from '@aubesonore/shared-types/stats';

// Re-export so existing imports (`from '../db/schema'`) keep working.
// Source of truth lives in @aubesonore/shared-types/client.
export type { PlatformLinks };

// ─────────────────────────────────────────────
// USER TABLE
// ─────────────────────────────────────────────
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// ─────────────────────────────────────────────
// ACCOUNT TABLE
// ─────────────────────────────────────────────
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    providerAccountUnique: unique().on(table.providerId, table.accountId),
    accountUserIdIdx: index('account_user_id_idx').on(table.userId),
  })
);

// ─────────────────────────────────────────────
// SESSION TABLE
// ─────────────────────────────────────────────
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    sessionUserIdIdx: index('session_user_id_idx').on(table.userId),
    sessionExpiresAtIdx: index('session_expires_at_idx').on(table.expiresAt),
  })
);

// ─────────────────────────────────────────────
// VERIFICATION TABLE
// ─────────────────────────────────────────────
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => ({
    verificationIdentifierIdx: index('verification_identifier_idx').on(table.identifier),
    verificationExpiresIdx: index('verification_expires_at_idx').on(table.expiresAt),
  })
);

// ─────────────────────────────────────────────
// LIKED_TRACKS TABLE (custom pour AubeSonore)
// ─────────────────────────────────────────────
export const likedTracks = pgTable(
  'liked_tracks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    album: text('album'),

    artworkUrl: text('artwork_url'),

    youtubeUrl: text('youtube_url').notNull(),
    isrc: text('isrc'),

    songlinkUrl: text('songlink_url'),
    platformLinks: jsonb('platform_links').$type<PlatformLinks>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The artist the resolver gives, set once the track is tied to a play;
    // null for a track the antenna is not known to have played.
    artistId: text('artist_id').references(() => artist.id, { onDelete: 'set null' }),
  },
  (table) => ({
    likedTracksUserIdIdx: index('liked_tracks_user_id_idx').on(table.userId),
    // Backs "who kept this artist" (alerts) and "what I kept of them" (artist page).
    likedTracksArtistUserIdx: index('liked_tracks_artist_user_idx').on(
      table.artistId,
      table.userId
    ),
    // Unique to eliminate the select+insert race on concurrent likes.
    // Doubles as the lookup index for "is this track liked?" queries.
    likedTracksUserTitleArtistUnique: uniqueIndex('liked_tracks_user_title_artist_unique').on(
      table.userId,
      table.title,
      table.artist
    ),
    // Backs the `getLikedTracks` listing (WHERE user_id ORDER BY created_at DESC).
    // Without this, Postgres does an Index Scan on user_id then an in-memory Sort.
    likedTracksUserCreatedAtIdx: index('liked_tracks_user_created_at_idx').on(
      table.userId,
      table.createdAt
    ),
  })
);

// ─────────────────────────────────────────────
// USER_STATS TABLE
// ─────────────────────────────────────────────
export const userStats = pgTable('user_stats', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  snapshot: jsonb('snapshot').notNull().$type<StatsState>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// COVERS TABLE
// ─────────────────────────────────────────────
// Drizzle 0.45 has no bytea column; node-postgres reads and writes it as a Buffer.
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// AzuraCast art dies with its media: a kept track gets its own copy,
// addressed by the SHA-256 of its bytes.
export const covers = pgTable('covers', {
  sha256: text('sha256').primaryKey(),
  contentType: text('content_type').notNull(),
  bytes: bytea('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// ARTIST TABLE — canonical identity only
// ─────────────────────────────────────────────
export const artist = pgTable(
  'artist',
  {
    id: text('id').primaryKey(),
    normalizedName: text('normalized_name').notNull(),
    displayName: text('display_name').notNull(),
    deezerId: text('deezer_id'),
    mbid: text('mbid'),
    // 'isrc' when a played track's ISRC gave the identity, 'name' when only the
    // name did: a name-bound row is re-identified once an ISRC is known.
    identifiedBy: text('identified_by').$type<'isrc' | 'name'>().notNull().default('name'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The resolution hot path is a single lookup on this column.
    artistNormalizedNameUnique: uniqueIndex('artist_normalized_name_unique').on(
      table.normalizedName
    ),
    // Postgres allows repeated NULLs in a unique index, so unresolved rows
    // (no upstream match) do not collide with each other.
    artistDeezerIdUnique: uniqueIndex('artist_deezer_id_unique').on(table.deezerId),
    artistMbidUnique: uniqueIndex('artist_mbid_unique').on(table.mbid),
  })
);

// ─────────────────────────────────────────────
// ARTIST_SLUG TABLE — the name of each artist page in its URL
// ─────────────────────────────────────────────
// A slug, once given, never changes nor goes to another artist: a page shared
// or indexed keeps its address. A homonym takes the next free suffix.
export const artistSlug = pgTable('artist_slug', {
  slug: text('slug').primaryKey(),
  artistId: text('artist_id')
    .notNull()
    .unique('artist_slug_artist_id_unique')
    .references(() => artist.id, { onDelete: 'cascade' }),
});

// ─────────────────────────────────────────────
// ARTIST_PROFILE TABLE — the last known answer of each source
// ─────────────────────────────────────────────
// A restart or a deploy keeps every page answering at once; a source that
// fails during a refresh leaves its stored section as it was.
export const artistProfile = pgTable('artist_profile', {
  artistId: text('artist_id')
    .primaryKey()
    .references(() => artist.id, { onDelete: 'cascade' }),
  image: text('image'),
  facts: jsonb('facts').$type<ArtistFacts>(),
  links: jsonb('links').$type<ArtistLink[]>().notNull().default([]),
  wikidataId: text('wikidata_id'),
  summaryFr: jsonb('summary_fr').$type<ArtistSummary>(),
  summaryEn: jsonb('summary_en').$type<ArtistSummary>(),
  // When every source last answered; a refresh cut short keeps the old date.
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull(),
});

// ─────────────────────────────────────────────
// RADIO_PLAY TABLE — what the antenna actually played
// ─────────────────────────────────────────────
export const radioPlay = pgTable(
  'radio_play',
  {
    id: text('id').primaryKey(),
    // AzuraCast's song-history id: one row per play, whatever restarts.
    shId: integer('sh_id').notNull(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    // Denormalised so the artist page filters without recomputing per row.
    artistNormalized: text('artist_normalized').notNull(),
    isrc: text('isrc'),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    radioPlayShIdUnique: uniqueIndex('radio_play_sh_id_unique').on(table.shId),
    radioPlayArtistPlayedAtIdx: index('radio_play_artist_played_at_idx').on(
      table.artistNormalized,
      table.playedAt
    ),
  })
);

// ─────────────────────────────────────────────
// TYPES INFÉRÉS
// ─────────────────────────────────────────────

export type User = InferSelectModel<typeof user>;
export type NewUser = InferInsertModel<typeof user>;

export type Account = InferSelectModel<typeof account>;
export type NewAccount = InferInsertModel<typeof account>;

export type Session = InferSelectModel<typeof session>;
export type NewSession = InferInsertModel<typeof session>;

export type Verification = InferSelectModel<typeof verification>;
export type NewVerification = InferInsertModel<typeof verification>;

export type LikedTrack = InferSelectModel<typeof likedTracks>;
export type NewLikedTrack = InferInsertModel<typeof likedTracks>;

export type UserStats = InferSelectModel<typeof userStats>;
export type NewUserStats = InferInsertModel<typeof userStats>;

export type Artist = InferSelectModel<typeof artist>;
export type NewArtist = InferInsertModel<typeof artist>;

export type RadioPlayRow = InferSelectModel<typeof radioPlay>;
export type NewRadioPlayRow = InferInsertModel<typeof radioPlay>;
