// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { JustBeforeView, type JustBeforeViewProps } from './JustBefore';

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

const TRACK: NonNullable<JustBeforeViewProps['track']> = {
  title: 'Really Doe',
  artist: 'Danny Brown',
  art: 'https://radio.aubesonore.fr/api/station/aubesonore/art/a1-1.jpg',
  artistHref: null,
  isKept: false,
  isKeeping: false,
};

function props(overrides: Partial<JustBeforeViewProps> = {}): JustBeforeViewProps {
  return { track: TRACK, onToggleKeep: vi.fn(), ...overrides };
}

describe('JustBeforeView', () => {
  it('names the track that played before, under its own heading', () => {
    render(<JustBeforeView {...props()} />);
    expect(screen.getByRole('heading', { name: 'Juste avant' })).toBeInTheDocument();
    expect(screen.getByText('Really Doe')).toBeInTheDocument();
    expect(screen.getByText('Danny Brown')).toBeInTheDocument();
  });

  it("leads to the artist's page once it exists, never to a dead link", () => {
    const { rerender } = render(<JustBeforeView {...props()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    rerender(
      <JustBeforeView {...props({ track: { ...TRACK, artistHref: '/artiste/danny-brown' } })} />
    );
    expect(screen.getByRole('link', { name: 'Danny Brown' })).toHaveAttribute(
      'href',
      '/artiste/danny-brown'
    );
  });

  it('keeps it with a heart named for its title', async () => {
    const onToggleKeep = vi.fn();
    const { rerender } = render(<JustBeforeView {...props({ onToggleKeep })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Garder «\u00a0Really Doe\u00a0»' }));
    expect(onToggleKeep).toHaveBeenCalledOnce();

    rerender(<JustBeforeView {...props({ track: { ...TRACK, isKept: true } })} />);
    expect(screen.getByRole('button', { name: 'Garder «\u00a0Really Doe\u00a0»' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('offers no YouTube link and no extract: the track is to keep, the live to hear', () => {
    render(<JustBeforeView {...props()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /YouTube|extrait/i })).not.toBeInTheDocument();
  });

  it("fetches its small cover after the page's other images, at its small size", () => {
    render(<JustBeforeView {...props()} />);
    const img = screen.getByRole('presentation');
    expect(img).toHaveAttribute('fetchpriority', 'low');
    expect(img).toHaveAttribute('loading', 'lazy');
    // 56 px beside the cover on air, 44 px on a phone: the 96 or 192 px file.
    expect(img).toHaveAttribute(
      'sizes',
      '(min-width: 48rem) and (orientation: landscape) 3.5rem, 2.75rem'
    );
  });

  it('shows nothing while no track played before', () => {
    const { container } = render(<JustBeforeView {...props({ track: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
