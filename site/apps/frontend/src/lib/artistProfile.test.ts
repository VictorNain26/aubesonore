// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { localizeHref } from '@/paraglide/runtime.js';
import { useLocaleStore } from '../stores/localeStore';
import { artistPath } from './artistProfile';

afterEach(() => {
  useLocaleStore.getState().setLocale('fr');
});

describe('artistPath', () => {
  it.each(['fr', 'en'] as const)('gives the path localizeHref gives, in %s', (locale) => {
    useLocaleStore.getState().setLocale(locale);

    for (const slug of ['daft-punk', 'cassius-2', 'sigur-rós', 'a$&b']) {
      expect(artistPath({ slug })).toBe(localizeHref(`/artiste/${encodeURIComponent(slug)}`));
    }
    expect(artistPath({ slug: 'daft-punk' })).toBe(
      locale === 'fr' ? '/artiste/daft-punk' : '/en/artist/daft-punk'
    );
  });
});
