// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VolumeControl } from './VolumeControl';

const props = { volume: 0.6, isMuted: false, onVolumeChange: vi.fn(), onToggleMute: vi.fn() };
// The slider's box: the element whose classes say when the level shows.
const levelBox = () => screen.getByTestId('volume-level');

describe('VolumeControl', () => {
  it('shows the level only where its container has room for it, in the player bar', () => {
    render(<VolumeControl {...props} />);
    expect(levelBox()).toHaveClass('hidden', '@min-[38rem]:flex');
  });

  it('always shows the level where its host asks for it, as the hero does', () => {
    render(<VolumeControl {...props} showLevel />);
    expect(levelBox()).not.toHaveClass('hidden');
    expect(levelBox()).toHaveClass('flex');
  });
});
