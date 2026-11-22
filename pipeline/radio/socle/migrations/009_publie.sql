-- Une découverte déposée sur AzuraCast passe à « publiée » dans la transaction de son entrée à
-- l'antenne, et son fichier prêt, effacé, n'est plus référencé. Sortie ensuite de l'antenne, elle
-- n'est jamais republiée (docs/conception.md §7.1).
-- Reconstruction de table : https://www.sqlite.org/lang_altertable.html#otheralter

CREATE TABLE acquisitions_new (
    deezer_track_id INTEGER PRIMARY KEY REFERENCES tracks (deezer_track_id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('ready', 'failed', 'published')),
    reason          TEXT,
    attempts        INTEGER NOT NULL CHECK (attempts >= 1),
    file            TEXT,
    attempted_at    TEXT NOT NULL,
    CHECK ((status = 'ready') = (file IS NOT NULL)),
    CHECK ((status = 'failed') = (reason IS NOT NULL))
) STRICT;
INSERT INTO acquisitions_new
    SELECT a.deezer_track_id,
           CASE WHEN n.deezer_track_id IS NULL THEN a.status ELSE 'published' END,
           a.reason,
           a.attempts,
           CASE WHEN n.deezer_track_id IS NULL THEN a.file END,
           a.attempted_at
    FROM acquisitions a LEFT JOIN antenne n
        ON n.deezer_track_id = a.deezer_track_id AND n.origin = 'decouverte' AND a.status = 'ready';
DROP TABLE acquisitions;
ALTER TABLE acquisitions_new RENAME TO acquisitions;
