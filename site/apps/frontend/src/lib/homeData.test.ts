// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { forgetHomeData, homeLoader } from './homeData';

const HISTORY_URL = 'http://localhost:3000/api/radio/history';
const TRENDS_URL = 'http://localhost:3000/api/trends';
const TRENDS = { week: [], allTime: [] };

const load = () => homeLoader({ request: new Request('http://localhost/') });

let historyCalls = 0;
let requested = '';

beforeEach(() => {
  forgetHomeData();
  historyCalls = 0;
  server.use(
    http.get(HISTORY_URL, ({ request }) => {
      historyCalls++;
      requested = request.url;
      return HttpResponse.json([]);
    }),
    http.get(TRENDS_URL, () => HttpResponse.json(TRENDS))
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the home page's loader", () => {
  it('brings the last nine plays, the thread and the track on air, and the ranking', async () => {
    expect(await load()).toEqual({ history: [], trends: TRENDS });
    expect(new URL(requested).searchParams.get('rows')).toBe('9');
  });

  it('says a list that did not answer failed, the other drawn all the same', async () => {
    server.use(http.get(HISTORY_URL, () => new HttpResponse(null, { status: 500 })));

    expect(await load()).toEqual({ history: 'failed', trends: TRENDS });
  });

  it('asks again at the next visit for lists of which one failed', async () => {
    server.use(
      http.get(HISTORY_URL, () => new HttpResponse(null, { status: 500 }), { once: true })
    );
    await load();

    expect(await load()).toEqual({ history: [], trends: TRENDS });
  });

  it('draws what it loaded in the last five minutes at once, and asks again after', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 2, 12, 0) });
    await load();
    await load();
    expect(historyCalls).toBe(1);

    vi.setSystemTime(new Date(2026, 9, 2, 12, 6));
    await load();
    expect(historyCalls).toBe(2);
  });
});
