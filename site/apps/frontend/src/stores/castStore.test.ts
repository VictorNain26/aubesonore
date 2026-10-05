// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/cast/chromecast', () => ({
  RECEIVER_APP_ID: 'E913507F',
  loadCastSdk: () => Promise.resolve(true),
}));

const toastError = vi.fn<(message: string) => void>();
vi.mock('../lib/appToast', () => ({ toastError: (message: string) => toastError(message) }));

type Listener = (event: { sessionState?: string }) => void;

// A stand-in for the Cast sender framework, with only what the store uses.
function fakeCast() {
  const contextListeners = new Map<string, Listener[]>();
  const playerListeners = new Map<string, Listener[]>();
  let castState = 'NO_DEVICES_AVAILABLE';
  let requestSession = () => Promise.resolve<unknown>(undefined);
  const session = {
    getCastDevice: () => ({ friendlyName: 'TV' }),
    loadMedia: vi.fn((_request: unknown) => Promise.resolve()),
  };
  const remotePlayer = {
    isConnected: true,
    playerState: null as string | null,
    volumeLevel: 1,
    isMuted: false,
  };
  const controller = { stop: vi.fn(), setVolumeLevel: vi.fn() };
  const context = {
    setOptions: vi.fn(),
    getCastState: () => castState,
    getCurrentSession: () => session,
    requestSession: () => requestSession(),
    addEventListener: (type: string, listener: Listener) =>
      contextListeners.set(type, [...(contextListeners.get(type) ?? []), listener]),
  };
  const emit = (map: Map<string, Listener[]>, type: string, event = {}) =>
    map.get(type)?.forEach((listener) => listener(event));

  Object.assign(globalThis, {
    cast: {
      framework: {
        CastContext: { getInstance: () => context },
        CastState: { NO_DEVICES_AVAILABLE: 'NO_DEVICES_AVAILABLE', CONNECTING: 'CONNECTING' },
        CastContextEventType: {
          CAST_STATE_CHANGED: 'caststatechanged',
          SESSION_STATE_CHANGED: 'sessionstatechanged',
        },
        SessionState: {
          SESSION_STARTED: 'SESSION_STARTED',
          SESSION_RESUMED: 'SESSION_RESUMED',
          SESSION_START_FAILED: 'SESSION_START_FAILED',
          SESSION_ENDED: 'SESSION_ENDED',
        },
        RemotePlayer: function RemotePlayer() {
          return remotePlayer;
        },
        RemotePlayerController: function RemotePlayerController() {
          return {
            ...controller,
            addEventListener: (type: string, listener: Listener) =>
              playerListeners.set(type, [...(playerListeners.get(type) ?? []), listener]),
          };
        },
        RemotePlayerEventType: {
          PLAYER_STATE_CHANGED: 'playerStateChanged',
          VOLUME_LEVEL_CHANGED: 'volumeLevelChanged',
          IS_MUTED_CHANGED: 'isMutedChanged',
          IS_CONNECTED_CHANGED: 'isConnectedChanged',
        },
      },
    },
    chrome: {
      cast: {
        AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' },
        ErrorCode: { CANCEL: 'cancel' },
        Image: class {
          constructor(public url: string) {}
        },
        media: {
          MusicTrackMediaMetadata: class {},
          MediaInfo: class {
            streamType = '';
            duration: number | null = null;
            constructor(
              public contentId: string,
              public contentType: string
            ) {}
          },
          StreamType: { LIVE: 'LIVE' },
          LoadRequest: class {
            autoplay = false;
            constructor(public media: unknown) {}
          },
          PlayerState: { PLAYING: 'PLAYING', BUFFERING: 'BUFFERING', IDLE: 'IDLE' },
        },
      },
    },
  });

  return {
    context,
    session,
    remotePlayer,
    controller,
    castStateIs: (state: string) => {
      castState = state;
      emit(contextListeners, 'caststatechanged');
    },
    sessionChanges: (sessionState: string) =>
      emit(contextListeners, 'sessionstatechanged', { sessionState }),
    playerEvent: (type: string) => emit(playerListeners, type),
    // The SDK rejects with the error code itself, a string (chrome.cast.ErrorCode), not an Error.
    requestSessionRejects: (code: string) => {
      requestSession = () =>
        Promise.resolve({
          then: (_resolve: unknown, reject: (reason: string) => void) => reject(code),
        });
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  toastError.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setUp() {
  const fake = fakeCast();
  const { useCastStore } = await import('./castStore');
  const { usePlayer } = await import('../lib/player');
  useCastStore.getState().initialize();
  await vi.waitFor(() => expect(fake.context.setOptions).toHaveBeenCalled());
  return { fake, useCastStore, usePlayer };
}

describe('castStore', () => {
  it("sets the context on AubeSonore's receiver and follows the cast state", async () => {
    const { fake, useCastStore } = await setUp();

    expect(fake.context.setOptions).toHaveBeenCalledWith({
      receiverApplicationId: 'E913507F',
      autoJoinPolicy: 'origin_scoped',
    });
    expect(useCastStore.getState()).toMatchObject({ available: false, connecting: false });
    fake.castStateIs('NOT_CONNECTED');
    expect(useCastStore.getState()).toMatchObject({ available: true, connecting: false });
    fake.castStateIs('CONNECTING');
    expect(useCastStore.getState()).toMatchObject({ available: true, connecting: true });
  });

  it('hands the antenna to the device: the browser stops, the device plays the live', async () => {
    const { fake, useCastStore, usePlayer } = await setUp();
    usePlayer.setState({ isPlaying: true });

    fake.sessionChanges('SESSION_STARTED');

    expect(useCastStore.getState().deviceName).toBe('TV');
    expect(fake.session.loadMedia).toHaveBeenCalledOnce();
    const request = fake.session.loadMedia.mock.calls[0]?.[0] as {
      autoplay: boolean;
      customData?: unknown;
      media: { contentId: string; contentType: string; streamType: string; duration: number };
    };
    expect(request.autoplay).toBe(true);
    expect(request.customData).toBeUndefined();
    expect(request.media).toMatchObject({
      contentId: 'https://radio.aubesonore.fr/listen/aubesonore/radio.mp3',
      contentType: 'audio/mpeg',
      streamType: 'LIVE',
      duration: -1,
    });

    fake.remotePlayer.playerState = 'PLAYING';
    fake.playerEvent('playerStateChanged');
    expect(usePlayer.getState()).toMatchObject({ isPlaying: true, isConnecting: false });
  });

  it('lets the play button and the volume act on the device while casting', async () => {
    const { fake, usePlayer } = await setUp();
    fake.sessionChanges('SESSION_STARTED');
    fake.remotePlayer.playerState = 'PLAYING';
    fake.playerEvent('playerStateChanged');

    usePlayer.getState().toggle();
    expect(fake.controller.stop).toHaveBeenCalledOnce();
    expect(usePlayer.getState().isPlaying).toBe(false);

    usePlayer.getState().setVolume(0.4);
    expect(fake.remotePlayer.volumeLevel).toBe(0.4);
    expect(fake.controller.setVolumeLevel).toHaveBeenCalledOnce();
  });

  it('shows the volume and mute set on the device elsewhere, without sending them back', async () => {
    const { fake, usePlayer } = await setUp();
    fake.sessionChanges('SESSION_STARTED');

    fake.remotePlayer.volumeLevel = 0.3;
    fake.playerEvent('volumeLevelChanged');
    fake.remotePlayer.isMuted = true;
    fake.playerEvent('isMutedChanged');

    expect(usePlayer.getState()).toMatchObject({ volume: 0.3, isMuted: true });
    expect(fake.controller.setVolumeLevel).not.toHaveBeenCalled();
  });

  it('joins a session resumed after a reload without loading the stream again', async () => {
    const { fake, useCastStore } = await setUp();

    fake.sessionChanges('SESSION_RESUMED');

    expect(useCastStore.getState().deviceName).toBe('TV');
    expect(fake.session.loadMedia).not.toHaveBeenCalled();
  });

  it('says so when the device cannot start the session', async () => {
    const { fake } = await setUp();

    fake.sessionChanges('SESSION_START_FAILED');

    expect(toastError).toHaveBeenCalledOnce();
  });

  it('stays quiet when the listener closes the picker, but says any other refusal', async () => {
    const { fake, useCastStore } = await setUp();

    fake.requestSessionRejects('cancel');
    useCastStore.getState().openPicker();
    await Promise.resolve();
    expect(toastError).not.toHaveBeenCalled();

    fake.requestSessionRejects('session_error');
    useCastStore.getState().openPicker();
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledOnce());
  });

  it('gives the antenna back when the session ends or the device drops', async () => {
    const { fake, useCastStore, usePlayer } = await setUp();
    fake.sessionChanges('SESSION_STARTED');
    fake.remotePlayer.isConnected = false;

    fake.playerEvent('isConnectedChanged');

    expect(useCastStore.getState().deviceName).toBeNull();
    expect(usePlayer.getState()).toMatchObject({ isPlaying: false, isConnecting: false });
    usePlayer.getState().setVolume(0.2);
    expect(fake.controller.setVolumeLevel).not.toHaveBeenCalled();
  });
});
