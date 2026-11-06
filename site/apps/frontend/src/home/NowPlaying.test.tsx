// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from 'react-error-boundary';
import { makeNowPlaying } from '../mocks/handlers';
import {
  useNowPlayingStore,
  type NowPlaying as NowPlayingData,
  type SongEntry,
} from '../lib/azuracast';
import { __resetNowPlayingStore } from '../lib/azuracast/store';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import type { LikedTrack } from '../lib/api';
import {
  NowPlaying,
  NowPlayingFallback,
  NowPlayingFallbackView,
  NowPlayingView,
  type NowPlayingFallbackViewProps,
  type NowPlayingViewProps,
} from './NowPlaying';
import type * as UseDiffusionModule from '../hooks/useDiffusion';

// The cast store, made to throw as the data that crashed the hero might.
const diffusionThrows = vi.hoisted(() => ({ value: false }));
vi.mock('../hooks/useDiffusion', async (importOriginal) => {
  const actual = await importOriginal<typeof UseDiffusionModule>();
  return {
    ...actual,
    useDiffusion: () => {
      if (diffusionThrows.value) throw new Error('cast store');
      return actual.useDiffusion();
    },
  };
});

// The artist link is a router <Link>.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

function props(overrides: Partial<NowPlayingViewProps> = {}): NowPlayingViewProps {
  return {
    track: {
      title: 'Mimoun',
      artist: 'Mickey 3D',
      album: 'Tu vas pas mourir de rire',
      art: undefined,
    },
    isOnline: true,
    listen: 'idle',
    volume: { volume: 0.8, isMuted: false, onVolumeChange: vi.fn(), onToggleMute: vi.fn() },
    onToggleListen: vi.fn(),
    isKept: false,
    isKeeping: false,
    onToggleKeep: vi.fn(),
    artistHref: null,
    ...overrides,
  };
}

describe('NowPlayingView', () => {
  it('shows the title as a heading, then the artist and the album', () => {
    render(<NowPlayingView {...props()} />);

    expect(screen.getByRole('heading', { name: 'Mimoun' })).toBeInTheDocument();
    expect(screen.getByText('Mickey 3D')).toBeInTheDocument();
    expect(screen.getByText('Tu vas pas mourir de rire', { selector: 'cite' })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) => el?.tagName === 'P' && el.textContent === 'Mickey 3D · Tu vas pas mourir de rire'
      )
    ).toBeInTheDocument();
  });

  it("leaves out a single's album, which only repeats the title", () => {
    const track = { title: 'Four to the Floor', artist: 'Starsailor', art: undefined };
    render(<NowPlayingView {...props({ track: { ...track, album: 'Four To The Floor' } })} />);
    expect(screen.getAllByText(/four to the floor/i)).toHaveLength(1);
  });

  it('says « En direct » above the title while the station is on air, and not off air', () => {
    const { rerender } = render(<NowPlayingView {...props()} />);
    const live = screen.getByText('En direct');
    const title = screen.getByRole('heading', { name: 'Mimoun' });
    expect(live.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(<NowPlayingView {...props({ isOnline: false })} />);
    expect(screen.queryByText('En direct')).not.toBeInTheDocument();
  });

  it('draws Écouter as a pill that says its word, and Arrêter while the live plays', async () => {
    const onToggleListen = vi.fn();
    const { rerender } = render(<NowPlayingView {...props({ onToggleListen })} />);

    const listen = screen.getByRole('button', { name: 'Écouter le direct' });
    expect(listen).toHaveTextContent('Écouter');
    await userEvent.click(listen);
    expect(onToggleListen).toHaveBeenCalledOnce();

    // Connecting, it says so, its name its word; a press still stops.
    rerender(<NowPlayingView {...props({ listen: 'connecting' })} />);
    const connecting = screen.getByRole('button', { name: 'Connexion…' });
    expect(connecting).toHaveAttribute('aria-busy', 'true');
    expect(connecting).toHaveTextContent('Connexion…');

    // The player has no pause, only a stop: a press after rejoins the live where it is.
    rerender(<NowPlayingView {...props({ listen: 'playing' })} />);
    const stop = screen.getByRole('button', { name: 'Arrêter le direct' });
    expect(stop).not.toHaveAttribute('aria-busy', 'true');
    expect(stop).toHaveTextContent('Arrêter');
    expect(screen.queryByText('Pause')).not.toBeInTheDocument();
  });

  it('shows the stop square as soon as the live plays, with no hover a finger cannot give', () => {
    const { rerender } = render(<NowPlayingView {...props({ listen: 'playing' })} />);
    const glyph = (button: string, name: string) =>
      within(screen.getByRole('button', { name: button })).getByTestId(`glyph-${name}`);
    const shown = (element: Element) =>
      element.classList.contains('opacity-100') &&
      ![...element.classList].some((c) => /hover:|focus-visible:/.test(c));
    expect(shown(glyph('Arrêter le direct', 'stop'))).toBe(true);
    expect(shown(glyph('Arrêter le direct', 'play'))).toBe(false);

    rerender(<NowPlayingView {...props({ listen: 'idle' })} />);
    expect(shown(glyph('Écouter le direct', 'play'))).toBe(true);
    expect(shown(glyph('Écouter le direct', 'stop'))).toBe(false);
  });

  it('keeps the track with a heart named for its title, the kept state in aria-pressed', async () => {
    const onToggleKeep = vi.fn();
    const { rerender } = render(<NowPlayingView {...props({ onToggleKeep })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Garder «\u00a0Mimoun\u00a0»' }));
    expect(onToggleKeep).toHaveBeenCalledOnce();

    rerender(<NowPlayingView {...props({ isKept: true })} />);
    expect(screen.getByRole('button', { name: 'Garder «\u00a0Mimoun\u00a0»' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('offers no Partager: the hero holds Écouter, Garder, the volume and Diffuser', () => {
    render(<NowPlayingView {...props()} />);
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
  });

  it('offers Diffuser, with its word, wherever the browser can cast, a device found or not', () => {
    const diffusion = (found: boolean, device: string | null = null) => ({
      kind: 'chromecast' as const,
      found,
      device,
      connecting: false,
      onOpen: vi.fn(),
    });
    // A browser that cannot cast: no button.
    const { rerender } = render(<NowPlayingView {...props({ diffusion: null })} />);
    expect(screen.queryByRole('button', { name: /Diffuser|Sur / })).not.toBeInTheDocument();

    // No device on the network yet: the button is there, its help says what to check.
    rerender(<NowPlayingView {...props({ diffusion: diffusion(false) })} />);
    expect(screen.getByRole('button', { name: 'Diffuser sur un appareil' })).toHaveTextContent(
      'Diffuser'
    );

    rerender(<NowPlayingView {...props({ diffusion: diffusion(true) })} />);
    expect(screen.getByRole('button', { name: 'Diffuser sur un appareil' })).toBeInTheDocument();

    // The word alone on a phone is left to screen readers; the device it plays on is shown at every
    // width, with its wave, or a phone would not see the stream is cast.
    const off = screen.getByRole('button', { name: 'Diffuser sur un appareil' });
    expect(within(off).getByText('Diffuser')).toHaveClass('sr-only');
    rerender(<NowPlayingView {...props({ diffusion: diffusion(false, 'Salon') })} />);
    const on = screen.getByRole('button', { name: 'Diffusion sur Salon' });
    expect(on).toHaveClass('wave-underline');
    expect(within(on).getByText('Sur Salon')).not.toHaveClass('sr-only');
  });

  it("links the artist's name to their page only once it exists", () => {
    const { rerender } = render(<NowPlayingView {...props()} />);
    expect(screen.getByText('Mickey 3D')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    rerender(<NowPlayingView {...props({ artistHref: '/artist/a-1/mickey-3d' })} />);
    expect(screen.getByRole('link', { name: 'Mickey 3D' })).toHaveAttribute(
      'href',
      '/artist/a-1/mickey-3d'
    );
  });

  it('carries its own volume beside the actions, the player bar being away on the hero', async () => {
    const onToggleMute = vi.fn();
    const onVolumeChange = vi.fn();
    render(
      <NowPlayingView
        {...props({ volume: { volume: 0.6, isMuted: false, onVolumeChange, onToggleMute } })}
      />
    );

    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(slider).toHaveAttribute('aria-valuenow', '60');
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onVolumeChange).toHaveBeenLastCalledWith(0.65);
    await userEvent.click(screen.getByRole('button', { name: 'Couper le son' }));
    expect(onToggleMute).toHaveBeenCalledOnce();
  });

  it('says radio silence when the station is off air, the last cover kept but dimmed', () => {
    const art = 'https://radio.aubesonore.fr/api/station/aubesonore/art/a1-1.jpg';
    const { rerender } = render(
      <NowPlayingView {...props({ track: { ...props().track!, art } })} />
    );
    expect(screen.getByTestId('hero-cover')).not.toHaveAttribute('data-off-air');

    rerender(<NowPlayingView {...props({ isOnline: false, track: { ...props().track!, art } })} />);
    expect(screen.getByText('Silence radio. Retour dans un instant.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pochette de Mimoun, Mickey 3D' })).toBeInTheDocument();
    expect(screen.getByTestId('hero-cover')).toHaveAttribute('data-off-air');
  });

  it('marks the track leaving, then the one arriving, for the hero to animate them', () => {
    const { rerender } = render(<NowPlayingView {...props()} />);
    const marks = () =>
      ['hero-cover', 'hero-words'].map((id) => screen.getByTestId(id).getAttribute('data-swap'));
    expect(marks()).toEqual(['idle', 'idle']);

    rerender(<NowPlayingView {...props({ swap: 'out' })} />);
    expect(marks()).toEqual(['out', 'out']);

    rerender(<NowPlayingView {...props({ swap: 'in' })} />);
    expect(marks()).toEqual(['in', 'in']);
  });

  it("holds the words' room while the live has not answered: a line of each, at its size", () => {
    // The classes that set a line's height and the air around it.
    const sizing = (line: Element) =>
      [...line.classList]
        .filter((c) => /^(text-(body|title|line)|font-display|m[tb]-\d+)$/.test(c))
        .sort()
        .join(' ');
    const { rerender } = render(<NowPlayingView {...props({ track: null })} />);
    const waiting = screen.getAllByTestId('hero-words-waiting').map(sizing);

    rerender(<NowPlayingView {...props()} />);
    const words = [
      screen.getByText('En direct'),
      screen.getByRole('heading', { name: 'Mimoun' }),
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.startsWith('Mickey 3D')),
    ].map(sizing);
    expect(waiting).toEqual(words);
  });

  it('says the live is not answering, rather than load forever, and offers Réessayer', async () => {
    const onRetry = vi.fn();
    render(<NowPlayingView {...props({ track: null, isUnreachable: true, onRetry })} />);
    expect(screen.getByText('Le direct ne répond pas pour le moment.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('offers nothing to do off air, with nothing to hear', () => {
    const cast = { kind: 'chromecast' as const, found: true, device: null, connecting: false };
    render(
      <NowPlayingView {...props({ isOnline: false, diffusion: { ...cast, onOpen: vi.fn() } })} />
    );
    expect(screen.queryByRole('button', { name: 'Écouter le direct' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Garder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Couper le son' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Diffuser/ })).not.toBeInTheDocument();
  });

  it('keeps Écouter, the volume and Diffuser while the live does not answer: the stream may', () => {
    const cast = { kind: 'chromecast' as const, found: true, device: null, connecting: false };
    render(
      <NowPlayingView
        {...props({ track: null, isUnreachable: true, diffusion: { ...cast, onOpen: vi.fn() } })}
      />
    );
    expect(screen.getByRole('button', { name: 'Écouter le direct' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Couper le son' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Diffuser/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Garder/ })).not.toBeInTheDocument();
  });

  it.each([
    ['off air', { isOnline: false }, 'Silence radio. Retour dans un instant.'],
    [
      'unreachable',
      { track: null, isUnreachable: true },
      'Le direct ne répond pas pour le moment.',
    ],
  ] as const)('says it %s as the title in its place, a heading', (_, state, sentence) => {
    render(<NowPlayingView {...props(state)} />);
    expect(screen.getByRole('heading', { name: sentence })).toBeInTheDocument();
  });

  it('keeps Arrêter off air while the live is still heard, so it can be stopped', () => {
    render(<NowPlayingView {...props({ isOnline: false, listen: 'playing' })} />);
    expect(screen.getByRole('button', { name: 'Arrêter le direct' })).toBeInTheDocument();
  });

  it('offers Réessayer only while the station does not answer', () => {
    render(<NowPlayingView {...props({ onRetry: vi.fn() })} />);
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  it('beats the heart when a track is kept, not when it loads kept', () => {
    const { rerender } = render(<NowPlayingView {...props({ isKept: true })} />);
    const keep = () => screen.getByRole('button', { name: 'Garder «\u00a0Mimoun\u00a0»' });
    expect(keep()).not.toContainHTML('keep-pop');

    rerender(<NowPlayingView {...props({ isKept: false })} />);
    rerender(<NowPlayingView {...props({ isKept: true })} />);
    expect(keep()).toContainHTML('keep-pop');
  });

  it("fetches the cover first: the page's largest image", () => {
    const art = 'https://radio.aubesonore.fr/api/station/aubesonore/art/abc-1.jpg';
    render(<NowPlayingView {...props({ track: { ...props().track!, art } })} />);
    const img = screen.getByRole('img', { name: 'Pochette de Mimoun, Mickey 3D' });
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('keeps the large cover open into the next track, showing the new one', async () => {
    const art = (id: string) => `https://radio.aubesonore.fr/api/station/aubesonore/art/${id}.jpg`;
    const next = { title: 'Respire', artist: 'Mickey 3D', album: 'Live', art: art('b') };
    const { rerender } = render(
      <NowPlayingView {...props({ track: { ...props().track!, art: art('a') } })} />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Voir la pochette de Mimoun en grand' })
    );
    await screen.findByRole('dialog', { name: 'Mimoun' });

    rerender(<NowPlayingView {...props({ track: next, swap: 'in' })} />);
    const dialog = screen.getByRole('dialog', { name: 'Respire' });
    expect(within(dialog).getByRole('img')).toHaveProperty('src', art('b'));
  });
});

describe('NowPlaying, from the stores', () => {
  const entry = (song: Partial<SongEntry['song']> = {}): SongEntry => {
    const onAir = makeNowPlaying().now_playing as unknown as SongEntry;
    return { ...onAir, song: { ...onAir.song, title: 'Mimoun', artist: 'Mickey 3D', ...song } };
  };
  afterEach(() => {
    __resetNowPlayingStore();
    useLikedTracksStore.setState({ tracks: [] });
  });

  it('says the live is not answering once the station failed before any answer', () => {
    useNowPlayingStore.setState({ data: null, error: 'HTTP 500' });
    render(<NowPlaying shown={null} swap="idle" />);
    expect(screen.getByText('Le direct ne répond pas pour le moment.')).toBeInTheDocument();
  });

  it('never says the live is not answering once it has answered, a later poll failing', () => {
    useNowPlayingStore.setState({
      data: makeNowPlaying() as unknown as NowPlayingData,
      error: 'HTTP 500',
    });
    render(<NowPlaying shown={null} swap="idle" />);
    expect(screen.queryByText('Le direct ne répond pas pour le moment.')).not.toBeInTheDocument();
  });

  it('shows the heart full for a track the listener kept, whatever its case', () => {
    useLikedTracksStore.setState({
      tracks: [{ id: 'k1', title: 'MIMOUN', artist: 'mickey 3d' } as LikedTrack],
    });
    render(<NowPlaying shown={entry()} swap="idle" />);
    expect(screen.getByRole('button', { name: 'Garder « Mimoun »' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows no track for an entry without a title', () => {
    render(<NowPlaying shown={entry({ title: '' })} swap="idle" />);
    expect(screen.queryByRole('button', { name: /^Garder/ })).not.toBeInTheDocument();
  });
});

describe('NowPlayingFallback', () => {
  afterEach(() => {
    diffusionThrows.value = false;
  });

  it('says the track does not show, keeps the live to hear, and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Track() {
      if (shouldThrow) throw new Error('boom');
      return <p>Mimoun</p>;
    }
    render(
      <ErrorBoundary FallbackComponent={NowPlayingFallback}>
        <Track />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Le titre en cours ne s’affiche pas.');
    expect(screen.getByRole('button', { name: 'Écouter le direct' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Couper le son' })).toBeInTheDocument();

    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(screen.getByText('Mimoun')).toBeInTheDocument();
  });

  it('still offers Écouter and Réessayer when a store its row reads throws as well', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    diffusionThrows.value = true;
    function Track(): null {
      throw new Error('boom');
    }
    render(
      <ErrorBoundary FallbackComponent={NowPlayingFallback}>
        <Track />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Le titre en cours ne s’affiche pas.');
    expect(screen.getByRole('button', { name: 'Écouter le direct' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('NowPlayingFallbackView', () => {
  const cast = {
    kind: 'chromecast' as const,
    found: true,
    device: null,
    connecting: false,
    onOpen: vi.fn(),
  };
  function fallback(
    overrides: Partial<NowPlayingFallbackViewProps> = {}
  ): NowPlayingFallbackViewProps {
    return {
      listen: 'idle',
      onToggleListen: vi.fn(),
      volume: { volume: 0.8, isMuted: false, onVolumeChange: vi.fn(), onToggleMute: vi.fn() },
      keep: { title: 'Mimoun', isKept: false, isKeeping: false, onToggle: vi.fn() },
      diffusion: cast,
      onRetry: vi.fn(),
      ...overrides,
    };
  }

  it('keeps Garder and Diffuser beside Écouter while the track does not show', async () => {
    const view = fallback();
    render(<NowPlayingFallbackView {...view} />);
    await userEvent.click(screen.getByRole('button', { name: 'Garder «\u00a0Mimoun\u00a0»' }));
    expect(view.keep?.onToggle).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Diffuser sur un appareil' }));
    expect(cast.onOpen).toHaveBeenCalledOnce();
  });

  it('leaves out Garder with no track to keep, and Diffuser where the browser cannot cast', () => {
    render(<NowPlayingFallbackView {...fallback({ keep: null, diffusion: null })} />);
    expect(screen.queryByRole('button', { name: /Garder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Diffuser/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Écouter le direct' })).toBeInTheDocument();
  });
});
