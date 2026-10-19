"""CLI entry point: run, the snapshots, make-fixtures, load."""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from collections.abc import Callable, Iterator, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb

from musilogy import (
    REFERENCE_DISCOGRAPHY,
    REFERENCE_DISCOGS,
    REFERENCE_LISTENING,
    REFERENCE_OFFICIAL,
    REFERENCE_POPULARITY,
)
from musilogy import REFERENCE_DUMP as DUMP
from musilogy.build import (
    RAW_ARTIST_FIELDS,
    RAW_DISCOGS_FIELDS,
    RAW_RG_FIELDS,
    build,
    check_invariants,
    connect,
    ndjson,
)
from musilogy.colisten import cache_key
from musilogy.extract import (
    extract,
    extract_discogs,
    reduce_artist,
    reduce_listens,
    reduce_release_group,
)
from musilogy.fetch import (
    POPULARITY_BATCH,
    expected_sums,
    fetch_discography,
    fetch_discogs,
    fetch_dump,
    fetch_official,
    fetch_popularity,
    sha256_file,
    spark_digest,
    spark_listens,
    spark_name,
    verify,
)
from musilogy.load import load
from musilogy.paths import (
    DATA_DIR,
    FIXTURES_DIR,
    QUERIES_DIR,
    RAW_DIR,
    SQL_DIR,
    aside_of,
    colisten_cache,
    discography_snapshot,
    discography_sums,
    discogs_dump,
    discogs_extraction,
    discogs_releases,
    discogs_sums,
    dump_sums,
    extraction_sidecar,
    listening_snapshot,
    listening_sums,
    official_snapshot,
    official_sums,
    out_dir,
    popularity_snapshot,
    popularity_sums,
    work_dir,
    written_aside,
)
from musilogy.publish import (
    COUNTER_TABLES,
    MAX_DRIFT,
    TABLES,
    Trace,
    accepts,
    compare,
    compared,
    delivered,
    extraction_matches_rows_loaded,
    group_of,
    is_counter,
    previous_manifest,
    publish,
    read_extraction,
)
from musilogy.sample import publish_sample

SUMS_PATH = dump_sums(DUMP)
WORK_DIR = work_dir(DUMP)
ARTISTS_JSONL = WORK_DIR / "artists.jsonl"
RELEASE_GROUPS_JSONL = WORK_DIR / "release_groups.jsonl"
POPULARITY_JSONL = popularity_snapshot(REFERENCE_POPULARITY)
DISCOGRAPHY_JSONL = discography_snapshot(REFERENCE_DISCOGRAPHY)
DISCOGS_JSONL = discogs_releases(REFERENCE_DISCOGS)

WITNESSES = [
    "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d",  # The Beatles
    "9d953ee6-4ea6-4b0e-aea6-7268d380bef1",  # homonym
    "8d3431db-bc83-4dc2-93b8-0e46e31d09f7",  # homonym
    "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd",  # Joy Division
    "f1106b17-dcbb-45f6-b938-199ccfab50cc",  # New Order
    "a3cb23fc-acd3-4ce0-8f36-1e5aa6a18432",  # U2
    "8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11",  # Portishead
    "97c86b2c-2765-46a2-aef8-76a7e24c430f",  # XTC
    "e598d30e-4ce1-402e-94a7-6f44779da6b7",  # Orange Juice
    "6959c3d5-3e7f-41bb-aba3-50e38225d23d",  # homonym
    "a9424175-8b06-44ad-a1f4-319e92a50879",  # Disincarnate
    "125948ec-7f91-4d1a-8b83-accbf50fae3d",  # 3OH!3
    "d25be955-6fed-4303-bffb-8c440c191edb",  # Lethal Shöck
    "53fc0417-7585-490c-b2ea-5f9737e14c0f",  # Blackdeath
    "1434b0d0-d647-421e-b345-1b9847045a52",  # Cleef
    "6dfa03fb-8b02-4055-b7cc-e48f426b13f8",  # Unheilig
    "d770374d-05e9-4ed3-a068-3fbd4e6e4dd6",  # Wiener Philharmoniker
    "0ab49580-c84f-44d4-875f-d83760ea2cfe",  # Maroon 5
    "703c4c92-43f7-4268-9f85-0ca6f0cd1a22",  # Polska Radio One
    "f7338f2a-136b-4d5e-b099-5504cf997f58",  # Cardiacs
    "bd13909f-1c29-4c27-a874-d4aaf27c5b1a",  # Fleetwood Mac
    "3cb86073-22d7-43d5-8f22-422b1e54988e",  # ROD
    "212faddb-cd09-4fbc-9336-3ed7cadfba68",  # Flesh Field
    "8a1f012c-acc1-4dda-878f-43ac02f2366f",  # Demented Are Go!
    "62f7a211-0056-45fe-934a-37a388a7356f",  # The Belle Stars
    "35ddcb29-4c16-4af6-b6f8-32143ee24a6c",  # Handel and Haydn Society
    "d36b0fad-abd7-44e4-88fa-f638bbf8c9a6",  # Thunder Jolt
    "03c2e506-e8bb-4bd6-9693-5aa97c8eea1c",  # Inspiral Carpets
    "87c5dedd-371d-4a53-9f7f-80522fb7f3cb",  # Björk: a living solo artist
    "5441c29d-3602-4898-b1a1-b77fa23b8e50",  # David Bowie: albums released after his death
    "24f1766e-9635-4d58-a4d4-9413f9f98a4c",  # Johann Sebastian Bach: dead before min_year
    "6fa2e161-200e-475a-8492-3755594581f9",  # Bernard Sumner: member of two witness bands
    "f38ed14d-07db-4a4b-9270-53435358898a",  # Buzz Kull: played, no type
    "b614843c-bec3-421f-9af1-03169cdd4b63",  # Quasimoto: a character
    "da02dddc-60fa-4ca4-88bb-8012598f1f86",  # Two Steps From Hell: an "other"
]
# The witnesses whose Discogs releases the fixtures carry: the whole catalogue of
# the Beatles or of Bach would weigh tens of megabytes.
DISCOGS_WITNESSES = [
    "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd",  # Joy Division
    "f1106b17-dcbb-45f6-b938-199ccfab50cc",  # New Order
    "e598d30e-4ce1-402e-94a7-6f44779da6b7",  # Orange Juice
    "f7338f2a-136b-4d5e-b099-5504cf997f58",  # Cardiacs
    "f38ed14d-07db-4a4b-9270-53435358898a",  # Buzz Kull
]


# The fields the MusicBrainz extraction writes, as its sidecar records them.
MB_EXTRACTION_FIELDS = {
    "artist_fields": list(RAW_ARTIST_FIELDS),
    "release_group_fields": list(RAW_RG_FIELDS),
}


def _written_with(outputs: Sequence[Path], sidecar: Path, fields: dict[str, list[str]]) -> bool:
    """Every output exists and its sidecar records the fields the build reads.
    An extraction written with others is redone: a field it lacks would read
    as nulls, and one the build dropped, like MusicBrainz's genres, would stay
    in the files make-fixtures copies."""
    recorded = read_extraction(sidecar) or {}
    return all(p.exists() for p in outputs) and all(recorded.get(k) == v for k, v in fields.items())


def fetch_and_extract() -> None:
    """fetch → extract. Replayable: fetch_dump does not re-download an
    archive it has already verified, and extract rewrites its output on every
    call."""
    artist_archive = fetch_dump(DUMP, "artist.tar.xz", RAW_DIR, SUMS_PATH)
    rg_archive = fetch_dump(DUMP, "release-group.tar.xz", RAW_DIR, SUMS_PATH)
    artists_kept, artists_dropped = extract(artist_archive, reduce_artist, ARTISTS_JSONL)
    rgs_kept, rgs_dropped = extract(rg_archive, reduce_release_group, RELEASE_GROUPS_JSONL)
    extraction_sidecar(WORK_DIR).write_text(
        json.dumps(
            {
                "artists_kept": artists_kept,
                "artists_dropped": artists_dropped,
                "release_groups_kept": rgs_kept,
                "release_groups_dropped": rgs_dropped,
                **MB_EXTRACTION_FIELDS,
            },
            indent=1,
        ),
        encoding="utf-8",
    )


def snapshot_popularity() -> None:
    """Asks ListenBrainz about every artist of the extraction. The counts move
    every day, so a snapshot cannot be taken again: like the dump, it is
    fetched once, its digest committed under reference/, and a run reads the
    one REFERENCE_POPULARITY pins, never a fresh one."""
    if not ARTISTS_JSONL.exists():
        fetch_and_extract()

    def fetch(dest: Path) -> int:
        cur = connect().execute(
            "SELECT mbid FROM read_ndjson(?, columns={mbid:'VARCHAR'}) ORDER BY mbid",
            [ARTISTS_JSONL.as_posix()],
        )
        batches = iter(lambda: [r[0] for r in cur.fetchmany(POPULARITY_BATCH)], [])
        return fetch_popularity(batches, dest)

    _take_once(
        "ListenBrainz snapshot",
        _today(),
        popularity_snapshot,
        popularity_sums,
        fetch,
        "artists asked; pin it: REFERENCE_POPULARITY = {date!r}",
    )


def _part_date(snapshot: Callable[[str], Path]) -> str:
    """The day of the part a stopped run left partial, which the next run
    resumes, else today's: a new part."""
    aside = aside_of(snapshot("*"))
    partials = sorted(Path(aside.anchor).glob(aside.relative_to(aside.anchor).as_posix()))
    return partials[-1].parent.name if partials else _today()


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


def snapshot_official() -> None:
    """Asks MusicBrainz which album and EP release groups it shows for every
    artist queries/official_asked.sql selects. MusicBrainz moves every day: a
    part is taken once and pinned; a run stopped before the end resumes the
    part it left partial, whatever day it started."""
    if not RELEASE_GROUPS_JSONL.exists():
        fetch_and_extract()

    def fetch(dest: Path) -> int:
        cur = connect().execute(
            (QUERIES_DIR / "official_asked.sql").read_text(encoding="utf-8"),
            {
                "popularity": verified_popularity().as_posix(),
                "release_groups": RELEASE_GROUPS_JSONL.as_posix(),
                "asked": [part.as_posix() for part in verified_official()],
            },
        )
        return fetch_official((r[0] for r in iter(cur.fetchone, None)), dest)

    _take_once(
        "MusicBrainz official status",
        _part_date(official_snapshot),
        official_snapshot,
        official_sums,
        fetch,
        "artists asked; pin it: add {date!r} to REFERENCE_OFFICIAL",
    )


def _take_once(
    survey: str,
    date: str,
    snapshot: Callable[[str], Path],
    sums: Callable[[str], Path],
    fetch: Callable[[Path], int],
    pin: str,
) -> None:
    """Takes the snapshot of `date` of a source that moves every day, once,
    and writes its digest to pin it; `pin` says how, formatted with the date."""
    dest = snapshot(date)
    if dest.exists():
        raise SystemExit(f"{survey} {date} already taken at {dest}: it is never taken again")
    n = fetch(dest)
    sums(date).write_text(f"{sha256_file(dest)}  {dest.name}\n", encoding="utf-8")
    print(f"{n} {pin.format(date=date)}")


def _verified_one(path: Path, date: str, sums: Path, survey: str, command: str) -> Path:
    """A pinned snapshot, checked against its digest; it cannot be taken again."""
    if not path.exists():
        raise SystemExit(
            f"{survey} {date} missing at {path}; it cannot be taken again: "
            f"`musilogy {command}`, then pin the new one"
        )
    verify(path, expected_sums(sums)[path.name])
    return path


def snapshot_listens(ref: str) -> None:
    """Reduces the listens of a ListenBrainz Spark dump to one row per user and
    artist, streaming the archive (fetch.spark_listens), and pins the result
    with the archive's published digest: the archive is never kept, and
    ListenBrainz does not keep its dumps for ever."""
    dest = listening_snapshot(ref)
    if dest.exists():
        raise SystemExit(f"listens {ref} already reduced at {dest}")
    expected = spark_digest(ref)
    with written_aside(dest) as aside:
        shutil.rmtree(aside, ignore_errors=True)
        aside.mkdir()
        rows = reduce_listens(connect(), spark_listens(ref, expected, DATA_DIR / "tmp"), aside)
        # Pinned before the folder takes its name: a stop in between leaves a
        # partial folder to start again, never slices without their digests.
        lines = [f"{expected}  {spark_name(ref)}"]
        lines += [f"{sha256_file(p)}  {p.name}" for p in sorted(aside.glob("*.parquet"))]
        listening_sums(ref).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{rows} user-artist rows; pin it: REFERENCE_LISTENING = {ref!r}")


def verified_listening() -> Path:
    """The listens the co-listening is computed from, every file checked
    against its pinned digest; the archive's own digest is provenance only."""
    folder = listening_snapshot(REFERENCE_LISTENING)
    if not folder.exists():
        raise SystemExit(
            f"listens {REFERENCE_LISTENING} missing at {folder}: "
            f"`musilogy snapshot-listens {REFERENCE_LISTENING}`"
        )
    pinned = {
        name: digest
        for name, digest in expected_sums(listening_sums(REFERENCE_LISTENING)).items()
        if name.endswith(".parquet")
    }
    found = sorted(p.name for p in folder.glob("*.parquet"))
    if found != sorted(pinned):
        raise SystemExit(f"{folder} holds {found}, the pin names {sorted(pinned)}")
    for name, digest in pinned.items():
        verify(folder / name, digest)
    return folder


def snapshot_discography() -> None:
    """Asks Wikidata for the release groups it files as a studio album, an EP
    or a soundtrack. Taken once and pinned, like the ListenBrainz snapshots."""
    _take_once(
        "Wikidata discography",
        _today(),
        discography_snapshot,
        discography_sums,
        fetch_discography,
        "rows; pin it: REFERENCE_DISCOGRAPHY = {date!r}",
    )


def verified_discography() -> Path:
    return _verified_one(
        DISCOGRAPHY_JSONL,
        REFERENCE_DISCOGRAPHY,
        discography_sums(REFERENCE_DISCOGRAPHY),
        "Wikidata snapshot",
        "snapshot-discography",
    )


def verified_parts(
    dates: Sequence[str],
    snapshot: Callable[[str], Path],
    sums: Callable[[str], Path],
    survey: str,
    command: str,
) -> list[Path]:
    """The pinned parts of a long survey, each checked against its digest."""
    return [_verified_one(snapshot(date), date, sums(date), survey, command) for date in dates]


def verified_official() -> list[Path]:
    return verified_parts(
        REFERENCE_OFFICIAL,
        official_snapshot,
        official_sums,
        "MusicBrainz official status",
        "snapshot-official",
    )


def verified_popularity() -> Path:
    return _verified_one(
        POPULARITY_JSONL,
        REFERENCE_POPULARITY,
        popularity_sums(REFERENCE_POPULARITY),
        "ListenBrainz snapshot",
        "snapshot-popularity",
    )


def verified_extraction() -> None:
    """The MusicBrainz extraction, made again when missing or written with
    other fields than the build reads."""
    outputs = (ARTISTS_JSONL, RELEASE_GROUPS_JSONL)
    if not _written_with(outputs, extraction_sidecar(WORK_DIR), MB_EXTRACTION_FIELDS):
        fetch_and_extract()


def verified_discogs() -> Path:
    """The projection of the pinned Discogs dump, extracted from the verified
    archive (about two hours) when missing or written with other fields than
    the build reads: a field the projection lacks would read as nulls."""
    sidecar = discogs_extraction(REFERENCE_DISCOGS)
    if not _written_with((DISCOGS_JSONL,), sidecar, {"fields": list(RAW_DISCOGS_FIELDS)}):
        archive = fetch_discogs(
            REFERENCE_DISCOGS, discogs_dump(REFERENCE_DISCOGS), discogs_sums(REFERENCE_DISCOGS)
        )
        n = extract_discogs(archive, DISCOGS_JSONL)
        sidecar.write_text(
            json.dumps({"releases": n, "fields": list(RAW_DISCOGS_FIELDS)}, indent=1),
            encoding="utf-8",
        )
    return DISCOGS_JSONL


def _stop_on_discogs_mismatch(con: duckdb.DuckDBPyConnection) -> None:
    """Like _stop_on_extraction_mismatch, before publish(): the build read
    other releases than the projection's sidecar says it holds."""
    written = (read_extraction(discogs_extraction(REFERENCE_DISCOGS)) or {}).get("releases")
    (read,) = con.execute("SELECT releases FROM discogs_coverage").fetchone() or (None,)
    if written is not None and written != read:
        raise SystemExit(
            f"Discogs extraction mismatch: {written} releases written, {read} read, "
            "nothing published"
        )


def _stop_on_extraction_mismatch(con: duckdb.DuckDBPyConnection, extraction: Path) -> None:
    """Called before publish(), never after: a run that wrote its Parquet and
    only then failed would have replaced a sound delivery with a truncated
    one, and a consumer reading the tables without the manifest could not tell.
    Nothing is written here, so the previous publication survives a refusal.

    `is False`, never a truthiness test: None says the sidecar is absent,
    unreadable or missing a count, which is silence and not agreement — every
    extraction predating the sidecar reports exactly that. False says the build
    loaded something other than what the extraction wrote, so the tables are
    narrower than their source and nothing downstream can tell."""
    if extraction_matches_rows_loaded(con, extraction) is False:
        raise SystemExit(
            f"extraction mismatch: {extraction} disagrees with the rows loaded, nothing published"
        )


def _stop_on_drift(con: duckdb.DuckDBPyConnection, out: Path, accepted: Sequence[str]) -> Trace:
    """The data diff, before publish() like the other guards: publishing at
    `out` overwrites the manifest the comparison reads. Each table count or
    counter that moved past MAX_DRIFT since the previous delivery stops the
    run, unless `accepted` names it, or names its counter group: a rule meant
    to move one says so when it runs. Returns the comparison as the delivery
    records it: the drifts it let through, each under its own name, and the
    counters new and gone.

    A name `accepted` holds that this build does not count stops the run too —
    a typo, or a counter gone since, whose new name would otherwise go
    uncompared: main() only checks its table or counter group, since which
    counters exist is the SQL's to say."""
    got = delivered(con)
    previous = previous_manifest(out)
    path, expected = (previous[0], compared(previous[1])) if previous else (None, {})
    unknown = sorted(a for a in set(accepted) if not any(accepts((a,), n) for n in got))
    if unknown:
        raise SystemExit(
            f"--accept-drift names nothing this build counts, nothing published: "
            f"{', '.join(unknown)}"
        )
    if previous is None:
        print(f"no previous delivery beside {out}: publishing without comparison")
        return Trace([], {}, {})
    comparison = compare(expected, got)
    for name, n in comparison.new.items():
        print(f"new counter {name}: {n}, nothing to compare it with")
    for name, n in comparison.gone.items():
        print(f"counter gone {name}, was {n}")
    let_through = [d for d in comparison.drifts if accepts(accepted, d.name)]
    for d in let_through:
        print(f"drift accepted, {d}")
    moved = {d.name for d in comparison.drifts}
    groups_moved = {group_of(name) for name in moved}
    for name in sorted(set(accepted) - moved):
        if name in COUNTER_TABLES:
            if name not in groups_moved:
                print(f"drift accepted on {name}, but no counter of {name} moved")
        elif name in comparison.new:
            print(f"drift accepted on {name}, but {name} is new, nothing to accept")
        else:
            print(f"drift accepted on {name}, but {name} did not move")
    refused = [str(d) for d in comparison.drifts if d not in let_through]
    if refused:
        raise SystemExit(
            f"counts moved more than {MAX_DRIFT:.1%} from {path}, nothing published:\n"
            + "\n".join(refused)
            + "\na rule meant to move them: musilogy run --accept-drift NAME"
        )
    return Trace(let_through, comparison.new, comparison.gone)


def run(accepted_drift: Sequence[str] = ()) -> None:
    """Full execution: fetch → extract (when needed) → transform → validate →
    compare with the previous delivery → publish."""
    verified_extraction()

    popularity = verified_popularity()
    discography = verified_discography()
    official = verified_official()
    discogs = verified_discogs()
    listening = verified_listening()

    con = connect()
    build(
        con,
        SQL_DIR,
        ARTISTS_JSONL,
        RELEASE_GROUPS_JSONL,
        popularity=popularity,
        popularity_snapshot=REFERENCE_POPULARITY,
        discography=discography,
        discography_snapshot=REFERENCE_DISCOGRAPHY,
        official=official,
        official_snapshots=REFERENCE_OFFICIAL,
        discogs=discogs,
        discogs_dump=REFERENCE_DISCOGS,
        listening=listening,
        listening_snapshot=REFERENCE_LISTENING,
        colisten_cache=colisten_cache(REFERENCE_LISTENING, cache_key()),
    )

    violations = check_invariants(con, SQL_DIR)
    if violations:
        raise SystemExit(f"invariants violated: {violations}")

    extraction = extraction_sidecar(WORK_DIR)
    _stop_on_extraction_mismatch(con, extraction)
    _stop_on_discogs_mismatch(con)

    out = out_dir(DUMP)
    trace = _stop_on_drift(con, out, accepted_drift)
    manifest = publish(con, out, DUMP, extraction, trace)
    print(manifest["counts"])


def _filter_jsonl(
    src: Path, dst: Path, keep: Callable[[dict[str, Any]], bool]
) -> list[dict[str, Any]]:
    """Writes to `dst` the lines of `src` whose record `keep` accepts, byte for
    byte and in order, and returns those records."""
    kept = []
    with dst.open("w", encoding="utf-8") as fh, src.open(encoding="utf-8") as lines:
        for line in lines:
            rec = json.loads(line)
            if keep(rec):
                fh.write(line)
                kept.append(rec)
    return kept


def _lines_about(parts: Sequence[Path], artists: set[str]) -> Iterator[str]:
    """The lines of a survey's parts that ask about one of `artists`."""
    for part in parts:
        with part.open(encoding="utf-8") as src:
            yield from (line for line in src if json.loads(line)["artist_mbid"] in artists)


def _discogs_fixture(artists: Path, out: Path) -> None:
    """Every release of the Discogs witnesses, through the Discogs pages
    MusicBrainz relates to them, read by the build's own discogs_artist_id."""
    con = connect()
    con.execute((SQL_DIR / "00_macros.sql").read_text(encoding="utf-8"))
    discogs_ids = {
        i
        for (i,) in con.execute(
            f"SELECT DISTINCT discogs_artist_id(t.u.url) FROM {ndjson(RAW_ARTIST_FIELDS)} r, "
            "UNNEST(r.urls) t(u) WHERE t.u.type = 'discogs' AND list_contains(?, r.mbid)",
            [artists.as_posix(), DISCOGS_WITNESSES],
        ).fetchall()
        if i is not None
    }
    _filter_jsonl(verified_discogs(), out, lambda r: bool(discogs_ids & set(r["artists"])))


def fixtures_attribution() -> str:
    """The sources the fixtures are drawn from, named from the pinned
    references: written by make-fixtures, so it cannot fall behind a new pin."""
    return (
        "<!-- tests/fixtures/ATTRIBUTION.md, written by `musilogy make-fixtures` -->\n"
        f"Extraits du dump MusicBrainz `{DUMP}`, des relevés ListenBrainz (popularité du "
        f"{REFERENCE_POPULARITY}), des relevés "
        f"Wikidata (discographie du {REFERENCE_DISCOGRAPHY}), "
        f"du statut officiel MusicBrainz du {', '.join(REFERENCE_OFFICIAL)} et du dump des "
        f"sorties Discogs `{REFERENCE_DISCOGS}` (data.discogs.com).\n"
        "Données de base, relevés et Discogs : CC0.\n"
        "Ne pas éditer à la main : `uv run musilogy make-fixtures` le réécrit.\n"
    )


def make_fixtures() -> None:
    """Extracts the witness records from the full extractions, plus every
    artist a witness is linked to: a link only survives when both of its ends
    are artists, so without them the witnesses would carry none. The linked
    artists come without their release-groups, which keeps the fixtures small
    and leaves their dates unrepresentative — tests read their links only."""
    verified_extraction()
    out = FIXTURES_DIR
    out.mkdir(parents=True, exist_ok=True)
    wanted = set(WITNESSES)

    linked: set[str] = set()
    with ARTISTS_JSONL.open(encoding="utf-8") as src:
        for line in src:
            rec = json.loads(line)
            if rec["mbid"] in wanted:
                linked |= {r["mbid"] for r in rec["relations"] if r["mbid"]}

    selected = wanted | linked
    kept = {
        rec["mbid"]
        for rec in _filter_jsonl(
            ARTISTS_JSONL, out / "artists.jsonl", lambda r: r["mbid"] in selected
        )
    }
    fixture_rgs = {
        rec["mbid"]
        for rec in _filter_jsonl(
            RELEASE_GROUPS_JSONL,
            out / "release_groups.jsonl",
            lambda r: bool(wanted & set(r["artists"])),
        )
    }
    # Every fixture artist, as the snapshot asked about every artist: a
    # witness with no row would fail popularity_unrequested.
    _filter_jsonl(
        verified_popularity(), out / "popularity.jsonl", lambda r: r["artist_mbid"] in kept
    )
    # What Wikidata files about the fixture release groups.
    _filter_jsonl(
        verified_discography(), out / "discography.jsonl", lambda r: r["rg_mbid"] in fixture_rgs
    )
    # What MusicBrainz shows of the fixture artists it was asked about.
    with (out / "official.jsonl").open("w", encoding="utf-8") as fh:
        fh.writelines(_lines_about(verified_official(), kept))
    _discogs_fixture(ARTISTS_JSONL, out / "discogs.jsonl")

    (out / "ATTRIBUTION.md").write_text(fixtures_attribution(), encoding="utf-8")
    print("witnesses found:", len(wanted & kept), "linked artists:", len(kept - wanted))
    missing = wanted - kept
    print("missing:", missing or "none")


def load_site(sample: bool = False) -> None:
    """Loads the published delivery into the site's database, or, with
    `sample`, the pipeline run on the fixtures: a workstation's small Musilogy."""
    if not sample:
        print(load(out_dir(DUMP)))
        return
    with tempfile.TemporaryDirectory() as tmp:
        print(load(publish_sample(Path(tmp))))


def _drift_name(name: str) -> str:
    """What --accept-drift can name before the build runs: a table, a counter
    group, or a counter of one. Whether the counter exists, only the build
    knows (_stop_on_drift)."""
    if name in TABLES or name in COUNTER_TABLES or is_counter(name):
        return name
    raise argparse.ArgumentTypeError(
        f"{name!r} is no table ({', '.join(TABLES)}), "
        f"no counter group ({', '.join(COUNTER_TABLES)}) nor GROUP.COUNTER of one"
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="musilogy")
    subparsers = parser.add_subparsers(dest="command", required=True)
    # Each command carries its handler (set_defaults(handler=...), as the
    # argparse documentation does for sub-commands): naming a command and
    # running it cannot fall out of step.
    run_parser = subparsers.add_parser(
        "run", help="fetch → extract → transform → validate → compare → publish"
    )
    run_parser.add_argument(
        "--accept-drift",
        action="append",
        default=[],
        type=_drift_name,
        metavar="NAME",
        help="publish although NAME moved past the limit since the previous delivery: "
        "a table, a counter as GROUP.COUNTER (link_exclusions.not_on_page), "
        "or a counter group, for every counter of it that moved (link_exclusions)",
    )
    run_parser.set_defaults(handler=lambda args: run(args.accept_drift))
    subparsers.add_parser(
        "snapshot-popularity", help="take a dated ListenBrainz snapshot of every artist"
    ).set_defaults(handler=lambda _: snapshot_popularity())
    subparsers.add_parser(
        "snapshot-official",
        help="take a dated MusicBrainz snapshot of the release groups each popular artist shows",
    ).set_defaults(handler=lambda _: snapshot_official())
    subparsers.add_parser(
        "snapshot-discography",
        help="take a dated Wikidata snapshot of the release groups filed as main records",
    ).set_defaults(handler=lambda _: snapshot_discography())
    listens = subparsers.add_parser(
        "snapshot-listens",
        help="reduce a ListenBrainz Spark dump's listens to one row per user and artist",
    )
    listens.add_argument(
        "ref", help="the dump's number, date and sequence, e.g. 2692-20261001-000003"
    )
    listens.set_defaults(handler=lambda args: snapshot_listens(args.ref))
    subparsers.add_parser(
        "make-fixtures", help="extract witness records for the test fixtures"
    ).set_defaults(handler=lambda _: make_fixtures())
    load_parser = subparsers.add_parser(
        "load", help="load the published tables into the site's Postgres (libpq environment)"
    )
    load_parser.add_argument(
        "--sample", action="store_true", help="load the pipeline run on the test fixtures instead"
    )
    load_parser.set_defaults(handler=lambda args: load_site(args.sample))

    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
