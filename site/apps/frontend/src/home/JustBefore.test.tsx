// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { makeNowPlaying } from '../mocks/handlers';
import { useNowPlayingStore, type NowPlaying } from '../lib/azuracast';
import { __resetNowPlayingStore } from '../lib/azuracast/store';
import { JustBefore, JustBeforeView, type JustBeforeViewProps } from './JustBefore';

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
      '(min-width: 40rem) and (orientation: landscape) 3.5rem, 2.75rem'
    );
  });

  it('marks its track leaving and arriving with the hero', () => {
    const { rerender } = render(<JustBeforeView {...props()} />);
    const region = () => screen.getByRole('region', { name: 'Juste avant' });
    expect(region()).toHaveAttribute('data-swap', 'idle');
    rerender(<JustBeforeView {...props({ swap: 'out' })} />);
    expect(region()).toHaveAttribute('data-swap', 'out');
    rerender(<JustBeforeView {...props({ swap: 'in' })} />);
    expect(region()).toHaveAttribute('data-swap', 'in');
  });

  it('shows nothing while no track played before', () => {
    const { container } = render(<JustBeforeView {...props({ track: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('JustBefore', () => {
  beforeEach(() => {
    const now = Math.floor(Date.now() / 1000);
    const np = makeNowPlaying() as unknown as NowPlaying;
    np.now_playing = { ...np.now_playing, sh_id: 2, played_at: now - 30 };
    np.song_history = [
      {
        ...np.now_playing,
        sh_id: 1,
        played_at: now - 300,
        song: { ...np.now_playing.song, title: 'Really Doe', artist: 'Danny Brown' },
      },
    ];
    useNowPlayingStore.setState({ data: np, isConnected: true, error: null });
  });
  afterEach(() => __resetNowPlayingStore());

  it("finds the artist's page through the shared resolver, as the track on air does", async () => {
    render(<JustBefore shown={null} swap="idle" />);
    expect(await screen.findByRole('link', { name: 'Danny Brown' })).toHaveAttribute(
      'href',
      '/artiste/danny-brown'
    );
  });

  it('leaves the rest of the page standing when the station sends a malformed track', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const np = useNowPlayingStore.getState().data!;
    useNowPlayingStore.setState({
      data: {
        ...np,
        song_history: [{ ...np.song_history[0]!, song: undefined as never }],
      },
    });
    const { container } = render(<JustBefore shown={null} swap="idle" />);
    expect(container).toBeEmptyDOMElement();
  });
});
