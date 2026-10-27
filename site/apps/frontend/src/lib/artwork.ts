// Covers whose host serves them at the size their URL names, so a cover shown small costs a small
// file:
// - The station's covers: AzuraCast serves one 1000 px art (~95 KB); this site's cover store keeps
//   it as WebP at 96, 192, 384 and 768 px (/covers/station/, made when the track starts). The
//   original stays the largest choice, for the now-playing cover on dense screens.
// - Wikimedia Commons thumbnails (`…/thumb/…/1280px-File.jpg`): Wikimedia serves a hotlink only at
//   its standard widths, refusing any other (mediawiki.org/wiki/Common_thumbnail_sizes); an
//   original smaller than 1280 px comes without /thumb/ and keeps its URL.
// - The Cover Art Archive (`coverartarchive.org/release-group/<id>/front-<size>`): served by this
//   site's cover store as WebP at /covers/caa/<id>/<size>.webp, the archive's three sizes, 250, 500
//   and 1200 px. Asked directly, a thumbnail took 2.6 s at the median behind two redirects, and 1
//   in 15 failed (2026-10-12).
//   A kept track's cover is its record's, from the archive too.
// Other hosts keep their URL.
// Only this station's art: the cover store fetches it from our own AzuraCast.
const STATION_ART =
  /^https:\/\/radio\.aubesonore\.fr\/api\/station\/aubesonore\/art\/([0-9a-f]+-\d+)\.jpg$/;
const STATION_WIDTHS = [96, 192, 384, 768] as const;
const STATION_ORIGINAL = 1000;
const COMMONS_THUMB =
  /^(https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+)\/\d+px-([^/]+)$/;
// Wikimedia's standard widths from 120 px to the 1280 px the API names; another size takes the
// next one up (96px- answered 400, 120px- 200, 2026-10-27).
const COMMONS_WIDTHS = [120, 330, 500, 960, 1280] as const;
const CAA =
  /^https:\/\/coverartarchive\.org\/release-group\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/front(?:-(250|500|1200))?$/;
const CAA_WIDTHS = [250, 500, 1200] as const;

interface Sizer {
  at: (pixels: number) => string;
  /** The sizes the host keeps ready. */
  widths: readonly number[];
}

const caaAt = (releaseGroup: string, size: number | string) =>
  `/covers/caa/${releaseGroup}/${size}.webp`;

function sizer(url: string): Sizer | null {
  const commons = COMMONS_THUMB.exec(url);
  if (commons) {
    return {
      at: (pixels) =>
        `${commons[1]}/${COMMONS_WIDTHS.find((w) => w >= pixels) ?? 1280}px-${commons[2]}`,
      widths: COMMONS_WIDTHS,
    };
  }
  const caa = CAA.exec(url);
  if (caa) {
    return {
      at: (pixels) => caaAt(caa[1]!, CAA_WIDTHS.find((w) => w >= pixels) ?? 1200),
      widths: CAA_WIDTHS,
    };
  }
  const art = STATION_ART.exec(url);
  if (art) {
    return {
      // The store keeps these widths only: another size takes the next one up, past them the
      // original.
      at: (pixels) => {
        const width = STATION_WIDTHS.find((w) => w >= pixels);
        return width ? `/covers/station/${art[1]}/${width}.webp` : url;
      },
      widths: [...STATION_WIDTHS, STATION_ORIGINAL],
    };
  }
  return null;
}

/**
 * The address a cover is fetched at, at the size its URL names: the Cover Art Archive's from this
 * site's cover store (the archive's largest, 1200, when it names none); any other as given.
 */
export function artworkSrc(url: string): string {
  const caa = CAA.exec(url);
  return caa ? caaAt(caa[1]!, caa[2] ?? '1200') : url;
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
