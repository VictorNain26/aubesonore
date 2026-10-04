// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { NowPlayingView, type NowPlayingViewProps } from './NowPlaying';

// The artist link is a router <Link>.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

const playedAt = Math.floor(new Date(2026, 9, 1, 17, 1).getTime() / 1000);

function props(overrides: Partial<NowPlayingViewProps> = {}): NowPlayingViewProps {
  return {
    track: { title: 'Mimoun', artist: 'Mickey 3D', art: undefined, playedAt },
    isOnline: true,
    listeners: undefined,
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
  it('shows the start time, the title as a heading and the artist', () => {
    render(<NowPlayingView {...props()} />);

    expect(screen.getByText("à l'antenne depuis 17:01")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mimoun' })).toBeInTheDocument();
    expect(screen.getByText('Mickey 3D')).toBeInTheDocument();
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

  it('shows the listener count only from two listeners upwards', () => {
    const { rerender } = render(<NowPlayingView {...props({ listeners: 1 })} />);
    expect(screen.queryByText(/à l'écoute/)).not.toBeInTheDocument();

    rerender(<NowPlayingView {...props({ listeners: 3 })} />);
    expect(screen.getByText(/3 à l'écoute/)).toBeInTheDocument();
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
