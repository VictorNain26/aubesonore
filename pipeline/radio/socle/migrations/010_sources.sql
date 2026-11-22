-- Chaque candidat garde sa source, pour juger chaque source sur les votes d'examen
-- (docs/conception.md §3) : un voisin d'une graine, un titre de Hype Machine (detail = blog), un titre
-- d'une sélection éditoriale Deezer (detail = genre). Seul un voisin a une graine.
-- Reconstruction de table : https://www.sqlite.org/lang_altertable.html#otheralter

CREATE TABLE candidates_new (
    deezer_track_id     INTEGER PRIMARY KEY
                        REFERENCES tracks (deezer_track_id) ON DELETE CASCADE,
    run_id              INTEGER NOT NULL REFERENCES discover_runs (run_id),
    source              TEXT NOT NULL CHECK (source IN ('voisin', 'hypem', 'deezer_editorial')),
    seed_artist_id      INTEGER,
    neighbour_artist_id INTEGER,
    detail              TEXT,
    CHECK ((source = 'voisin') = (seed_artist_id IS NOT NULL AND neighbour_artist_id IS NOT NULL)),
    CHECK ((source = 'voisin') = (detail IS NULL))
) STRICT;
INSERT INTO candidates_new (deezer_track_id, run_id, source, seed_artist_id, neighbour_artist_id)
    SELECT deezer_track_id, run_id, 'voisin', seed_artist_id, neighbour_artist_id FROM candidates;
DROP TABLE candidates;
ALTER TABLE candidates_new RENAME TO candidates;
