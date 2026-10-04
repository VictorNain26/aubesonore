-- Migrate all timestamp columns to timestamptz (timestamp with time zone)
-- Workers run UTC in prod, so existing rows are interpreted as UTC during ALTER
-- and their values are preserved. Only columns still without a time zone are
-- altered, which keeps it idempotent; any error in an ALTER fails the migration.

DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.data_type = 'timestamp without time zone'
      AND (c.table_name::text, c.column_name::text) IN (
        ('user', 'ban_expires'),
        ('user', 'created_at'),
        ('user', 'updated_at'),
        ('account', 'access_token_expires_at'),
        ('account', 'refresh_token_expires_at'),
        ('account', 'created_at'),
        ('account', 'updated_at'),
        ('session', 'expires_at'),
        ('session', 'created_at'),
        ('session', 'updated_at'),
        ('verification', 'expires_at'),
        ('verification', 'created_at'),
        ('verification', 'updated_at'),
        ('liked_tracks', 'created_at'),
        ('user_preferences', 'updated_at'),
        ('push_subscriptions', 'created_at')
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE timestamp with time zone USING %I AT TIME ZONE ''UTC''',
      col.table_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;
