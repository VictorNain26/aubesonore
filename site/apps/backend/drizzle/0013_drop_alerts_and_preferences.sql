-- The liked-artist alerts and the preferred platform are gone: "Mes titres"
-- opens every track on YouTube. Their tables go with them. Idempotent.
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS user_preferences;
