import { buildAzuracastUrls } from '@aubesonore/core/azuracast';

// API Backend
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || '';

// AzuraCast Configuration
const AZURACAST_URL: string =
  import.meta.env.VITE_AZURACAST_BASE_URL || 'https://radio.aubesonore.fr';
const STATION_SHORTCODE: string = import.meta.env.VITE_STATION_SHORTCODE || 'aubesonore';

// Derived URLs, in one place.
const azuracastUrls = buildAzuracastUrls(AZURACAST_URL, STATION_SHORTCODE);
export const STREAM_URL: string = azuracastUrls.stream;
export const STATIC_NOWPLAYING_URL: string = azuracastUrls.staticNowPlaying;
