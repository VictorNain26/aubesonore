// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { artistLoader } from './artistPageData';

// The tab's cache keeps Musilogy by MBID: one per test.
const MBIDS: Record<string, string> = {
  'daft-punk-a': '056e4f3e-d505-4dad-8ec1-d04f521cbb56',
  'daft-punk-b': '9c9f1380-2516-4fc9-a3e6-f9f61941d090',
};
const PAGE_URL = 'http://localhost:3000/api/artist/page/:slug';
const musilogyUrl = (slug: string) => `http://localhost:3000/api/musilogy/artist/${MBIDS[slug]}`;

const profile = (slug: string) => ({
  id: null,
  name: 'Daft Punk',
  slug,
  mbid: MBIDS[slug],
  images: [],
  facts: null,
  summary: null,
  links: [],
  played: true,
});

const load = (path: string, slug: string) =>
  artistLoader({ params: { slug }, request: new Request(`http://localhost${path}`) });

let asked: string[] = [];

beforeEach(() => {
  asked = [];
  server.use(
    http.get(PAGE_URL, ({ request, params }) => {
      asked.push(new URL(request.url).searchParams.get('lang') ?? '');
      return HttpResponse.json(profile(String(params.slug)));
    })
  );
});

describe("an artist page's loader", () => {
  it('asks the profile in the language of the page it goes to, not the one it leaves', async () => {
    window.history.replaceState(null, '', '/artiste/daft-punk-a');
    server.use(http.get(musilogyUrl('daft-punk-a'), () => new HttpResponse(null, { status: 404 })));

    await load('/en/artist/daft-punk-a', 'daft-punk-a');

    expect(asked).toEqual(['en']);
  });

  it('asks Musilogy again next time when it failed, the page drawn without it meanwhile', async () => {
    server.use(http.get(musilogyUrl('daft-punk-b'), () => new HttpResponse(null, { status: 503 })));
    expect((await load('/artiste/daft-punk-b', 'daft-punk-b')).musilogy).toBeNull();

    const sections = { mbid: MBIDS['daft-punk-b'], name: 'Daft Punk' };
    server.use(http.get(musilogyUrl('daft-punk-b'), () => HttpResponse.json(sections)));
    expect((await load('/artiste/daft-punk-b', 'daft-punk-b')).musilogy).toEqual(sections);
  });
});
