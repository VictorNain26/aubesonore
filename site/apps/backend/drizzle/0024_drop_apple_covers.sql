-- Apple's album art (the iTunes Search API's) is kept by its terms for store promotion beside a
-- store badge (https://performance-partners.apple.com/search-api): a kept track no longer shows
-- it. Its address is cleared, never the track; the kept-cover pass (services/keptTrackCovers.ts)
-- then gives the track its record's Cover Art Archive cover, when there is one.
-- Idempotent: a second run finds no such address.
UPDATE liked_tracks
SET artwork_url = NULL
WHERE artwork_url LIKE 'https://%.mzstatic.com/%';
