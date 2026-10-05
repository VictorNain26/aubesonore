// Covers whose host serves them at the size their URL names, so a cover shown small costs a small
// file. Measured on 2026-10-05:
// - Apple's artwork CDN (`…/600x600bb.jpg`): all 85 Apple covers kept in production load at
//   160 px, 81 exactly 160×160 and 4 non-square originals within a pixel or a crop, at 5 to 12
//   times fewer bytes.
// - Deezer's image CDN (`…/1000x1000-000000-80-0-0.jpg`), artist portraits and album covers: 17 of
//   18 portraits of artists the antenna played and 4 of 4 album covers load at 320×320, a fifth
//   of the bytes; the 18th redirects at its own size as well.
// Other hosts (AzuraCast, the Cover Art Archive, our own store) keep their URL.
const APPLE_SIZED = /^(https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/.+)\/\d+x\d+bb\.jpg$/;
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
  return null;
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
