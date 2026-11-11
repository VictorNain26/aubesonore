-- The role `musilogy load` signs in as (compose.yaml, db-roles-init; psql runs this file at every
-- `docker compose up`). It may create schemas in this database and owns the two it writes,
-- `musilogy` and, while a load runs, `musilogy_next`. It holds no right over the site's tables:
-- a load drops a schema with CASCADE, in the database that keeps the accounts and the kept tracks.
--
-- Idempotent: the role is created once, its password follows .env, and a schema an earlier load
-- left under another role changes hands. The owner of a schema may drop it with what it holds,
-- whoever owns the tables inside (postgresql.org/docs/16/sql-dropschema.html).
\getenv password MUSILOGY_DB_PASSWORD

SELECT 'CREATE ROLE musilogy LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'musilogy') \gexec

ALTER ROLE musilogy PASSWORD :'password';

SELECT format('GRANT CREATE ON DATABASE %I TO musilogy', current_database()) \gexec

SELECT format('ALTER SCHEMA %I OWNER TO musilogy', nspname)
FROM pg_namespace
WHERE nspname IN ('musilogy', 'musilogy_next') \gexec
