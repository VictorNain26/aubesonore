import { describe, it, expect } from 'bun:test';
import { parse } from 'valibot';
import { likeTrackSchema } from './trackValidator';

const like = {
  title: 'F Major',
  artist: 'Hania Rani',
  youtubeUrl: 'https://www.youtube.com/watch?v=x',
};

describe('likeTrackSchema', () => {
  it("keeps only what the site sends: a caller's ISRC or album never reaches the track", () => {
    expect(parse(likeTrackSchema, { ...like, isrc: 'DEN271800071', album: 'Home' })).toEqual(like);
  });
});
