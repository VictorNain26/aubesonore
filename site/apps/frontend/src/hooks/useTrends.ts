import { useEffect, useState } from 'react';
import type { KeptArtistPage } from '@aubesonore/shared-types/client';
import { API_BASE_URL } from '../utils/config';

export interface TrendEntry {
  title: string;
  artist: string;
  artworkUrl: string | null;
  likes: number;
  /** The page of the artist the track is tied to, when that artist has one. */
  artistPage: KeptArtistPage | null;
}

export interface TrendsResult {
  week: TrendEntry[];
  allTime: TrendEntry[];
}

// Fetches the community ranking once on mount — no polling: the backend
// already caches the aggregate for 5 minutes. `isLoading` is derived (not a
// state) so the effect never sets state synchronously in its body.
export function useTrends() {
  const [data, setData] = useState<TrendsResult | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`${API_BASE_URL}/api/trends`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`trends ${res.status}`);
        const result = (await res.json()) as TrendsResult;
        if (controller.signal.aborted) return;
        setHasError(false);
        setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHasError(true);
      });

    return () => controller.abort();
  }, []);

  return { data, isLoading: data === null && !hasError, hasError };
}
