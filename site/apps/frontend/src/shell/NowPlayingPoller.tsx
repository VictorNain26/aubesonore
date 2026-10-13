import { useEffect } from 'react';
import { startNowPlayingPolling } from '../lib/azuracast';

// Mounts once at the app root. Owns the lifecycle of the now-playing
// polling loop: starts it on mount, stops it on unmount. Decoupled from
// the consumers (Player and friends) so individual sub-component unmounts
// do not tear down the data feed.

export function NowPlayingPoller(): null {
  useEffect(() => {
    const stop = startNowPlayingPolling();
    return stop;
  }, []);
  return null;
}
