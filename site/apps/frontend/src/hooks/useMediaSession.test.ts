// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { mediaArtwork, useMediaSession } from './useMediaSession';
import { usePlayer } from '../lib/player';

describe('mediaArtwork', () => {
  it("offers the lock screen the station's cover at each size the store keeps, as WebP", () => {
    expect(
      mediaArtwork('https://radio.aubesonore.fr/api/station/aubesonore/art/abc-1.jpg')
    ).toEqual(
      [96, 192, 384, 768].map((w) => ({
        src: `/covers/station/abc-1/${w}.webp`,
        sizes: `${w}x${w}`,
        type: 'image/webp',
      }))
    );
  });

  it('gives a cover no host resizes as it is, without claiming a size or a type', () => {
    expect(mediaArtwork('https://example.com/cover.jpg')).toEqual([
      { src: 'https://example.com/cover.jpg' },
    ]);
  });
});

describe('useMediaSession', () => {
  // The browser's Media Session, as the lock screen and the media keys read it.
  type Handler = (() => void) | null;
  let session: {
    metadata: unknown;
    playbackState: string;
    handlers: Map<string, Handler>;
    setActionHandler: (action: string, handler: Handler) => void;
  };
  const play = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn();

  beforeEach(() => {
    session = {
      metadata: undefined,
      playbackState: 'none',
      handlers: new Map(),
      setActionHandler: (action, handler) => session.handlers.set(action, handler),
    };
    // jsdom has no Media Session: it is added to the real navigator for this test alone.
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(init: object) {
          Object.assign(this, init);
        }
      }
    );
    usePlayer.setState({ play, stop });
  });

  const player = usePlayer.getState();
  afterEach(() => {
    // Unmounted first: the hook lets go of its keys on the session it was given.
    cleanup();
    Reflect.deleteProperty(navigator, 'mediaSession');
    usePlayer.setState({ play: player.play, stop: player.stop });
  });

  const track: Parameters<typeof useMediaSession>[0] = {
    title: 'Mimoun',
    artist: 'Mickey 3D',
    album: null,
    artworkUrl: 'https://example.com/cover.jpg',
  };

  it('names the track on the lock screen, and clears it when nothing is known', () => {
    const { rerender } = renderHook(({ data }) => useMediaSession(data, false), {
      initialProps: { data: track },
    });
    expect(session.metadata).toEqual({
      title: 'Mimoun',
      artist: 'Mickey 3D',
      album: '',
      artwork: [{ src: 'https://example.com/cover.jpg' }],
    });

    rerender({ data: { ...track, title: undefined } });
    expect(session.metadata).toBeNull();
  });

  it('plays from the play key and stops from pause and stop: a live has no pause', () => {
    renderHook(() => useMediaSession(track, true));

    session.handlers.get('play')?.();
    expect(play).toHaveBeenCalledOnce();
    session.handlers.get('pause')?.();
    session.handlers.get('stop')?.();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('lets go of the keys once unmounted', () => {
    const { unmount } = renderHook(() => useMediaSession(track, true));
    unmount();
    expect([...session.handlers.values()]).toEqual([null, null, null]);
  });

  it('tells the system whether the live plays', () => {
    const { rerender } = renderHook(({ playing }) => useMediaSession(track, playing), {
      initialProps: { playing: true },
    });
    expect(session.playbackState).toBe('playing');
    rerender({ playing: false });
    expect(session.playbackState).toBe('paused');
  });
});
