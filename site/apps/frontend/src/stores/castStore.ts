/// <reference types="chromecast-caf-sender" />
import { create } from 'zustand';
import { useNowPlayingStore } from '../lib/azuracast';
import { toastError } from '../lib/appToast';
import { castTrack } from '../lib/cast/castMetadata';
import { loadCastSdk, RECEIVER_APP_ID } from '../lib/cast/chromecast';
import { setRemotePlayback, usePlayer } from '../lib/player';
import { STREAM_URL } from '../utils/config';
import * as m from '@/paraglide/messages.js';

// The Web Sender's lifecycle as developers.google.com/cast/docs/web_sender/integrate and the
// CastVideos-chrome sample run it: the button follows CAST_STATE_CHANGED; STARTED loads the
// live, RESUMED (a reload, another tab) joins what plays without loading again; every failure
// but the listener's own cancel is said.

interface CastStore {
  /** The browser can cast (Chromium, the SDK loaded). */
  supported: boolean;
  /** A Cast device is on the network. */
  available: boolean;
  /** Between the choice of a device and the session it opens. */
  connecting: boolean;
  /** The device the stream is cast to, by the name its owner gave it. */
  deviceName: string | null;
  initialize: () => void;
  openPicker: () => void;
}

let initialized = false;

function castFailed(): void {
  usePlayer.setState({ isPlaying: false, isConnecting: false });
  toastError(m.cast_failed());
}

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
  // A live stream has no duration (web_receiver/live: "MediaInformation.duration should be -1").
  media.duration = -1;
  media.metadata = metadata;
  const request = new chrome.cast.media.LoadRequest(media);
  request.autoplay = true;
  // ?castdebug on the site's address shows the receiver's Cast Debug Logger on the TV.
  if (new URLSearchParams(window.location.search).has('castdebug')) {
    request.customData = { debug: true };
  }
  session.loadMedia(request).catch(castFailed);
}

function start(set: (state: Partial<CastStore>) => void): void {
  const context = cast.framework.CastContext.getInstance();
  context.setOptions({
    receiverApplicationId: RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });

  const showCastState = () => {
    const state = context.getCastState();
    set({
      available: state !== cast.framework.CastState.NO_DEVICES_AVAILABLE,
      connecting: state === cast.framework.CastState.CONNECTING,
    });
  };
  showCastState();
  context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, showCastState);

  const remotePlayer = new cast.framework.RemotePlayer();
  const controller = new cast.framework.RemotePlayerController(remotePlayer);
  const disconnect = () => {
    setRemotePlayback(null);
    set({ deviceName: null });
    usePlayer.setState({ isPlaying: false, isConnecting: false });
  };

  // The sender stays in step with the device, whoever changes it: a remote, the Google Home
  // app, another sender (design_checklist/sender).
  controller.addEventListener(cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED, () => {
    if (!remotePlayer.isConnected) return;
    usePlayer.setState({
      isPlaying: remotePlayer.playerState === chrome.cast.media.PlayerState.PLAYING,
      isConnecting: remotePlayer.playerState === chrome.cast.media.PlayerState.BUFFERING,
    });
  });
  controller.addEventListener(cast.framework.RemotePlayerEventType.VOLUME_LEVEL_CHANGED, () => {
    if (remotePlayer.isConnected) usePlayer.setState({ volume: remotePlayer.volumeLevel });
  });
  controller.addEventListener(cast.framework.RemotePlayerEventType.IS_MUTED_CHANGED, () => {
    if (remotePlayer.isConnected) usePlayer.setState({ isMuted: remotePlayer.isMuted });
  });
  controller.addEventListener(cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED, () => {
    if (!remotePlayer.isConnected) disconnect();
  });

  context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
    const { SESSION_STARTED, SESSION_RESUMED, SESSION_START_FAILED, SESSION_ENDED } =
      cast.framework.SessionState;
    const session = context.getCurrentSession();
    if (event.sessionState === SESSION_STARTED || event.sessionState === SESSION_RESUMED) {
      if (!session) return;
      const started = event.sessionState === SESSION_STARTED;
      // The browser falls silent before the device takes over: one antenna at a time.
      usePlayer.getState().stop();
      setRemotePlayback({
        play: () => load(session),
        stop: () => controller.stop(),
        setVolume: (value) => {
          // Only the listener's own changes reach the device (web_sender/advanced).
          remotePlayer.volumeLevel = value;
          controller.setVolumeLevel();
        },
      });
      set({ deviceName: session.getCastDevice().friendlyName });
      if (started) usePlayer.getState().toggle();
    } else if (event.sessionState === SESSION_START_FAILED) {
      castFailed();
    } else if (event.sessionState === SESSION_ENDED) {
      disconnect();
    }
  });
}

export const useCastStore = create<CastStore>((set) => ({
  supported: false,
  available: false,
  connecting: false,
  deviceName: null,
  initialize: () => {
    if (initialized) return;
    initialized = true;
    void loadCastSdk().then((isAvailable) => {
      if (!isAvailable) return;
      set({ supported: true });
      start(set);
    });
  },
  openPicker: () => {
    // Connected, Chrome shows its own dialog with the device and Stop casting (cast-dialog).
    cast.framework.CastContext.getInstance()
      .requestSession()
      .catch((code: unknown) => {
        if (code !== chrome.cast.ErrorCode.CANCEL) castFailed();
      });
  },
}));
