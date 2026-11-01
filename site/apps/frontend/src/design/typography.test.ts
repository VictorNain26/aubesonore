import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cn } from '../lib/utils';
import { fromSrc, sources } from './sourceFiles';

/**
 * The charter's type (tokens.css): its sizes and weights are the only ones, the real italic is the
 * tagline's alone, and figures are proportional but in the columns of numbers. Tailwind drops a
 * class whose token is gone without a word, so a size or a weight left behind by a change of the
 * scale would draw the inherited one unnoticed.
 */

/** The files that align figures in a column: dates, years and ranks read down a list. */
const TABULAR: Record<string, string> = {
  'library/MyTracksView.tsx': "the kept date's column",
  'artist/ArtistPageView.tsx': "the kept tracks' dates",
  'musilogy/MusilogyTimeline.tsx': "the axis's years and the ranks' column",
  'musilogy/SearchView.tsx': "the results' years",
  'musilogy/ArtistSections.tsx': "the members' years",
};

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const themeCss = tokensCss.slice(tokensCss.search(/^@theme inline/m));

function names(pattern: RegExp): string[] {
  return [...themeCss.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : []));
}

const SIZES = names(/^\s*--text-([a-z]+):/gm);
const WEIGHTS = names(/^\s*--font-weight-([a-z]+):/gm);
const FAMILIES = names(/^\s*--font-([a-z]+):/gm);
const COLOURS = names(/^\s*--color-([a-z]+):/gm);
/** Tailwind's own `text-*` utilities that are not a size: alignment, wrapping, overflow. */
const TEXT_KEYWORDS = ['left', 'center', 'right', 'justify', 'start', 'end'];
const TEXT_WRAPS = ['balance', 'pretty', 'wrap', 'nowrap', 'ellipsis', 'clip'];

const files = sources().map((path) => ({ path: fromSrc(path), code: readFileSync(path, 'utf8') }));

/** Every `<prefix>-<word>` class written in the scripts, a word with no hyphen after it. */
function classes(prefix: string): { path: string; name: string }[] {
  const pattern = new RegExp(`(?<![\\w-])${prefix}-([a-z]+)(?![\\w/-])`, 'g');
  return files.flatMap(({ path, code }) =>
    [...code.matchAll(pattern)].flatMap((match) => (match[1] ? [{ path, name: match[1] }] : []))
  );
}

describe('the type scale', () => {
  it('names only the sizes of tokens.css', () => {
    const known = new Set([...SIZES, ...COLOURS, ...TEXT_KEYWORDS, ...TEXT_WRAPS]);
    expect(classes('text').filter(({ name }) => !known.has(name))).toEqual([]);
  });

  it('names only the weights and families of tokens.css', () => {
    const known = new Set([...WEIGHTS, ...FAMILIES]);
    expect(classes('font').filter(({ name }) => !known.has(name))).toEqual([]);
  });

  it('keeps every size beside a text colour in cn()', () => {
    for (const size of SIZES) {
      expect(cn(`text-${size}`, 'text-text-muted')).toBe(`text-${size} text-text-muted`);
    }
  });
});

describe('the figures and the italic', () => {
  it('leaves the figures proportional but in the columns of numbers', () => {
    expect(indexCss).not.toMatch(/tabular-nums/);
    const tabular = files
      .filter(({ code }) => /(?<![\w-])tabular-nums/.test(code))
      .map(({ path }) => path)
      .sort();
    expect(tabular).toEqual(Object.keys(TABULAR).sort());
  });

  it('sets the italic on the tagline alone', () => {
    // The class, between quotes or spaces: not `not-italic`, nor the word in a sentence.
    const italic = files.filter(({ code }) => /(?<=['"`\s])italic(?=['"`\s])/.test(code));
    expect(italic.map(({ path }) => path)).toEqual(['shell/SiteHeader.tsx']);
  });
});
