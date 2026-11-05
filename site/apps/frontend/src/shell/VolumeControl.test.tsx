// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VolumeControl } from './VolumeControl';

const props = { volume: 0.6, isMuted: false, onVolumeChange: vi.fn(), onToggleMute: vi.fn() };

describe('VolumeControl', () => {
  it('reads the level from 0 to 100', () => {
    render(<VolumeControl {...props} />);
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '60');
  });

  it('reads the level as silence while muted', () => {
    render(<VolumeControl {...props} isMuted />);
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '0');
  });
});
