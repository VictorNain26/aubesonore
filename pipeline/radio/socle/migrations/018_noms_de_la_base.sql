-- La base prend les noms du vocabulaire (pipeline/docs/conception.md, « Vocabulaire »).
-- 1. Les tables et les colonnes changent de nom : SQLite réécrit lui-même les REFERENCES, les CHECK
--    et les index qui les nomment (https://www.sqlite.org/lang_altertable.html#altertabrename).
-- 2. Les tables dont un CHECK nomme une valeur qui change sont reconstruites, selon la procédure
--    officielle (même page, « Making Other Kinds Of Table Schema Changes ») : _migrate coupe les
--    clés étrangères et les vérifie avant de valider. Un CASE sans ELSE rend NULL sur une valeur
--    inconnue, que NOT NULL refuse : la migration échoue plutôt que de corrompre.
-- 3. votes.source, toujours 'page', part.

ALTER TABLE library_tracks RENAME TO bibliotheque;
ALTER TABLE deezer_matches RENAME TO rapprochements;
ALTER TABLE artists RENAME TO artistes;
ALTER TABLE tracks RENAME TO titres;
ALTER TABLE discover_runs RENAME TO fournees;
ALTER TABLE run_seeds RENAME TO graines;
ALTER TABLE candidates RENAME TO candidats;
ALTER TABLE negative_artists RENAME TO artistes_negatifs;
ALTER TABLE track_measures RENAME TO empreintes;
ALTER TABLE models RENAME TO modeles;
ALTER TABLE scores RENAME TO notes;
ALTER TABLE selections RENAME TO tirages;
ALTER TABLE ballots RENAME TO bulletins;
ALTER TABLE acquisitions RENAME TO telechargements;
ALTER TABLE repere_sorties RENAME TO reperes_sortis;
ALTER TABLE track_features RENAME TO mesures;
ALTER TABLE stage_reports RENAME TO rapports;

ALTER TABLE rapprochements RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE rapprochements RENAME COLUMN deezer_artist_id TO artiste_id;
ALTER TABLE artistes RENAME COLUMN deezer_artist_id TO artiste_id;
ALTER TABLE titres RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE titres RENAME COLUMN deezer_artist_id TO artiste_id;
ALTER TABLE titres RENAME COLUMN origin TO provenance;
ALTER TABLE fournees RENAME COLUMN run_id TO fournee_id;
ALTER TABLE graines RENAME COLUMN run_id TO fournee_id;
ALTER TABLE graines RENAME COLUMN deezer_artist_id TO artiste_id;
ALTER TABLE candidats RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE candidats RENAME COLUMN run_id TO fournee_id;
ALTER TABLE artistes_negatifs RENAME COLUMN deezer_artist_id TO artiste_id;
ALTER TABLE empreintes RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE modeles RENAME COLUMN model_id TO modele_id;
ALTER TABLE notes RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE notes RENAME COLUMN model_id TO modele_id;
ALTER TABLE notes RENAME COLUMN accepted TO retenu;
ALTER TABLE notes RENAME COLUMN floored TO sous_plancher;
ALTER TABLE tirages RENAME COLUMN selection_id TO tirage_id;
ALTER TABLE tirages RENAME COLUMN model_id TO modele_id;
ALTER TABLE bulletins RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE bulletins RENAME COLUMN selection_id TO tirage_id;
ALTER TABLE bulletins RENAME COLUMN kind TO type;
ALTER TABLE bulletins RENAME COLUMN retained TO retenu;
ALTER TABLE telechargements RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE reperes_sortis RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE mesures RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE mesures RENAME COLUMN arousal TO energie;
ALTER TABLE mesures RENAME COLUMN arousal_start TO energie_start;
ALTER TABLE mesures RENAME COLUMN arousal_end TO energie_end;
ALTER TABLE mesures RENAME COLUMN bpm TO tempo;
ALTER TABLE mesures RENAME COLUMN bpm_start TO tempo_start;
ALTER TABLE mesures RENAME COLUMN bpm_end TO tempo_end;
ALTER TABLE rapports RENAME COLUMN report_id TO rapport_id;
ALTER TABLE antenne RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE antenne RENAME COLUMN origin TO provenance;
ALTER TABLE votes RENAME COLUMN deezer_track_id TO titre_id;
ALTER TABLE votes RENAME COLUMN kind TO type;

DROP INDEX discover_one_running;
CREATE UNIQUE INDEX fournee_en_cours ON fournees (status) WHERE status = 'running';

-- titres

CREATE TABLE titres_nouv (
    titre_id   INTEGER PRIMARY KEY,
    artiste_id INTEGER NOT NULL REFERENCES artistes (artiste_id),
    title      TEXT NOT NULL,
    provenance TEXT NOT NULL
               CHECK (provenance IN ('bibliotheque', 'candidat', 'negatif', 'favori')),
    dedupe_key TEXT NOT NULL,
    added_at   TEXT NOT NULL
) STRICT;
INSERT INTO titres_nouv
SELECT titre_id, artiste_id, title,
       CASE provenance
           WHEN 'library' THEN 'bibliotheque'
           WHEN 'candidate' THEN 'candidat'
           WHEN 'negative' THEN 'negatif'
           WHEN 'favorite' THEN 'favori'
       END,
       dedupe_key, added_at
FROM titres;
DROP TABLE titres;
ALTER TABLE titres_nouv RENAME TO titres;
CREATE UNIQUE INDEX titres_dedoublonnage ON titres (provenance, dedupe_key)
    WHERE provenance != 'bibliotheque';

-- rapprochements

CREATE TABLE rapprochements_nouv (
    plex_key   TEXT PRIMARY KEY REFERENCES bibliotheque (plex_key) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('trouve', 'non_trouve')),
    reason     TEXT CHECK (reason IN ('no_duration', 'no_result', 'no_exact_match')),
    titre_id   INTEGER,
    artiste_id INTEGER,
    matched_at TEXT NOT NULL,
    CHECK ((status = 'trouve') = (titre_id IS NOT NULL
                                  AND artiste_id IS NOT NULL
                                  AND reason IS NULL)),
    CHECK ((status = 'non_trouve') = (reason IS NOT NULL))
) STRICT;
INSERT INTO rapprochements_nouv
SELECT plex_key,
       CASE status WHEN 'matched' THEN 'trouve' WHEN 'unmatched' THEN 'non_trouve' END,
       reason, titre_id, artiste_id, matched_at
FROM rapprochements;
DROP TABLE rapprochements;
ALTER TABLE rapprochements_nouv RENAME TO rapprochements;

-- empreintes

CREATE TABLE empreintes_nouv (
    titre_id    INTEGER PRIMARY KEY REFERENCES titres (titre_id) ON DELETE CASCADE,
    status      TEXT NOT NULL
                CHECK (status IN ('ok', 'sans_extrait', 'audio_rate', 'disparu')),
    embedding   BLOB,
    model       TEXT NOT NULL,
    measured_at TEXT NOT NULL,
    CHECK ((status = 'ok') = (embedding IS NOT NULL)),
    CHECK (embedding IS NULL OR length(embedding) = 5120)
) STRICT;
INSERT INTO empreintes_nouv
SELECT titre_id,
       CASE status
           WHEN 'ok' THEN 'ok'
           WHEN 'no_preview' THEN 'sans_extrait'
           WHEN 'audio_failed' THEN 'audio_rate'
           WHEN 'gone' THEN 'disparu'
       END,
       embedding, model, measured_at
FROM empreintes;
DROP TABLE empreintes;
ALTER TABLE empreintes_nouv RENAME TO empreintes;

-- bulletins

CREATE TABLE bulletins_nouv (
    titre_id  INTEGER PRIMARY KEY REFERENCES titres (titre_id) ON DELETE CASCADE,
    tirage_id INTEGER NOT NULL REFERENCES tirages (tirage_id),
    type      TEXT NOT NULL CHECK (type IN ('examen', 'lecon')),
    position  INTEGER NOT NULL CHECK (position >= 0),
    retenu    INTEGER NOT NULL DEFAULT 0 CHECK (retenu IN (0, 1)),
    UNIQUE (tirage_id, position)
) STRICT;
INSERT INTO bulletins_nouv
SELECT titre_id, tirage_id,
       CASE type WHEN 'exam' THEN 'examen' WHEN 'lesson' THEN 'lecon' END,
       position, retenu
FROM bulletins;
DROP TABLE bulletins;
ALTER TABLE bulletins_nouv RENAME TO bulletins;

-- votes, sans source

CREATE TABLE votes_nouv (
    titre_id INTEGER PRIMARY KEY,
    type     TEXT NOT NULL CHECK (type IN ('examen', 'lecon')),
    vote     TEXT NOT NULL CHECK (vote IN ('oui', 'non', 'passer')),
    voted_at TEXT NOT NULL
) STRICT;
INSERT INTO votes_nouv
SELECT titre_id, CASE type WHEN 'exam' THEN 'examen' WHEN 'lesson' THEN 'lecon' END,
       vote, voted_at
FROM votes;
DROP TABLE votes;
ALTER TABLE votes_nouv RENAME TO votes;

-- telechargements

CREATE TABLE telechargements_nouv (
    titre_id     INTEGER PRIMARY KEY REFERENCES titres (titre_id) ON DELETE CASCADE,
    status       TEXT NOT NULL CHECK (status IN ('pret', 'echec', 'publie')),
    reason       TEXT,
    attempts     INTEGER NOT NULL CHECK (attempts >= 1),
    file         TEXT,
    attempted_at TEXT NOT NULL,
    CHECK ((status = 'pret') = (file IS NOT NULL)),
    CHECK ((status = 'echec') = (reason IS NOT NULL))
) STRICT;
INSERT INTO telechargements_nouv
SELECT titre_id,
       CASE status WHEN 'ready' THEN 'pret' WHEN 'failed' THEN 'echec' WHEN 'published' THEN 'publie' END,
       reason, attempts, file, attempted_at
FROM telechargements;
DROP TABLE telechargements;
ALTER TABLE telechargements_nouv RENAME TO telechargements;

-- antenne

CREATE TABLE antenne_nouv (
    titre_id     INTEGER PRIMARY KEY,
    provenance   TEXT NOT NULL CHECK (provenance IN ('telecharge', 'repere')),
    categorie    TEXT NOT NULL
                 CHECK (categorie IN ('nouveautes', 'decouvertes', 'fond', 'repos', 'reperes')),
    media_id     INTEGER NOT NULL UNIQUE,
    song_id      TEXT NOT NULL,
    path         TEXT NOT NULL UNIQUE,
    published_at TEXT NOT NULL,
    since        TEXT NOT NULL,
    CHECK ((provenance = 'repere') = (categorie = 'reperes'))
) STRICT;
INSERT INTO antenne_nouv
SELECT titre_id,
       CASE provenance WHEN 'decouverte' THEN 'telecharge' WHEN 'repere' THEN 'repere' END,
       categorie, media_id, song_id, path, published_at, since
FROM antenne;
DROP TABLE antenne;
ALTER TABLE antenne_nouv RENAME TO antenne;

-- mesures

CREATE TABLE mesures_nouv (
    titre_id           INTEGER PRIMARY KEY,
    status             TEXT NOT NULL CHECK (status IN ('ok', 'audio_rate')),
    model              TEXT NOT NULL,
    measured_at        TEXT NOT NULL,
    duration_s         REAL,
    danceability       REAL,
    danceability_start REAL,
    danceability_end   REAL,
    energie            REAL,
    energie_start      REAL,
    energie_end        REAL,
    valence            REAL,
    valence_start      REAL,
    valence_end        REAL,
    tempo              REAL,
    tempo_start        REAL,
    tempo_end          REAL,
    CHECK ((status = 'ok') = (
        duration_s IS NOT NULL
        AND danceability IS NOT NULL AND danceability_start IS NOT NULL
        AND danceability_end IS NOT NULL
        AND energie IS NOT NULL AND energie_start IS NOT NULL AND energie_end IS NOT NULL
        AND valence IS NOT NULL AND valence_start IS NOT NULL AND valence_end IS NOT NULL
        AND tempo IS NOT NULL AND tempo_start IS NOT NULL AND tempo_end IS NOT NULL
    ))
) STRICT;
INSERT INTO mesures_nouv
SELECT titre_id, CASE status WHEN 'ok' THEN 'ok' WHEN 'audio_failed' THEN 'audio_rate' END,
       model, measured_at, duration_s,
       danceability, danceability_start, danceability_end,
       energie, energie_start, energie_end,
       valence, valence_start, valence_end,
       tempo, tempo_start, tempo_end
FROM mesures;
DROP TABLE mesures;
ALTER TABLE mesures_nouv RENAME TO mesures;
