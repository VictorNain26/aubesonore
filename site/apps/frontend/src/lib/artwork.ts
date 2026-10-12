// Covers whose host serves them at the size their URL names, so a cover shown small costs a small
// file. Measured on 2026-10-05:
// - Apple's artwork CDN (`…/600x600bb.jpg`): all 85 Apple covers kept in production load at
//   160 px, 81 exactly 160×160 and 4 non-square originals within a pixel or a crop, at 5 to 12
//   times fewer bytes.
// - Deezer's image CDN (`…/1000x1000-000000-80-0-0.jpg`), artist portraits and album covers: 17 of
//   18 portraits of artists the antenna played and 4 of 4 album covers load at 320×320, a fifth
//   of the bytes; the 18th redirects at its own size as well.
// - The station's covers: AzuraCast serves one 1000 px art (~95 KB); nginx shrinks it at /covers/ to
//   96, 192, 384 and 768 px, 2.4, 6.2 and 18.9 KB for the first three (nginx.conf, measured
//   2026-10-06). The original stays the largest choice, for the now-playing cover on dense screens.
// - Wikimedia Commons thumbnails (`…/thumb/…/1280px-File.jpg`): Wikimedia serves a hotlink only at
//   its standard widths (mediawiki.org/wiki/Common_thumbnail_sizes); an original smaller than
//   1280 px comes without /thumb/ and keeps its URL.
// - The Cover Art Archive (`coverartarchive.org/release-group/<id>/front-<size>`): served by this
//   site at /caa/<size>/<id>.jpg (nginx.conf), its three sizes, 250, 500 and 1200 px. Asked
//   directly, a thumbnail took 2.6 s at the median behind two redirects, and 1 in 15 failed
//   (2026-10-12).
// Other hosts (our own store) keep their URL.
const APPLE_SIZED = /^(https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/.+)\/\d+x\d+bb\.jpg$/;
// Only this station's art: nginx fetches it from radio.aubesonore.fr.
const STATION_ART =
  /^https:\/\/radio\.aubesonore\.fr\/api\/station\/aubesonore\/art\/([0-9a-f]+-\d+)\.jpg$/;
const STATION_WIDTHS = [96, 192, 384, 768] as const;
const STATION_ORIGINAL = 1000;
const COMMONS_THUMB =
  /^(https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+)\/\d+px-([^/]+)$/;
const CAA =
  /^https:\/\/coverartarchive\.org\/release-group\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/front(?:-(250|500|1200))?$/;
const CAA_WIDTHS = [250, 500, 1200] as const;
const DEEZER_SIZED =
  /^(https:\/\/cdn-images\.dzcdn\.net\/images\/(?:artist|cover)\/[0-9a-f]+)\/\d+x\d+(-[^/]+\.jpg)$/;

interface Sizer {
  at: (pixels: number) => string;
  /**
   * The sizes the host keeps ready. Another size is made on demand and can weigh more: Deezer's
   * 960 px portrait of Cassius is 46 KB where its 1000 px one is 26 KB (2026-10-05).
   */
  widths: readonly number[];
}

function sizer(url: string): Sizer | null {
  const apple = APPLE_SIZED.exec(url);
  if (apple) {
    return {
      at: (pixels) => `${apple[1]}/${pixels}x${pixels}bb.jpg`,
      widths: [160, 320, 480, 600],
    };
  }
  const deezer = DEEZER_SIZED.exec(url);
  if (deezer) {
    // The API's picture_medium, _big and _xl.
    return {
      at: (pixels) => `${deezer[1]}/${pixels}x${pixels}${deezer[2]}`,
      widths: [250, 500, 1000],
    };
  }
  const commons = COMMONS_THUMB.exec(url);
  if (commons) {
    return {
      at: (pixels) => `${commons[1]}/${pixels}px-${commons[2]}`,
      widths: [330, 500, 960, 1280],
    };
  }
  const caa = CAA.exec(url);
  if (caa) {
    return {
      at: (pixels) => `/caa/${CAA_WIDTHS.find((w) => w >= pixels) ?? 1200}/${caa[1]}.jpg`,
      widths: CAA_WIDTHS,
    };
  }
  const art = STATION_ART.exec(url);
  if (art) {
    return {
      // nginx makes these widths only: another size takes the next one up, past them the original.
      at: (pixels) => {
        const width = STATION_WIDTHS.find((w) => w >= pixels);
        return width ? `/covers/${width}/${art[1]}.jpg` : url;
      },
      widths: [...STATION_WIDTHS, STATION_ORIGINAL],
    };
  }
  return null;
}

/**
 * The address a cover is fetched at: the Cover Art Archive's through this site, at the size its
 * URL names (the original's, 1200, when it names none); any other as given.
 */
export function artworkSrc(url: string): string {
  const caa = CAA.exec(url);
  return caa ? `/caa/${caa[2] ?? '1200'}/${caa[1]}.jpg` : url;
}

/** The cover at `pixels` on its longer side where its host can serve that size, else as given. */
export function artworkAt(url: string, pixels: number): string {
  return sizer(url)?.at(pixels) ?? url;
}

/** The cover's sizes as a `srcset`, where its host resizes: the browser takes the smallest that fills it. */
export function artworkSrcSet(url: string): string | undefined {
  const host = sizer(url);
  return host?.widths.map((width) => `${host.at(width)} ${width}w`).join(', ');
}
