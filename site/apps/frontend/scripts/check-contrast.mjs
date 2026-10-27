import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Proves AA on the colour tokens of src/design/tokens.css, by day and by night (the top-level
// :root, a token that changes written `var(--by-day, …) var(--by-night, …)`), and that every
// oklch token lies in the sRGB gamut: out of it, a browser maps the colour back and the ratio
// computed here would hold for a colour no screen shows.

const DAY_AND_NIGHT = /^var\(--by-day,\s*(.+)\)\s+var\(--by-night,\s*(.+)\)$/;
/** The player bar, whose light is read through the bar's own veil and inks. */
const BAR = '@utility player-bar';

/** The declarations between the brace that follows `from` and the brace that closes it. */
const blockAfter = (css, from) => {
  const open = css.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block at ${from}`);
};

const declarations = (text) => {
  const vars = {};
  for (const m of text.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
};

/** The tokens of one scheme: each one's value, or its value by day or by night. */
const scheme = (vars, index) =>
  Object.fromEntries(
    Object.entries(vars).map(([key, value]) => {
      if (!/--by-(day|night)\b/.test(value)) return [key, value];
      const both = value.match(DAY_AND_NIGHT);
      if (!both) throw new Error(`--${key} must read var(--by-day, …) var(--by-night, …)`);
      return [key, both[index].trim()];
    })
  );

const readSchemes = (css) => {
  const root = css.search(/^:root\s*\{/m);
  if (root === -1) throw new Error('selector not found: :root');
  const tokens = declarations(blockAfter(css, root));
  if (!Object.values(tokens).some((value) => DAY_AND_NIGHT.test(value)))
    throw new Error('no token has a night value: var(--by-day, …) var(--by-night, …)');
  const day = scheme(tokens, 1);
  const night = scheme(tokens, 2);
  const bar = css.indexOf(BAR);
  if (bar === -1) throw new Error(`block not found: ${BAR}`);
  // Only the light's tokens: the bar's other declarations name tokens it redefines itself.
  const barLight = Object.fromEntries(
    Object.entries(declarations(blockAfter(css, bar))).filter(([key]) => key.startsWith('light-'))
  );
  return { day, night, barLight };
};

/** The token as [L, C, H], following var() references to another token. */
const resolve = (vars, key, seen = []) => {
  const value = vars[key];
  if (value === undefined) throw new Error(`missing --${key}`);
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) {
    if (seen.includes(key)) throw new Error(`--${key} refers to itself`);
    return resolve(vars, ref[1], [...seen, key]);
  }
  const m = value.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?)?\)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const oklchToLinearSrgb = ([L, C, H]) => {
  const h = (H * Math.PI) / 180;
  const [a, b] = [C * Math.cos(h), C * Math.sin(h)];
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};

// Rounding slack: a token written to three decimals may sit a hair past the edge.
const GAMUT_SLACK = 1e-4;
const inGamut = (rgb) => rgb.every((c) => c >= -GAMUT_SLACK && c <= 1 + GAMUT_SLACK);

const luminance = (rgb) => rgb.reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (a, b, w) => a.map((v, i) => v * w + b[i] * (1 - w));
const clip = (rgb) => rgb.map((c) => Math.min(1, Math.max(0, c)));
// A browser composites a translucent layer in gamma-encoded sRGB, not in linear light.
const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const over = (top, alpha, under) => mix(top.map(encode), under.map(encode), alpha).map(decode);

/** The colours of a scope of tokens, as linear sRGB, and their alpha. */
const colours = (vars) => {
  const c = (key) => {
    const lch = resolve(vars, key);
    if (!lch) throw new Error(`--${key} is not an oklch colour`);
    return clip(oklchToLinearSrgb(lch));
  };
  const alpha = (key) => {
    const ref = vars[key]?.match(/^var\(--([\w-]+)\)$/);
    if (ref) return alpha(ref[1]);
    const m = vars[key]?.match(/\/\s*([\d.]+)\)$/);
    if (!m) throw new Error(`--${key} has no alpha`);
    return Number(m[1]);
  };
  return { c, alpha };
};

/**
 * The light is dimmed per cover until the words over it hold (design/lightStrength.ts), weighed
 * for the inks of the surface it lies on, down to none: then the veil, where it is thinnest, over
 * the ground alone. That floor must hold them, or no light would: over the paper in the hero and
 * the sheet, over the bar in the player bar.
 */
const lightFloor = (where, { c, alpha }) => {
  const veiled = over(c('light-veil-top'), alpha('light-veil-top'), c('light-ground'));
  return [
    [`light-ink/veil over the ${where}`, c('light-ink'), veiled, 4.5],
    [`light-ink-muted/veil over the ${where}`, c('light-ink-muted'), veiled, 4.5],
  ];
};

const checkScheme = (scheme, vars, barLight) => {
  const rows = [];
  for (const key of Object.keys(vars)) {
    const lch = resolve(vars, key);
    if (lch && vars[key].startsWith('oklch('))
      rows.push({
        scheme,
        label: `gamut --${key}`,
        gamut: true,
        pass: inGamut(oklchToLinearSrgb(lch)),
      });
  }
  const page = colours(vars);
  const { c } = page;
  const glow = mix(c('dawn'), c('surface'), 0.3);
  const pairs = [
    ['text/surface', c('text'), c('surface'), 4.5],
    ['text-muted/surface', c('text-muted'), c('surface'), 4.5],
    ['text-faint/surface', c('text-faint'), c('surface'), 4.5],
    ['text/surface-raised', c('text'), c('surface-raised'), 4.5],
    ['text-muted/surface-raised', c('text-muted'), c('surface-raised'), 4.5],
    ['text-faint/surface-raised', c('text-faint'), c('surface-raised'), 4.5],
    ['accent/surface', c('accent'), c('surface'), 3.0],
    ['on-accent/accent', c('on-accent'), c('accent'), 4.5],
    ['on-accent-muted/accent', c('on-accent-muted'), c('accent'), 4.5],
    ['on-bar/bar', c('on-bar'), c('bar'), 4.5],
    ['on-bar-muted/bar', c('on-bar-muted'), c('bar'), 4.5],
    ['text/dawn-glow', c('text'), glow, 4.5],
    ...lightFloor('paper', page),
    ...lightFloor('bar', colours({ ...vars, ...barLight })),
    // The wave under the current page and the selected tab: a mark, beside text that holds AA.
    ['dawn-ink/surface', c('dawn-ink'), c('surface'), 3.0],
  ];
  for (const [label, fg, bg, floor] of pairs) {
    const r = ratio(fg, bg);
    rows.push({ scheme, label, ratio: r, floor, pass: r >= floor });
  }
  return rows;
};

/** One row per contrast pair and per oklch token, by day then by night. */
export const checkTokens = (css) => {
  const { day, night, barLight } = readSchemes(css);
  return [...checkScheme('day', day, barLight), ...checkScheme('night', night, barLight)];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = checkTokens(
    readFileSync(new URL('../src/design/tokens.css', import.meta.url), 'utf8')
  );
  for (const row of rows) {
    if (row.gamut && row.pass) continue;
    const detail = row.gamut ? 'outside sRGB' : `${row.ratio.toFixed(2)} (min ${row.floor})`;
    console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.scheme} ${row.label} ${detail}`);
  }
  const tokens = rows.filter((row) => row.gamut).length;
  console.log(`${rows.filter((row) => row.gamut && row.pass).length}/${tokens} tokens in sRGB`);
  process.exit(rows.every((row) => row.pass) ? 0 : 1);
}
