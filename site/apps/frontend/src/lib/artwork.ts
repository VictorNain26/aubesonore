// Apple's artwork CDN serves a cover at the size its URL ends with (`…/600x600bb.jpg`). Measured
// on the 85 Apple covers kept in production on 2026-10-05: all 85 load at 160 px, 81 exactly
// 160×160 and 4 non-square originals within a pixel or a crop, at 5 to 12 times fewer bytes.
// Other hosts (AzuraCast, Deezer, our own store) keep their URL.
const APPLE_SIZED = /^(https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\/.+)\/\d+x\d+bb\.jpg$/;

/** The cover at `pixels` on its longer side where its host can serve that size, else as given. */
export function artworkAt(url: string, pixels: number): string {
  const match = APPLE_SIZED.exec(url);
  return match ? `${match[1]}/${pixels}x${pixels}bb.jpg` : url;
}
