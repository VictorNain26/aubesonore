// Tokens AzuraCast names its generic artwork with: such a URL is no real cover, to show or to
// keep on a like.
const DEFAULT_ARTWORK_TOKENS = ['generic', 'default', 'placeholder'] as const;

export function isDefaultArtwork(url: string | null | undefined): boolean {
  if (!url) return true;
  return DEFAULT_ARTWORK_TOKENS.some((token) => url.includes(token));
}
