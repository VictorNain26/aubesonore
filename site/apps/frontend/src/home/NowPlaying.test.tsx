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

    // The ring alone tells the waiting: the button already names what a press does.
    rerender(<NowPlayingView {...props({ listen: 'connecting' })} />);
    expect(screen.getByRole('button', { name: 'Arrêter le direct' })).toHaveAttribute(
      'aria-busy',
      'true'
    );

    // The player has no pause, only a stop: a press after rejoins the live where it is.
    rerender(<NowPlayingView {...props({ listen: 'playing' })} />);
    const stop = screen.getByRole('button', { name: 'Arrêter le direct' });
    expect(stop).not.toHaveAttribute('aria-busy', 'true');
    expect(stop).toHaveTextContent('Arrêter');
    expect(screen.queryByText('Pause')).not.toBeInTheDocument();
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

  it('offers neither Partager nor Diffuser: the hero holds Écouter, Garder and the volume', () => {
    render(<NowPlayingView {...props()} />);
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Diffuser/ })).not.toBeInTheDocument();
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
    const keep = () => screen.getByRole('button', { name: 'Garder «\u00a0Mimoun\u00a0»' });
    expect(keep()).not.toContainHTML('keep-pop');

    rerender(<NowPlayingView {...props({ isKept: false })} />);
    rerender(<NowPlayingView {...props({ isKept: true })} />);
    expect(keep()).toContainHTML('keep-pop');
  });

  it('fetches the cover at the width the hero gives it, beside the column or above it', () => {
    const art = 'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/bb/x.jpg/600x600bb.jpg';
    render(<NowPlayingView {...props({ track: { ...props().track!, art } })} />);
    const img = screen.getByRole('img', { name: 'Pochette de Mimoun, Mickey 3D' });

    // Beside the column (hero-split), the screen's height under the header, or the width the
    // column leaves; above it, the screen's width, held under the height the words need.
    expect(img.getAttribute('sizes')).toBe(
      [
        '(min-width: 48rem) and (orientation: landscape) min(100vh - 4.5rem, 100vw - 32rem)',
        'min(100vw, max(16rem, 100vh - 27rem))',
      ].join(', ')
    );
    // The page's largest image: fetched first.
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
