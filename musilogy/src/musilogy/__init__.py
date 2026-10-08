"""Musilogy's data, built offline from a pinned MusicBrainz dump, the Discogs
releases dump and dated ListenBrainz, MusicBrainz and Wikidata surveys."""

REFERENCE_DUMP = "20260909-001002"
# A ListenBrainz snapshot is never taken again: its date pins the one a run reads.
REFERENCE_POPULARITY = "2026-10-06"
REFERENCE_INFLUENCES = "2026-10-04"
REFERENCE_DISCOGRAPHY = "2026-10-05"
# The monthly Discogs data dump whose releases give the labels and the styles.
REFERENCE_DISCOGS = "20261001"
# The parts of each long survey, oldest first: each asks only the artists no
# earlier part asked (cli.snapshot_proximity, cli.snapshot_official).
REFERENCE_PROXIMITY = ("2026-10-04", "2026-10-06")
REFERENCE_OFFICIAL = ("2026-10-05", "2026-10-06")
# The ListenBrainz statistics export whose users' top artists give our
# co-listening (colisten.py): dump number, date and sequence of its folder.
REFERENCE_LISTENING = "2692-20261001-000003"
