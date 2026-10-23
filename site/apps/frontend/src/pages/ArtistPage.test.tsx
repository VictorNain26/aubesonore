// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useHeroListenVisible } from '../home/listen';
import {
  ARTIST_PAGE_DATA_ID,
  artistLoader,
  readArtistPageData,
  seedArtistPage,
} from '../lib/artistPageData';
import { ArtistPage } from './ArtistPage';
import { PAGE_TEST_TIMEOUT, settle } from '../mocks/settle';

/** The page at `path`, through its route and its loader, as the site serves it (routes.tsx). */
function open(path: string) {
  const router = createMemoryRouter(
    [{ path: '/artiste/:slug', Component: ArtistPage, loader: artistLoader }],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('ArtistPage', { timeout: PAGE_TEST_TIMEOUT }, () => {
  it('loads the profile of the slug in the url', async () => {
    await settle(open('/artiste/hania-rani'));

    expect(screen.getByRole('heading', { level: 1, name: 'Hania Rani' })).toBeInTheDocument();
    // Set by an effect after the heading renders: what the server's <title> says (artistPageName).
    await waitFor(() => expect(document.title).toBe('Hania Rani (artiste, Pologne) · AubeSonore'));
  });

  it('is drawn once its data has come, content and footer together', async () => {
    // An artist no earlier test opened: a page seen before comes back at once.
    const router = open('/artiste/nils-frahm');

    // Nothing of the page before its loader answers: no footer pushed down by what comes after.
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    await settle(router);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('draws a server-rendered page from the data it embeds, asking nothing', async () => {
    server.use(http.get('*/api/artist/page/:slug', () => HttpResponse.error()));
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
        images: [],
        facts: null,
        summary: null,
        links: [],
      },
      musilogy: null,
    });
    document.body.append(script);
    const data = readArtistPageData(document);
    script.remove();
    if (!data) throw new Error('no embedded data');
    seedArtistPage(data);

    await settle(open('/artiste/rendu-serveur'));

    expect(screen.getByRole('heading', { level: 1, name: 'Rendu Serveur' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('draws a page this tab already holds without asking for it again', async () => {
    server.use(http.get('*/api/artist/page/:slug', () => HttpResponse.error()));
    seedArtistPage({
      locale: 'fr',
      profile: {
        id: 'a10',
        name: 'Déjà Là',
        slug: 'deja-la',
        mbid: null,
        played: true,
        images: [],
        facts: null,
        summary: null,
        links: [],
      },
      musilogy: null,
    });

    await settle(open('/artiste/deja-la'));

    expect(screen.getByRole('heading', { level: 1, name: 'Déjà Là' })).toBeInTheDocument();
  });

  it('shows the not-found state for a slug the API does not know, with the way back', async () => {
    await settle(open('/artiste/nope'));

    expect(screen.getByRole('heading', { name: 'Artiste introuvable.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revenir au direct' })).toHaveAttribute('href', '/');
    await waitFor(() => expect(document.title).toBe('Page introuvable · AubeSonore'));
  });

  it('shows the not-found state for a slug the API rejects as malformed', async () => {
    await settle(open('/artiste/malformed'));

    expect(screen.getByRole('heading', { name: 'Artiste introuvable.' })).toBeInTheDocument();
  });

  it('shows the player bar, since no hero carries the listen button here', async () => {
    useHeroListenVisible.setState({ visible: true });

    await settle(open('/artiste/hania-rani'));

    await waitFor(() => expect(useHeroListenVisible.getState().visible).toBe(false));
  });
});
