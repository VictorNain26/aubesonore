// Public API of the AzuraCast client: the app imports from '../lib/azuracast', which keeps the
// surface stable. Two exceptions reach a module: tests take the store's reset from './store', and
// the Cast receiver (cast/receiver.ts) takes the schemas from './validators' alone, without the
// store and its React dependency.

export { useNowPlayingStore, startNowPlayingPolling } from './store';
export { isDefaultArtwork } from './artwork';
export { SongEntrySchema, type SongEntry, type NowPlaying } from './validators';
