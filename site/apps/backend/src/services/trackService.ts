import { db, schema } from '../db/index';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { User, LikedTrack } from '../db/schema';
import type { KeptArtistPage } from '@aubesonore/shared-types/client';
import { coverKeptTrack } from './keptTrackCovers';
import { resolveArtist } from './artistResolver';
import { mbidSlug, ownSlug, pageSlug } from './artistSlugs';
import { findPlay } from './radioPlayService';
import { resolveSong, songKey, youtubeUrls } from './youtubeLinks';
import { logger } from '../lib/logger';

// Hard cap on the liked-tracks listing payload. Power users with thousands
// of tracks would otherwise stream the entire library on every page load.
// Pagination via cursor (?before=createdAt) is the long-term replacement.
const LIKED_TRACKS_MAX_PAGE = 500;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface LikeTrackBody {
  title: string;
  artist: string;
  album?: string;
  youtubeUrl: string;
  isrc?: string;
}

/** A track service's answer; `status` is the HTTP status the route sets, never sent. */
export interface ServiceResponse<T = LikedTrack> {
  message?: string;
  track?: T;
  status?: number;
  error?: string;
}

// ─────────────────────────────────────────────
// Like un morceau - Fast insert + background enrichment
// ─────────────────────────────────────────────

export async function likeTrack({
  user,
  body,
}: {
  user: User;
  body: LikeTrackBody;
}): Promise<ServiceResponse> {
  const { title, artist, album, youtubeUrl, isrc } = body;
  const trackId = randomUUID();

  // Atomic insert relying on the unique index (user_id, title, artist).
  // Returning empty means the row already existed — single round-trip, no race.
  const [likedTrack] = await db
    .insert(schema.likedTracks)
    .values({
      id: trackId,
      userId: user.id,
      title,
      artist,
      album: album || null,
      youtubeUrl,
      isrc: isrc || null,
    })
    .onConflictDoNothing({
      target: [schema.likedTracks.userId, schema.likedTracks.title, schema.likedTracks.artist],
    })
    .returning();

  if (!likedTrack) {
    return { status: 400, error: 'Morceau déjà liké' };
  }

  // In the background: the play it was kept from, then the cover of its record, found through
  // that play's ISRC when it has one (keptTrackCovers.ts). Until then, and without one, no cover.
  void (async () => {
    await linkKeptTrack(trackId, title, artist).catch((err: unknown) => {
      logger.warn('keptTrack.link_failed', { trackId, message: (err as Error).message });
    });
    await coverKeptTrack(trackId);
  })().catch((err: unknown) => {
    logger.warn('keptTrack.cover_failed', { trackId, message: (err as Error).message });
  });
  void resolveSong(title, artist).catch((err: unknown) => {
    logger.warn('youtube.resolve_failed', { trackId, message: (err as Error).message });
  });

  return {
    message: 'Morceau liké avec succès',
    track: likedTrack,
  };
}

/**
 * Ties a kept track to the play it was kept from and to that play's artist
 * (docs/vision.md §4.4), so the artist page shows what a listener kept. A track the antenna is
 * not known to have played stays untied: a like can name anything.
 */
export async function linkKeptTrack(trackId: string, title: string, artist: string): Promise<void> {
  const play = await findPlay(title, artist);
  if (!play) return;
  const resolved = await resolveArtist(artist);
  await db
    .update(schema.likedTracks)
    .set({ artistId: resolved?.id ?? null, ...(play.isrc ? { isrc: play.isrc } : {}) })
    .where(eq(schema.likedTracks.id, trackId));
}

export type LikedTrackListItem = LikedTrack & { artistPage: KeptArtistPage | null };

/**
 * Each kept track with the page of the artist it is tied to, when that artist has one, and its
 * YouTube Art Track in place of the search it was kept with, once one is verified.
 */
export async function getLikedTracks({ user }: { user: User }): Promise<LikedTrackListItem[]> {
  const rows = await db
    .select({
      track: schema.likedTracks,
      slug: pageSlug,
      name: schema.artist.displayName,
    })
    .from(schema.likedTracks)
    .leftJoin(schema.artist, eq(schema.artist.id, schema.likedTracks.artistId))
    .leftJoin(mbidSlug, eq(mbidSlug.mbid, schema.artist.mbid))
    .leftJoin(ownSlug, eq(ownSlug.artistId, schema.artist.id))
    .where(eq(schema.likedTracks.userId, user.id))
    .orderBy(desc(schema.likedTracks.createdAt))
    .limit(LIKED_TRACKS_MAX_PAGE);
  const direct = await youtubeUrls(rows.map(({ track }) => track));
  return rows.map(({ track, slug, name }) => ({
    ...track,
    youtubeUrl: direct.get(songKey(track.title, track.artist)) ?? track.youtubeUrl,
    artistPage: slug !== null && name !== null ? { slug, name } : null,
  }));
}

// ─────────────────────────────────────────────
// Supprimer un morceau liké
// ─────────────────────────────────────────────

export async function unlikeTrack({
  user,
  id,
}: {
  user: User;
  id: string;
}): Promise<ServiceResponse> {
  const [deletedTrack] = await db
    .delete(schema.likedTracks)
    .where(and(eq(schema.likedTracks.userId, user.id), eq(schema.likedTracks.id, id)))
    .returning();

  if (!deletedTrack) {
    return { status: 404, error: 'Morceau non trouvé ou déjà supprimé' };
  }

  return {
    message: 'Morceau supprimé avec succès',
    track: deletedTrack,
  };
}
