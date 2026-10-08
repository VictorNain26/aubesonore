import { db, schema } from '../db/index';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { User, LikedTrack } from '../db/schema';
import type { KeptArtistPage } from '@aubesonore/shared-types/client';
import { findTrackLinks } from './trackLinksService';
import { keepCover } from './coverService';
import { resolveArtist } from './artistResolver';
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
  artworkUrl?: string;
  youtubeUrl: string;
  isrc?: string;
}

interface ServiceResponse<T = LikedTrack> {
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
  const { title, artist, album, artworkUrl, youtubeUrl, isrc } = body;
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
      artworkUrl: artworkUrl || null,
      youtubeUrl,
      isrc: isrc || null,
      songlinkUrl: null,
      platformLinks: null,
    })
    .onConflictDoNothing({
      target: [schema.likedTracks.userId, schema.likedTracks.title, schema.likedTracks.artist],
    })
    .returning();

  if (!likedTrack) {
    return { status: 400, error: 'Morceau déjà liké' };
  }

  // Background enrichment — non-blocking Songlink lookup.
  void enrichTrackInBackground(trackId, title, artist, isrc ?? null).catch((err: unknown) => {
    logger.warn('track.enrich_failed', { trackId, message: (err as Error).message });
  });
  void linkKeptTrack(trackId, title, artist).catch((err: unknown) => {
    logger.warn('keptTrack.link_failed', { trackId, message: (err as Error).message });
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
 * (docs/vision.md §4.4), so the artist page shows what a listener kept and the
 * alerts know who kept an artist. A track the antenna is not known to have
 * played stays untied: a like can name anything.
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

async function enrichTrackInBackground(
  trackId: string,
  title: string,
  artist: string,
  bodyIsrc: string | null
): Promise<void> {
  // The play's ISRC, as linkKeptTrack stores it: it runs alongside, so the
  // stored column may not be written yet. The client's own ISRC comes second.
  const play = await findPlay(title, artist);
  const isrc = play?.isrc ?? bodyIsrc;

  const [track] = await db
    .select({ artworkUrl: schema.likedTracks.artworkUrl })
    .from(schema.likedTracks)
    .where(eq(schema.likedTracks.id, trackId))
    .limit(1);

  const songlinkData = await findTrackLinks(title, artist, isrc);

  // Prefer the artist-verified iTunes cover when Songlink found one, else
  // our own copy of the AzuraCast art, which dies with its media.
  const verifiedArt = songlinkData?.artworkUrl ?? null;
  const existingAzuracastUrl = track?.artworkUrl ?? null;
  const keptArt =
    !verifiedArt && existingAzuracastUrl ? await keepCover(existingAzuracastUrl) : null;
  const nextArt = verifiedArt ?? keptArt ?? existingAzuracastUrl ?? null;

  const update: Partial<LikedTrack> = {};
  if (songlinkData) {
    update.songlinkUrl = songlinkData.songlinkUrl ?? null;
    update.platformLinks = songlinkData.platformLinks;
  }
  if (nextArt) update.artworkUrl = nextArt;

  if (Object.keys(update).length === 0) return;

  await db.update(schema.likedTracks).set(update).where(eq(schema.likedTracks.id, trackId));
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
      slug: schema.artistSlug.slug,
      name: schema.artist.displayName,
    })
    .from(schema.likedTracks)
    .leftJoin(schema.artist, eq(schema.artist.id, schema.likedTracks.artistId))
    .leftJoin(schema.artistSlug, eq(schema.artistSlug.artistId, schema.likedTracks.artistId))
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

// ─────────────────────────────────────────────
// Récupérer un morceau liké par titre/artiste
// ─────────────────────────────────────────────

export async function getLikedTrackByTitleArtist({
  user,
  title,
  artist,
}: {
  user: User;
  title: string;
  artist: string;
}): Promise<LikedTrack | null> {
  const track = await db
    .select()
    .from(schema.likedTracks)
    .where(
      and(
        eq(schema.likedTracks.userId, user.id),
        eq(schema.likedTracks.title, title),
        eq(schema.likedTracks.artist, artist)
      )
    )
    .limit(1)
    .then((res) => res[0] || null);

  return track;
}

// ─────────────────────────────────────────────
// Rafraîchir tous les liens (batch, rate-limited)
// ─────────────────────────────────────────────

const REFRESH_CHUNK_SIZE = 5;
const REFRESH_CHUNK_DELAY_MS = 500;
// Per-user cooldown between full refreshes. The route triggers up to N
// external API chains; without this, a user could spam-amplify traffic to
// Songlink / iTunes. In-memory is fine for the current single-replica
// backend; would need to move to Redis for multi-instance scaling.
const REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const lastRefreshByUser = new Map<string, number>();

export async function refreshAllLinks({
  user,
}: {
  user: User;
}): Promise<{ message: string; updated: number; status?: number; error?: string }> {
  const last = lastRefreshByUser.get(user.id);
  if (last !== undefined && Date.now() - last < REFRESH_COOLDOWN_MS) {
    const remainingMs = REFRESH_COOLDOWN_MS - (Date.now() - last);
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    return {
      message: '',
      updated: 0,
      status: 429,
      error: `Patientez ${remainingHours}h avant le prochain rafraîchissement global`,
    };
  }
  lastRefreshByUser.set(user.id, Date.now());

  const tracks = await db
    .select({
      id: schema.likedTracks.id,
      title: schema.likedTracks.title,
      artist: schema.likedTracks.artist,
      artworkUrl: schema.likedTracks.artworkUrl,
      isrc: schema.likedTracks.isrc,
    })
    .from(schema.likedTracks)
    .where(eq(schema.likedTracks.userId, user.id));

  let updated = 0;

  for (let i = 0; i < tracks.length; i += REFRESH_CHUNK_SIZE) {
    const chunk = tracks.slice(i, i + REFRESH_CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map(async (track) => {
        const songlinkData = await findTrackLinks(track.title, track.artist, track.isrc);
        if (!songlinkData) return false;
        const verifiedArt = songlinkData.artworkUrl ?? null;
        const existingAzuracastUrl = track.artworkUrl ?? null;
        const nextArt = verifiedArt ?? existingAzuracastUrl ?? null;
        await db
          .update(schema.likedTracks)
          .set({
            songlinkUrl: songlinkData.songlinkUrl ?? null,
            platformLinks: songlinkData.platformLinks,
            ...(nextArt ? { artworkUrl: nextArt } : {}),
          })
          .where(eq(schema.likedTracks.id, track.id));
        return true;
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) updated++;
      if (r.status === 'rejected') {
        logger.warn('track_links.refresh_failed', { message: (r.reason as Error).message });
      }
    }
    if (i + REFRESH_CHUNK_SIZE < tracks.length) {
      await new Promise((resolve) => setTimeout(resolve, REFRESH_CHUNK_DELAY_MS));
    }
  }

  return { message: `${updated} liens mis à jour`, updated };
}

// ─────────────────────────────────────────────
// Mettre à jour les liens d'un morceau (refresh)
// ─────────────────────────────────────────────

export async function refreshTrackLinks({
  user,
  id,
}: {
  user: User;
  id: string;
}): Promise<ServiceResponse> {
  const track = await db
    .select()
    .from(schema.likedTracks)
    .where(and(eq(schema.likedTracks.userId, user.id), eq(schema.likedTracks.id, id)))
    .limit(1)
    .then((res) => res[0]);

  if (!track) {
    return { status: 404, error: 'Morceau non trouvé' };
  }

  const songlinkData = await findTrackLinks(track.title, track.artist, track.isrc);
  if (!songlinkData) {
    return { status: 400, error: 'Impossible de récupérer les liens pour ce morceau' };
  }

  const verifiedArt = songlinkData.artworkUrl ?? null;
  const existingAzuracastUrl = track.artworkUrl ?? null;
  const nextArt = verifiedArt ?? existingAzuracastUrl ?? null;

  // Re-check userId in the UPDATE to close the TOCTOU window between the SELECT
  // above and this UPDATE: if the row was deleted/transferred in between, we
  // return cleanly rather than touching another user's track.
  const [updatedTrack] = await db
    .update(schema.likedTracks)
    .set({
      songlinkUrl: songlinkData.songlinkUrl ?? null,
      platformLinks: songlinkData.platformLinks,
      ...(nextArt ? { artworkUrl: nextArt } : {}),
    })
    .where(and(eq(schema.likedTracks.id, id), eq(schema.likedTracks.userId, user.id)))
    .returning();

  if (!updatedTrack) {
    return { status: 404, error: 'Morceau non trouvé' };
  }

  return {
    message: 'Liens mis à jour avec succès',
    track: updatedTrack,
  };
}
