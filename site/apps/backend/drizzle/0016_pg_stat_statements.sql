-- The statistics view of the queries the server runs: the module is loaded at start
-- (compose.yaml, shared_preload_libraries), the view lives in each database that
-- creates the extension (postgresql.org/docs/16/pgstatstatements.html). Idempotent.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
