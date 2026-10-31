// Reads the tokens of src/design/tokens.css, by day and by night: the top-level :root, a token
// that changes written `var(--by-day, …) var(--by-night, …)`. No Node API, so the catalogue reads
// it in the browser (src/stories/foundations.ts) as scripts/check-contrast.mjs does in Node.

const DAY_AND_NIGHT = /^var\(--by-day,\s*(.+)\)\s+var\(--by-night,\s*(.+)\)$/;
/** The player bar, whose light is read through the bar's own veil and inks. */
const BAR = '@utility player-bar';

/** The declarations between the brace that follows `from` and the brace that closes it. */
export const blockAfter = (css, from) => {
  const open = css.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block at ${from}`);
};

export const declarations = (text) => {
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

export const readSchemes = (css) => {
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
