import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The tone guide's rule 8: French typography is part of the voice. The no-break space is U+00A0,
// not the narrow U+202F French typesetting prefers: neither Fraunces nor Atkinson Hyperlegible
// Next (the Fontsource latin files) draws U+202F, and the browser would take it from another font.

function messages(locale) {
  return JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'));
}

/** The keys whose value matches `pattern`, so a failure names them. */
function offenders(locale, pattern) {
  return Object.entries(messages(locale))
    .filter(([, value]) => pattern.test(value))
    .map(([key]) => key);
}

describe('messages typography', () => {
  it('writes every French apostrophe curly', () => {
    expect(offenders('fr', /'/)).toEqual([]);
  });

  it('holds ; ? ! : and » to the word before, and « to the word after, by a U+00A0 space', () => {
    expect(offenders('fr', /[^\u00a0][;?!:»]|^[;?!:»]/)).toEqual([]);
    expect(offenders('fr', /«[^\u00a0]/)).toEqual([]);
  });

  it('writes every English apostrophe curly', () => {
    expect(offenders('en', /'/)).toEqual([]);
  });
});
