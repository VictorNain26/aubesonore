-- The roles other than the owner's, created by db-roles-init (compose.yaml) at every
-- `docker compose up`, as the owner (POSTGRES_USER), which keeps the schema and runs the migrations.
--
-- `musilogy`: the role `musilogy load` signs in as (compose.yaml, db-roles-init; psql runs this file at every
-- `docker compose up`). It may create schemas in this database and owns the two it writes,
-- `musilogy` and, while a load runs, `musilogy_next`. It holds no right over the site's tables:
-- a load drops a schema with CASCADE, in the database that keeps the accounts and the kept tracks.
--
-- Idempotent: the role is created once, its password follows .env, and a schema an earlier load
-- left under another role changes hands. The owner of a schema may drop it with what it holds,
-- whoever owns the tables inside (postgresql.org/docs/16/sql-dropschema.html).
\getenv password MUSILOGY_DB_PASSWORD
\getenv app_password APP_DB_PASSWORD

SELECT 'CREATE ROLE musilogy LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'musilogy') \gexec

-- The password travels in the statement: the server logs neither a slow statement (compose.yaml,
-- log_min_duration_statement) nor a failed one for this session
-- (postgresql.org/docs/16/runtime-config-logging.html).
SET log_min_duration_statement = -1;
SET log_min_error_statement = 'panic';
ALTER ROLE musilogy PASSWORD :'password';

SELECT format('GRANT CREATE ON DATABASE %I TO musilogy', current_database()) \gexec

SELECT format('ALTER SCHEMA %I OWNER TO musilogy', nspname)
FROM pg_namespace
WHERE nspname IN ('musilogy', 'musilogy_next') \gexec

-- `aubesonore_app`: the backend's role while it serves. It reads and writes the rows of the site's
-- tables, reads Musilogy's (below), and nothing else: no schema change, no role, no other database; a flaw in a request
-- cannot drop a table nor read past the grants (postgresql.org/docs/16/ddl-priv.html). The
-- migrations run as the owner, at the backend's start (MIGRATION_DATABASE_URL).
SELECT 'CREATE ROLE aubesonore_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aubesonore_app') \gexec

ALTER ROLE aubesonore_app PASSWORD :'app_password';

SELECT format('GRANT CONNECT ON DATABASE %I TO aubesonore_app', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO aubesonore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aubesonore_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aubesonore_app;
-- The tables a later migration creates, as the owner, are granted alike
-- (postgresql.org/docs/16/sql-alterdefaultprivileges.html).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aubesonore_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO aubesonore_app;

-- It reads Musilogy, through the functions the site calls (musilogy/docs/conception.md §4), which
-- run with its rights and so need the tables too: USAGE and SELECT, never a write. Granted here
-- on the schema in place, whatever load left it (one older than its grant to PUBLIC served none:
-- 2026-11-21), and by default on what the `musilogy` role creates next, so the schema a load
-- renames in is readable without this script running again
-- (postgresql.org/docs/16/sql-alterdefaultprivileges.html).
SELECT format('GRANT USAGE ON SCHEMA %I TO aubesonore_app', nspname),
       format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO aubesonore_app', nspname)
FROM pg_namespace
WHERE nspname = 'musilogy' \gexec
ALTER DEFAULT PRIVILEGES FOR ROLE musilogy GRANT USAGE ON SCHEMAS TO aubesonore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE musilogy GRANT SELECT ON TABLES TO aubesonore_app;
