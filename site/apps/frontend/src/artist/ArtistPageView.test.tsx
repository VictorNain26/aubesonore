// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { MusilogyArtist } from '@aubesonore/shared-types/client';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { makeArtistProfile } from '../mocks/handlers';
import {
  ArtistPageView,
  factsLine,
  portraitSentence,
  type ArtistPageState,
} from './ArtistPageView';

type Kept = NonNullable<Parameters<typeof ArtistPageView>[0]['kept']>;

function show(state: ArtistPageState, kept: Kept = []) {
  return render(<ArtistPageView state={state} kept={kept} />, { wrapper: MemoryRouter });
}

const MUSILOGY: MusilogyArtist = {
  card: {
    mbid: '00000000-0000-4000-8000-000000000001',
    name: 'Hania Rani',
    disambiguation: null,
    y0: 2015,
    played: { id: 'a-1', slug: 'hania-rani' },
    type: 'Person',
    y0Source: 'declared',
    yEnd: null,
    yEndSource: null,
    ended: false,
    genres: [],
  },
  neighbours: {
    before: [
      {
        mbid: '00000000-0000-4000-8000-000000000002',
        name: 'Nils Frahm',
        disambiguation: null,
        y0: 2005,
        played: null,
        yEnd: null,
        score: 900,
      },
    ],
    during: [],
    after: [],
    undated: [],
  },
  influences: null,
  releases: [],
  bands: { members: [], groups: [] },
  memberProjects: [],
  otherNames: [],
};

const SUMMARY = {
  text: 'Hania Rani est une pianiste et compositrice polonaise.',
  lang: 'fr' as const,
  url: 'https://fr.wikipedia.org/wiki/Hania_Rani',
};

describe('ArtistPageView', () => {
  it('says who the artist is', () => {
    show({ status: 'ready', profile: makeArtistProfile({ summary: SUMMARY }) });

    expect(screen.getByRole('heading', { level: 1, name: 'Hania Rani' })).toBeInTheDocument();
    expect(screen.getByText('Artiste · Pologne')).toBeInTheDocument();
  });

  it('shows the way walked to the artist, each earlier step a link back', () => {
    render(
      <ArtistPageView
        state={{ status: 'ready', profile: makeArtistProfile() }}
        trail={[
          { path: '/artiste/stereolab', name: 'Stereolab' },
          { path: '/artiste/hania-rani', name: 'Hania Rani' },
        ]}
      />,
      { wrapper: MemoryRouter }
    );

    const trail = screen.getByRole('navigation', { name: 'Votre parcours' });
    expect(within(trail).getByRole('link', { name: 'Stereolab' })).toHaveAttribute(
      'href',
      '/artiste/stereolab'
    );
    expect(within(trail).getByText('Hania Rani')).toHaveAttribute('aria-current', 'page');
  });

  it('shows no trail for the first artist of a walk', () => {
    render(
      <ArtistPageView
        state={{ status: 'ready', profile: makeArtistProfile() }}
        trail={[{ path: '/artiste/hania-rani', name: 'Hania Rani' }]}
      />,
      { wrapper: MemoryRouter }
    );

    expect(screen.queryByRole('navigation', { name: 'Votre parcours' })).not.toBeInTheDocument();
  });

  it("carries Musilogy's sections that hold something, on the same page", () => {
    render(
      <ArtistPageView
        state={{ status: 'ready', profile: makeArtistProfile() }}
        musilogy={MUSILOGY}
        thisYear={2026}
      />,
      { wrapper: MemoryRouter }
    );

    expect(screen.getByRole('heading', { name: 'Artistes proches' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Avant' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Après' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Influences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explorer dans Musilogy' })).not.toBeInTheDocument();
  });

  it('orders the page as the vision does: listen, records, kept, then where to go next', () => {
    const record = (n: number, type: 'album' | 'ep') => ({
      mbid: `rg-${n}`,
      title: `Record ${n}`,
      type,
      soundtrack: false,
      remix: false,
      year: 2015 + n,
    });
    render(
      <ArtistPageView
        state={{
          status: 'ready',
          profile: makeArtistProfile({
            links: [{ platform: 'bandcamp', url: 'https://haniarani.bandcamp.com/' }],
          }),
        }}
        kept={[{ id: 'k-1', title: 'Glass', createdAt: '2026-09-12T08:00:00.000Z' }]}
        musilogy={{ ...MUSILOGY, releases: [record(1, 'album'), record(2, 'ep')] }}
        thisYear={2026}
      />,
      { wrapper: MemoryRouter }
    );

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Écouter ailleurs',
      'Albums et EP',
      'Vos titres gardés',
      'Artistes proches',
    ]);
    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('#'))
        .map((link) => link.textContent)
    ).toEqual(['Écouter ailleurs', 'Albums et EP', 'Vos titres gardés', 'Artistes proches']);
    expect(screen.getByText('Record 1')).toBeInTheDocument();
  });

  it('says the facts in a sentence when Wikipedia has no article', () => {
    show({ status: 'ready', profile: makeArtistProfile() });

    expect(screen.getByText('Artiste originaire de Pologne.')).toBeInTheDocument();
    expect(screen.queryByText('MusicBrainz')).not.toBeInTheDocument();
    expect(screen.queryByText('Artiste · Pologne')).not.toBeInTheDocument();
  });

  it('shows what the listener kept of the artist', () => {
    show({ status: 'ready', profile: makeArtistProfile() }, [
      { id: 'k-1', title: 'Glass', createdAt: '2026-09-12T08:00:00.000Z' },
    ]);

    expect(screen.getByRole('heading', { name: 'Vos titres gardés' })).toBeInTheDocument();
    expect(screen.getByText('Glass')).toBeInTheDocument();
  });

  it('quotes the Wikipedia summary and links its article, naming no licence on the page', () => {
    show({ status: 'ready', profile: makeArtistProfile({ summary: SUMMARY }) });

    expect(screen.getByRole('blockquote')).toHaveTextContent(SUMMARY.text);
    expect(screen.getByRole('blockquote')).toHaveAttribute('lang', 'fr');
    expect(screen.getByRole('link', { name: 'Lire la suite sur Wikipédia' })).toHaveAttribute(
      'href',
      SUMMARY.url
    );
    expect(screen.queryByText(/CC BY/)).not.toBeInTheDocument();
  });

  it('says when the summary is in the other language', () => {
    show({
      status: 'ready',
      profile: makeArtistProfile({ summary: { ...SUMMARY, lang: 'en' } }),
    });

    expect(screen.getByRole('blockquote')).toHaveAttribute('lang', 'en');
    expect(
      screen.getByRole('link', { name: 'Lire la suite sur Wikipédia, en anglais' })
    ).toBeInTheDocument();
  });

  it('shows nothing a source could not fill', () => {
    show({ status: 'ready', profile: makeArtistProfile({ facts: null }) });

    expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
    expect(screen.queryByText(/Artiste ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Écouter ailleurs' })).not.toBeInTheDocument();
  });

  it('opens outside links in a new tab, named by platform', () => {
    show({
      status: 'ready',
      profile: makeArtistProfile({
        links: [
          { platform: 'deezer', url: 'https://www.deezer.com/artist/1' },
          { platform: 'official', url: 'https://haniarani.com/' },
        ],
      }),
    });

    expect(screen.getByRole('link', { name: 'Deezer' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Site officiel' })).toHaveAttribute(
      'href',
      'https://haniarani.com/'
    );
  });

  it('says the artist is not found, or that the page failed', () => {
    const { rerender } = show({ status: 'missing' });
    expect(screen.getByRole('heading', { name: 'Artiste introuvable.' })).toBeInTheDocument();

    rerender(<ArtistPageView state={{ status: 'error' }} />);
    expect(screen.getByRole('heading', { name: 'Page indisponible.' })).toBeInTheDocument();
  });

  it('leads back to the live from the header', () => {
    render(
      <MemoryRouter initialEntries={['/artist/a-1/hania-rani']}>
        <ArtistPageView state={{ status: 'loading' }} kept={[]} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /^AubeSonore/ })).toHaveAttribute('href', '/');
  });
});

describe('factsLine', () => {
  const group = {
    kind: 'group' as const,
    place: 'Paris',
    country: 'FR',
    formed: 1993,
    ended: 2021,
    active: false,
  };

  it('names a group, where and when it played', () => {
    expect(factsLine(group)).toBe('Groupe · Paris, France · de 1993 à 2021');
    expect(factsLine({ ...group, ended: null, active: true })).toBe(
      'Groupe · Paris, France · depuis 1993'
    );
  });

  it('never says "since" of a group that ended on an unknown date', () => {
    expect(factsLine({ ...group, ended: null })).toBe('Groupe · Paris, France · formé en 1993');
  });

  it('says nothing when MusicBrainz states nothing', () => {
    expect(
      factsLine({
        kind: null,
        place: null,
        country: null,
        formed: null,
        ended: null,
        active: false,
      })
    ).toBeNull();
  });
});

describe('portraitSentence', () => {
  const group = {
    kind: 'group' as const,
    place: 'Paris',
    country: 'FR',
    formed: 1993,
    ended: 2021,
    active: false,
  };

  it('says where and when a group formed, and until when it played', () => {
    expect(portraitSentence(group)).toBe(
      "Groupe originaire de Paris, France, formé en 1993. Actif jusqu'en 2021."
    );
    expect(portraitSentence({ ...group, ended: null, active: true })).toBe(
      'Groupe originaire de Paris, France, formé en 1993. Toujours en activité.'
    );
  });

  it('says what it knows, and nothing when it knows nothing', () => {
    expect(portraitSentence({ ...group, place: null, country: null, ended: null })).toBe(
      'Groupe formé en 1993.'
    );
    expect(
      portraitSentence({
        kind: null,
        place: null,
        country: null,
        formed: null,
        ended: null,
        active: false,
      })
    ).toBeNull();
  });
});
