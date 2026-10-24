// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeepHeart } from './KeepHeart';

// The heart is aria-hidden, so the tests read the markup the button around it holds.
const markup = () => screen.getByTestId('keep').innerHTML;

function Keep({ isKept }: { isKept: boolean }) {
  return (
    <button type="button" data-testid="keep">
      <KeepHeart isKept={isKept} />
    </button>
  );
}

describe('KeepHeart', () => {
  it('is an empty outline while the track is not kept', () => {
    render(<Keep isKept={false} />);
    expect(markup()).toMatch(/<path[^>]* fill="none"/);
  });

  it('fills once the track is kept', () => {
    const { rerender } = render(<Keep isKept={false} />);
    rerender(<Keep isKept />);
    expect(markup()).toMatch(/<path[^>]* fill="currentColor"/);
  });

  it('is decoration: the button carries the name', () => {
    render(<Keep isKept />);
    expect(markup()).toMatch(/^<svg[^>]* aria-hidden="true"/);
  });
});
