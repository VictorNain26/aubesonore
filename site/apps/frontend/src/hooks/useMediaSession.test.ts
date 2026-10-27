import { describe, expect, it } from 'vitest';
import { mediaArtwork } from './useMediaSession';

describe('mediaArtwork', () => {
  it("offers the lock screen the station's cover at each size the store keeps, as WebP", () => {
    expect(
      mediaArtwork('https://radio.aubesonore.fr/api/station/aubesonore/art/abc-1.jpg')
    ).toEqual(
      [96, 192, 384, 768].map((w) => ({
        src: `/covers/station/abc-1/${w}.webp`,
        sizes: `${w}x${w}`,
        type: 'image/webp',
      }))
    );
  });

  it('gives a cover no host resizes as it is, without claiming a size or a type', () => {
    expect(mediaArtwork('https://example.com/cover.jpg')).toEqual([
      { src: 'https://example.com/cover.jpg' },
    ]);
  });
});
