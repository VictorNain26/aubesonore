// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { forgetHomeData, homeLoader } from './homeData';

const TRENDS_URL = 'http://localhost:3000/api/trends';
const TRENDS = { week: [] };

const load = () => homeLoader({ request: new Request('http://localhost/') });

let trendsCalls = 0;

beforeEach(() => {
  forgetHomeData();
  trendsCalls = 0;
  server.use(
    http.get(TRENDS_URL, () => {
      trendsCalls++;
      return HttpResponse.json(TRENDS);
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the home page's loader", () => {
  it("brings the week's ranking alone: the live payload says the track before", async () => {
    expect(await load()).toEqual({ trends: TRENDS });
    expect(trendsCalls).toBe(1);
  });

  it('says the ranking failed when it did not answer, and asks again at the next visit', async () => {
    server.use(http.get(TRENDS_URL, () => new HttpResponse(null, { status: 500 }), { once: true }));

    expect(await load()).toEqual({ trends: 'failed' });
    expect(await load()).toEqual({ trends: TRENDS });
  });

  it('draws what it loaded in the last five minutes at once, and asks again after', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 2, 12, 0) });
    await load();
    await load();
    expect(trendsCalls).toBe(1);

    vi.setSystemTime(new Date(2026, 9, 2, 12, 6));
    await load();
    expect(trendsCalls).toBe(2);
  });
});
