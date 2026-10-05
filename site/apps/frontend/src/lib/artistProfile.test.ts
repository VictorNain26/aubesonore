// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { localizeHref } from '@/paraglide/runtime.js';
import { server } from '../mocks/server';
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

describe('resolveArtistPage', () => {
  async function counting() {
    vi.resetModules();
    const asked: string[] = [];
    server.use(
      http.get('http://localhost:3000/api/artist/resolve', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') ?? '';
        asked.push(name);
        if (name === 'Unknown') return new HttpResponse(null, { status: 404 });
        return HttpResponse.json({ id: 'a-1', slug: 'hania-rani' });
      })
    );
    const { resolveArtistPage } = await import('./artistProfile');
    return { asked, resolveArtistPage };
  }

  it('asks once for an artist the hero and the player bar both show', async () => {
    const { asked, resolveArtistPage } = await counting();

    const [hero, bar] = await Promise.all([
      resolveArtistPage('Hania Rani'),
      resolveArtistPage('Hania Rani'),
    ]);
    const later = await resolveArtistPage('Hania Rani');

    expect(hero).toEqual({ id: 'a-1', slug: 'hania-rani' });
    expect(bar).toEqual(hero);
    expect(later).toEqual(hero);
    expect(asked).toEqual(['Hania Rani']);
  });

  it('asks again for an artist that had no page yet', async () => {
    const { asked, resolveArtistPage } = await counting();

    expect(await resolveArtistPage('Unknown')).toBeNull();
    expect(await resolveArtistPage('Unknown')).toBeNull();

    expect(asked).toEqual(['Unknown', 'Unknown']);
  });
});
