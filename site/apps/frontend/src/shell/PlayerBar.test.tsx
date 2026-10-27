// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { PlayerBarView, type PlayerBarViewProps } from './PlayerBar';
import type * as PlayerModule from '../lib/player';

type Player = typeof PlayerModule;

const stream = vi.hoisted((): { analyser: unknown } => ({ analyser: null }));
vi.mock('../lib/player', async (importOriginal) => ({
  ...(await importOriginal<Player>()),
  getAnalyser: () => stream.analyser,
}));

// The track links to the artist's page: a router <Link>.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

const playedAt = Math.floor(new Date(2026, 9, 1, 17, 1).getTime() / 1000);
const art = 'https://radio.aubesonore.fr/api/station/aubesonore/art/a1-1.jpg';

function props(overrides: Partial<PlayerBarViewProps> = {}): PlayerBarViewProps {
  return {
    isHidden: false,
    listen: 'idle',
    onToggleListen: vi.fn(),
    track: { title: 'Mimoun', artist: 'Mickey 3D', album: '', art: undefined, playedAt },
    isKept: false,
    onToggleKeep: vi.fn(),
    onShare: vi.fn(),
    volume: 0.8,
    isMuted: false,
    onVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    diffusion: null,
    artistHref: null,
    isOnline: true,
    ...overrides,
  };
}

describe('PlayerBarView', () => {
  it("shares the track from the phone's sheet, as the hero does", async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    render(<PlayerBarView {...props({ onShare })} />);

    await user.click(screen.getByRole('button', { name: /Ouvrir «\u00a0Mimoun\u00a0»/ }));
    await user.click(await screen.findByRole('button', { name: 'Partager' }));

    expect(onShare).toHaveBeenCalledOnce();
  });

  it('puts the title and the artist forward, without the time', async () => {
    const onToggleListen = vi.fn();
    render(<PlayerBarView {...props({ onToggleListen })} />);

    // Twice: the phone's sheet trigger and the larger screens' line, one hidden by CSS.
    expect(screen.getAllByText('Mimoun')).toHaveLength(2);
    expect(screen.getAllByText('Mickey 3D')).toHaveLength(2);
    expect(screen.queryByText(/à l’antenne/)).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Écouter le direct' })[0]!);
    expect(onToggleListen).toHaveBeenCalledOnce();
  });

  // jsdom applies no CSS: both layouts are in the page, each hidden on the other's screens.
  const listenButtons = () => screen.getAllByRole('button', { name: /le direct$/ });
  const keepButton = () => screen.getByRole('button', { name: 'Garder «\u00a0Mimoun\u00a0»' });
  const follows = (later: Element, earlier: Element) =>
    Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);

  it.each([
    ['idle', 'Écouter', 'Écouter le direct'],
    ['playing', 'Arrêter', 'Arrêter le direct'],
  ] as const)(
    'says its word on a computer while %s, as the hero does: Écouter, then Arrêter',
    (listen, word, name) => {
      render(<PlayerBarView {...props({ listen })} />);
      const pill = screen.getAllByRole('button', { name }).find((b) => b.textContent === word);
      expect(pill).toBeDefined();
      expect(pill).toHaveClass('hidden', 'md:flex');
    }
  );

  it('puts the heart right after the track on a computer, before the volume', () => {
    render(<PlayerBarView {...props({ artistHref: '/artist/a-1/mickey-3d' })} />);
    const link = screen.getByRole('link', { name: /Mimoun/ });
    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(follows(keepButton(), link)).toBe(true);
    expect(follows(slider, keepButton())).toBe(true);
  });

  it('leaves the volume to the phone’s own buttons: none in the bar under md', () => {
    render(<PlayerBarView {...props()} />);
    expect(screen.getByTestId('volume')).toHaveClass('hidden', 'md:fine-pointer:flex');
  });

  it('puts Écouter under the thumb on a phone: the disc alone, after the heart', () => {
    render(<PlayerBarView {...props()} />);
    const disc = listenButtons().find((b) => b.textContent === '');
    expect(disc).toBeDefined();
    expect(disc).toHaveClass('md:hidden');
    expect(follows(disc!, keepButton())).toBe(true);
    const trigger = screen.getByRole('button', { name: /Ouvrir «\u00a0Mimoun\u00a0»/ });
    expect(follows(keepButton(), trigger)).toBe(true);
  });

  it('marks the live and names the album beside the artist on a computer', () => {
    render(
      <PlayerBarView
        {...props({
          track: {
            title: 'Mimoun',
            artist: 'Mickey 3D',
            album: 'Tu vas pas mourir',
            art,
            playedAt,
          },
        })}
      />
    );
    expect(screen.getByText('Mickey 3D · Tu vas pas mourir')).toBeInTheDocument();
  });

  it("leaves out a single's album, which only repeats the title", () => {
    render(
      <PlayerBarView
        {...props({
          track: { title: 'Mimoun', artist: 'Mickey 3D', album: 'Mimoun', art, playedAt },
        })}
      />
    );
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('is lit by the cover on air, as the hero is; no light off air', () => {
    const { rerender } = render(
      <PlayerBarView {...props({ track: { ...props().track!, art } })} />
    );
    expect(within(screen.getByRole('region')).getAllByTestId('cover-light')).toHaveLength(1);

    rerender(<PlayerBarView {...props({ track: { ...props().track!, art }, isOnline: false })} />);
    expect(screen.queryByTestId('cover-light')).not.toBeInTheDocument();
  });

  it('says Écouter while nothing is known of the live', () => {
    render(<PlayerBarView {...props({ track: null })} />);
    // The phone's word beside its disc; a computer's pill says it already.
    expect(screen.getAllByText('Écouter')).toHaveLength(2);
    expect(screen.getByText('Écouter', { ignore: 'button *' })).toHaveClass('md:hidden');
  });

  it('offers to stop the live while it plays, never to pause it: a press rejoins the live', () => {
    render(<PlayerBarView {...props({ track: null, listen: 'playing' })} />);
    expect(screen.getAllByRole('button', { name: 'Arrêter le direct' })).toHaveLength(2);
    expect(screen.getAllByText('Arrêter')).toHaveLength(2);
    expect(screen.queryByText('Pause')).not.toBeInTheDocument();
  });

  it('is inert while hidden, so nothing in it can be focused', () => {
    render(<PlayerBarView {...props({ isHidden: true })} />);
    expect(screen.getByRole('region', { hidden: true })).toHaveAttribute('inert');
  });

  it('stays on screen while it holds the keyboard focus', async () => {
    const { rerender } = render(<PlayerBarView {...props()} />);

    await userEvent.tab();
    rerender(<PlayerBarView {...props({ isHidden: true })} />);
    expect(screen.getByRole('region')).not.toHaveAttribute('inert');

    await userEvent.tab({ shift: true });
    expect(screen.getByRole('region', { hidden: true })).toHaveAttribute('inert');
  });

  it('leaves for the hero after a click, which focuses a button too', async () => {
    const { rerender } = render(<PlayerBarView {...props()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Écouter le direct' })[0]!);
    rerender(<PlayerBarView {...props({ isHidden: true })} />);
    expect(screen.getByRole('region', { hidden: true })).toHaveAttribute('inert');
  });

  it('keeps the track with a constant label', async () => {
    const onToggleKeep = vi.fn();
    render(<PlayerBarView {...props({ onToggleKeep, isKept: true })} />);

    const keep = screen.getByRole('button', { name: 'Garder «\u00a0Mimoun\u00a0»' });
    expect(keep).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(keep);
    expect(onToggleKeep).toHaveBeenCalledOnce();
  });

  it.each(['idle', 'connecting', 'playing'] as const)(
    'shows the volume in the bar while %s',
    async (listen) => {
      const onToggleMute = vi.fn();
      render(<PlayerBarView {...props({ listen, onToggleMute })} />);

      const slider = screen.getByRole('slider', { name: 'Volume' });
      expect(slider).toHaveAttribute('aria-valuenow', '80');
      await userEvent.click(screen.getByRole('button', { name: 'Couper le son' }));
      expect(onToggleMute).toHaveBeenCalledOnce();
    }
  );

  it('moves the volume by steps of 5 with the arrow keys, to silence with Home', async () => {
    const onVolumeChange = vi.fn();
    render(<PlayerBarView {...props({ onVolumeChange })} />);

    const slider = screen.getByRole('slider', { name: 'Volume' });
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onVolumeChange).toHaveBeenLastCalledWith(0.85);
    await userEvent.keyboard('{ArrowLeft}');
    expect(onVolumeChange).toHaveBeenLastCalledWith(0.75);
    await userEvent.keyboard('{Home}');
    expect(onVolumeChange).toHaveBeenLastCalledWith(0);
  });

  const diffusion = (overrides = {}) => ({
    kind: 'chromecast' as const,
    found: true,
    device: null,
    connecting: false,
    onOpen: vi.fn(),
    ...overrides,
  });

  it('offers Diffuser only where the browser can cast', () => {
    render(<PlayerBarView {...props()} />);
    expect(
      screen.queryByRole('button', { name: 'Diffuser sur un appareil' })
    ).not.toBeInTheDocument();
  });

  it('opens the device picker once a device is on the network', async () => {
    const cast = diffusion();
    render(<PlayerBarView {...props({ diffusion: cast })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Diffuser sur un appareil' }));
    expect(cast.onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByText('Aucun appareil trouvé')).not.toBeInTheDocument();
  });

  it('says what to check when no device is found, rather than opening an empty picker', async () => {
    const cast = diffusion({ found: false });
    render(<PlayerBarView {...props({ diffusion: cast })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Diffuser sur un appareil' }));
    expect(cast.onOpen).not.toHaveBeenCalled();
    expect(await screen.findByText('Aucun appareil trouvé')).toBeInTheDocument();
    expect(screen.getByText(/même Wi-Fi/)).toBeInTheDocument();
    expect(screen.getByText(/Pour AirPlay, ouvrez le site dans Safari/)).toBeInTheDocument();
  });

  it('names the device the stream plays on, and shows the connection under way', () => {
    const { rerender } = render(
      <PlayerBarView {...props({ diffusion: diffusion({ connecting: true }) })} />
    );
    expect(screen.getByRole('button', { name: 'Diffuser sur un appareil' })).toHaveAttribute(
      'aria-busy',
      'true'
    );

    rerender(<PlayerBarView {...props({ diffusion: diffusion({ device: 'TV' }) })} />);
    const button = screen.getByRole('button', { name: 'Diffusion sur TV' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('Sur TV');
  });

  it("leads from the track to the artist's page once it exists", () => {
    const { rerender } = render(<PlayerBarView {...props()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    rerender(<PlayerBarView {...props({ artistHref: '/artist/a-1/mickey-3d' })} />);
    expect(screen.getByRole('link', { name: /Mimoun/ })).toHaveAttribute(
      'href',
      '/artist/a-1/mickey-3d'
    );
  });

  it('says radio silence instead of a track when the station is off air', () => {
    render(<PlayerBarView {...props({ isOnline: false })} />);
    expect(screen.getByText('Silence radio. Retour dans un instant.')).toBeInTheDocument();
    expect(screen.queryByText('Mimoun')).not.toBeInTheDocument();
  });

  it('opens the whole track in a sheet from the track line, and closes it', async () => {
    render(
      <PlayerBarView
        {...props({
          track: {
            title: 'Mimoun',
            artist: 'Mickey 3D',
            album: 'Tu vas pas mourir de rire',
            art: undefined,
            playedAt,
          },
        })}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Ouvrir «\u00a0Mimoun\u00a0», Mickey 3D' })
    );

    const sheet = await screen.findByRole('dialog', { name: 'Mimoun' });
    expect(sheet).toHaveTextContent('Mickey 3D · Tu vas pas mourir de rire');
    // Modal: the page behind, the bar included, leaves the accessibility tree.
    expect(within(sheet).getByRole('button', { name: 'Écouter le direct' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Écouter le direct' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the track in the sheet as the hero does: « En direct », then the pill and its heart', async () => {
    const onToggleKeep = vi.fn();
    render(<PlayerBarView {...props({ onToggleKeep, track: { ...props().track!, art } })} />);
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir «\u00a0Mimoun\u00a0»/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Mimoun' });

    const live = within(sheet).getByText('En direct');
    const title = within(sheet).getByRole('heading', { name: 'Mimoun' });
    expect(follows(title, live)).toBe(true);
    // The heart right after the pill, before Partager, as the hero's actions.
    const pill = within(sheet).getByRole('button', { name: 'Écouter le direct' });
    const keep = within(sheet).getByRole('button', { name: 'Garder «\u00a0Mimoun\u00a0»' });
    expect(follows(keep, pill)).toBe(true);
    expect(follows(within(sheet).getByRole('button', { name: 'Partager' }), keep)).toBe(true);
    expect(pill).toHaveTextContent('Écouter');
    await userEvent.click(keep);
    expect(onToggleKeep).toHaveBeenCalledOnce();
    // The hero's light, under the paper's veil.
    expect(within(sheet).getAllByTestId('cover-light')).toHaveLength(1);
  });
});

describe('the line along its edge', () => {
  let frames: FrameRequestCallback[] = [];
  const heard = vi.fn();

  function drawn(reducedMotion = false) {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reducedMotion && query.includes('reduced-motion'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const ctx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );
    stream.analyser = {
      frequencyBinCount: 64,
      context: { sampleRate: 48000 },
      getByteFrequencyData: heard,
    };
    return ctx;
  }

  function runFrames(count: number) {
    let now = performance.now();
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      frames.shift()?.(now);
    }
  }

  afterEach(() => {
    stream.analyser = null;
    heard.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('listens to the stream only while the live is heard, calm otherwise', () => {
    const ctx = drawn();
    const { rerender } = render(<PlayerBarView {...props({ listen: 'idle' })} />);
    runFrames(5);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();

    rerender(<PlayerBarView {...props({ listen: 'connecting' })} />);
    runFrames(5);
    expect(heard).not.toHaveBeenCalled();

    rerender(<PlayerBarView {...props({ listen: 'playing' })} />);
    runFrames(5);
    expect(heard).toHaveBeenCalled();
  });

  it('is drawn in the dawn, the token itself: the theme emits no --color-dawn', () => {
    const ctx = drawn();
    const root = document.documentElement;
    root.style.setProperty('--dawn', 'rgb(4, 5, 6)');
    render(<PlayerBarView {...props()} />);
    expect(ctx.strokeStyle).toContain('rgb(4, 5, 6)');
    root.style.removeProperty('--dawn');
  });

  it('holds still under reduced motion, even while the live plays', () => {
    const ctx = drawn(true);
    render(<PlayerBarView {...props({ listen: 'playing' })} />);
    expect(frames).toHaveLength(0);
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(heard).not.toHaveBeenCalled();
  });
});
