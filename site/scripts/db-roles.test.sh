#!/usr/bin/env bash
# db-roles.sql against a real Postgres: the backend's role reads Musilogy's functions, whatever
# load left the schema, and keeps reading after the next load swaps it.
#
# Connects as a superuser through the libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD), like
# the owner db-roles-init signs in as, and works in a database of its own, dropped at the end.
# The roles it creates are the cluster's, and it resets their passwords: it runs only on a
# throwaway server (CI's service container), when DB_ROLES_TEST_THROWAWAY=1 says so.
set -euo pipefail

if [ "${DB_ROLES_TEST_THROWAWAY:-}" != 1 ]; then
  echo "db-roles.test.sh resets the roles' passwords of the server it reaches:" >&2
  echo "run it on a throwaway server, with DB_ROLES_TEST_THROWAWAY=1." >&2
  exit 2
fi

here=$(cd "$(dirname "$0")" && pwd)
db=db_roles_test
export MUSILOGY_DB_PASSWORD=musilogy-test APP_DB_PASSWORD=app-test
export PGOPTIONS="-c client_min_messages=warning"

psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
trap 'psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $db"' EXIT

owner() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }
as() { # <role> <password> <sql>
  PGUSER=$1 PGPASSWORD=$2 psql -X -q -At -v ON_ERROR_STOP=1 -d "$db" -c "$3"
}
roles() { owner -f "$here/db-roles.sql" >/dev/null; }

failures=0
check() { # <what> <role> <password> <sql> <expected>
  local got
  got=$(as "$2" "$3" "$4" 2>&1) || true
  if [ "$got" = "$5" ]; then
    echo "ok   $1"
  else
    echo "FAIL $1: got '$got', expected '$5'"
    failures=$((failures + 1))
  fi
}

# A fresh database, without Musilogy: the script runs, twice.
roles
roles
echo "ok   the script runs on a database without Musilogy, and again"

# A schema an older load left: owned by its loader, no right granted to anyone.
owner <<'SQL'
CREATE SCHEMA musilogy;
CREATE TABLE musilogy.artists (mbid uuid PRIMARY KEY, name text NOT NULL);
INSERT INTO musilogy.artists VALUES ('a74b1b7f-71a5-4011-9441-d0b5e4122711', 'Radiohead');
CREATE FUNCTION musilogy.artist_name(artist uuid) RETURNS text LANGUAGE sql STABLE
  AS 'SELECT name FROM musilogy.artists WHERE mbid = artist';
REVOKE ALL ON SCHEMA musilogy FROM PUBLIC;
SQL
roles
check "the backend reads a schema an older load left" aubesonore_app app-test \
  "SELECT musilogy.artist_name('a74b1b7f-71a5-4011-9441-d0b5e4122711')" Radiohead

# The next load, as musilogy load runs it: a staging schema, renamed over the old one, with no
# grant of its own and no db-roles run after it. It copies the swap of musilogy/src/musilogy/load.py
# (signed in as the `musilogy` role, the one the default privileges name): a change there to the
# role or the swap is changed here too.
as musilogy musilogy-test "
  CREATE SCHEMA musilogy_next;
  CREATE TABLE musilogy_next.artists (mbid uuid PRIMARY KEY, name text NOT NULL);
  INSERT INTO musilogy_next.artists VALUES ('a74b1b7f-71a5-4011-9441-d0b5e4122711', 'Radiohead');
  CREATE FUNCTION musilogy_next.artist_name(artist uuid) RETURNS text LANGUAGE sql STABLE
    AS 'SELECT name FROM musilogy.artists WHERE mbid = artist';
  REVOKE ALL ON SCHEMA musilogy_next FROM PUBLIC;
  DROP SCHEMA musilogy CASCADE;
  ALTER SCHEMA musilogy_next RENAME TO musilogy;" >/dev/null
check "the backend reads the schema the next load swaps in" aubesonore_app app-test \
  "SELECT musilogy.artist_name('a74b1b7f-71a5-4011-9441-d0b5e4122711')" Radiohead

# Reading is all it gets.
check "the backend cannot write Musilogy's tables" aubesonore_app app-test \
  "DELETE FROM musilogy.artists" \
  "ERROR:  permission denied for table artists"

if [ "$failures" -gt 0 ]; then
  echo "$failures failure(s)"
  exit 1
fi
