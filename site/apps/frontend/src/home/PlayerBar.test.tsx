// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerBarView, type PlayerBarViewProps } from './PlayerBar';

const playedAt = Math.floor(new Date(2026, 9, 1, 17, 1).getTime() / 1000);

function props(overrides: Partial<PlayerBarViewProps> = {}): PlayerBarViewProps {
  return {
    isHidden: false,
    listen: 'idle',
    onToggleListen: vi.fn(),
    track: { title: 'Mimoun', artist: 'Mickey 3D', art: undefined, playedAt },
    isKept: false,
    onToggleKeep: vi.fn(),
    volume: 0.8,
    isMuted: false,
    onVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    airPlay: null,
    ...overrides,
  };
}

describe('PlayerBarView', () => {
  it('puts the title and the artist forward, without the time', async () => {
    const onToggleListen = vi.fn();
    render(<PlayerBarView {...props({ onToggleListen })} />);

    expect(screen.getByText('Mimoun')).toBeInTheDocument();
    expect(screen.getByText('Mickey 3D')).toBeInTheDocument();
    expect(screen.queryByText(/à l'antenne/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Écouter le direct' }));
    expect(onToggleListen).toHaveBeenCalledOnce();
  });

  it('says Écouter while nothing is known of the live', () => {
    render(<PlayerBarView {...props({ track: null })} />);
    expect(screen.getByText('Écouter')).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: 'Écouter le direct' }));
    rerender(<PlayerBarView {...props({ isHidden: true })} />);
    expect(screen.getByRole('region', { hidden: true })).toHaveAttribute('inert');
  });

  it('keeps the track with a constant label', async () => {
    const onToggleKeep = vi.fn();
    render(<PlayerBarView {...props({ onToggleKeep, isKept: true })} />);

    const keep = screen.getByRole('button', { name: 'Garder « Mimoun »' });
    expect(keep).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(keep);
    expect(onToggleKeep).toHaveBeenCalledOnce();
  });

  it('keeps the volume in view and offers AirPlay only when available', async () => {
    const onOpen = vi.fn();
    const onToggleMute = vi.fn();
    const { rerender } = render(<PlayerBarView {...props({ onToggleMute })} />);

    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '80');
    await userEvent.click(screen.getByRole('button', { name: 'Couper le son' }));
    expect(onToggleMute).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Diffuser via AirPlay' })).not.toBeInTheDocument();

    rerender(<PlayerBarView {...props({ airPlay: { isActive: false, onOpen } })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Diffuser via AirPlay' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
