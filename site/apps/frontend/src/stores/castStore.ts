/// <reference types="chromecast-caf-sender" />
import { create } from 'zustand';
import { useNowPlayingStore } from '../lib/azuracast';
import { castTrack } from '../lib/cast/castMetadata';
import { loadCastSdk, RECEIVER_APP_ID } from '../lib/cast/chromecast';
import { setRemotePlayback, usePlayer } from '../lib/player';
import { STREAM_URL } from '../utils/config';

interface CastStore {
  /** A Cast device is on the network: the button shows. */
  available: boolean;
  /** The device the stream is cast to, by the name its owner gave it. */
  deviceName: string | null;
  initialize: () => void;
  openPicker: () => void;
}

let initialized = false;

/** Asks the device to play the station; the receiver fills in the stream and the track on air. */
function load(session: cast.framework.CastSession): void {
  const track = castTrack(
    useNowPlayingStore.getState().data,
    new URL('/icon-512.png', window.location.origin).href
  );
  const metadata = new chrome.cast.media.MusicTrackMediaMetadata();
  metadata.title = track.title;
  metadata.artist = track.artist;
  if (track.album) metadata.albumName = track.album;
  metadata.images = [new chrome.cast.Image(track.image)];
  const media = new chrome.cast.media.MediaInfo(STREAM_URL, 'audio/mpeg');
  media.streamType = chrome.cast.media.StreamType.LIVE;
  media.metadata = metadata;
  const request = new chrome.cast.media.LoadRequest(media);
  request.autoplay = true;
  session.loadMedia(request).catch(() => {
    usePlayer.setState({
      isPlaying: false,
      isConnecting: false,
      playError: { code: 'network', message: 'cast load failed' },
    });
  });
}

function start(set: (state: Partial<CastStore>) => void): void {
  const context = cast.framework.CastContext.getInstance();
  context.setOptions({
    receiverApplicationId: RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });

  const showAvailability = () =>
    set({ available: context.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE });
  showAvailability();
  context.addEventListener(
    cast.framework.CastContextEventType.CAST_STATE_CHANGED,
    showAvailability
  );

  const remotePlayer = new cast.framework.RemotePlayer();
  const controller = new cast.framework.RemotePlayerController(remotePlayer);
  controller.addEventListener(cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED, () => {
    if (!remotePlayer.isConnected) return;
    usePlayer.setState({
      isPlaying: remotePlayer.playerState === chrome.cast.media.PlayerState.PLAYING,
      isConnecting: remotePlayer.playerState === chrome.cast.media.PlayerState.BUFFERING,
    });
  });

  context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
    const session = context.getCurrentSession();
    const started = event.sessionState === cast.framework.SessionState.SESSION_STARTED;
    if (started || event.sessionState === cast.framework.SessionState.SESSION_RESUMED) {
      if (!session) return;
      // The browser falls silent before the device takes over: one antenna at a time.
      if (started) usePlayer.getState().stop();
      setRemotePlayback({
        play: () => load(session),
        stop: () => controller.stop(),
        setVolume: (value) => {
          remotePlayer.volumeLevel = value;
          controller.setVolumeLevel();
        },
      });
      set({ deviceName: session.getCastDevice().friendlyName });
      if (started) usePlayer.getState().toggle();
    } else if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
      setRemotePlayback(null);
      set({ deviceName: null });
      usePlayer.setState({ isPlaying: false, isConnecting: false });
    }
  });
}

export const useCastStore = create<CastStore>((set) => ({
  available: false,
  deviceName: null,
  initialize: () => {
    if (initialized) return;
    initialized = true;
    void loadCastSdk().then((isAvailable) => {
      if (isAvailable) start(set);
    });
  },
  openPicker: () => {
    // Rejects when the listener closes the picker without a choice: nothing to do then.
    cast.framework.CastContext.getInstance()
      .requestSession()
      .catch(() => undefined);
  },
}));
