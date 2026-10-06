import { describe, expect, it } from 'vitest';
import { artworkAt, artworkSrcSet } from './artwork';

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
    'https://api.aubesonore.fr/api/covers/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/cover.png',
  ])('leaves a host that cannot resize as it is: %s', (url) => {
    expect(artworkAt(url, 160)).toBe(url);
  });

  it("asks Deezer's CDN for a portrait or an album cover at the size it is shown", () => {
    expect(
      artworkAt(
        'https://cdn-images.dzcdn.net/images/artist/7ed91fa11a9785a82e63fd9058821d8a/1000x1000-000000-80-0-0.jpg',
        320
      )
    ).toBe(
      'https://cdn-images.dzcdn.net/images/artist/7ed91fa11a9785a82e63fd9058821d8a/320x320-000000-80-0-0.jpg'
    );
    expect(
      artworkAt(
        'https://cdn-images.dzcdn.net/images/cover/5718f7c81c27e0b2417e2a4c45224f8a/1000x1000-000000-80-0-0.jpg',
        160
      )
    ).toBe(
      'https://cdn-images.dzcdn.net/images/cover/5718f7c81c27e0b2417e2a4c45224f8a/160x160-000000-80-0-0.jpg'
    );
  });
});

describe('artworkSrcSet', () => {
  it('offers the browser every size a resizing host serves', () => {
    const srcset = artworkSrcSet(
      'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/25/94/a12594ce/00077778777656.jpg/600x600bb.jpg'
    );
    expect(srcset?.split(', ').map((candidate) => candidate.split(' ')[1])).toEqual([
      '160w',
      '320w',
      '480w',
      '600w',
    ]);
    expect(srcset).toContain('/320x320bb.jpg 320w');
  });

  it('offers only the sizes Deezer keeps ready', () => {
    expect(
      artworkSrcSet(
        'https://cdn-images.dzcdn.net/images/artist/7ed91fa11a9785a82e63fd9058821d8a/1000x1000-000000-80-0-0.jpg'
      )
    ).toBe(
      [250, 500, 1000]
        .map(
          (w) =>
            `https://cdn-images.dzcdn.net/images/artist/7ed91fa11a9785a82e63fd9058821d8a/${w}x${w}-000000-80-0-0.jpg ${w}w`
        )
        .join(', ')
    );
  });

  it("offers the station's covers at the three widths nginx makes", () => {
    expect(
      artworkSrcSet(
        'https://radio.aubesonore.fr/api/station/aubesonore/art/27d87a8584e8ebe4e670e5e7-1791145643.jpg'
      )
    ).toBe(
      [96, 192, 384]
        .map((width) => `/covers/${width}/27d87a8584e8ebe4e670e5e7-1791145643.jpg ${width}w`)
        .join(', ')
    );
  });

  it("takes the next width nginx makes for a station's cover at another size", () => {
    const url = 'https://radio.aubesonore.fr/api/station/aubesonore/art/abc-1.jpg';
    expect(artworkAt(url, 160)).toBe('/covers/192/abc-1.jpg');
    expect(artworkAt(url, 1000)).toBe('/covers/384/abc-1.jpg');
  });

  it('offers nothing for a host that cannot resize', () => {
    expect(artworkSrcSet('https://radio.aubesonore.fr/api/station/1/art/abc-1691234.jpg')).toBe(
      undefined
    );
  });
});
