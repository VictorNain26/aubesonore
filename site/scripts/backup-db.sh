#!/usr/bin/env bash
# Off-disk dump of the AubeSonore Postgres database.
#
# The database lives in a Docker volume on the NVMe that carries the whole
# stack; a failure of that disk takes the only copy with it. Dumps therefore
# land on /media/plex, a physically separate disk (sda1) — the same target the
# media stack already backs up to.
set -euo pipefail

CONTAINER=aubesonore-db
DB_USER=${POSTGRES_USER:-aubesonore}
DB_NAME=${POSTGRES_DB:-aubesonore}
DEST=/media/plex/.backups/aubesonore
RETENTION_DAYS=14
STAMP=$(date +%F_%H%M)
TARGET="$DEST/aubesonore-$STAMP.dump"

# Dumps carry user emails and auth rows: keep them unreadable to other users of
# this shared box.
mkdir -p "$DEST"
chmod 700 "$DEST"

if ! docker ps --filter "name=^${CONTAINER}$" --filter "health=healthy" --format '{{.Names}}' | grep -q .; then
  echo "$CONTAINER is not healthy, refusing to dump"
  exit 1
fi

# Custom format: compressed, and pg_restore can list/select from it. The
# musilogy schema (~1 GB) is derived data, reloaded from its Parquet delivery
# by `musilogy load`: dumping it nightly would only multiply its size by the
# retention.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc --exclude-schema=musilogy "$DB_NAME" > "$TARGET"
chmod 600 "$TARGET"

# A dump that pg_restore cannot read is worse than no dump, because it looks
# like a backup. Verify before rotating older ones out.
if ! docker exec -i "$CONTAINER" pg_restore --list < "$TARGET" > /dev/null 2>&1; then
  echo "dump $TARGET is unreadable by pg_restore, keeping older backups"
  rm -f "$TARGET"
  exit 1
fi

size=$(stat -c %s "$TARGET")
echo "dumped $DB_NAME to $TARGET ($size bytes), archive verified"

find "$DEST" -name 'aubesonore-*.dump' -type f -mtime +"$RETENTION_DAYS" -delete
echo "retention: $(find "$DEST" -name 'aubesonore-*.dump' -type f | wc -l) dumps kept"
