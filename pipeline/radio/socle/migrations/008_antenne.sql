-- Bibliothèque d'antenne (docs/conception.md §7) et fichier Plex des titres, pour les repères (§6).
ALTER TABLE library_tracks ADD COLUMN file TEXT;

-- Titres publiés sur AzuraCast par le pipeline. Pas de clé étrangère : un repère retiré de Plex
-- reste à l'antenne jusqu'à sa sortie.
CREATE TABLE antenne (
    deezer_track_id INTEGER PRIMARY KEY,
    origin          TEXT NOT NULL CHECK (origin IN ('decouverte', 'repere')),
    media_id        INTEGER NOT NULL UNIQUE,
    song_id         TEXT NOT NULL,
    path            TEXT NOT NULL UNIQUE,
    published_at    TEXT NOT NULL
) STRICT;
