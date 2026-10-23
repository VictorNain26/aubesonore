-- Votes de Victor (docs/conception.md §4). Pas de clé étrangère vers `tracks` : un vote ne se perd jamais,
-- même si son titre quitte la table (titre retiré de Plex). Un vote sans signaux est compté.
CREATE TABLE votes (
    deezer_track_id INTEGER PRIMARY KEY,
    kind            TEXT NOT NULL CHECK (kind IN ('exam', 'lesson')),
    vote            TEXT NOT NULL CHECK (vote IN ('oui', 'non', 'passer')),
    voted_at        TEXT NOT NULL,
    source          TEXT NOT NULL
) STRICT;

-- Historique des entraînements (docs/conception.md §4) : une ligne par entraînement, promu ou non.
-- `file` : nom du fichier joblib dans <data_dir>/models/. Le modèle en service est le dernier
-- promu.
CREATE TABLE models (
    model_id   INTEGER PRIMARY KEY,
    trained_at TEXT NOT NULL,
    file       TEXT NOT NULL,
    threshold  REAL CHECK (threshold IS NULL OR (threshold >= 0 AND threshold <= 1)),
    promoted   INTEGER NOT NULL CHECK (promoted IN (0, 1)),
    verdict    TEXT NOT NULL,
    params     TEXT NOT NULL,
    metrics    TEXT NOT NULL,
    CHECK (promoted = 0 OR threshold IS NOT NULL)
) STRICT;

-- Notes des candidats par le modèle en service ; remplacées à chaque entraînement.
CREATE TABLE scores (
    deezer_track_id INTEGER PRIMARY KEY REFERENCES tracks (deezer_track_id) ON DELETE CASCADE,
    model_id        INTEGER NOT NULL REFERENCES models (model_id),
    score           REAL NOT NULL CHECK (score >= 0 AND score <= 1),
    accepted        INTEGER NOT NULL CHECK (accepted IN (0, 1))
) STRICT;
