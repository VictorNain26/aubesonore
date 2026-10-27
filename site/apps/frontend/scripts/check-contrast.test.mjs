import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkTokens } from './check-contrast.mjs';

const tokens = readFileSync(new URL('../src/design/tokens.css', import.meta.url), 'utf8');

// A palette whose every pair passes by day and by night, to change one token at a time.
const day = {
  surface: 'oklch(0.93 0.018 60)',
  'surface-raised': 'oklch(0.895 0.022 58)',
  text: 'oklch(0.26 0.045 270)',
  'text-muted': 'oklch(0.42 0.05 275)',
  'text-faint': 'oklch(0.47 0.045 280)',
  accent: 'var(--text)',
  'on-accent': 'var(--surface)',
  'on-accent-muted': 'oklch(0.8 0.03 275)',
  bar: 'var(--accent)',
  'on-bar': 'var(--on-accent)',
  'on-bar-muted': 'var(--on-accent-muted)',
  dawn: 'oklch(0.82 0.11 55)',
  'dawn-ink': 'oklch(0.6 0.13 45)',
  'light-veil-top': 'oklch(0.93 0.018 60 / 0.55)',
  'light-ground': 'var(--surface)',
  'light-ink': 'var(--text)',
  'light-ink-muted': 'var(--text-muted)',
  'bar-veil': 'oklch(0.22 0.045 270 / 0.62)',
};
const night = {
  surface: 'oklch(0.235 0.045 268)',
  'surface-raised': 'oklch(0.285 0.05 268)',
  text: 'oklch(0.93 0.018 70)',
  'text-muted': 'oklch(0.8 0.03 280)',
  'text-faint': 'oklch(0.74 0.035 285)',
  'on-accent-muted': 'oklch(0.42 0.05 275)',
  bar: 'var(--surface-raised)',
  'on-bar': 'var(--text)',
  'on-bar-muted': 'var(--text-muted)',
  dawn: 'oklch(0.62 0.12 45)',
  'dawn-ink': 'var(--dawn)',
  'light-veil-top': 'oklch(0.18 0.04 268 / 0.38)',
  'bar-veil': 'oklch(0.2 0.045 268 / 0.55)',
};
// The light under the player bar: its ground, its veil and the inks it is weighed for.
const barLight = {
  'light-ground': 'var(--bar)',
  'light-veil-top': 'var(--bar-veil)',
  'light-ink': 'var(--on-bar)',
  'light-ink-muted': 'var(--on-bar-muted)',
};
const decls = (vars) =>
  Object.entries(vars)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n');
const css = (dayVars, nightVars, bar = barLight) =>
  `:root {\n${decls(dayVars)}\n}\n\n@theme inline {\n  --color-text: var(--text);\n}\n` +
  (nightVars
    ? `\n@media (prefers-color-scheme: dark) {\n  :root {\n${decls(nightVars)}\n  }\n}\n`
    : '') +
  `\n@utility player-bar {\n  --accent: var(--bar);\n${decls(bar)}\n}\n`;
const failures = (rows) =>
  rows.filter((row) => !row.pass).map((row) => `${row.scheme} ${row.label}`);

describe('checkTokens', () => {
  it('passes every pair of the site, by day and by night, in the sRGB gamut', () => {
    const rows = checkTokens(tokens);
    expect(failures(rows)).toEqual([]);
    expect(new Set(rows.map((row) => row.scheme))).toEqual(new Set(['day', 'night']));
  });

  it('passes a palette that holds by day and by night', () => {
    expect(failures(checkTokens(css(day, night)))).toEqual([]);
  });

  it('fails a night bar whose words do not hold on it, as a slab of paper under paper ink would', () => {
    const rows = checkTokens(css(day, { ...night, bar: 'var(--text)' }));
    expect(failures(rows)).toEqual([
      'night on-bar/bar',
      'night on-bar-muted/bar',
      'night light-ink/veil over the bar',
      'night light-ink-muted/veil over the bar',
    ]);
  });

  it('checks the night block with the same pairs', () => {
    const rows = checkTokens(css(day, { ...night, text: night.surface }));
    expect(failures(rows)).toContain('night text/surface');
    expect(failures(rows).filter((f) => f.startsWith('day'))).toEqual([]);
    const pairs = (scheme) => rows.filter((row) => row.scheme === scheme && !row.gamut);
    expect(pairs('night').map((row) => row.label)).toEqual(pairs('day').map((row) => row.label));
  });

  it('keeps by night a day token the night block does not redefine', () => {
    // accent and on-accent are not redefined: they still read the night's text and surface.
    const rows = checkTokens(css(day, night));
    const onAccent = rows.find((row) => row.scheme === 'night' && row.label === 'on-accent/accent');
    const text = rows.find((row) => row.scheme === 'night' && row.label === 'text/surface');
    expect(onAccent.ratio).toBeCloseTo(text.ratio, 5);
  });

  it('fails a token outside the sRGB gamut, which the ratio alone would clip silently', () => {
    // The rejected rose dawn of the research: its red channel is above 1.
    const rows = checkTokens(css({ ...day, dawn: 'oklch(0.83 0.1 40)' }, night));
    expect(failures(rows)).toEqual(['day gamut --dawn']);
  });

  it('accepts a token just inside the gamut', () => {
    expect(failures(checkTokens(css({ ...day, dawn: 'oklch(0.82 0.095 42)' }, night)))).toEqual([]);
  });

  it('fails a dawn ink too light for its wave to mark the current page', () => {
    // The mockup's ink, 2.3:1 on the paper: the wave alone says which page is open (WCAG 1.4.11).
    const rows = checkTokens(css({ ...day, 'dawn-ink': 'oklch(0.7 0.13 50)' }, night));
    expect(failures(rows)).toEqual(['day dawn-ink/surface']);
  });

  it("fails a veil the hero's words do not read on, the light dimmed to nothing", () => {
    // The light is dimmed per cover down to the veil over the paper (design/lightStrength.ts): that
    // floor must hold the words. A veil of the ink by day sinks them.
    const rows = checkTokens(
      css({ ...day, 'light-veil-top': 'oklch(0.45 0.05 270 / 0.55)' }, night)
    );
    expect(failures(rows)).toEqual(['day light-ink-muted/veil over the paper']);
  });

  it("fails a bar veil the bar's words do not read on, the light dimmed to nothing", () => {
    // A veil of the paper by day over the ink bar: its paper words sink.
    const rows = checkTokens(css({ ...day, 'bar-veil': 'oklch(0.93 0.018 60 / 0.8)' }, night));
    expect(failures(rows)).toEqual([
      'day light-ink/veil over the bar',
      'day light-ink-muted/veil over the bar',
    ]);
  });

  it("fails a bar whose light is weighed for the paper's text, not for the bar's own inks", () => {
    // By night the bar's inks are the text's; by day the paper's ink on the ink bar fails.
    const rows = checkTokens(
      css(day, night, {
        ...barLight,
        'light-ink': 'var(--text)',
        'light-ink-muted': 'var(--text-muted)',
      })
    );
    expect(failures(rows)).toEqual([
      'day light-ink/veil over the bar',
      'day light-ink-muted/veil over the bar',
    ]);
  });

  it('refuses tokens without the bar’s light', () => {
    expect(() => checkTokens(css(day, night).replace(/@utility player-bar[^}]*}/, ''))).toThrow(
      /player-bar/
    );
  });

  it('refuses tokens without a night block', () => {
    expect(() => checkTokens(css(day))).toThrow(/prefers-color-scheme: dark/);
  });

  it('refuses a palette missing a token of a pair', () => {
    const withoutDawn = { ...day };
    delete withoutDawn.dawn;
    expect(() => checkTokens(css(withoutDawn, night))).toThrow(/--dawn/);
  });
});
