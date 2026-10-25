// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { makeNowPlaying } from '../mocks/handlers';
import { useNowPlayingStore, type NowPlaying, type SongEntry } from '../lib/azuracast';
import { __resetNowPlayingStore } from '../lib/azuracast/store';
import { usePlayer } from '../lib/player';
import { SinceDawn, SinceDawnView, THREAD_CLOSE_MS, type ThreadRow } from './SinceDawn';

function rows(count: number, from = 1): ThreadRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: from + i,
    playedAt: Math.floor(new Date(2026, 9, 1, 17, 0).getTime() / 1000) - (from + i) * 240,
    title: `Titre ${from + i}`,
    artist: `Artiste ${from + i}`,
    artistHref: null,
    youtubeUrl: `https://www.youtube.com/results?search_query=Titre%20${from + i}`,
    art: null,
    isKept: false,
    isKeeping: false,
  }));
}

const view = (shown: ThreadRow[], more: Partial<Parameters<typeof SinceDawnView>[0]> = {}) => (
  <SinceDawnView
    rows={shown}
    status="ready"
    onToggleKeep={vi.fn()}
    onListenElsewhere={vi.fn()}
    {...more}
  />
);

const items = () => screen.getAllByRole('listitem');

afterEach(() => {
  vi.useRealTimers();
});

describe('SinceDawnView', () => {
  it('shows every track it is given, with no button for earlier ones', () => {
    render(view(rows(8)), { wrapper: MemoryRouter });

    expect(items()).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /plus tôt/i })).not.toBeInTheDocument();
  });

  it('gives each track its time, its title, its artist, YouTube and Garder', () => {
    render(view(rows(1)), { wrapper: MemoryRouter });
    const row = items()[0]!;

    expect(row).toHaveTextContent('16:56');
    expect(row).toHaveTextContent('Titre 1');
    expect(row).toHaveTextContent('Artiste 1');
    const youtube = within(row).getByRole('link', { name: 'Écouter « Titre 1 » sur YouTube' });
    expect(youtube).toHaveAttribute('href', rows(1)[0]!.youtubeUrl);
    expect(youtube).toHaveAttribute('target', '_blank');
    expect(youtube).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(row).getByRole('button', { name: 'Garder « Titre 1 »' })).toBeInTheDocument();
  });

  it('keeps a track by its id', async () => {
    const onToggleKeep = vi.fn();
    render(view(rows(3), { onToggleKeep }), { wrapper: MemoryRouter });

    await userEvent.click(screen.getByRole('button', { name: 'Garder « Titre 2 »' }));
    expect(onToggleKeep).toHaveBeenCalledWith(2);
  });

  it('says when a track is opened on YouTube', async () => {
    const onListenElsewhere = vi.fn();
    render(view(rows(2), { onListenElsewhere }), { wrapper: MemoryRouter });

    await userEvent.click(screen.getByRole('link', { name: 'Écouter « Titre 2 » sur YouTube' }));
    expect(onListenElsewhere).toHaveBeenCalledOnce();
  });

  it('tells apart an empty thread from an unavailable history', () => {
    const { rerender } = render(view([]), { wrapper: MemoryRouter });
    expect(screen.getByText('Rien n’est encore passé à l’antenne.')).toBeInTheDocument();

    rerender(view([], { status: 'error' }));
    expect(
      screen.getByText('Les derniers titres sont indisponibles pour l’instant.')
    ).toBeInTheDocument();
  });

  it('opens a line for the track that joins the thread, not for the ones already there', () => {
    const { rerender } = render(view(rows(8, 2)), { wrapper: MemoryRouter });
    items().forEach((li) => expect(li).not.toHaveClass('thread-enter'));

    rerender(view([...rows(1), ...rows(7, 2)]));
    const [arrived, ...others] = items();
    expect(arrived).toHaveTextContent('Titre 1');
    expect(arrived).toHaveClass('thread-enter');
    others.forEach((li) => expect(li).not.toHaveClass('thread-enter'));
  });

  it('lets older tracks that the history brings after the live ones just appear', () => {
    const { rerender } = render(view(rows(5)), { wrapper: MemoryRouter });

    rerender(view(rows(8)));
    items().forEach((li) => expect(li).not.toHaveClass('thread-enter'));
  });

  it('closes the line of the oldest track, which leaves once it is closed', () => {
    vi.useFakeTimers();
    const { rerender } = render(view(rows(8, 2)), { wrapper: MemoryRouter });

    rerender(view([...rows(1), ...rows(7, 2)]));
    // Hidden from screen readers while it closes: found only among the hidden.
    const leaving = screen.getAllByRole('listitem', { hidden: true })[8]!;
    expect(leaving).toHaveTextContent('Titre 9');
    expect(leaving).toHaveClass('thread-leave');
    // Out of reach while it closes: no longer one of the thread's tracks.
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    expect(leaving).toHaveAttribute('inert');
    expect(items()).toHaveLength(8);

    act(() => {
      vi.advanceTimersByTime(THREAD_CLOSE_MS);
    });
    expect(screen.queryByText('Titre 9')).not.toBeInTheDocument();
  });

  it('links an artist to their page once it is known, and only then', () => {
    const [known, unknown] = rows(2);
    render(view([{ ...known!, artistHref: '/artist/a-1/artiste-1' }, unknown!]), {
      wrapper: MemoryRouter,
    });

    expect(screen.getByRole('link', { name: 'Artiste 1' })).toHaveAttribute(
      'href',
      '/artist/a-1/artiste-1'
    );
    expect(screen.queryByRole('link', { name: 'Artiste 2' })).not.toBeInTheDocument();
    expect(screen.getByText('Artiste 2')).toBeInTheDocument();
  });
});

function entry(sh_id: number, playedAt: number): SongEntry {
  return {
    sh_id,
    played_at: playedAt,
    duration: 200,
    playlist: 'main',
    streamer: '',
    is_request: false,
    song: {
      id: String(sh_id),
      art: '',
      text: '',
      artist: `Artist ${sh_id}`,
      title: `Track ${sh_id}`,
      album: '',
      genre: '',
      isrc: '',
      lyrics: '',
    },
  };
}

describe('SinceDawn', () => {
  afterEach(() => {
    __resetNowPlayingStore();
  });

  function renderThread() {
    const now = Math.floor(Date.now() / 1000);
    const np = makeNowPlaying() as unknown as NowPlaying;
    np.now_playing = entry(3, now - 10);
    np.song_history = [];
    useNowPlayingStore.setState({ data: np, isConnected: true, error: null });
    render(<SinceDawn history={[entry(3, now - 10), entry(2, now - 200), entry(1, now - 400)]} />, {
      wrapper: MemoryRouter,
    });
  }

  it('leaves out the track on air, which the player above shows', () => {
    renderThread();
    expect(items().map((li) => within(li).getByText(/^Track/).textContent)).toEqual([
      'Track 2',
      'Track 1',
    ]);
  });

  it('pauses the live when a track is opened on YouTube, two sounds being worse than one', async () => {
    const stop = vi.fn();
    usePlayer.setState({ isPlaying: true, stop });
    renderThread();

    await userEvent.click(screen.getByRole('link', { name: 'Écouter « Track 2 » sur YouTube' }));
    expect(stop).toHaveBeenCalledOnce();
  });

  it('leaves the player alone when the live is not playing', async () => {
    const stop = vi.fn();
    usePlayer.setState({ isPlaying: false, isConnecting: false, stop });
    renderThread();

    await userEvent.click(screen.getByRole('link', { name: 'Écouter « Track 2 » sur YouTube' }));
    expect(stop).not.toHaveBeenCalled();
  });
});
