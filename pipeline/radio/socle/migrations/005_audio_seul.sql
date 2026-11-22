-- Modèle audio seul (2026-09-30) : popularité, culture et proximité n'aidaient pas sur les votes,
-- leurs colonnes partent. Le seuil disparaît : une fournée est classée, pas seuillée.
-- Reconstruction de table : https://www.sqlite.org/lang_altertable.html#otheralter

CREATE TABLE artists_new (
    deezer_artist_id INTEGER PRIMARY KEY,
    name             TEXT NOT NULL
) STRICT;
INSERT INTO artists_new SELECT deezer_artist_id, name FROM artists;
DROP TABLE artists;
ALTER TABLE artists_new RENAME TO artists;

CREATE TABLE track_measures_new (
    deezer_track_id INTEGER PRIMARY KEY REFERENCES tracks (deezer_track_id) ON DELETE CASCADE,
    status          TEXT NOT NULL
                    CHECK (status IN ('ok', 'no_preview', 'audio_failed', 'gone')),
    embedding       BLOB,
    model           TEXT NOT NULL,
    measured_at     TEXT NOT NULL,
    CHECK ((status = 'ok') = (embedding IS NOT NULL)),
    CHECK (embedding IS NULL OR length(embedding) = 5120)
) STRICT;
INSERT INTO track_measures_new
    SELECT deezer_track_id, status, embedding, model, measured_at FROM track_measures;
DROP TABLE track_measures;
ALTER TABLE track_measures_new RENAME TO track_measures;

-- Les modèles empilés antérieurs ne se relisent plus.
DELETE FROM scores;
DELETE FROM models;
CREATE TABLE models_new (
    model_id   INTEGER PRIMARY KEY,
    trained_at TEXT NOT NULL,
    file       TEXT NOT NULL,
    promoted   INTEGER NOT NULL CHECK (promoted IN (0, 1)),
    verdict    TEXT NOT NULL,
    params     TEXT NOT NULL,
    metrics    TEXT NOT NULL
) STRICT;
DROP TABLE models;
ALTER TABLE models_new RENAME TO models;
