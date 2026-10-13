// Public API of the AzuraCast client. Consumers import from '../lib/azuracast'
// and never reach into individual modules — keeps the surface stable.

export { useNowPlayingStore, startNowPlayingPolling, __resetNowPlayingStore } from './store';
export { isDefaultArtwork } from './artwork';
export { SongEntrySchema } from './validators';

// Re-export the shared-types domain shapes so a consumer never needs two
// imports for "AzuraCast types".
export type { SongEntry, NowPlaying } from '@aubesonore/shared-types/azuracast';
