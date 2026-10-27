// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VolumeControl } from './VolumeControl';

const props = { volume: 0.6, isMuted: false, onVolumeChange: vi.fn(), onToggleMute: vi.fn() };

describe('VolumeControl', () => {
  it('shows the level beside the speaker wherever it is shown, the bar as the hero', () => {
    render(<VolumeControl {...props} />);
    expect(screen.getByTestId('volume-level')).not.toHaveClass('hidden');
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '60');
  });

  it('reads the level as silence while muted', () => {
    render(<VolumeControl {...props} isMuted />);
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '0');
  });
});
