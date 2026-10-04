// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useHeroListenVisible } from '../home/listen';
import ArtistPage from './ArtistPage';

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/artist/:id/:slug?" element={<ArtistPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ArtistPage', () => {
  it('loads the profile of the id in the url', async () => {
    open('/artist/a-1/hania-rani');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hania Rani' })
    ).toBeInTheDocument();
    // Set by an effect after the heading renders.
    await waitFor(() => expect(document.title).toBe('Hania Rani · AubeSonore'));
  });

  it('shows the not-found state for an id the API does not know', async () => {
    open('/artist/nope');

    expect(
      await screen.findByRole('heading', { name: 'Artiste introuvable.' })
    ).toBeInTheDocument();
  });

  it('shows the not-found state for an id the API rejects as malformed', async () => {
    open('/artist/malformed');

    expect(
      await screen.findByRole('heading', { name: 'Artiste introuvable.' })
    ).toBeInTheDocument();
  });

  it('shows the player bar, since no hero carries the listen button here', () => {
    useHeroListenVisible.setState({ visible: true });

    open('/artist/a-1');

    expect(useHeroListenVisible.getState().visible).toBe(false);
  });
});
