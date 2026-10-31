import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colourRows, fontRows, textRows } from './foundations';

// Read from disk: Vitest stubs the stylesheets it imports, `?raw` included.
const tokensCss = readFileSync(new URL('../design/tokens.css', import.meta.url), 'utf8');
/** From the theme block on: what Tailwind turns into classes. */
const themeCss = tokensCss.slice(tokensCss.search(/^@theme inline/m));

const SAMPLE = `
:root {
  --by-day: initial;
  --by-night: ;
  --text: var(--by-day, oklch(0.26 0.045 270)) var(--by-night, oklch(0.93 0.018 70));
  --accent: var(--text);
  --veil: var(--by-day, oklch(0.93 0.018 60 / 0.55))
    var(--by-night, oklch(0.18 0.04 268 / 0.38));
}
@utility player-bar {
  --light-veil-top: var(--bar-veil);
}
@theme inline {
  --color-*: initial;
  --color-accent: var(--accent);
  --color-veil: var(--veil);
  --text-*: initial;
  --text-page: clamp(2.5rem, 1.75rem + 2.6vw, 4.5rem);
  --text-page--line-height: 1;
  --text-page--font-weight: 460;
  --text-body: 1rem;
}
`;

describe('colourRows', () => {
  it('follows a token that names another, and reads a value written over two lines', () => {
    expect(colourRows(SAMPLE)).toEqual([
      { name: 'accent', day: 'oklch(0.26 0.045 270)', night: 'oklch(0.93 0.018 70)' },
      { name: 'veil', day: 'oklch(0.93 0.018 60 / 0.55)', night: 'oklch(0.18 0.04 268 / 0.38)' },
    ]);
  });

  it('gives every colour of the site’s theme a written value by day and by night', () => {
    const rows = colourRows(tokensCss);
    const themed = [...themeCss.matchAll(/^\s*--color-([\w-]+):\s*var\(/gm)].length;
    expect(rows.filter((row) => !row.name.startsWith('sky-'))).toHaveLength(themed);
    for (const row of rows) {
      expect(row.day).not.toMatch(/--by-|^var\(/);
      expect(row.night).not.toMatch(/--by-|^var\(/);
    }
  });
});

describe('textRows', () => {
  it('reads each size with what Tailwind sets beside it, null where nothing is', () => {
    expect(textRows(SAMPLE)).toEqual([
      {
        name: 'page',
        size: 'clamp(2.5rem, 1.75rem + 2.6vw, 4.5rem)',
        lineHeight: '1',
        weight: '460',
        tracking: null,
      },
      { name: 'body', size: '1rem', lineHeight: null, weight: null, tracking: null },
    ]);
  });

  it('lists every text size of the site’s theme', () => {
    const sizes = [...themeCss.matchAll(/^\s*--text-([a-z]+):/gm)].map((m) => m[1]);
    expect(textRows(tokensCss).map((row) => row.name)).toEqual(sizes);
  });
});

it('lists the site’s font families, the text first', () => {
  expect(fontRows(tokensCss).map((row) => row.name)).toEqual(['text', 'display']);
});
