import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { HttpError } from './api';
import { fetchMusilogyArtist, MusilogyUnavailableError, searchMusilogy } from './musilogy';

const ARTIST = 'http://localhost:3000/api/musilogy/artist/m1';
const SEARCH = 'http://localhost:3000/api/musilogy/search';

const answer = (url: string, status: number) =>
  server.use(http.get(url, () => new HttpResponse(null, { status })));

describe('Musilogy reads', () => {
  it('say Musilogy is not loaded on a 503, apart from any other failure', async () => {
    answer(ARTIST, 503);
    await expect(fetchMusilogyArtist('m1')).rejects.toBeInstanceOf(MusilogyUnavailableError);
    answer(SEARCH, 503);
    await expect(searchMusilogy('x')).rejects.toBeInstanceOf(MusilogyUnavailableError);

    answer(ARTIST, 500);
    const error = await fetchMusilogyArtist('m1').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).not.toBeInstanceOf(MusilogyUnavailableError);
  });

  it('give no artist for one the dump does not hold, and no hit for an empty search', async () => {
    answer(ARTIST, 404);
    expect(await fetchMusilogyArtist('m1')).toBeNull();
    answer(SEARCH, 400);
    expect(await searchMusilogy('x')).toEqual([]);
  });
});
