// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useArtistPages } from './useArtistPages';

const API = 'http://localhost:3000';

/** Records the names of each request, still answering from the default handler. */
function recordRequests(): string[][] {
  const asked: string[][] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && request.url.endsWith('/api/artist/pages')) {
      void request
        .clone()
        .json()
        .then((body) => asked.push((body as { names: string[] }).names));
    }
  });
  return asked;
}

afterEach(() => server.events.removeAllListeners());

describe('useArtistPages', () => {
  it('maps each played artist to its page, and leaves out an artist without one', async () => {
    const { result } = renderHook(() => useArtistPages(['Hania Rani', 'Unknown']));

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get('Hania Rani')).toEqual({ id: 'a-1', slug: 'hania-rani' });
    expect(result.current.has('Unknown')).toBe(false);
  });

  it('asks again, with the next track, for an artist that had no page yet', async () => {
    const asked = recordRequests();
    const { result, rerender } = renderHook(({ names }) => useArtistPages(names), {
      initialProps: { names: ['Unknown', 'Weval'] },
    });
    await waitFor(() => expect(result.current.size).toBe(1));

    rerender({ names: ['Doves', 'Unknown', 'Weval'] });
    await waitFor(() => expect(result.current.size).toBe(2));

    expect(asked).toEqual([
      ['Unknown', 'Weval'],
      ['Doves', 'Unknown'],
    ]);
  });

  it('asks the day once, then only the artist of a new track', async () => {
    const asked = recordRequests();
    const { result, rerender } = renderHook(({ names }) => useArtistPages(names), {
      initialProps: { names: ['Weval', 'Doves', 'Weval'] },
    });
    await waitFor(() => expect(result.current.size).toBe(2));

    rerender({ names: ['Bill Callahan', 'Weval', 'Doves'] });
    await waitFor(() => expect(result.current.size).toBe(3));

    expect(asked).toEqual([['Weval', 'Doves'], ['Bill Callahan']]);
  });

  it('shows no link when the lookup fails, without asking again on every render', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/api/artist/pages`, () => {
        calls += 1;
        return new HttpResponse(null, { status: 500 });
      })
    );
    const { result, rerender } = renderHook(({ names }) => useArtistPages(names), {
      initialProps: { names: ['Weval'] },
    });
    await waitFor(() => expect(calls).toBe(1));
    rerender({ names: ['Weval'] });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toBe(1);
    expect(result.current.get('Weval')).toBeUndefined();
  });
});
