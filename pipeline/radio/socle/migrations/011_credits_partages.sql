-- pick_match accepte désormais un seul artiste d'un crédit « A & B » ou « A, B » (titre et durée
-- inchangés) : les titres jugés « no_exact_match » avec un tel crédit sont remis en file, une
-- fois, et la prochaine library-sync les retente. Les autres restent jugés.
DELETE FROM deezer_matches
WHERE status = 'unmatched' AND reason = 'no_exact_match'
  AND plex_key IN (
      SELECT plex_key FROM library_tracks WHERE artist LIKE '%&%' OR artist LIKE '%,%'
  );
