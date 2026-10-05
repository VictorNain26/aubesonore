import '@fontsource-variable/bricolage-grotesque';
import type * as Caf from 'chromecast-caf-receiver/cast.framework';
import { safeParse } from 'valibot';
import type { NowPlaying } from '@aubesonore/shared-types/azuracast';
import { castTrack } from '../lib/cast/castMetadata';
import { NowPlayingSchema } from '../lib/azuracast/validators';
import { STATIC_NOWPLAYING_URL, STREAM_URL } from '../utils/config';

// AubeSonore's Cast receiver: the page a TV or a speaker opens when the site casts to it. It
// plays the station's stream and follows the track on air itself, from the file the site reads,
// so the TV's title and cover change with each track without the sound being loaded again.

// AzuraCast rewrites the file about every 10 s (Cache-Control: max-age=10).
const POLL_MS = 10_000;
const LOGO = new URL('/icon-512.png', window.location.origin).href;
// The framework script sets `cast`; the sender's types claim that global for the site's pages,
// so the receiver reads it with the receiver's own types.
const framework = (window as unknown as { cast: { framework: typeof Caf } }).cast.framework;
const context = framework.CastReceiverContext.getInstance();
const player = context.getPlayerManager();
let onAir: NowPlaying | null = null;

function metadata(): Caf.messages.MusicTrackMediaMetadata {
  const track = castTrack(onAir, LOGO);
  const music = new framework.messages.MusicTrackMediaMetadata();
  music.title = track.title;
  music.artist = track.artist;
  if (track.album) music.albumName = track.album;
  music.images = [new framework.messages.Image(track.image)];
  return music;
}

// Whatever a sender asks, this receiver plays the station: launched by anyone, it plays
// nothing else. A live MP3, which Cast receivers play as is (developers.google.com/cast/docs/media).
player.setMessageInterceptor(framework.messages.MessageType.LOAD, (request) => {
  request.media.contentId = STREAM_URL;
  request.media.contentUrl = STREAM_URL;
  request.media.contentType = 'audio/mpeg';
  request.media.streamType = framework.messages.StreamType.LIVE;
  request.media.metadata = metadata();
  return request;
});

// A new track: the media information is set again, which the TV and every sender show, while the
// stream plays on — the pattern of Music Assistant's receiver (github.com/music-assistant/cast-receiver).
async function poll(): Promise<void> {
  try {
    const response = await fetch(STATIC_NOWPLAYING_URL, { cache: 'no-store' });
    const parsed = safeParse(NowPlayingSchema, await response.json());
    if (!parsed.success) return;
    const next = parsed.output as NowPlaying;
    if (next.now_playing.sh_id === onAir?.now_playing.sh_id) return;
    onAir = next;
    const media = player.getMediaInformation();
    if (!media) return;
    media.metadata = metadata();
    player.setMediaInformation(media, true);
  } catch {
    // Offline for a moment: the TV keeps the last track, the next poll catches up.
  }
}

void poll();
setInterval(() => void poll(), POLL_MS);

// No pause on a live stream: playing again after one would play the buffer, minutes behind the
// antenna. Remotes offer Stop instead, and listening again starts at the live.
const options = new framework.CastReceiverOptions();
options.supportedCommands =
  framework.messages.Command.STREAM_VOLUME | framework.messages.Command.STREAM_MUTE;
context.start(options);
