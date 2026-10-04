// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { useLikeAction } from './useLikeAction';
import { useLikedTracksStore } from '../../stores/likedTracksStore';
import { useAuthStore } from '../../stores/authStore';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockedToastSuccess = vi.mocked(toast.success);

describe('useLikeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: true });
    useLikedTracksStore.setState({ tracks: [], likingTrackId: null, error: null });
  });

  it('offers a "Découvrir" toast action leading to the artist page after a like', async () => {
    const { result } = renderHook(() => ({ like: useLikeAction(), location: useLocation() }), {
      wrapper: MemoryRouter,
    });

    await act(() => result.current.like.toggleLike('Test Track', 'Test Artist'));

    await waitFor(() => expect(mockedToastSuccess).toHaveBeenCalled());
    const [message, options] = mockedToastSuccess.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe('Gardé.');
    expect(options.action.label).toBe('Découvrir Test Artist');

    act(() => options.action.onClick());
    expect(result.current.location.pathname).toBe('/artiste/test-artist');
  });

  it('shows a plain toast when the artist has no page', async () => {
    const { result } = renderHook(() => useLikeAction(), { wrapper: MemoryRouter });

    await act(() => result.current.toggleLike('Test Track', 'Unknown'));

    await waitFor(() => expect(mockedToastSuccess).toHaveBeenCalled());
    expect(mockedToastSuccess).toHaveBeenCalledWith('Gardé.');
  });
});
