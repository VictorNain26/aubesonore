// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { NowPlaying } from '../lib/azuracast';
import { useNowPlayingStore } from '../lib/azuracast';
import { usePlayer } from '../lib/player';
import { usePageTitle } from '../hooks/usePageTitle';
import { PlayerSideEffects } from './PlayerSideEffects';

/** The track on air, as the polling store holds it. */
function onAir(title: string, artist: string): void {
  useNowPlayingStore.setState({
    data: { now_playing: { song: { title, artist, album: '', art: '' } } } as unknown as NowPlaying,
  });
}

function Page({ name }: { name: string }) {
  usePageTitle(name);
  return null;
}

afterEach(() => {
  usePlayer.setState({ isPlaying: false });
  useNowPlayingStore.setState({ data: null });
  document.title = '';
});

describe('the tab title', () => {
  it('names the track while it plays, then the page the listener is on', async () => {
    const router = createMemoryRouter(
      [
        { path: '/a', element: <Page name="Kraftwerk" /> },
        { path: '/b', element: <Page name="Neu!" /> },
      ],
      { initialEntries: ['/a'] }
    );
    render(
      <>
        <PlayerSideEffects />
        <RouterProvider router={router} />
      </>
    );
    expect(document.title).toBe('Kraftwerk · AubeSonore');

    act(() => {
      onAir('Autobahn', 'Kraftwerk');
      usePlayer.setState({ isPlaying: true });
    });
    expect(document.title).toBe('Autobahn, Kraftwerk · AubeSonore');

    // Another page, then another track, while it plays: the tab follows the track.
    await act(() => router.navigate('/b'));
    expect(document.title).toBe('Autobahn, Kraftwerk · AubeSonore');
    act(() => onAir('Hallogallo', 'Neu!'));
    expect(document.title).toBe('Hallogallo, Neu! · AubeSonore');

    // Stopped: the page the listener is on, not one left behind.
    act(() => usePlayer.setState({ isPlaying: false }));
    expect(document.title).toBe('Neu! · AubeSonore');
  });
});
