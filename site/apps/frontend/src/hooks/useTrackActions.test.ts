// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const toggleLike = vi.fn(() => Promise.resolve());
vi.mock('./useLikeAction', () => ({
  useLikeAction: () => ({ likingTrackId: null, toggleLike }),
}));
const shareTrackWithToast = vi.fn((_track: unknown) => Promise.resolve());
vi.mock('../lib/shareTrack', () => ({
  shareTrackWithToast: (track: unknown) => shareTrackWithToast(track),
  getRadioShareUrl: (title: string, artist: string) => `https://aubesonore.fr/#${title}-${artist}`,
}));

import { useNowPlayingStore } from '../lib/azuracast';
import { useTrackActions } from './useTrackActions';

function onAir(title: string, artist: string) {
  useNowPlayingStore.setState({
    data: { now_playing: { song: { title, artist } } },
  } as unknown as Parameters<typeof useNowPlayingStore.setState>[0]);
}

describe('useTrackActions', () => {
  beforeEach(() => {
    toggleLike.mockClear();
    shareTrackWithToast.mockClear();
  });

  it('keeps and shares the track on air when it is given none', () => {
    onAir('Mimoun', 'Mickey 3D');
    const { result } = renderHook(() => useTrackActions());
    result.current.handleToggleLike();
    result.current.handleShare();
    expect(toggleLike).toHaveBeenCalledWith('Mimoun', 'Mickey 3D');
    expect(shareTrackWithToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mimoun', artist: 'Mickey 3D' })
    );
  });

  it('keeps and shares the track it shows, not the next one already on air', () => {
    // The bar still shows the last track while the next one's cover loads.
    onAir('Really Doe', 'Danny Brown');
    const { result } = renderHook(() => useTrackActions({ title: 'Mimoun', artist: 'Mickey 3D' }));
    expect(result.current.title).toBe('Mimoun');
    result.current.handleToggleLike();
    result.current.handleShare();
    expect(toggleLike).toHaveBeenCalledWith('Mimoun', 'Mickey 3D');
    expect(shareTrackWithToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mimoun', artist: 'Mickey 3D' })
    );
  });
});
