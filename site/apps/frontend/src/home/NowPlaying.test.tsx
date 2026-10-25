// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from 'react-error-boundary';
import { NowPlayingFallback, NowPlayingView, type NowPlayingViewProps } from './NowPlaying';

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
    onShare: vi.fn(),
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

  it('puts Écouter under the title and names the action, not the waiting', async () => {
    const onToggleListen = vi.fn();
    const { rerender } = render(<NowPlayingView {...props({ onToggleListen })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Écouter le direct' }));
    expect(onToggleListen).toHaveBeenCalledOnce();

    // The ring alone tells the waiting: the button already names what a press does.
    rerender(<NowPlayingView {...props({ listen: 'connecting' })} />);
    expect(screen.getByRole('button', { name: 'Arrêter le direct' })).toHaveAttribute(
      'aria-busy',
      'true'
    );

    rerender(<NowPlayingView {...props({ listen: 'playing' })} />);
    expect(screen.getByRole('button', { name: 'Arrêter le direct' })).not.toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it('keeps a constant label and carries the kept state in aria-pressed', async () => {
    const onToggleKeep = vi.fn();
    const { rerender } = render(<NowPlayingView {...props({ onToggleKeep })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Garder' }));
    expect(onToggleKeep).toHaveBeenCalledOnce();

    rerender(<NowPlayingView {...props({ isKept: true })} />);
    expect(screen.getByRole('button', { name: 'Garder' })).toHaveAttribute('aria-pressed', 'true');
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

  it('shows Garder as a heart alone, named and with its tooltip, beside Partager and Diffuser', () => {
    const diffusion = {
      kind: 'chromecast' as const,
      found: true,
      device: null,
      connecting: false,
      onOpen: vi.fn(),
    };
    render(<NowPlayingView {...props({ diffusion })} />);

    const keep = screen.getByRole('button', { name: 'Garder' });
    expect(keep).toHaveAttribute('title', 'Garder');
    expect(keep).toHaveTextContent('');
    // Under 30rem of row the words are visually hidden (design/tokens.css, hero-actions), never
    // taken out of the accessibility tree.
    for (const name of ['Partager', 'Diffuser sur un appareil']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    for (const word of ['Partager', 'Diffuser']) {
      expect(screen.getByText(word)).not.toHaveAttribute('aria-hidden');
    }
  });

  it('says « En direct » on the cover while on air, and not off air', () => {
    // Where it stands, in the cover's corner, is measured by scripts/hero-layout-check.mjs.
    const { rerender } = render(<NowPlayingView {...props()} />);
    expect(screen.getByText('En direct')).toBeInTheDocument();

    rerender(<NowPlayingView {...props({ isOnline: false })} />);
    expect(screen.queryByText('En direct')).not.toBeInTheDocument();
  });

  it('says radio silence when the station is off air', () => {
    render(<NowPlayingView {...props({ isOnline: false })} />);
    expect(screen.getByText('Silence radio. Retour dans un instant.')).toBeInTheDocument();
  });

  it('says the live is not answering, rather than load forever, when the station is unreachable', () => {
    render(<NowPlayingView {...props({ track: null, isUnreachable: true })} />);
    expect(screen.getByText('Le direct ne répond pas pour le moment.')).toBeInTheDocument();
  });

  it('beats the heart when a track is kept, not when it loads kept', () => {
    const { rerender } = render(<NowPlayingView {...props({ isKept: true })} />);
    const keep = () => screen.getByRole('button', { name: 'Garder' });
    expect(keep()).not.toContainHTML('keep-pop');

    rerender(<NowPlayingView {...props({ isKept: false })} />);
    rerender(<NowPlayingView {...props({ isKept: true })} />);
    expect(keep()).toContainHTML('keep-pop');
  });

  it('fetches the cover at the width the hero gives it, side by side or stacked', () => {
    const art = 'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/bb/x.jpg/600x600bb.jpg';
    render(<NowPlayingView {...props({ track: { ...props().track!, art } })} />);
    const sizes = screen
      .getByRole('img', { name: 'Pochette de Mimoun, Mickey 3D' })
      .getAttribute('sizes');

    // Beside the thread (hero-split), the player's column: the screen's height less the header,
    // the title, the actions and some air, up to the mockup's 520 px and 42% of the width; on a
    // phone on its side, beside the title; then stacked, the line or the height the first lines of
    // the thread leave.
    const split = 'clamp(20rem, 97vh - 16rem, min(32.5rem, 42vw))';
    expect(sizes).toBe(
      [
        `(min-width: 64rem) and (min-height: 30rem) ${split}`,
        `(min-width: 48rem) and (orientation: landscape) and (min-height: 30rem) ${split}`,
        '(orientation: landscape) and (max-height: 30rem) min(100vh - 7rem, 40vw)',
        '(min-width: 48rem) min(100vw - 5rem, 100vh - 32rem)',
        'min(100vw - 3rem, 100vh - 30rem)',
      ].join(', ')
    );
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

    rerender(<NowPlayingView {...props({ track: next, hasChanged: true })} />);
    const dialog = screen.getByRole('dialog', { name: 'Respire' });
    expect(within(dialog).getByRole('img')).toHaveProperty('src', art('b'));
  });
});

describe('NowPlayingFallback', () => {
  it('says the track does not show, keeps the live to hear, and retries', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    spy.mockRestore();
  });
});
