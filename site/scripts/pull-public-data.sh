#!/usr/bin/env bash
# Copies production's public, non-personal tables into the local stack's database, so a
# workstation develops against what the site really holds without holding a listener's data:
# the artists the antenna played, their slugs and stored profiles, the plays, the pages offered
# to search engines. Production is only read: a pg_dump, and the identifier of its cluster.
# On the server, the local container is production's: the copy refuses a database it reads.
#
# Never copied: the listener tables (user, account, session, verification, liked_tracks), the
# covers kept for their tracks, youtube_link (YouTube's 30-day rule, schema.ts), and the
# migrations record (the schema comes from schema.ts). The local test listener (seed-dev) keeps
# its kept tracks, and their tie to an artist the copy still holds.
#
# Usage: scripts/pull-public-data.sh   (the local stack's Postgres running, `pnpm stack`)
set -euo pipefail

SERVER="${AUBESONORE_SERVER:-victormoi@victorserv}"
# In dependency order: each table's references come before it.
TABLES=(artist artist_slug artist_profile radio_play discovered_artist)

table_args="$(printf ' --table=public.%s' "${TABLES[@]}")"
# Emptied in reverse, so no row outlives what it references.
deletes=""
for ((i = ${#TABLES[@]} - 1; i >= 0; i--)); do deletes+="DELETE FROM ${TABLES[i]}; "; done

# Inside the container, whose environment names its own user and database.
local_psql() {
  docker exec -i aubesonore-db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
}

# The same cluster on both ends is production writing over itself: refused, as is a local
# database that cannot be identified.
SYSTEM_ID='SELECT system_identifier FROM pg_control_system();'
local_id="$(echo "$SYSTEM_ID" | local_psql -At || true)"
remote_id="$(echo "$SYSTEM_ID" | ssh "$SERVER" "docker exec -i aubesonore-db sh -c 'psql -At -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'" || true)"
if [ -z "$local_id" ] || [ -z "$remote_id" ] || [ "$local_id" = "$remote_id" ]; then
  echo "refusing: the local database is not a workstation's own (cluster '$local_id', production '$remote_id')" >&2
  exit 1
fi

dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT

# shellcheck disable=SC2029  # table_args expands here on purpose
ssh "$SERVER" "docker exec aubesonore-db sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --data-only --no-owner --no-privileges$table_args'" >"$dump"

# One transaction: the local database holds either the previous copy or the new one, whole.
# DELETE, not TRUNCATE: liked_tracks.artist_id is ON DELETE SET NULL, which TRUNCATE ignores
# (CASCADE would empty liked_tracks); the ties are kept aside and given back where the artist
# still exists. The lock holds the local antenna watcher off until the copy is whole.
{
  echo 'BEGIN;'
  echo "LOCK TABLE $(IFS=,; echo "${TABLES[*]}") IN SHARE ROW EXCLUSIVE MODE;"
  echo 'CREATE TEMP TABLE kept_tie ON COMMIT DROP AS SELECT id, artist_id FROM liked_tracks WHERE artist_id IS NOT NULL;'
  echo "$deletes"
  cat "$dump"
  # pg_dump empties search_path for its own statements.
  echo 'SET search_path = public;'
  echo 'UPDATE liked_tracks SET artist_id = k.artist_id FROM kept_tie k WHERE liked_tracks.id = k.id AND EXISTS (SELECT 1 FROM artist WHERE artist.id = k.artist_id);'
  echo 'COMMIT;'
} | local_psql >/dev/null

local_psql -At -F': ' <<'SQL'
SELECT 'artists', count(*) FROM artist
UNION ALL SELECT 'plays', count(*) FROM radio_play
UNION ALL SELECT 'kept tracks tied', count(*) FROM liked_tracks WHERE artist_id IS NOT NULL;
SQL
