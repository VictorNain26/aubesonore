import { useEffect, useState } from 'react';
import { fetchArtistPages, type ArtistPage } from '../lib/artistProfile';

// What the backend accepts (artistPagesSchema): one name out of bounds would void the batch.
const MAX_NAMES = 400;
const MAX_NAME_LENGTH = 200;
const NONE: ReadonlySet<string> = new Set();

/**
 * The pages of the artists in `names` the antenna already played: the thread asks for
 * the whole day at load, then, at each new track, for its artist and for the names still
 * without a page. An artist heard for the first time gets its page a little after its
 * first play (the resolution calls Deezer and MusicBrainz), so a miss is not final: it
 * holds for the current list of names only.
 */
export function useArtistPages(names: readonly string[]): ReadonlyMap<string, ArtistPage> {
  const [pages, setPages] = useState<ReadonlyMap<string, ArtistPage>>(new Map());
  const [missed, setMissed] = useState<{ list: string; names: ReadonlySet<string> }>({
    list: '',
    names: NONE,
  });
  const unique = [...new Set(names)].filter(
    (name) => name.trim() !== '' && name.length <= MAX_NAME_LENGTH
  );
  // Strings, so a render with the same names does not ask again.
  const list = JSON.stringify(unique);
  const missedNow = missed.list === list ? missed.names : NONE;
  const missingKey = JSON.stringify(
    unique.filter((name) => !pages.has(name) && !missedNow.has(name)).slice(0, MAX_NAMES)
  );

  useEffect(() => {
    const asked = JSON.parse(missingKey) as string[];
    if (asked.length === 0) return;
    const controller = new AbortController();
    fetchArtistPages(asked, controller.signal)
      .then((found) => {
        setPages((prev) => new Map([...prev, ...found]));
        setMissed((prev) => ({
          list,
          names: new Set([
            ...(prev.list === list ? prev.names : NONE),
            ...asked.filter((name) => !found.has(name)),
          ]),
        }));
      })
      .catch(() => {
        // Aborted by a newer list, or offline: no links rather than dead ones.
      });
    return () => controller.abort();
  }, [missingKey, list]);

  return pages;
}
