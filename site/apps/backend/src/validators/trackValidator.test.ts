import { describe, it, expect } from 'bun:test';
import { safeParse } from 'valibot';
import { likeTrackSchema } from './trackValidator';

const like = (isrc?: string) => ({
  title: 'F Major',
  artist: 'Hania Rani',
  youtubeUrl: 'https://www.youtube.com/watch?v=x',
  ...(isrc === undefined ? {} : { isrc }),
});

describe('likeTrackSchema', () => {
  it('accepts a like with an ISO 3901 ISRC, or none', () => {
    expect(safeParse(likeTrackSchema, like('DEN271800071')).success).toBe(true);
    expect(safeParse(likeTrackSchema, like()).success).toBe(true);
  });

  it('rejects an ISRC it would send to Deezer and Spotify unchecked', () => {
    expect(safeParse(likeTrackSchema, like('DEN27|800071')).success).toBe(false);
    expect(safeParse(likeTrackSchema, like('x'.repeat(5000))).success).toBe(false);
  });
});
