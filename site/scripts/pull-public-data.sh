#!/usr/bin/env bash
# Copies production's public, non-personal tables into the local stack's database, so a
# workstation develops against what the site really holds without holding a listener's data:
# the artists the antenna played, their slugs and stored profiles, the plays, the pages offered
# to search engines (17 MB in all, 2026-10-16). Production is only read (pg_dump).
#
# Never copied: the listener tables (user, account, session, verification, liked_tracks), the
# covers kept for their tracks, youtube_link (YouTube data lives at most 30 days), and the
# migrations record (the schema comes from schema.ts). The local test listener (seed-dev) keeps
# its kept tracks, and their tie to an artist the copy still holds.
#
# Usage: scripts/pull-public-data.sh   (the local stack's Postgres running, `pnpm stack`)
set -euo pipefail

SERVER="${AUBESONORE_SERVER:-victormoi@victorserv}"
TABLES=(artist artist_slug artist_profile radio_play discovered_artist)

table_args=""
for t in "${TABLES[@]}"; do table_args+=" --table=public.$t"; done

dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT

# Inside the production container, whose environment names its own user and database.
# shellcheck disable=SC2029  # table_args expands here on purpose
ssh "$SERVER" "docker exec aubesonore-db sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --data-only --no-owner --no-privileges$table_args'" >"$dump"

# One transaction: the local database holds either the previous copy or the new one, whole.
# DELETE, not TRUNCATE: liked_tracks.artist_id is ON DELETE SET NULL, which TRUNCATE ignores
# (CASCADE would empty liked_tracks); the ties are kept aside and given back where the artist
# still exists.
{
  echo 'BEGIN;'
  echo 'CREATE TEMP TABLE kept_tie ON COMMIT DROP AS SELECT id, artist_id FROM liked_tracks WHERE artist_id IS NOT NULL;'
  echo 'DELETE FROM radio_play; DELETE FROM discovered_artist; DELETE FROM artist_slug; DELETE FROM artist;'
  cat "$dump"
  # pg_dump empties search_path for its own statements.
  echo 'SET search_path = public;'
  echo 'UPDATE liked_tracks SET artist_id = k.artist_id FROM kept_tie k WHERE liked_tracks.id = k.id AND EXISTS (SELECT 1 FROM artist WHERE artist.id = k.artist_id);'
  echo 'COMMIT;'
} | docker exec -i aubesonore-db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null

docker exec -i aubesonore-db sh -c 'psql -At -F": " -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT 'artists', count(*) FROM artist
UNION ALL SELECT 'plays', count(*) FROM radio_play
UNION ALL SELECT 'kept tracks tied', count(*) FROM liked_tracks WHERE artist_id IS NOT NULL;
SQL
