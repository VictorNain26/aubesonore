-- Artistes Deezer mesurés : bibliothèque, voisins, négatifs. Données brutes lues une fois ;
-- les signaux se calculent à la lecture (radio/signals/table.py).
CREATE TABLE artists (
    deezer_artist_id INTEGER PRIMARY KEY,
    name             TEXT NOT NULL,
    fetched_at       TEXT,
    nb_fan           INTEGER CHECK (nb_fan >= 0),
    deezer_related   TEXT,
    lastfm_found     INTEGER CHECK (lastfm_found IN (0, 1)),
    lastfm_listeners INTEGER CHECK (lastfm_listeners >= 0),
    lastfm_tags      TEXT,
    lastfm_similar   TEXT,
    CHECK ((fetched_at IS NULL) = (nb_fan IS NULL)),
    CHECK ((fetched_at IS NULL) = (deezer_related IS NULL)),
    CHECK ((fetched_at IS NULL) = (lastfm_found IS NULL)),
    CHECK ((lastfm_found = 1) = (lastfm_tags IS NOT NULL AND lastfm_similar IS NOT NULL)),
    CHECK (lastfm_found = 1 OR lastfm_listeners IS NULL)
) STRICT;

-- Tous les titres mesurés, quelle que soit leur origine. La bibliothèque peut contenir deux
-- versions d'un même titre ; candidats et négatifs sont dédoublonnés dès l'entrée (radio/library/dedupe.py).
CREATE TABLE tracks (
    deezer_track_id  INTEGER PRIMARY KEY,
    deezer_artist_id INTEGER NOT NULL REFERENCES artists (deezer_artist_id),
    title            TEXT NOT NULL,
    origin           TEXT NOT NULL CHECK (origin IN ('library', 'candidate', 'negative')),
    dedupe_key       TEXT NOT NULL,
    added_at         TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX tracks_dedupe ON tracks (origin, dedupe_key) WHERE origin != 'library';

-- Rang Deezer et empreinte EffNet (1 280 float32 = 5 120 octets) de l'extrait de 30 s.
CREATE TABLE track_measures (
    deezer_track_id INTEGER PRIMARY KEY REFERENCES tracks (deezer_track_id) ON DELETE CASCADE,
    status          TEXT NOT NULL
                    CHECK (status IN ('ok', 'no_preview', 'audio_failed', 'gone')),
    rank            INTEGER CHECK (rank >= 0),
    embedding       BLOB,
    model           TEXT NOT NULL,
    measured_at     TEXT NOT NULL,
    CHECK ((status = 'gone') = (rank IS NULL)),
    CHECK ((status = 'ok') = (embedding IS NOT NULL)),
    CHECK (embedding IS NULL OR length(embedding) = 5120)
) STRICT;

CREATE TABLE discover_runs (
    run_id      INTEGER PRIMARY KEY,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    status      TEXT NOT NULL CHECK (status IN ('running', 'done')),
    CHECK ((status = 'done') = (finished_at IS NOT NULL))
) STRICT;

-- Au plus une passe en cours : une passe interrompue reprend avec les mêmes graines.
CREATE UNIQUE INDEX discover_one_running ON discover_runs (status) WHERE status = 'running';

CREATE TABLE run_seeds (
    run_id           INTEGER NOT NULL REFERENCES discover_runs (run_id),
    deezer_artist_id INTEGER NOT NULL,
    PRIMARY KEY (run_id, deezer_artist_id)
) STRICT;

CREATE TABLE candidates (
    deezer_track_id     INTEGER PRIMARY KEY
                        REFERENCES tracks (deezer_track_id) ON DELETE CASCADE,
    run_id              INTEGER NOT NULL REFERENCES discover_runs (run_id),
    seed_artist_id      INTEGER NOT NULL,
    neighbour_artist_id INTEGER NOT NULL
) STRICT;

CREATE TABLE negative_artists (
    deezer_artist_id INTEGER PRIMARY KEY REFERENCES artists (deezer_artist_id),
    category         TEXT NOT NULL
                     CHECK (category IN ('commercial_fr', 'commercial_intl', 'metal', 'hard_techno'))
) STRICT;
