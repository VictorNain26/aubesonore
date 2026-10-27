import { describe, expect, it } from 'vitest';
import { artworkAt, artworkSrc, artworkSrcSet } from './artwork';

describe('artworkAt', () => {
  it("asks Apple's CDN for the size the cover is shown at, as WebP", () => {
    expect(
      artworkAt(
        'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/25/94/a12594ce/00077778777656.jpg/600x600bb.jpg',
        160
      )
    ).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/25/94/a12594ce/00077778777656.jpg/160x160bb.webp'
    );
    expect(
      artworkAt(
        'https://is3-ssl.mzstatic.com/image/thumb/Music/4e/45/54/mzi.yzadbjif.jpg/512x512bb.jpg',
        480
      )
    ).toBe(
      'https://is3-ssl.mzstatic.com/image/thumb/Music/4e/45/54/mzi.yzadbjif.jpg/480x480bb.webp'
    );
  });

  it('resizes an Apple cover already asked for as WebP', () => {
    expect(
      artworkAt(
        'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/cover.jpg/600x600bb.webp',
        320
      )
    ).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/cover.jpg/320x320bb.webp');
  });

  it('serves an Apple cover as WebP at the size its URL names, even where nothing resizes it', () => {
    const url =
      'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/25/94/a12594ce/00077778777656.jpg/600x600bb.jpg';
    expect(artworkSrc(url)).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/25/94/a12594ce/00077778777656.jpg/600x600bb.webp'
    );
  });

  it.each([
    'https://radio.aubesonore.fr/api/station/1/art/abc-1691234.jpg',
    'https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/cover.png',
    // Not Apple's CDN, though shaped like it.
    'https://example.com/image/thumb/Music6/v4/a1/cover.jpg/600x600bb.jpg',
    'http://is1-ssl.mzstatic.com/image/thumb/Music6/v4/a1/cover.jpg/600x600bb.jpg',
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
    expect(srcset).toContain('/320x320bb.webp 320w');
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

  it("offers the station's covers at the widths the store keeps, then the original", () => {
    const original =
      'https://radio.aubesonore.fr/api/station/aubesonore/art/27d87a8584e8ebe4e670e5e7-1791145643.jpg';
    expect(artworkSrcSet(original)).toBe(
      [96, 192, 384, 768]
        .map(
          (width) => `/covers/station/27d87a8584e8ebe4e670e5e7-1791145643/${width}.webp ${width}w`
        )
        .concat(`${original} 1000w`)
        .join(', ')
    );
  });

  it("takes the next width the store keeps for a station's cover at another size", () => {
    const url = 'https://radio.aubesonore.fr/api/station/aubesonore/art/abc-1.jpg';
    expect(artworkAt(url, 160)).toBe('/covers/station/abc-1/192.webp');
    expect(artworkAt(url, 500)).toBe('/covers/station/abc-1/768.webp');
    expect(artworkAt(url, 1000)).toBe(url);
  });

  it("offers a Commons thumbnail at Wikimedia's standard widths only", () => {
    // The thumbnail the imageinfo API gives (2026-10-11), its tracking query kept.
    const url =
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Stereolab_%281994%29.jpg/' +
      '1280px-Stereolab_%281994%29.jpg?utm_source=commons.wikimedia.org';
    const srcset = artworkSrcSet(url);
    expect(srcset?.split(', ').map((candidate) => candidate.split(' ')[1])).toEqual([
      '330w',
      '500w',
      '960w',
      '1280w',
    ]);
    expect(srcset).toContain(
      '/500px-Stereolab_%281994%29.jpg?utm_source=commons.wikimedia.org 500w'
    );
    // An original under 1280 px has no thumbnail path: it is served as it is.
    expect(
      artworkSrcSet('https://upload.wikimedia.org/wikipedia/commons/6/61/Can_1972.jpg')
    ).toBeUndefined();
  });

  it('offers nothing for a host that cannot resize', () => {
    expect(artworkSrcSet('https://radio.aubesonore.fr/api/station/1/art/abc-1691234.jpg')).toBe(
      undefined
    );
  });
});

describe('the Cover Art Archive, from the cover store', () => {
  const RG = '00b3e683-47fa-3302-add0-4c0cecc5224e';

  it('is fetched as WebP at the size its URL names, the largest without one', () => {
    expect(artworkSrc(`https://coverartarchive.org/release-group/${RG}/front-250`)).toBe(
      `/covers/caa/${RG}/250.webp`
    );
    expect(artworkSrc(`https://coverartarchive.org/release-group/${RG}/front`)).toBe(
      `/covers/caa/${RG}/1200.webp`
    );
    // Anything else is left as given: nothing but a release group's id reaches the store.
    expect(artworkSrc(`https://coverartarchive.org/release/${RG}/front-250`)).toBe(
      `https://coverartarchive.org/release/${RG}/front-250`
    );
  });

  it('offers its three sizes to the browser', () => {
    const url = `https://coverartarchive.org/release-group/${RG}/front-250`;
    expect(artworkSrcSet(url)).toBe(
      `/covers/caa/${RG}/250.webp 250w, /covers/caa/${RG}/500.webp 500w, /covers/caa/${RG}/1200.webp 1200w`
    );
    expect(artworkAt(url, 400)).toBe(`/covers/caa/${RG}/500.webp`);
  });
});

describe("a kept track's own copy, from the cover store", () => {
  const SHA = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
  const kept = `https://aubesonore.fr/covers/kept/${SHA}/768.webp`;

  it('is fetched from this site at the size its URL names', () => {
    expect(artworkSrc(kept)).toBe(`/covers/kept/${SHA}/768.webp`);
  });

  it('offers the sizes the store keeps', () => {
    expect(artworkSrcSet(kept)).toBe(
      [96, 192, 384, 768].map((w) => `/covers/kept/${SHA}/${w}.webp ${w}w`).join(', ')
    );
    expect(artworkAt(kept, 160)).toBe(`/covers/kept/${SHA}/192.webp`);
    expect(artworkAt(kept, 1000)).toBe(`/covers/kept/${SHA}/768.webp`);
  });

  it('leaves anything shaped otherwise as given', () => {
    const odd = `https://aubesonore.fr/covers/kept/${SHA}/500.webp`;
    expect(artworkSrc(odd)).toBe(odd);
    expect(artworkSrcSet(odd)).toBeUndefined();
  });
});
