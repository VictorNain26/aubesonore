-- Les favoris Hype Machine de Victor (docs/conception.md §3.2) : un titre qu'il a déjà aimé n'est
-- plus une découverte, et la part de ses favoris que retiendrait le modèle mesure son goût.
-- Origine `favorite` ; la bibliothèque garde la priorité sur elle.
-- Reconstruction de table : https://www.sqlite.org/lang_altertable.html#otheralter

CREATE TABLE tracks_new (
    deezer_track_id  INTEGER PRIMARY KEY,
    deezer_artist_id INTEGER NOT NULL REFERENCES artists (deezer_artist_id),
    title            TEXT NOT NULL,
    origin           TEXT NOT NULL
                     CHECK (origin IN ('library', 'candidate', 'negative', 'favorite')),
    dedupe_key       TEXT NOT NULL,
    added_at         TEXT NOT NULL
) STRICT;
INSERT INTO tracks_new SELECT * FROM tracks;
DROP TABLE tracks;
ALTER TABLE tracks_new RENAME TO tracks;
CREATE UNIQUE INDEX tracks_dedupe ON tracks (origin, dedupe_key) WHERE origin != 'library';
