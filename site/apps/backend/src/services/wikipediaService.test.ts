import { describe, it, expect, spyOn, afterEach } from 'bun:test';
// Real Wikidata and Wikipedia answers (2026-10-02).
import sitelinksEnOnly from './__fixtures__/wikidata-sitelinks-en.json';
import sitelinksFrEn from './__fixtures__/wikidata-sitelinks-fr-en.json';
import disambiguation from './__fixtures__/wikipedia-summary-disambiguation.json';
import summaryEn from './__fixtures__/wikipedia-summary-en.json';
import summaryFr from './__fixtures__/wikipedia-summary-fr.json';

const { getSummary, firstSentences, wikipediaCache } = await import('./wikipediaService');

afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore?.();
  wikipediaCache.dispose();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Answers each upstream URL with its fixture, and records what was asked. */
function serve(routes: Record<string, unknown>) {
  return spyOn(globalThis, 'fetch').mockImplementation(((input: string) => {
    const match = Object.keys(routes).find((prefix) => input.startsWith(prefix));
    return Promise.resolve(match ? json(routes[match]) : json({}, 404));
  }) as typeof fetch);
}

const WIKIDATA = 'https://www.wikidata.org/w/api.php';

describe('getSummary', () => {
  it('opens the article in the page language, across an initial, without its long list', async () => {
    const fetchSpy = serve({
      [WIKIDATA]: sitelinksFrEn,
      'https://fr.wikipedia.org/api/rest_v1/page/summary/Joshua_Tillman': summaryFr,
    });

    expect(await getSummary('Q6107266', 'fr')).toEqual({
      status: 'found',
      value: {
        text:
          'Joshua Michael Tillman, aussi connu sous le nom de J. Tillman ou Father John Misty, ' +
          'est un chanteur, guitariste, compositeur et batteur américain.',
        lang: 'fr',
        url: 'https://fr.wikipedia.org/wiki/Joshua_Tillman',
      },
    });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toContain('AubeSonore');
  });

  it('falls back to the other language when the article only exists there', async () => {
    serve({
      [WIKIDATA]: sitelinksEnOnly,
      'https://en.wikipedia.org/api/rest_v1/page/summary/Velocity_Girl': summaryEn,
    });

    const found = await getSummary('Q7919286', 'fr');
    const summary = found.status === 'found' ? found.value : null;

    expect(summary?.lang).toBe('en');
    expect(summary?.text).toBe(
      'Velocity Girl was an American indie rock band formed in 1989 in College Park, ' +
        'Maryland, and active in the Washington, D.C., area. ' +
        'The band released three albums before splitting up in 1996.'
    );
  });

  it('shows nothing for a disambiguation page', async () => {
    serve({
      [WIKIDATA]: sitelinksEnOnly,
      'https://en.wikipedia.org/api/rest_v1/page/summary/Velocity_Girl': disambiguation,
    });

    expect(await getSummary('Q7919286', 'en')).toEqual({ status: 'none' });
  });

  it('never caches a failure as "no article"', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 503 })
    );

    expect(await getSummary('Q7919286', 'en')).toEqual({ status: 'failed' });

    fetchSpy.mockRestore();
    serve({
      [WIKIDATA]: sitelinksEnOnly,
      'https://en.wikipedia.org/api/rest_v1/page/summary/Velocity_Girl': summaryEn,
    });
    expect(await getSummary('Q7919286', 'en')).toMatchObject({
      status: 'found',
      value: { lang: 'en' },
    });
  });
});

describe('firstSentences', () => {
  it('keeps a short text whole', () => {
    expect(firstSentences('Weval est un groupe néerlandais.', 'fr')).toBe(
      'Weval est un groupe néerlandais.'
    );
  });

  it('reads through initials and short titles', () => {
    // A second sentence too long to join: before the fix, the summary was "Dr.".
    const long = `He produced ${'records, '.repeat(40)}for other artists.`;
    expect(firstSentences(`Andre Young, known as Dr. Dre, is a rapper. ${long}`, 'en')).toBe(
      'Andre Young, known as Dr. Dre, is a rapper.'
    );
    expect(
      firstSentences('Josh Tillman, dit Father John Misty ou J. Tillman, est un musicien.', 'fr')
    ).toBe('Josh Tillman, dit Father John Misty ou J. Tillman, est un musicien.');
  });
});
