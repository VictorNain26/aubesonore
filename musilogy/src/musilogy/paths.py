"""Paths anchored on the package, never on the caller's cwd."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
SQL_DIR = PACKAGE_DIR / "sql"
QUERIES_DIR = PACKAGE_DIR / "queries"
PG_DIR = PACKAGE_DIR / "pg"
REFERENCE_DIR = PACKAGE_DIR / "reference"

REPO_ROOT = PACKAGE_DIR.parents[1]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures"


def aside_of(dest: Path) -> Path:
    """Where `dest` is written until whole."""
    return dest.with_name(dest.name + ".partial")


@contextmanager
def written_aside(dest: Path) -> Iterator[Path]:
    """Yields the path to write `dest` at, renamed to `dest` once the block
    ends without an error: a write cut short leaves only its `.partial`, never
    a `dest` the next run would take for a whole one."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    aside = aside_of(dest)
    yield aside
    aside.replace(dest)


def dump_sums(dump: str) -> Path:
    """The published digests of a MusicBrainz dump's archives."""
    return REFERENCE_DIR / f"{dump}.SHA256SUMS"


def extraction_sidecar(work: Path) -> Path:
    """What an extraction wrote, beside it: a build reads it to tell a
    truncated or outdated extraction from a sound one."""
    return work / "extraction.json"


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


def listening_snapshot(ref: str) -> Path:
    return RAW_DIR / "listenbrainz" / f"listens-{ref}"


def listening_sums(ref: str) -> Path:
    return REFERENCE_DIR / f"listenbrainz-listens-{ref}.SHA256SUMS"


def colisten_cache(ref: str, key: str) -> Path:
    """Our co-listening, kept once computed: about ten hours over every listen,
    for a result that depends only on the listens and the rule's parameters,
    both named here (colisten.cache_key)."""
    return work_dir(f"colisten-{ref}") / f"colisten-{key}.parquet"


def official_snapshot(date: str) -> Path:
    return RAW_DIR / "musicbrainz" / date / "official-release-groups.jsonl"


def official_sums(date: str) -> Path:
    return REFERENCE_DIR / f"musicbrainz-official-{date}.SHA256SUMS"


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
    return extraction_sidecar(discogs_releases(date).parent)
