CREATE TABLE library_tracks (
    plex_key    TEXT PRIMARY KEY,
    artist      TEXT NOT NULL,
    title       TEXT NOT NULL,
    album       TEXT NOT NULL,
    duration_ms INTEGER,
    plays       INTEGER NOT NULL CHECK (plays >= 0),
    synced_at   TEXT NOT NULL
) STRICT;

CREATE TABLE deezer_matches (
    plex_key         TEXT PRIMARY KEY REFERENCES library_tracks (plex_key) ON DELETE CASCADE,
    status           TEXT NOT NULL CHECK (status IN ('matched', 'unmatched')),
    reason           TEXT CHECK (reason IN ('no_duration', 'no_result', 'no_exact_match')),
    deezer_track_id  INTEGER,
    deezer_artist_id INTEGER,
    matched_at       TEXT NOT NULL,
    CHECK ((status = 'matched') = (deezer_track_id IS NOT NULL
                                   AND deezer_artist_id IS NOT NULL
                                   AND reason IS NULL)),
    CHECK ((status = 'unmatched') = (reason IS NOT NULL))
) STRICT;
