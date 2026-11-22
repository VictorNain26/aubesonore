-- Acquisition (docs/conception.md §5, §6) et rapports d'étape (§8.1).

-- Dernier état de chaque titre retenu tenté : prêt (fichier préparé) ou en échec (raison).
CREATE TABLE acquisitions (
    deezer_track_id INTEGER PRIMARY KEY REFERENCES tracks (deezer_track_id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
    reason          TEXT,
    attempts        INTEGER NOT NULL CHECK (attempts >= 1),
    file            TEXT,
    attempted_at    TEXT NOT NULL,
    CHECK ((status = 'ready') = (file IS NOT NULL)),
    CHECK ((status = 'failed') = (reason IS NOT NULL))
) STRICT;

-- Une ligne par étape d'une passe ; `invocation` = $INVOCATION_ID de systemd, ou NULL à la main.
CREATE TABLE stage_reports (
    report_id   INTEGER PRIMARY KEY,
    invocation  TEXT,
    stage       TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    ok          INTEGER NOT NULL CHECK (ok IN (0, 1)),
    counts      TEXT NOT NULL
) STRICT;
