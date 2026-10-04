// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
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
    expect(screen.getByText(/^extrait de/)).toHaveTextContent(
      'extrait de Tu vas pas mourir de rire'
    );
  });

  it("leaves out a single's album, which only repeats the title", () => {
    const track = { title: 'Four to the Floor', artist: 'Starsailor', art: undefined };
    render(<NowPlayingView {...props({ track: { ...track, album: 'Four To The Floor' } })} />);
    expect(screen.getAllByText(/four to the floor/i)).toHaveLength(1);
  });

  it('puts Écouter under the title and shows the connecting and listening states', async () => {
    const onToggleListen = vi.fn();
    const { rerender } = render(<NowPlayingView {...props({ onToggleListen })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Écouter le direct' }));
    expect(onToggleListen).toHaveBeenCalledOnce();

    rerender(<NowPlayingView {...props({ listen: 'connecting' })} />);
    expect(screen.getByText('Un instant…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mettre en pause' })).toHaveAttribute(
      'aria-busy',
      'true'
    );

    rerender(<NowPlayingView {...props({ listen: 'playing' })} />);
    expect(screen.getByText('Pause')).toBeInTheDocument();
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

  it('offers the volume beside Écouter only while listening', () => {
    const volume = { volume: 0.5, isMuted: false, onVolumeChange: vi.fn(), onToggleMute: vi.fn() };
    const { rerender } = render(<NowPlayingView {...props({ volume })} />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    rerender(<NowPlayingView {...props({ volume, listen: 'playing' })} />);
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('says radio silence when the station is off air', () => {
    render(<NowPlayingView {...props({ isOnline: false })} />);
    expect(screen.getByText('Silence radio. Retour dans un instant.')).toBeInTheDocument();
  });

  it('beats the heart when a track is kept, not when it loads kept', () => {
    const { rerender } = render(<NowPlayingView {...props({ isKept: true })} />);
    const keep = () => screen.getByRole('button', { name: 'Garder' });
    expect(keep()).not.toContainHTML('keep-pop');

    rerender(<NowPlayingView {...props({ isKept: false })} />);
    rerender(<NowPlayingView {...props({ isKept: true })} />);
    expect(keep()).toContainHTML('keep-pop');
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

    expect(screen.getByRole('alert')).toHaveTextContent("Le titre en cours ne s'affiche pas.");
    expect(screen.getByRole('button', { name: 'Écouter le direct' })).toBeInTheDocument();

    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(screen.getByText('Mimoun')).toBeInTheDocument();
    spy.mockRestore();
  });
});
