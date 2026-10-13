/**
 * The resolution key. Letters and digits of every script survive, so "坂本龍一"
 * or "Кино" get a key; accents and punctuation do not, so "Beyoncé" and
 * "beyonce" share one.
 */
export function normalizeArtistName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function slugify(name: string): string {
  return normalizeArtistName(name).replace(/ /g, '-');
}

// Only explicit featuring markers. Splitting on `&`, `+`, `x` or `,` would
// destroy legitimate names ("Simon & Garfunkel", "Earth, Wind & Fire").
const FEATURING_SEPARATOR = /\s+(?:feat\.?|ft\.?|featuring)\s+/i;

export function primaryArtistName(raw: string): string {
  return (raw.split(FEATURING_SEPARATOR)[0] ?? raw).trim();
}

/** The key a raw AzuraCast name is stored and compared under: its first credited artist, normalized. */
export function artistKey(raw: string): string {
  return normalizeArtistName(primaryArtistName(raw));
}

// Compared, not keyed: an apostrophe is typed or left out (« Lets Go Surfing »
// played, « Let’s Go Surfing » in MusicBrainz), so it is dropped, not spaced.
export function comparableName(text: string): string {
  return normalizeArtistName(text.replace(/['’ʼ`´]/g, ''));
}

/**
 * The same title, versions aside: « Song » and « Song (Radio Edit) » match,
 * two different songs do not.
 */
export function sameTitle(played: string, other: string): boolean {
  const a = comparableName(played);
  const b = comparableName(other);
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

// A version said in brackets or after a dash: « Song (feat. X) », « Song - 2011 Remaster ».
const VERSION =
  /\s*(?:[([][^)\]]*\b(?:feat|ft|with|remaster(?:ed)?|version|edit|mix|live|mono|stereo)\b[^)\]]*[)\]]|\s-\s.*\b(?:remaster(?:ed)?|version|edit|mix|live|mono|stereo)\b.*)/gi;

/** A title without its version: what MusicBrainz names a recording (Style guidelines). */
export function bareTitle(title: string): string {
  return title.replace(VERSION, '').trim();
}
