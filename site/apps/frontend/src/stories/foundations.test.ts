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
  --p-font-text: 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif;
  --p-font-display: 'Fraunces Variable', Georgia, serif;
  --sky-night: oklch(0.24 0.06 272);
  --surface: var(--by-day, oklch(0.93 0.018 60)) var(--by-night, oklch(0.235 0.045 268));
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
  --color-surface: var(--surface);
  --color-accent: var(--accent);
  --color-veil: var(--veil);
  --text-*: initial;
  --text-page: clamp(2.5rem, 1.75rem + 2.6vw, 4.5rem);
  --text-page--line-height: 1;
  --text-page--font-weight: 460;
  --text-page--letter-spacing: -0.032em;
  --text-body: 1rem;
}
`;

describe('colourRows', () => {
  it('gives each colour of the theme its value by day and by night', () => {
    expect(colourRows(SAMPLE)).toContainEqual({
      name: 'surface',
      day: 'oklch(0.93 0.018 60)',
      night: 'oklch(0.235 0.045 268)',
    });
  });

  it('follows a token that names another to the value it gives in each scheme', () => {
    expect(colourRows(SAMPLE)).toContainEqual({
      name: 'accent',
      day: 'oklch(0.26 0.045 270)',
      night: 'oklch(0.93 0.018 70)',
    });
  });

  it('reads a value written over two lines', () => {
    expect(colourRows(SAMPLE)).toContainEqual({
      name: 'veil',
      day: 'oklch(0.93 0.018 60 / 0.55)',
      night: 'oklch(0.18 0.04 268 / 0.38)',
    });
  });

  it('adds the sky, the same by day and by night', () => {
    expect(colourRows(SAMPLE)).toContainEqual({
      name: 'sky-night',
      day: 'oklch(0.24 0.06 272)',
      night: 'oklch(0.24 0.06 272)',
    });
  });

  it('lists every colour of the site’s theme, each with both values written out', () => {
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
  it('gives each text size its size, line height, weight and letter spacing', () => {
    expect(textRows(SAMPLE)).toEqual([
      {
        name: 'page',
        size: 'clamp(2.5rem, 1.75rem + 2.6vw, 4.5rem)',
        lineHeight: '1',
        weight: '460',
        tracking: '-0.032em',
      },
      { name: 'body', size: '1rem', lineHeight: null, weight: null, tracking: null },
    ]);
  });

  it('lists every text size of the site’s theme', () => {
    const sizes = [...themeCss.matchAll(/^\s*--text-([a-z]+):/gm)].map((m) => m[1]);
    expect(textRows(tokensCss).map((row) => row.name)).toEqual(sizes);
  });
});

describe('fontRows', () => {
  it('gives each family of the site its stack, the text first', () => {
    expect(fontRows(SAMPLE)).toEqual([
      { name: 'text', family: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif" },
      { name: 'display', family: "'Fraunces Variable', Georgia, serif" },
    ]);
  });
});
