import { createHash } from 'node:crypto';
import type { BrowserContext, Page, Route } from '@playwright/test';
import type { ClientLikedTrack } from '@aubesonore/shared-types/client';
import { nowPlayingPayload, TRACKS, WEEK, type SampleTrack } from '../src/stories/fixtures';
import { CASSIUS, LISTENER, STEREOLAB, STEREOLAB_MUSILOGY } from '../src/stories/artist';

// The pages' data, nothing from the network: the station, the API and every image are answered
// here (Playwright's routing, playwright.dev/docs/network), from the catalogue's sample data
// (src/stories/), so a capture changes only when the site's drawing does.

/** The moment every page is drawn at: the kept tracks' dates and « Juste avant » read from it. */
export const NOW = new Date('2026-11-04T10:00:00Z');

const STATION = 'https://radio.aubesonore.fr';
const NOW_PLAYING = `${STATION}/api/nowplaying_static/aubesonore.json`;

/** What the station answers: a track on air, the radio off air, or no answer at all. */
export type Live = 'on-air' | 'off-air' | 'unreachable';

export interface Scene {
  live?: Live;
  signedIn?: boolean;
}

/** The station's answer at NOW: its builder stamps the real clock, shifted here to NOW. */
function nowPlaying(isOnline: boolean) {
  const payload = nowPlayingPayload(TRACKS.growlers, TRACKS.danny, isOnline);
  const shift = Math.floor(NOW.getTime() / 1000) - Math.floor(Date.now() / 1000);
  payload.now_playing.played_at += shift;
  for (const entry of payload.song_history) entry.played_at += shift;
  return payload;
}

/** A library as the API lists it: four of the catalogue's records, one without a page. */
function kept(track: SampleTrack, createdAt: string, slug: string | null): ClientLikedTrack {
  return {
    id: `kept-${createdAt}`,
    title: track.title,
    artist: track.artist,
    album: track.album || null,
    artworkUrl: track.art ?? null,
    youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(track.title)}`,
    createdAt,
    userId: LISTENER.id,
    artistId: slug ? `example-${slug}` : null,
    artistPage: slug ? { slug, name: track.artist } : null,
  };
}

const KEPT: ClientLikedTrack[] = [
  kept(TRACKS.growlers, '2026-10-28T21:14:00.000Z', 'the-growlers'),
  kept(TRACKS.umo, '2026-10-12T08:02:00.000Z', null),
  kept(TRACKS.tame, '2026-03-21T23:10:00.000Z', 'tame-impala'),
  kept(TRACKS.bowie, '2025-12-08T17:55:00.000Z', 'david-bowie'),
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/**
 * A cover for any image address: a colour and a disc drawn from a hash of the record (the release
 * group's id, whatever size is asked; else the path), so a record keeps its cover from run to run
 * and from page to page, and the hero its light (CoverLight). Flat colours: the baselines stay
 * small.
 */
function cover(url: string): string {
  const { pathname } = new URL(url);
  const hash = createHash('sha256')
    .update(UUID.exec(pathname)?.[0] ?? pathname)
    .digest();
  const hue = (i: number) => Math.round(((hash[i] ?? 0) / 255) * 360);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1200" height="1200">
<rect width="100" height="100" fill="hsl(${hue(0)} 45% 40%)"/>
<circle cx="${30 + ((hash[2] ?? 0) % 40)}" cy="${30 + ((hash[3] ?? 0) % 40)}" r="18" fill="hsl(${hue(4)} 70% 70%)"/>
</svg>`;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** An image: CORS open, as the cover store's and Commons' are, so the hero can read its colours. */
const image = (route: Route) =>
  route.fulfill({
    contentType: 'image/svg+xml',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: cover(route.request().url()),
  });

/**
 * Answers every request of the page: the dev server's own files go through, the API and the
 * station from the scene, images from `cover`; anything else is refused (the Cast SDK, any
 * other host). An API call no answer here knows is listed in `unanswered`, which the test checks
 * is empty: a page that starts asking for something new must get its answer here first.
 */
export async function serveScene(
  context: BrowserContext,
  baseURL: string,
  { live = 'on-air', signedIn = false }: Scene
): Promise<{ unanswered: string[] }> {
  const unanswered: string[] = [];
  const origin = new URL(baseURL).origin;

  // Routes run newest first (playwright.dev/docs/api/class-browsercontext#browser-context-route):
  // the catch-all is registered first so the ones below take precedence.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (route.request().resourceType() === 'image') return image(route);
    if (url.pathname.startsWith('/api/')) unanswered.push(`${url.pathname}${url.search}`);
    return route.abort('blockedbyclient');
  });

  await context.route(`${origin}/covers/**`, image);

  await context.route(NOW_PLAYING, (route) =>
    live === 'unreachable'
      ? route.fulfill({ status: 503, body: '' })
      : json(route, nowPlaying(live === 'on-air'))
  );
  // The stream itself: the tests stand in for the audio element (`stubAudio`).
  await context.route(`${STATION}/listen/**`, (route) => route.abort('blockedbyclient'));

  await context.route(`${origin}/api/auth/get-session`, (route) =>
    json(
      route,
      signedIn
        ? {
            user: LISTENER,
            session: { id: 's-1', userId: LISTENER.id, expiresAt: '2027-01-01T00:00:00.000Z' },
          }
        : { user: null }
    )
  );
  await context.route(`${origin}/api/track/like`, (route) =>
    signedIn ? json(route, KEPT) : json(route, { error: 'Unauthorized' }, 401)
  );
  await context.route(`${origin}/api/trends`, (route) => json(route, { week: WEEK }));
  await context.route(`${origin}/api/artist/resolve?*`, (route) => {
    const name = new URL(route.request().url()).searchParams.get('name') ?? '';
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return json(route, { id: `example-${slug}`, slug });
  });
  await context.route(`${origin}/api/artist/page/**`, (route) => {
    const slug = new URL(route.request().url()).pathname.split('/').pop();
    return slug === STEREOLAB.slug ? json(route, STEREOLAB) : json(route, {}, 404);
  });
  await context.route(`${origin}/api/musilogy/artist/**`, (route) =>
    route.request().url().includes(STEREOLAB_MUSILOGY.card.mbid)
      ? json(route, STEREOLAB_MUSILOGY)
      : json(route, {}, 404)
  );
  await context.route(`${origin}/api/musilogy/search?*`, (route) => json(route, CASSIUS));

  return { unanswered };
}

/** How the audio element answers Écouter: it plays, or it never gets its first sound. */
export type Stream = 'plays' | 'never-answers';

/**
 * The page's audio element, without a stream: play() resolves (or never does), load() fetches
 * nothing. Media playback is the browser's, not the site's: the player (lib/player.ts) runs as
 * is on top of it. The element is kept as `window.__audio` for a test to fire its events.
 */
export async function stubAudio(page: Page, stream: Stream): Promise<void> {
  await page.addInitScript((mode: Stream) => {
    const proto = HTMLMediaElement.prototype;
    proto.load = () => {};
    proto.pause = () => {};
    proto.play = function (this: HTMLMediaElement) {
      (window as unknown as { __audio: HTMLMediaElement }).__audio = this;
      return mode === 'plays' ? Promise.resolve() : new Promise<void>(() => {});
    };
  }, stream);
}
