// API Backend
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || '';

// AzuraCast Configuration
const AZURACAST_URL: string =
  import.meta.env.VITE_AZURACAST_BASE_URL || 'https://radio.aubesonore.fr';
const STATION_SHORTCODE: string = import.meta.env.VITE_STATION_SHORTCODE || 'aubesonore';

// AzuraCast's endpoints have the same shape on every install.
const AZURACAST_BASE = AZURACAST_URL.replace(/\/$/, '');
export const STREAM_URL = `${AZURACAST_BASE}/listen/${STATION_SHORTCODE}/radio.mp3`;
export const STATIC_NOWPLAYING_URL = `${AZURACAST_BASE}/api/nowplaying_static/${STATION_SHORTCODE}.json`;
