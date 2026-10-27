-- A kept track's cover is its record's on the Cover Art Archive (services/keptTrackCovers.ts).
-- Cleared here, the tracks themselves kept:
-- - Apple's album art (the iTunes Search API's), which its terms keep for store promotion beside a
--   store badge (https://performance-partners.apple.com/search-api);
-- - the copies of the antenna's art (/covers/kept/, and /api/covers/ before the cover store),
--   which the pipeline takes from Deezer: the site keeps no Deezer content. Their files leave the
--   volume at boot (coverStore.removeKeptCopies).
-- The kept-cover pass then gives each track its record's cover, when there is one.
-- Idempotent: a second run finds no such address.
UPDATE liked_tracks
SET artwork_url = NULL
WHERE artwork_url LIKE 'https://%.mzstatic.com/%'
   OR artwork_url LIKE '%/covers/kept/%'
   OR artwork_url LIKE '%/api/covers/%';
