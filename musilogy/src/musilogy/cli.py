"""CLI entry point: run, the snapshots, make-fixtures, load."""

from __future__ import annotations

import argparse
import itertools
import json
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from musilogy import (
    REFERENCE_DISCOGRAPHY,
    REFERENCE_INFLUENCES,
    REFERENCE_POPULARITY,
    REFERENCE_PROXIMITY,
)
from musilogy import REFERENCE_DUMP as DUMP
from musilogy.build import build, check_invariants, connect
from musilogy.extract import extract, reduce_artist, reduce_release_group
from musilogy.fetch import (
    POPULARITY_BATCH,
    expected_sums,
    fetch_discography,
    fetch_dump,
    fetch_influences,
    fetch_official,
    fetch_popularity,
    fetch_proximity,
    sha256_file,
    verify,
)
from musilogy.load import load
from musilogy.paths import (
    CORRECTIONS_CSV,
    FIXTURES_DIR,
    RAW_DIR,
    REFERENCE_DIR,
    SQL_DIR,
    discography_snapshot,
    discography_sums,
    influences_snapshot,
    influences_sums,
    official_snapshot,
    official_sums,
    out_dir,
    popularity_snapshot,
    popularity_sums,
    proximity_snapshot,
    proximity_sums,
    work_dir,
)
from musilogy.publish import extraction_matches_rows_loaded, publish

SUMS_PATH = REFERENCE_DIR / f"{DUMP}.SHA256SUMS"
WORK_DIR = work_dir(DUMP)
ARTISTS_JSONL = WORK_DIR / "artists.jsonl"
RELEASE_GROUPS_JSONL = WORK_DIR / "release_groups.jsonl"
POPULARITY_JSONL = popularity_snapshot(REFERENCE_POPULARITY)
INFLUENCES_JSONL = influences_snapshot(REFERENCE_INFLUENCES)
DISCOGRAPHY_JSONL = discography_snapshot(REFERENCE_DISCOGRAPHY)

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
    "7b7f9365-45fc-43b0-a8c3-83f7451ddbd5",  # $.99 Dreams: its genres come from its albums
    "87c5dedd-371d-4a53-9f7f-80522fb7f3cb",  # Björk: a living solo artist
    "5441c29d-3602-4898-b1a1-b77fa23b8e50",  # David Bowie: albums released after his death
    "24f1766e-9635-4d58-a4d4-9413f9f98a4c",  # Johann Sebastian Bach: dead before min_year
    "6fa2e161-200e-475a-8492-3755594581f9",  # Bernard Sumner: member of two witness bands
    "f38ed14d-07db-4a4b-9270-53435358898a",  # Buzz Kull: played, no type
    "b614843c-bec3-421f-9af1-03169cdd4b63",  # Quasimoto: a character
    "da02dddc-60fa-4ca4-88bb-8012598f1f86",  # Two Steps From Hell: an "other"
]


def fetch_and_extract() -> None:
    """fetch → extract. Replayable: fetch_dump does not re-download an
    archive it has already verified, and extract rewrites its output on every
    call."""
    artist_archive = fetch_dump(DUMP, "artist.tar.xz", RAW_DIR, SUMS_PATH)
    rg_archive = fetch_dump(DUMP, "release-group.tar.xz", RAW_DIR, SUMS_PATH)
    artists_kept, artists_dropped = extract(artist_archive, reduce_artist, ARTISTS_JSONL)
    rgs_kept, rgs_dropped = extract(rg_archive, reduce_release_group, RELEASE_GROUPS_JSONL)
    (WORK_DIR / "extraction.json").write_text(
        json.dumps(
            {
                "artists_kept": artists_kept,
                "artists_dropped": artists_dropped,
                "release_groups_kept": rgs_kept,
                "release_groups_dropped": rgs_dropped,
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
    date = datetime.now(UTC).date().isoformat()
    dest = popularity_snapshot(date)
    if dest.exists():
        raise SystemExit(
            f"ListenBrainz snapshot {date} already taken at {dest}: it is never taken again"
        )
    cur = connect().execute(
        f"SELECT mbid FROM read_ndjson('{ARTISTS_JSONL.as_posix()}', columns={{mbid:'VARCHAR'}}) "
        "ORDER BY mbid"
    )
    batches = iter(lambda: [r[0] for r in cur.fetchmany(POPULARITY_BATCH)], [])
    n = fetch_popularity(batches, dest)
    popularity_sums(date).write_text(f"{sha256_file(dest)}  {dest.name}\n", encoding="utf-8")
    print(f"{n} artists asked; pin it: REFERENCE_POPULARITY = {date!r}")


# The artists ListenBrainz relates to others: those with at least this many
# listeners in the pinned popularity snapshot. 111 402 artists, and 228 of the
# 235 played artists with an MBID (2026-10-04); the 7 others have 132 listeners
# or more. At most one request a second, but about 0.6 artist a second
# measured with the service's outages (2026-10-04): several days.
PROXIMITY_MIN_USERS = 500
PROXIMITY_FIXTURE_LINES = 120


def snapshot_proximity() -> None:
    """Asks ListenBrainz for the neighbours of every artist with at least
    PROXIMITY_MIN_USERS listeners in the pinned popularity that no pinned part
    of the survey asked yet: about one artist a second, so a survey is never
    taken again whole, it grows by parts. A part is taken once and pinned; a
    run stopped before the end resumes the part it left partial, whatever day
    it started."""
    partials = sorted(RAW_DIR.glob("listenbrainz/*/artist-similar.jsonl.partial"))
    date = partials[-1].parent.name if partials else datetime.now(UTC).date().isoformat()
    dest = proximity_snapshot(date)
    if dest.exists():
        raise SystemExit(
            f"ListenBrainz proximity {date} already taken at {dest}: it is never taken again"
        )
    asked = [part.as_posix() for part in verified_proximity()]
    cur = connect().execute(
        f"SELECT artist_mbid FROM read_ndjson('{verified_popularity().as_posix()}', "
        "columns={artist_mbid:'VARCHAR', total_user_count:'BIGINT'}) "
        f"WHERE total_user_count >= {PROXIMITY_MIN_USERS} AND artist_mbid NOT IN ("
        f"SELECT artist_mbid FROM read_ndjson({asked}, columns={{artist_mbid:'VARCHAR'}})) "
        "ORDER BY artist_mbid"
    )
    n = fetch_proximity((r[0] for r in iter(cur.fetchone, None)), dest)
    proximity_sums(date).write_text(f"{sha256_file(dest)}  {dest.name}\n", encoding="utf-8")
    print(f"{n} artists asked; pin it: add {date!r} to REFERENCE_PROXIMITY")


# The artists whose records a page filters by MusicBrainz's official status:
# those with at least this many listeners and at least one album or EP in the
# extraction, 97 628 artists for about 100 000 requests (2026-10-05). Below
# it, bootlegs are rare: the 31 played artists under 500 listeners show 112
# records, one of them a promotional EP (Cignol, The Cosmic Garden EP).
OFFICIAL_MIN_USERS = 500


def snapshot_official() -> None:
    """Asks MusicBrainz which album and EP release groups it shows for every
    artist with at least OFFICIAL_MIN_USERS listeners. MusicBrainz moves every
    day: taken once and pinned, and resumed like the proximity."""
    if not RELEASE_GROUPS_JSONL.exists():
        fetch_and_extract()
    partials = sorted(RAW_DIR.glob("musicbrainz/*/official-release-groups.jsonl.partial"))
    date = partials[-1].parent.name if partials else datetime.now(UTC).date().isoformat()
    dest = official_snapshot(date)
    if dest.exists():
        raise SystemExit(
            f"MusicBrainz official status {date} already taken at {dest}: it is never taken again"
        )
    cur = connect().execute(
        f"SELECT p.artist_mbid FROM read_ndjson('{verified_popularity().as_posix()}', "
        "columns={artist_mbid:'VARCHAR', total_user_count:'BIGINT'}) p "
        f"WHERE p.total_user_count >= {OFFICIAL_MIN_USERS} AND p.artist_mbid IN ("
        f"SELECT UNNEST(artists) FROM read_ndjson('{RELEASE_GROUPS_JSONL.as_posix()}', "
        "columns={artists:'VARCHAR[]'})) ORDER BY p.artist_mbid"
    )
    n = fetch_official((r[0] for r in iter(cur.fetchone, None)), dest)
    official_sums(date).write_text(f"{sha256_file(dest)}  {dest.name}\n", encoding="utf-8")
    print(f"{n} artists asked; pin it: REFERENCE_OFFICIAL = {date!r}")


def snapshot_influences() -> None:
    """Asks Wikidata for the declared influences between MusicBrainz artists.
    Wikidata moves every day, so the snapshot is taken once and pinned, like
    the ListenBrainz ones."""
    date = datetime.now(UTC).date().isoformat()
    dest = influences_snapshot(date)
    if dest.exists():
        raise SystemExit(
            f"Wikidata influences {date} already taken at {dest}: it is never taken again"
        )
    n = fetch_influences(dest)
    influences_sums(date).write_text(f"{sha256_file(dest)}  {dest.name}\n", encoding="utf-8")
    print(f"{n} rows; pin it: REFERENCE_INFLUENCES = {date!r}")


def verified_influences() -> Path:
    if not INFLUENCES_JSONL.exists():
        raise SystemExit(
            f"Wikidata snapshot {REFERENCE_INFLUENCES} missing at {INFLUENCES_JSONL}; "
            "it cannot be taken again: `musilogy snapshot-influences`, then pin the new one"
        )
    sums = expected_sums(influences_sums(REFERENCE_INFLUENCES))
    verify(INFLUENCES_JSONL, sums[INFLUENCES_JSONL.name])
    return INFLUENCES_JSONL


def snapshot_discography() -> None:
    """Asks Wikidata for the release groups it files as a studio album, an EP
    or a soundtrack. Taken once and pinned, like the influences."""
    date = datetime.now(UTC).date().isoformat()
    dest = discography_snapshot(date)
    if dest.exists():
        raise SystemExit(
            f"Wikidata discography {date} already taken at {dest}: it is never taken again"
        )
    n = fetch_discography(dest)
    discography_sums(date).write_text(f"{sha256_file(dest)}  {dest.name}\n", encoding="utf-8")
    print(f"{n} rows; pin it: REFERENCE_DISCOGRAPHY = {date!r}")


def verified_discography() -> Path:
    if not DISCOGRAPHY_JSONL.exists():
        raise SystemExit(
            f"Wikidata snapshot {REFERENCE_DISCOGRAPHY} missing at {DISCOGRAPHY_JSONL}; "
            "it cannot be taken again: `musilogy snapshot-discography`, then pin the new one"
        )
    sums = expected_sums(discography_sums(REFERENCE_DISCOGRAPHY))
    verify(DISCOGRAPHY_JSONL, sums[DISCOGRAPHY_JSONL.name])
    return DISCOGRAPHY_JSONL


def verified_proximity() -> list[Path]:
    parts = []
    for date in REFERENCE_PROXIMITY:
        part = proximity_snapshot(date)
        if not part.exists():
            raise SystemExit(
                f"ListenBrainz proximity {date} missing at {part}; it cannot be taken "
                "again: `musilogy snapshot-proximity`, then pin the new part"
            )
        verify(part, expected_sums(proximity_sums(date))[part.name])
        parts.append(part)
    return parts


def verified_popularity() -> Path:
    if not POPULARITY_JSONL.exists():
        raise SystemExit(
            f"ListenBrainz snapshot {REFERENCE_POPULARITY} missing at {POPULARITY_JSONL}; "
            "it cannot be taken again: `musilogy snapshot-popularity`, then pin the new one"
        )
    sums = expected_sums(popularity_sums(REFERENCE_POPULARITY))
    verify(POPULARITY_JSONL, sums[POPULARITY_JSONL.name])
    return POPULARITY_JSONL


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


def run() -> None:
    """Full execution: fetch → extract (when needed) → transform → validate → publish."""
    if not ARTISTS_JSONL.exists() or not RELEASE_GROUPS_JSONL.exists():
        fetch_and_extract()

    popularity = verified_popularity()
    influences = verified_influences()
    discography = verified_discography()
    proximity = verified_proximity()

    con = connect()
    build(
        con,
        SQL_DIR,
        ARTISTS_JSONL,
        RELEASE_GROUPS_JSONL,
        CORRECTIONS_CSV,
        popularity=popularity,
        popularity_snapshot=REFERENCE_POPULARITY,
        influences=influences,
        influences_snapshot=REFERENCE_INFLUENCES,
        discography=discography,
        discography_snapshot=REFERENCE_DISCOGRAPHY,
        proximity=proximity,
        proximity_snapshots=REFERENCE_PROXIMITY,
    )

    violations = check_invariants(con, SQL_DIR)
    if violations:
        raise SystemExit(f"invariants violated: {violations}")

    extraction = WORK_DIR / "extraction.json"
    _stop_on_extraction_mismatch(con, extraction)

    manifest = publish(con, out_dir(DUMP), DUMP, CORRECTIONS_CSV, extraction)
    print(manifest["counts"])


def make_fixtures() -> None:
    """Extracts the witness records from the full extractions, plus every
    artist a witness is linked to: a link only survives when both of its ends
    are artists, so without them the witnesses would carry none. The linked
    artists come without their release-groups, which keeps the fixtures small
    and leaves their dates unrepresentative — tests read their links only."""
    work = WORK_DIR
    out = FIXTURES_DIR
    out.mkdir(parents=True, exist_ok=True)
    wanted = set(WITNESSES)

    linked: set[str] = set()
    with (work / "artists.jsonl").open(encoding="utf-8") as src:
        for line in src:
            rec = json.loads(line)
            if rec["mbid"] in wanted:
                linked |= {r["mbid"] for r in rec["relations"] if r["mbid"]}

    kept = []
    with (
        (out / "artists.jsonl").open("w", encoding="utf-8") as fh,
        (work / "artists.jsonl").open(encoding="utf-8") as src,
    ):
        for line in src:
            rec = json.loads(line)
            if rec["mbid"] in wanted or rec["mbid"] in linked:
                fh.write(line)
                kept.append(rec["mbid"])

    fixture_rgs: set[str] = set()
    with (
        (out / "release_groups.jsonl").open("w", encoding="utf-8") as fh,
        (work / "release_groups.jsonl").open(encoding="utf-8") as src,
    ):
        for line in src:
            rec = json.loads(line)
            if wanted & set(rec["artists"]):
                fh.write(line)
                fixture_rgs.add(rec["mbid"])

    # Every fixture artist, as the snapshot asked about every artist: a
    # witness with no row would fail popularity_unrequested.
    kept_set = set(kept)
    with (
        (out / "popularity.jsonl").open("w", encoding="utf-8") as fh,
        verified_popularity().open(encoding="utf-8") as src,
    ):
        for line in src:
            if json.loads(line)["artist_mbid"] in kept_set:
                fh.write(line)

    # The declarations that touch a fixture artist, from either side: the
    # witnesses' influences, and who cites them.
    with (
        (out / "influences.jsonl").open("w", encoding="utf-8") as fh,
        verified_influences().open(encoding="utf-8") as src,
    ):
        for line in src:
            row = json.loads(line)
            if row["artist_mbid"] in kept_set or row["influence_mbid"] in kept_set:
                fh.write(line)

    # What Wikidata files about the fixture release groups.
    with (
        (out / "discography.jsonl").open("w", encoding="utf-8") as fh,
        verified_discography().open(encoding="utf-8") as src,
    ):
        for line in src:
            if json.loads(line)["rg_mbid"] in fixture_rgs:
                fh.write(line)
    # The first lines of the survey's first part, whoever they ask about: few of
    # them are witnesses (artists are asked in mbid order), but they hold every
    # shape the rule reads — 100 neighbours, none at all, a repeated one (line
    # 119). A prefix, so the partial snapshot already held these very bytes.
    with (
        (out / "proximity.jsonl").open("w", encoding="utf-8") as fh,
        verified_proximity()[0].open(encoding="utf-8") as src,
    ):
        fh.writelines(itertools.islice(src, PROXIMITY_FIXTURE_LINES))

    print("witnesses found:", len(wanted & set(kept)), "linked artists:", len(set(kept) - wanted))
    missing = wanted - set(kept)
    print("missing:", missing or "none")


def load_site() -> None:
    """Loads the published delivery into the site's database."""
    print(load(out_dir(DUMP)))


def main() -> None:
    parser = argparse.ArgumentParser(prog="musilogy")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("run", help="fetch → extract → transform → validate → publish")
    subparsers.add_parser(
        "snapshot-popularity", help="take a dated ListenBrainz snapshot of every artist"
    )
    subparsers.add_parser(
        "snapshot-proximity",
        help="take a dated ListenBrainz snapshot of each popular artist's neighbours",
    )
    subparsers.add_parser(
        "snapshot-official",
        help="take a dated MusicBrainz snapshot of the release groups each popular artist shows",
    )
    subparsers.add_parser(
        "snapshot-influences",
        help="take a dated Wikidata snapshot of the influences between MusicBrainz artists",
    )
    subparsers.add_parser(
        "snapshot-discography",
        help="take a dated Wikidata snapshot of the release groups filed as main records",
    )
    subparsers.add_parser("make-fixtures", help="extract witness records for the test fixtures")
    subparsers.add_parser(
        "load", help="load the published tables into the site's Postgres (libpq environment)"
    )

    args = parser.parse_args()
    if args.command == "run":
        run()
    elif args.command == "snapshot-popularity":
        snapshot_popularity()
    elif args.command == "snapshot-proximity":
        snapshot_proximity()
    elif args.command == "snapshot-official":
        snapshot_official()
    elif args.command == "snapshot-influences":
        snapshot_influences()
    elif args.command == "snapshot-discography":
        snapshot_discography()
    elif args.command == "make-fixtures":
        make_fixtures()
    elif args.command == "load":
        load_site()


if __name__ == "__main__":
    main()
