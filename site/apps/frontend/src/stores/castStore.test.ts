// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/cast/chromecast', () => ({
  RECEIVER_APP_ID: 'E913507F',
  loadCastSdk: () => Promise.resolve(true),
}));

type Listener = (event: { sessionState?: string }) => void;

// A stand-in for the Cast sender framework, with only what the store uses.
function fakeCast() {
  const contextListeners = new Map<string, Listener[]>();
  const playerListeners = new Map<string, Listener[]>();
  let castState = 'NO_DEVICES_AVAILABLE';
  const session = {
    getCastDevice: () => ({ friendlyName: 'TV' }),
    loadMedia: vi.fn((_request: unknown) => Promise.resolve()),
  };
  const remotePlayer = { isConnected: true, playerState: null as string | null, volumeLevel: 1 };
  const controller = { stop: vi.fn(), setVolumeLevel: vi.fn() };
  const context = {
    setOptions: vi.fn(),
    getCastState: () => castState,
    getCurrentSession: () => session,
    requestSession: vi.fn(() => Promise.resolve()),
    addEventListener: (type: string, listener: Listener) =>
      contextListeners.set(type, [...(contextListeners.get(type) ?? []), listener]),
  };
  const emit = (map: Map<string, Listener[]>, type: string, event = {}) =>
    map.get(type)?.forEach((listener) => listener(event));

  Object.assign(globalThis, {
    cast: {
      framework: {
        CastContext: { getInstance: () => context },
        CastState: { NO_DEVICES_AVAILABLE: 'NO_DEVICES_AVAILABLE' },
        CastContextEventType: {
          CAST_STATE_CHANGED: 'caststatechanged',
          SESSION_STATE_CHANGED: 'sessionstatechanged',
        },
        SessionState: {
          SESSION_STARTED: 'SESSION_STARTED',
          SESSION_RESUMED: 'SESSION_RESUMED',
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
        RemotePlayerEventType: { PLAYER_STATE_CHANGED: 'playerStateChanged' },
      },
    },
    chrome: {
      cast: {
        AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' },
        Image: class {
          constructor(public url: string) {}
        },
        media: {
          MusicTrackMediaMetadata: class {},
          MediaInfo: class {
            streamType = '';
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
    devicesAppear: () => {
      castState = 'NOT_CONNECTED';
      emit(contextListeners, 'caststatechanged');
    },
    sessionChanges: (sessionState: string) =>
      emit(contextListeners, 'sessionstatechanged', { sessionState }),
    playerState: (state: string) => {
      remotePlayer.playerState = state;
      emit(playerListeners, 'playerStateChanged');
    },
  };
}

beforeEach(() => {
  vi.resetModules();
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
  it("sets the context on AubeSonore's receiver, and shows the button once a device is there", async () => {
    const { fake, useCastStore } = await setUp();

    expect(fake.context.setOptions).toHaveBeenCalledWith({
      receiverApplicationId: 'E913507F',
      autoJoinPolicy: 'origin_scoped',
    });
    expect(useCastStore.getState().available).toBe(false);
    fake.devicesAppear();
    expect(useCastStore.getState().available).toBe(true);
  });

  it('hands the antenna to the device: the browser stops, the device plays the live', async () => {
    const { fake, useCastStore, usePlayer } = await setUp();
    usePlayer.setState({ isPlaying: true });

    fake.sessionChanges('SESSION_STARTED');

    expect(useCastStore.getState().deviceName).toBe('TV');
    expect(fake.session.loadMedia).toHaveBeenCalledOnce();
    const request = fake.session.loadMedia.mock.calls[0]?.[0] as {
      autoplay: boolean;
      media: { contentId: string; contentType: string; streamType: string };
    };
    expect(request.autoplay).toBe(true);
    expect(request.media).toMatchObject({
      contentId: 'https://radio.aubesonore.fr/listen/aubesonore/radio.mp3',
      contentType: 'audio/mpeg',
      streamType: 'LIVE',
    });
    expect(usePlayer.getState().isConnecting).toBe(true);

    fake.playerState('PLAYING');
    expect(usePlayer.getState()).toMatchObject({ isPlaying: true, isConnecting: false });
  });

  it('lets the play button and the volume act on the device while casting', async () => {
    const { fake, usePlayer } = await setUp();
    fake.sessionChanges('SESSION_STARTED');
    fake.playerState('PLAYING');

    usePlayer.getState().toggle();
    expect(fake.controller.stop).toHaveBeenCalledOnce();
    expect(usePlayer.getState().isPlaying).toBe(false);

    usePlayer.getState().setVolume(0.4);
    expect(fake.remotePlayer.volumeLevel).toBe(0.4);
    expect(fake.controller.setVolumeLevel).toHaveBeenCalledOnce();
  });

  it('joins a session resumed after a reload without loading the stream again', async () => {
    const { fake, useCastStore } = await setUp();

    fake.sessionChanges('SESSION_RESUMED');

    expect(useCastStore.getState().deviceName).toBe('TV');
    expect(fake.session.loadMedia).not.toHaveBeenCalled();
  });

  it('gives the antenna back when the session ends', async () => {
    const { fake, useCastStore, usePlayer } = await setUp();
    fake.sessionChanges('SESSION_STARTED');
    fake.playerState('PLAYING');

    fake.sessionChanges('SESSION_ENDED');

    expect(useCastStore.getState().deviceName).toBeNull();
    expect(usePlayer.getState()).toMatchObject({ isPlaying: false, isConnecting: false });
    usePlayer.getState().setVolume(0.2);
    expect(fake.controller.setVolumeLevel).not.toHaveBeenCalled();
  });
});
