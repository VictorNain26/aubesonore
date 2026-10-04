// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { makeArtistProfile } from '../mocks/handlers';
import { ArtistPageView, factsLine, type ArtistPageState } from './ArtistPageView';

function show(state: ArtistPageState) {
  return render(<ArtistPageView state={state} />, { wrapper: MemoryRouter });
}

const SUMMARY = {
  text: 'Hania Rani est une pianiste et compositrice polonaise.',
  lang: 'fr' as const,
  url: 'https://fr.wikipedia.org/wiki/Hania_Rani',
};

describe('ArtistPageView', () => {
  it('says who the artist is, then what the antenna played', () => {
    show({ status: 'ready', profile: makeArtistProfile() });

    expect(screen.getByRole('heading', { level: 1, name: 'Hania Rani' })).toBeInTheDocument();
    expect(screen.getByText('Artiste · Pologne')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Passé sur AubeSonore' })).toBeInTheDocument();
    expect(screen.getByText('F Major')).toBeInTheDocument();
  });

  it('quotes the Wikipedia summary with its source and licence', () => {
    show({ status: 'ready', profile: makeArtistProfile({ summary: SUMMARY }) });

    expect(screen.getByRole('blockquote')).toHaveTextContent(SUMMARY.text);
    expect(screen.getByRole('blockquote')).toHaveAttribute('lang', 'fr');
    expect(screen.getByRole('link', { name: 'Wikipédia' })).toHaveAttribute('href', SUMMARY.url);
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/'
    );
  });

  it('says when the summary is in the other language', () => {
    show({
      status: 'ready',
      profile: makeArtistProfile({ summary: { ...SUMMARY, lang: 'en' } }),
    });

    expect(screen.getByRole('blockquote')).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('link', { name: 'Wikipédia, en anglais' })).toBeInTheDocument();
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
    show({ status: 'loading' });

    expect(screen.getByRole('link', { name: 'Revenir au direct' })).toHaveAttribute('href', '/');
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
    expect(factsLine(group)).toBe('Groupe · Paris, France · 1993 – 2021');
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
