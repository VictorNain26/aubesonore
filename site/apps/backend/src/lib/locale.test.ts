import { describe, expect, it } from 'bun:test';
import { requestLocale } from './locale';

describe('requestLocale', () => {
  it('takes the first of fr and en, French otherwise', () => {
    expect(requestLocale('en-US,en;q=0.9')).toBe('en');
    expect(requestLocale('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(requestLocale('de-DE,en;q=0.5')).toBe('en');
    expect(requestLocale('de-DE')).toBe('fr');
    expect(requestLocale(null)).toBe('fr');
  });
});
