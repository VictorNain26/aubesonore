// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { PlayerBarView, type PlayerBarViewProps } from './PlayerBar';

// The track links to the artist's page: a router <Link>.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

const playedAt = Math.floor(new Date(2026, 9, 1, 17, 1).getTime() / 1000);

function props(overrides: Partial<PlayerBarViewProps> = {}): PlayerBarViewProps {
  return {
    isHidden: false,
    listen: 'idle',
    onToggleListen: vi.fn(),
    track: { title: 'Mimoun', artist: 'Mickey 3D', album: '', art: undefined, playedAt },
    isKept: false,
    onToggleKeep: vi.fn(),
    volume: 0.8,
    isMuted: false,
    onVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    airPlay: null,
    artistHref: null,
    isOnline: true,
    ...overrides,
  };
}

describe('PlayerBarView', () => {
  it('puts the title and the artist forward, without the time', async () => {
    const onToggleListen = vi.fn();
    render(<PlayerBarView {...props({ onToggleListen })} />);

    // Twice: the phone's sheet trigger and the larger screens' line, one hidden by CSS.
    expect(screen.getAllByText('Mimoun')).toHaveLength(2);
    expect(screen.getAllByText('Mickey 3D')).toHaveLength(2);
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
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir « Mimoun », Mickey 3D' }));

    const sheet = await screen.findByRole('dialog', { name: 'Mimoun' });
    expect(sheet).toHaveTextContent('extrait de Tu vas pas mourir de rire');
    // Modal: the page behind, the bar included, leaves the accessibility tree.
    expect(within(sheet).getByRole('button', { name: 'Écouter le direct' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Écouter le direct' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
