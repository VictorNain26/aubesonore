-- Cycle de vie d'un titre à l'antenne (docs/recherches/2026-10-02-cycle-de-vie.md §4) : chaque
-- titre a une catégorie et la date d'entrée dans cette catégorie (`since`). Le repos est hors
-- antenne, dans le dossier `repos/` d'AzuraCast, lié à aucune playlist. `published_at` reste la
-- première diffusion : la péremption à 18 mois part de là.
-- Reconstruction de table : https://www.sqlite.org/lang_altertable.html#otheralter

CREATE TABLE antenne_new (
    deezer_track_id INTEGER PRIMARY KEY,
    origin          TEXT NOT NULL CHECK (origin IN ('decouverte', 'repere')),
    categorie       TEXT NOT NULL
                    CHECK (categorie IN ('nouveautes', 'decouvertes', 'fond', 'repos', 'reperes')),
    media_id        INTEGER NOT NULL UNIQUE,
    song_id         TEXT NOT NULL,
    path            TEXT NOT NULL UNIQUE,
    published_at    TEXT NOT NULL,
    since           TEXT NOT NULL,
    CHECK ((origin = 'repere') = (categorie = 'reperes'))
) STRICT;
INSERT INTO antenne_new
    SELECT n.deezer_track_id, n.origin,
           CASE WHEN n.origin = 'repere' THEN 'reperes'
                WHEN c.source IN ('hypem', 'deezer_editorial') THEN 'nouveautes'
                ELSE 'decouvertes' END,
           n.media_id, n.song_id, n.path, n.published_at, n.published_at
    FROM antenne n LEFT JOIN candidates c USING (deezer_track_id);
DROP TABLE antenne;
ALTER TABLE antenne_new RENAME TO antenne;

-- Un repère sorti ne revient pas avant `rest_weeks` semaines.
CREATE TABLE repere_sorties (
    deezer_track_id INTEGER PRIMARY KEY,
    left_at         TEXT NOT NULL
) STRICT;
