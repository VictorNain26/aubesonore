import { useEffect, useState } from 'react';
import { fetchArtistPages, type ArtistPage } from '../lib/artistProfile';

// What the backend accepts (artistPagesSchema): one name out of bounds would void the batch.
const MAX_NAMES = 400;
const MAX_NAME_LENGTH = 200;

/**
 * The pages of the artists in `names` the antenna already played, each name asked once:
 * the thread asks for the whole day at load, then a new track only for its own artist.
 * A name without a page maps to null; a name not asked yet is absent.
 */
export function useArtistPages(names: readonly string[]): ReadonlyMap<string, ArtistPage | null> {
  const [known, setKnown] = useState<ReadonlyMap<string, ArtistPage | null>>(new Map());
  const missing = [...new Set(names)]
    .filter((name) => name.trim() !== '' && name.length <= MAX_NAME_LENGTH && !known.has(name))
    .slice(0, MAX_NAMES);
  // A string, so a render with the same missing names does not ask again.
  const missingKey = JSON.stringify(missing);

  useEffect(() => {
    const asked = JSON.parse(missingKey) as string[];
    if (asked.length === 0) return;
    const controller = new AbortController();
    fetchArtistPages(asked, controller.signal)
      .then((pages) =>
        setKnown((prev) => {
          const next = new Map(prev);
          for (const name of asked) next.set(name, pages.get(name) ?? null);
          return next;
        })
      )
      .catch(() => {
        // Aborted by a newer list, or offline: no links rather than dead ones.
      });
    return () => controller.abort();
  }, [missingKey]);

  return known;
}
