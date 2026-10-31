import { blockAfter, declarations, readSchemes, type Tokens } from '../../scripts/tokens.mjs';

// The catalogue's Foundations pages (src/stories/*.mdx) read the tokens of src/design/tokens.css
// as written, through the reader scripts/check-contrast.mjs uses: they show what the site draws
// and cannot drift from it.

export interface ColourRow {
  name: string;
  day: string;
  night: string;
}

export interface TextRow {
  name: string;
  size: string;
  lineHeight: string | null;
  weight: string | null;
  tracking: string | null;
}

/** The value a token gives in one scheme, following a token that names another. */
function valueIn(tokens: Tokens, name: string, seen: string[] = []): string {
  const value = tokens[name];
  if (value === undefined) throw new Error(`missing --${name}`);
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (!ref?.[1] || !(ref[1] in tokens)) return value;
  if (seen.includes(name)) throw new Error(`--${name} refers to itself`);
  return valueIn(tokens, ref[1], [...seen, name]);
}

/** The declarations of the `@theme inline` block, Tailwind's view of the tokens. */
function theme(css: string): Tokens {
  // At the start of a line: a comment names the block too.
  const at = css.search(/^@theme inline\s*\{/m);
  if (at === -1) throw new Error('block not found: @theme inline');
  return declarations(blockAfter(css, at));
}

/**
 * Every colour of the theme (its `--color-*`, the only ones a class can name), by day and by night,
 * then the sky, the same in both.
 */
export function colourRows(css: string): ColourRow[] {
  const { day, night } = readSchemes(css);
  const themed = Object.entries(theme(css)).flatMap(([key, value]) => {
    const name = key.startsWith('color-') ? value.match(/^var\(--([\w-]+)\)$/)?.[1] : undefined;
    return name ? [name] : [];
  });
  const sky = Object.keys(day).filter((name) => name.startsWith('sky-'));
  return [...themed, ...sky].map((name) => ({
    name,
    day: valueIn(day, name),
    night: valueIn(night, name),
  }));
}

/** The site's font families (the `--p-font-*` primitives), in the order tokens.css gives them. */
export function fontRows(css: string): { name: string; family: string }[] {
  const { day } = readSchemes(css);
  return Object.entries(day)
    .filter(([key]) => key.startsWith('p-font-'))
    .map(([key, family]) => ({ name: key.slice('p-font-'.length), family }));
}

/** Every text size of the theme (its `--text-*`), with what Tailwind sets beside it. */
export function textRows(css: string): TextRow[] {
  const tokens = theme(css);
  return Object.keys(tokens)
    .filter((key) => /^text-[a-z]+$/.test(key))
    .map((key) => ({
      name: key.slice('text-'.length),
      size: tokens[key] ?? '',
      lineHeight: tokens[`${key}--line-height`] ?? null,
      weight: tokens[`${key}--font-weight`] ?? null,
      tracking: tokens[`${key}--letter-spacing`] ?? null,
    }));
}
