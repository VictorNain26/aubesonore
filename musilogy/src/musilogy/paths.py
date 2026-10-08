"""Paths anchored on the package, never on the caller's cwd."""

from __future__ import annotations

from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
SQL_DIR = PACKAGE_DIR / "sql"
PG_DIR = PACKAGE_DIR / "pg"
REFERENCE_DIR = PACKAGE_DIR / "reference"
CORRECTIONS_CSV = PACKAGE_DIR / "corrections.csv"

REPO_ROOT = PACKAGE_DIR.parents[1]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures"


def work_dir(dump: str) -> Path:
    """An extraction carries the dump it came from. Without this level, a
    `musilogy run` launched after a REFERENCE_DUMP bump rebuilds on the previous
    extraction and publishes a manifest naming the new dump and its checksums —
    the output then asserts a source it never read."""
    return DATA_DIR / "work" / dump


def out_dir(dump: str) -> Path:
    return DATA_DIR / "out" / dump


def popularity_snapshot(date: str) -> Path:
    return RAW_DIR / "listenbrainz" / date / "artist-popularity.jsonl"


def popularity_sums(date: str) -> Path:
    return REFERENCE_DIR / f"listenbrainz-{date}.SHA256SUMS"


def proximity_snapshot(date: str) -> Path:
    return RAW_DIR / "listenbrainz" / date / "artist-similar.jsonl"


def proximity_sums(date: str) -> Path:
    return REFERENCE_DIR / f"listenbrainz-similar-{date}.SHA256SUMS"


def listening_export(ref: str) -> Path:
    return RAW_DIR / "listenbrainz" / f"statistics-{ref}" / "artists_all_time.jsonl"


def listening_sums(ref: str) -> Path:
    return REFERENCE_DIR / f"listenbrainz-statistics-{ref}.SHA256SUMS"


def official_snapshot(date: str) -> Path:
    return RAW_DIR / "musicbrainz" / date / "official-release-groups.jsonl"


def official_sums(date: str) -> Path:
    return REFERENCE_DIR / f"musicbrainz-official-{date}.SHA256SUMS"


def influences_snapshot(date: str) -> Path:
    return RAW_DIR / "wikidata" / date / "influences.jsonl"


def influences_sums(date: str) -> Path:
    return REFERENCE_DIR / f"wikidata-influences-{date}.SHA256SUMS"


def discography_snapshot(date: str) -> Path:
    return RAW_DIR / "wikidata" / date / "discography.jsonl"


def discography_sums(date: str) -> Path:
    return REFERENCE_DIR / f"wikidata-discography-{date}.SHA256SUMS"


def discogs_dump(date: str) -> Path:
    return RAW_DIR / "discogs" / date / f"discogs_{date}_releases.xml.gz"


def discogs_sums(date: str) -> Path:
    return REFERENCE_DIR / f"discogs-{date}.SHA256SUMS"


def discogs_releases(date: str) -> Path:
    """The projection of the dump, beside the MusicBrainz extractions and named
    after its own dump for the same reason as work_dir."""
    return work_dir(f"discogs-{date}") / "releases.jsonl"


def discogs_extraction(date: str) -> Path:
    """The sidecar of the projection: the releases it holds and the fields it
    wrote, so a build can tell a truncated or outdated projection."""
    return discogs_releases(date).with_name("extraction.json")
