// Preloaded before every test file (see bunfig.toml [test].preload) so the
// frozen `config/env` singleton is built from these values no matter which
// test file imports it first. Per-file `process.env` writes race with that
// first import; a preload is the only order-independent place to set them.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(32);
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';

// Forced (not ??=): specs assert the exact AzuraCast URL built from these, so
// a developer's ambient shell values must not leak into the test run.
process.env.AZURACAST_BASE_URL = 'http://azuracast.test';
process.env.AZURACAST_API_KEY = 'secret-key';
process.env.AZURACAST_STATION_ID = 'aubesonore';

// Forced too: the track links specs follow the Spotify path with these.
process.env.SPOTIFY_CLIENT_ID = 'test-spotify-id';
process.env.SPOTIFY_CLIENT_SECRET = 'test-spotify-secret';

// Forced: the YouTube specs assert that this key never reaches a log.
process.env.YOUTUBE_API_KEY = 'test-youtube-key';
