-- Mesures de chaque titre à l'antenne, pour l'enchaînement (docs/conception.md §7.3) : sur le titre
-- entier, ses 30 premières et ses 30 dernières secondes.
CREATE TABLE track_features (
    deezer_track_id    INTEGER PRIMARY KEY,
    status             TEXT NOT NULL CHECK (status IN ('ok', 'audio_failed')),
    model              TEXT NOT NULL,
    measured_at        TEXT NOT NULL,
    duration_s         REAL,
    danceability       REAL,
    danceability_start REAL,
    danceability_end   REAL,
    arousal            REAL,
    arousal_start      REAL,
    arousal_end        REAL,
    valence            REAL,
    valence_start      REAL,
    valence_end        REAL,
    bpm                REAL,
    bpm_start          REAL,
    bpm_end            REAL,
    CHECK ((status = 'ok') = (
        duration_s IS NOT NULL
        AND danceability IS NOT NULL AND danceability_start IS NOT NULL
        AND danceability_end IS NOT NULL
        AND arousal IS NOT NULL AND arousal_start IS NOT NULL AND arousal_end IS NOT NULL
        AND valence IS NOT NULL AND valence_start IS NOT NULL AND valence_end IS NOT NULL
        AND bpm IS NOT NULL AND bpm_start IS NOT NULL AND bpm_end IS NOT NULL
    ))
) STRICT;
