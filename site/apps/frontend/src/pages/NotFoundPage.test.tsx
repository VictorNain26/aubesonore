// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NotFoundPage } from './NotFoundPage';

/** The points of a path, as [x, y]. */
function pointsOf(d: string): [number, number][] {
  return [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe('NotFoundPage', () => {
  it('draws the horizon fallen silent in its middle: dead air', () => {
    render(<NotFoundPage />, { wrapper: MemoryRouter });
    // The line is decoration (aria-hidden): read from the markup of the page's main.
    const line =
      /<svg[^>]* viewBox="0 0 (\d+) (\d+)" preserveAspectRatio="none"[^>]*><path[^>]* d="([^"]+)"/.exec(
        screen.getByRole('main').innerHTML
      );
    const width = Number(line?.[1]);
    const height = Number(line?.[2]);
    const points = pointsOf(line?.[3] ?? '');
    expect(points.length).toBeGreaterThan(100);

    const silent = points.filter(([x]) => x > 0.6 * width && x < 0.74 * width);
    const heard = points.filter(([x]) => x < 0.45 * width);
    expect(silent.length).toBeGreaterThan(0);
    expect(silent.every(([, y]) => y === height / 2)).toBe(true);
    expect(heard.some(([, y]) => Math.abs(y - height / 2) > 1)).toBe(true);
  });
});
