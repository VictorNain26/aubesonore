import '@fontsource-variable/bricolage-grotesque';
import type * as Caf from 'chromecast-caf-receiver/cast.framework';
import type * as CafDebug from 'chromecast-caf-receiver/cast.debug';
import { safeParse } from 'valibot';
import type { NowPlaying } from '@aubesonore/shared-types/azuracast';
import { castTrack } from '../lib/cast/castMetadata';
import { NowPlayingSchema } from '../lib/azuracast/validators';
import { STATIC_NOWPLAYING_URL, STREAM_URL } from '../utils/config';

// AubeSonore's Cast receiver (Custom Web Receiver, CAF v3): the page a TV or a speaker opens when
// the site casts to it. It plays the station's live MP3 and follows the track on air itself, so the
// TV, the Google Home app and every remote show the current title without the sound reloading.
// Built on developers.google.com/cast/docs/web_receiver: basic, live, core_features, audio.

// AzuraCast rewrites the file about every 10 s (Cache-Control: max-age=10).
const POLL_MS = 10_000;
const LOGO = new URL('/icon-512.png', window.location.origin).href;
const DEBUG_LOGGER =
  'https://www.gstatic.com/cast/sdk/libs/devtools/debug_layer/caf_receiver_logger.js';

// The framework script sets `cast`; the sender's types claim that global for the site's pages,
// so the receiver reads it with the receiver's own types.
interface CafGlobal {
  framework: typeof Caf;
  debug?: typeof CafDebug;
}
const castGlobal = (): CafGlobal => (window as unknown as { cast: CafGlobal }).cast;
const caf = castGlobal().framework;
const context = caf.CastReceiverContext.getInstance();
const player = context.getPlayerManager();
let onAir: NowPlaying | null = null;

function metadata(): Caf.messages.MusicTrackMediaMetadata {
  const track = castTrack(onAir, LOGO);
  const music = new caf.messages.MusicTrackMediaMetadata();
  music.title = track.title;
  music.artist = track.artist;
  if (track.album) music.albumName = track.album;
  music.images = [new caf.messages.Image(track.image)];
  return music;
}

async function readOnAir(): Promise<NowPlaying | null> {
  const response = await fetch(STATIC_NOWPLAYING_URL, { cache: 'no-store' });
  const parsed = safeParse(NowPlayingSchema, await response.json());
  return parsed.success ? (parsed.output as NowPlaying) : null;
}

/** The Cast Debug Logger's overlay (debugging/cast_debug_logger), on demand only: never by default. */
function showDebugLogs(): void {
  const script = document.createElement('script');
  script.src = DEBUG_LOGGER;
  script.onload = () => {
    const logger = castGlobal().debug?.CastDebugLogger.getInstance();
    logger?.setEnabled(true);
    logger?.showDebugLogs(true);
  };
  document.head.append(script);
}

// Whatever a sender asks, this receiver plays the station: launched by anyone, it plays nothing
// else. A live stream: StreamType.LIVE and a duration of -1 (web_receiver/live), an MP3 the
// receiver plays as is (docs/media). `customData.debug` turns the Cast Debug Logger on.
player.setMessageInterceptor(caf.messages.MessageType.LOAD, (request) => {
  request.media.contentId = STREAM_URL;
  request.media.contentUrl = STREAM_URL;
  request.media.contentType = 'audio/mpeg';
  request.media.streamType = caf.messages.StreamType.LIVE;
  request.media.duration = -1;
  request.media.metadata = metadata();
  if ((request.customData as { debug?: unknown } | undefined)?.debug === true) showDebugLogs();
  return request;
});

// A paused live stream would resume minutes behind the antenna: PLAY after a pause loads the
// stream again, at the live edge, as the live guide asks ("resume playback at the live edge"). A
// progressive MP3 has no seekable range to seek to, hence the reload; null drops the PLAY itself.
// The API returns "updated data … or null if the request should not be handled"; its
// DefinitelyTyped union types one or the other per function, never both, hence the cast.
const resumeAtLiveEdge = (request: Caf.messages.RequestData): Caf.messages.RequestData | null => {
  const media = player.getMediaInformation();
  if (player.getPlayerState() !== caf.messages.PlayerState.PAUSED || !media) return request;
  const load = new caf.messages.LoadRequestData();
  load.media = media;
  load.autoplay = true;
  void player.load(load);
  return null;
};
player.setMessageInterceptor(
  caf.messages.MessageType.PLAY,
  resumeAtLiveEdge as (request: Caf.messages.RequestData) => Caf.messages.RequestData
);

// A new track: the media information is set again and broadcast, so the TV and every sender show
// it while the stream plays on (core_features; Music Assistant's receiver does the same). Audio
// devices must keep this metadata in sync with what plays (docs/audio). No poll while idle.
async function poll(): Promise<void> {
  if (player.getPlayerState() === caf.messages.PlayerState.IDLE) return;
  try {
    const next = await readOnAir();
    if (!next || next.now_playing.sh_id === onAir?.now_playing.sh_id) return;
    onAir = next;
    const media = player.getMediaInformation();
    if (!media) return;
    media.metadata = metadata();
    player.setMediaInformation(media, true);
  } catch {
    // Offline for a moment: the TV keeps the last track, the next poll catches up.
  }
}

// Read before the first load too, so the TV names the track from the start.
readOnAir()
  .then((first) => {
    onAir ??= first;
  })
  .catch(() => undefined);
setInterval(() => void poll(), POLL_MS);

// Play/pause for speakers' buttons and smart displays (docs/audio, optimize-smart-displays), volume
// and mute; no seek on a live stream. Enforced, so a voice command cannot run what is not listed
// (core_features).
const options = new caf.CastReceiverOptions();
options.supportedCommands =
  caf.messages.Command.PAUSE |
  caf.messages.Command.STREAM_VOLUME |
  caf.messages.Command.STREAM_MUTE;
options.enforceSupportedCommands = true;
context.start(options);
