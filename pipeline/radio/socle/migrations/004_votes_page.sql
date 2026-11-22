-- Sélections hebdomadaires de votes (docs/conception.md §4) : le modèle en service qui les a tirées.
CREATE TABLE selections (
    selection_id INTEGER PRIMARY KEY,
    selected_at  TEXT NOT NULL,
    model_id     INTEGER NOT NULL REFERENCES models (model_id)
) STRICT;

-- Bulletins : un titre présenté au vote, une seule fois dans toute l'histoire. Il est en attente
-- tant qu'aucune ligne de `votes` ne le porte. `position` est l'ordre de présentation, tiré au
-- hasard (à l'aveugle).
CREATE TABLE ballots (
    deezer_track_id INTEGER PRIMARY KEY
                    REFERENCES tracks (deezer_track_id) ON DELETE CASCADE,
    selection_id    INTEGER NOT NULL REFERENCES selections (selection_id),
    kind            TEXT NOT NULL CHECK (kind IN ('exam', 'lesson')),
    position        INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (selection_id, position)
) STRICT;
