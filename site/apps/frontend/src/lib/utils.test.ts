import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cn } from './utils';

const tokensCss = readFileSync(new URL('../design/tokens.css', import.meta.url), 'utf8');
const themeCss = tokensCss.slice(tokensCss.search(/^@theme inline/m));
/** The charter's sizes (tokens.css), which the extendTailwindMerge list has to name. */
const SIZES = [...themeCss.matchAll(/^\s*--text-([a-z]+):/gm)].flatMap((match) =>
  match[1] ? [match[1]] : []
);

describe('cn', () => {
  it('still resolves two sizes or two colors to the last one', () => {
    expect(cn('text-body', 'text-small')).toBe('text-small');
    expect(cn('text-text', 'text-on-accent')).toBe('text-on-accent');
  });

  it('keeps every size of tokens.css beside a text colour', () => {
    expect(SIZES).not.toEqual([]);
    for (const size of SIZES) {
      expect(cn(`text-${size}`, 'text-text-muted')).toBe(`text-${size} text-text-muted`);
    }
  });
});
