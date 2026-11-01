import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromSrc, sources } from './sourceFiles';

/**
 * The charter's two shapes (tokens.css, --radius-full): the disc for the two main actions, Écouter
 * and Garder, and for the live, the right angle for every other control. The pill had become the
 * shape of every link, field and button (37 uses before the charter), so a new one has to be argued
 * here. The list is exact: a file that no longer draws a disc leaves it too.
 */
const DISCS: Record<string, string> = {
  'home/listen.tsx': 'the Écouter pill, its disc, its live bars and its waiting ring',
  'home/Horizon.tsx': 'the now dot on the horizon',
  'shell/PlayerBar.tsx': "Écouter's disc on a phone, and Garder",
  'design/classes.ts': 'the ring of Garder beside Écouter',
  'design/onAir.tsx': 'the live dot',
  'design/Button.tsx': "the loading spinner's ring",
};

/**
 * Three control heights (the charter's « Composants »): 56 px for the hero's and the sheet's
 * actions, 48 for the bar's and the forms', 44, the smallest target, for the rest. 52 and 64 px
 * were the two off the scale; the artist's horizon is a band, not a control.
 */
const OFF_SCALE = /(?<![\w-])(?:min-h|h|size)-(?:13|16)(?![\w.-])/;
const BANDS: Record<string, string> = {
  'artist/ArtistPageView.tsx': "the artist's horizon band",
};

const files = sources().map((path) => ({ path: fromSrc(path), code: readFileSync(path, 'utf8') }));

describe('shapes', () => {
  it('draws a disc only where the charter keeps one', () => {
    const withDisc = files
      .filter(({ code }) => code.includes('rounded-full'))
      .map(({ path }) => path)
      .sort();
    expect(withDisc).toEqual(Object.keys(DISCS).sort());
  });

  it('draws the live dot in one place, the same wherever the live is said', () => {
    const LIVE_DOT = /bg-dawn(?:-ink)?\b[^'"`]*rounded-full|rounded-full[^'"`]*bg-dawn/;
    const withDot = files.filter(({ code }) => LIVE_DOT.test(code)).map(({ path }) => path);
    expect(withDot).toEqual(['design/onAir.tsx']);
  });

  it('draws the controls at the three heights alone', () => {
    const offScale = files
      .filter(({ path, code }) => !(path in BANDS) && OFF_SCALE.test(code))
      .map(({ path }) => path);
    expect(offScale).toEqual([]);
  });
});
