-- What no deployed backend reads or writes since #511: the stats API's table,
-- a kept track's stored links (the share page asks them live), and the columns of Better
-- Auth's admin plugin, removed with it. Kept by #511 while a rollback could still run a
-- backend that read them, as 0017 kept the column 0018 dropped. The owner agreed on
-- 2026-10-13; the tables were copied first (pre-drop-unread-2026-10-13.dump, beside the
-- nightly dumps). Idempotent.
DROP TABLE IF EXISTS user_stats;
ALTER TABLE liked_tracks DROP COLUMN IF EXISTS songlink_url;
ALTER TABLE liked_tracks DROP COLUMN IF EXISTS platform_links;
ALTER TABLE "user" DROP COLUMN IF EXISTS role;
ALTER TABLE "user" DROP COLUMN IF EXISTS banned;
ALTER TABLE "user" DROP COLUMN IF EXISTS ban_reason;
ALTER TABLE "user" DROP COLUMN IF EXISTS ban_expires;
