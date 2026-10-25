import { describe, expect, it } from 'vitest';
import { keepRequest, youtubeSearchUrl } from './pendingKeep';

describe('youtubeSearchUrl', () => {
  it('searches YouTube for the title and the artist', () => {
    expect(youtubeSearchUrl('Mimoun', 'Rachid Taha')).toBe(
      'https://www.youtube.com/results?search_query=Mimoun%20Rachid%20Taha'
    );
  });

  it("keeps the station's metadata inside the query, whatever it holds", () => {
    const url = new URL(youtubeSearchUrl('A&B?x=1#top', 'Ç/a "ira"'));

    expect(url.origin + url.pathname).toBe('https://www.youtube.com/results');
    expect([...url.searchParams.keys()]).toEqual(['search_query']);
    expect(url.searchParams.get('search_query')).toBe('A&B?x=1#top Ç/a "ira"');
    expect(url.hash).toBe('');
  });

  it('is the link a kept track is stored with', () => {
    expect(keepRequest('Mimoun', 'Rachid Taha').youtubeUrl).toBe(
      youtubeSearchUrl('Mimoun', 'Rachid Taha')
    );
  });
});
