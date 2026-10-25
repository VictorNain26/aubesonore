import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Proves AA on the colour tokens of src/design/tokens.css, by day (the top-level :root) and by
// night (the :root under prefers-color-scheme: dark, over the day's), and that every oklch token
// lies in the sRGB gamut: out of it, a browser maps the colour back and the ratio computed here
// would hold for a colour no screen shows.

const NIGHT = '@media (prefers-color-scheme: dark)';

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

const readSchemes = (css) => {
  const root = css.search(/^:root\s*\{/m);
  if (root === -1) throw new Error('selector not found: :root');
  const media = css.indexOf(NIGHT);
  if (media === -1) throw new Error(`block not found: ${NIGHT}`);
  const nightRoot = blockAfter(css, media).indexOf(':root');
  if (nightRoot === -1) throw new Error(`selector not found: ${NIGHT} :root`);
  const day = declarations(blockAfter(css, root));
  const night = { ...day, ...declarations(blockAfter(blockAfter(css, media), nightRoot)) };
  return { day, night };
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
const BLACK = [0, 0, 0];
const WHITE = [1, 1, 1];

const checkScheme = (scheme, vars) => {
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
  const c = (key) => {
    const lch = resolve(vars, key);
    if (!lch) throw new Error(`--${key} is not an oklch colour`);
    return clip(oklchToLinearSrgb(lch));
  };
  const glow = mix(c('dawn'), c('surface'), 0.3);
  const alpha = (key) => {
    const m = vars[key]?.match(/\/\s*([\d.]+)\)$/);
    if (!m) throw new Error(`--${key} has no alpha`);
    return Number(m[1]);
  };
  const number = (key) => {
    const value = Number(vars[key]);
    if (vars[key] === undefined || Number.isNaN(value)) throw new Error(`missing --${key}`);
    return value;
  };
  // The hero's light at its top, where its veil is thinnest, over the cover the text reads worst
  // on: a black one by day (dark ink), a white one by night (paper ink): the antenna plays both.
  // Its filter's contrast() and brightness() map each channel.
  const worstCover = scheme === 'day' ? BLACK : WHITE;
  const filtered = worstCover.map((channel) => {
    const g = (encode(channel) - 0.5) * number('light-contrast') + 0.5;
    return decode(Math.min(1, Math.max(0, g * number('light-brightness'))));
  });
  const light = over(filtered, number('light-opacity'), c('surface'));
  const lit = over(c('light-veil-top'), alpha('light-veil-top'), light);
  // « En direct » over the lightest cover.
  const tag = over(c('tag'), alpha('tag'), WHITE);
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
    ['text/light over the worst cover', c('text'), lit, 4.5],
    ['text-muted/light over the worst cover', c('text-muted'), lit, 4.5],
    ['on-tag/tag over a white cover', c('on-tag'), tag, 4.5],
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
  const { day, night } = readSchemes(css);
  return [...checkScheme('day', day), ...checkScheme('night', night)];
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
