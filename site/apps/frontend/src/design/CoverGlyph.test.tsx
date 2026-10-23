// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoverGlyph } from './CoverGlyph';

function drawing(seed: string) {
  const { unmount } = render(<CoverGlyph seed={seed} />);
  const html = screen.getByRole('img', { name: 'Pochette indisponible' }).innerHTML;
  const lines = [...html.matchAll(/<path[^>]* d="([^"]+)"/g)].map((match) => match[1]);
  const suns = [...html.matchAll(/<circle[^>]* cx="([^"]+)"/g)].map((match) => match[1]);
  unmount();
  return { lines, suns };
}

describe('CoverGlyph', () => {
  it('draws a missing cover as one thin line over a sun', () => {
    const { lines, suns } = drawing('Mickey 3D|Mimoun');
    expect(lines).toHaveLength(1);
    expect(suns).toHaveLength(1);
  });

  it('gives a track the same cover every time, and another track another one', () => {
    expect(drawing('Mickey 3D|Mimoun')).toEqual(drawing('Mickey 3D|Mimoun'));
    expect(drawing('Mickey 3D|Mimoun').lines).not.toEqual(drawing('SLIFT|Confluence').lines);
  });
});
