// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useHeroListenVisible } from '../home/listen';
import { ARTIST_PAGE_DATA_ID, readArtistPageData, seedArtistPage } from '../lib/artistPageData';
import ArtistPage from './ArtistPage';

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/artiste/:slug" element={<ArtistPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ArtistPage', () => {
  it('loads the profile of the slug in the url', async () => {
    open('/artiste/hania-rani');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hania Rani' })
    ).toBeInTheDocument();
    // Set by an effect after the heading renders.
    await waitFor(() => expect(document.title).toBe('Hania Rani · AubeSonore'));
  });

  it('keeps its footer out of view until its content has come', async () => {
    // An artist no earlier test opened: a page seen before comes back at once.
    open('/artiste/nils-frahm');

    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    await screen.findByRole('heading', { level: 1 });
    expect(await screen.findByRole('contentinfo')).toBeInTheDocument();
  });

  it('draws a server-rendered page from the data it embeds, before any request answers', () => {
    const script = document.createElement('script');
    script.type = 'application/json';
    script.id = ARTIST_PAGE_DATA_ID;
    script.textContent = JSON.stringify({
      locale: 'fr',
      profile: {
        id: 'a9',
        name: 'Rendu Serveur',
        slug: 'rendu-serveur',
        mbid: null,
        played: true,
        image: null,
        facts: null,
        summary: null,
        links: [],
        playedOnRadio: [],
      },
      musilogy: null,
    });
    document.body.append(script);
    const data = readArtistPageData(document);
    script.remove();
    if (!data) throw new Error('no embedded data');
    seedArtistPage(data);

    open('/artiste/rendu-serveur');

    expect(screen.getByRole('heading', { level: 1, name: 'Rendu Serveur' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('shows the not-found state for a slug the API does not know, with the way back', async () => {
    open('/artiste/nope');

    expect(
      await screen.findByRole('heading', { name: 'Artiste introuvable.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revenir au direct' })).toHaveAttribute('href', '/');
    await waitFor(() => expect(document.title).toBe('Page introuvable · AubeSonore'));
  });

  it('shows the not-found state for a slug the API rejects as malformed', async () => {
    open('/artiste/malformed');

    expect(
      await screen.findByRole('heading', { name: 'Artiste introuvable.' })
    ).toBeInTheDocument();
  });

  it('shows the player bar, since no hero carries the listen button here', () => {
    useHeroListenVisible.setState({ visible: true });

    open('/artiste/hania-rani');

    expect(useHeroListenVisible.getState().visible).toBe(false);
  });
});
