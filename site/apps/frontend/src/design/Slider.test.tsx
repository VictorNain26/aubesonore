// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from './Slider';

describe('Slider', () => {
  it('draws the line up to the value, flat past it', () => {
    render(<Slider label="Volume" value={80} min={0} max={100} onValueChange={vi.fn()} />);
    const played = screen.getByTestId('slider-played').getAttribute('d');
    expect(played).toMatch(/^M0 [\d.]+( L[\d.]+ [\d.]+)+$/);
    expect(played).toMatch(/ L80 [\d.]+$/);
    expect(screen.getByTestId('slider-rest')).toHaveAttribute('d', 'M80 8 L100 8');
  });
});
