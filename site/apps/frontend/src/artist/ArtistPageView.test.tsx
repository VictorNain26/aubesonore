// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const SUMMARY = {
  text: 'Hania Rani est une pianiste et compositrice polonaise.',
  lang: 'fr' as const,
  url: 'https://fr.wikipedia.org/wiki/Hania_Rani',
};

describe('ArtistPageView', () => {
  it('says who the artist is, then what the antenna played', () => {
    show({ status: 'ready', profile: makeArtistProfile({ summary: SUMMARY }) });

    expect(screen.getByRole('heading', { level: 1, name: 'Hania Rani' })).toBeInTheDocument();
    expect(screen.getByText('Artiste · Pologne')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Ses titres à l'antenne" })).toBeInTheDocument();
    expect(screen.getByText('F Major')).toBeInTheDocument();
  });

  it('says the facts in a sentence when Wikipedia has no article', () => {
    show({ status: 'ready', profile: makeArtistProfile() });

    expect(screen.getByText('Artiste originaire de Pologne.')).toBeInTheDocument();
    expect(screen.queryByText('MusicBrainz')).not.toBeInTheDocument();
    expect(screen.queryByText('Artiste · Pologne')).not.toBeInTheDocument();
  });

  it('lists each title once: how often it played, then keep it or hear it on Deezer', async () => {
    const onToggle = vi.fn();
    const profile = makeArtistProfile({
      playedOnRadio: [
        {
          title: 'The Word',
          artist: 'Supergrass',
          plays: 3,
          lastPlayedAt: '2026-10-04T15:46:00.000Z',
          deezer: { link: 'https://www.deezer.com/track/1', cover: null },
        },
        {
          title: 'The Bird is on Fire',
          artist: 'Supergrass',
          plays: 1,
          lastPlayedAt: '2026-10-03T19:21:00.000Z',
          deezer: null,
        },
      ],
    });
    render(
      <ArtistPageView
        state={{ status: 'ready', profile }}
        keep={{ isKept: () => false, isKeeping: () => false, onToggle }}
      />,
      { wrapper: MemoryRouter }
    );

    const [word, bird] = screen.getAllByRole('listitem');
    expect(word).toHaveTextContent('The Word3 passages · dernier le 4 oct.');
    expect(bird).toHaveTextContent('The Bird is on FirePassé le 3 oct.');
    expect(screen.getByRole('link', { name: 'Écouter « The Word » sur Deezer' })).toHaveAttribute(
      'href',
      'https://www.deezer.com/track/1'
    );
    expect(
      screen.queryByRole('link', { name: 'Écouter « The Bird is on Fire » sur Deezer' })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Garder « The Word »' }));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ title: 'The Word' }));
  });

  it("shows what the listener kept of the artist instead of the antenna's plays", () => {
    show({ status: 'ready', profile: makeArtistProfile() }, [
      { id: 'k-1', title: 'Glass', createdAt: '2026-09-12T08:00:00.000Z' },
    ]);

    expect(screen.getByRole('heading', { name: 'Vos titres gardés' })).toBeInTheDocument();
    expect(screen.getByText('Glass')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: "Ses titres à l'antenne" })
    ).not.toBeInTheDocument();
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

  it('says so when no play is recorded yet', () => {
    show({ status: 'ready', profile: makeArtistProfile({ playedOnRadio: [] }) });

    expect(screen.getByText("Aucun passage enregistré pour l'instant.")).toBeInTheDocument();
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

    expect(screen.getByRole('link', { name: 'Le direct' })).toHaveAttribute('href', '/');
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
