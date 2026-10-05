import { describe, expect, it } from 'vitest';
import { artworkAt } from './artwork';

describe('artworkAt', () => {
  it("asks Apple's CDN for the size the cover is shown at", () => {
    expect(
      artworkAt(
        'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/25/94/a12594ce/00077778777656.jpg/600x600bb.jpg',
        160
      )
    ).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/25/94/a12594ce/00077778777656.jpg/160x160bb.jpg'
    );
    expect(
      artworkAt(
        'https://is3-ssl.mzstatic.com/image/thumb/Music/4e/45/54/mzi.yzadbjif.jpg/512x512bb.jpg',
        480
      )
    ).toBe(
      'https://is3-ssl.mzstatic.com/image/thumb/Music/4e/45/54/mzi.yzadbjif.jpg/480x480bb.jpg'
    );
  });

  it.each([
    'https://radio.aubesonore.fr/api/station/1/art/abc-1691234.jpg',
    'https://cdn-images.dzcdn.net/images/cover/0f1e/1000x1000-000000-80-0-0.jpg',
    'https://api.aubesonore.fr/api/covers/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/cover.png',
  ])('leaves a host that cannot resize as it is: %s', (url) => {
    expect(artworkAt(url, 160)).toBe(url);
  });
});
