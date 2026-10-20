"""The evaluation bench of the similar artists (docs/conception.md, « Mesure »).

The method of offline evaluation in information retrieval (TREC): references
drawn at random from the catalogue, by popularity stratum; the first neighbours
of every system pooled per reference, in an order that tells neither the system
nor the rank; every pair judged once, from cited sources, by two judges and a
third where they split; the systems then measured against the judged pool,
never counting an unjudged pair as a bad one (Buckley & Voorhees, SIGIR 2004).

The measures are ir_measures' (trec_eval underneath), the intervals scipy's
bootstrap over references, the agreement of the judges Krippendorff's alpha.

Last.fm's and Deezer's lists are read to be measured against, never published:
the bench's data stay in data/bench/, out of the repository."""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
from collections.abc import Mapping, Sequence
from functools import partial
from pathlib import Path
from typing import Any

import duckdb
import ir_measures
import krippendorff
import numpy as np
from ir_measures import Judged, Qrel, ScoredDoc, SetP, SetR
from scipy import stats

from musilogy.build import connect
from musilogy.fetch import get_json, sha256_file, with_retries
from musilogy.load import verified_manifest
from musilogy.paths import CONSIGNE, written_aside

# Listeners of the reference, both ends included; None leaves the top open.
STRATA: dict[str, tuple[int, int | None]] = {
    "tail": (3, 99),
    "torso": (100, 9_999),
    "head": (10_000, None),
}
# What the page shows, and what the pool takes from each system: deeper than
# the page, so that a variant moving a neighbour up finds it judged.
SHOWN = 8
DEPTH = 10
# From the lowest: in doubt between two verdicts, the judge takes the lower
# (docs/consigne-juges.md), and so does the vote.
LABELS = ("etranger", "lointain", "parente", "meme_son")
GOOD = {"parente", "meme_son"}
RELEVANCE = {"etranger": 0, "lointain": 0, "parente": 1, "meme_son": 2}
UNKNOWN = "inconnu"
# Known verdicts a pair needs before the vote settles it.
VOTES = 2
CONFIDENCE = 0.95
MEASURES = ("strict", "large", "recall", "foreign", "judged", "less_known")


def _blind(seed: str, value: str) -> int:
    return int(hashlib.sha256(f"{seed}:{value}".encode()).hexdigest(), 16)


def draw_references(
    con: duckdb.DuckDBPyConnection, per_stratum: int, seed: str
) -> list[dict[str, Any]]:
    """`per_stratum` artists of each stratum, drawn among those the
    co-listening knows, the same for one seed whatever DuckDB's version: the
    order is a digest of the seed and the MBID. An artist with a neighbour is
    one's neighbour too (listeners in common go both ways), so `artist_mbid`
    alone names them all."""
    case = " ".join(
        f"WHEN user_count <= {high} THEN '{name}'" for name, (_, high) in STRATA.items() if high
    )
    top = next(name for name, (_, high) in STRATA.items() if high is None)
    rows = con.execute(
        f"""
        SELECT CASE {case} ELSE '{top}' END AS stratum, mbid, user_count FROM popularity p
        WHERE user_count >= ? AND EXISTS (SELECT 1 FROM colisten c WHERE c.artist_mbid = p.mbid)
        QUALIFY row_number() OVER (PARTITION BY stratum ORDER BY sha256(? || ':' || mbid)) <= ?
        ORDER BY sha256(? || ':' || mbid)
        """,
        [min(low for low, _ in STRATA.values()), seed, per_stratum, seed],
    ).fetchall()
    return [
        {"mbid": m, "stratum": s, "listeners": n}
        for name in STRATA
        for s, m, n in rows
        if s == name
    ]


def pooled(
    runs: Mapping[str, Mapping[str, Sequence[str]]],
    depth: int,
    controls: Mapping[str, str],
    seed: str,
) -> dict[str, list[str]]:
    """Per reference, the first `depth` candidates of every system and its
    control, once each, in the order of a digest: the judge cannot tell which
    system found a candidate, nor at which rank."""
    pool: dict[str, set[str]] = {}
    for run in runs.values():
        for ref, candidates in run.items():
            pool.setdefault(ref, set()).update(candidates[:depth])
    for ref, control in controls.items():
        pool.setdefault(ref, set()).add(control)
    return {ref: sorted(c, key=lambda x: _blind(seed + ref, x)) for ref, c in pool.items()}


def problems(verdict: Mapping[str, Any], ref: str, expected: set[str]) -> list[str]:
    """Why a judge's file cannot be taken as it is; empty when it can. A
    verdict other than `inconnu` rests on at least one source the judge read."""
    found: list[str] = []
    if verdict.get("ref_mbid") != ref:
        found.append(f"reference {verdict.get('ref_mbid')!r} is not {ref}")
    given = {v.get("mbid") for v in verdict.get("verdicts", [])}
    found += [f"missing {m}" for m in sorted(expected - given)]
    found += [f"not in the pool: {m}" for m in sorted(str(m) for m in given - expected)]
    for v in verdict.get("verdicts", []):
        if v.get("son") not in (*LABELS, UNKNOWN):
            found.append(f"{v.get('mbid')}: son {v.get('son')!r}")
        elif v["son"] != UNKNOWN and not any(
            str(s).startswith(("https://", "http://")) for s in v.get("sources") or []
        ):
            found.append(f"{v.get('mbid')}: no source")
    return found


def final_labels(
    judges: Mapping[str, Mapping[str, Mapping[str, str]]],
) -> tuple[dict[str, dict[str, str]], list[tuple[str, str]]]:
    """The vote of the judges ({judge: {ref: {candidate: son}}}): the side, good
    or not, that most of the known verdicts take, then the lowest verdict on
    that side. `inconnu` takes no side; a pair with fewer than two known
    verdicts, or as many on each side, goes to another judge (`disputed`) —
    unless no judge could tell what it is."""
    votes: dict[tuple[str, str], list[str]] = {}
    for by_ref in judges.values():
        for ref, given in by_ref.items():
            for cand, son in given.items():
                votes.setdefault((ref, cand), []).append(son)
    labels: dict[str, dict[str, str]] = {ref: {} for by_ref in judges.values() for ref in by_ref}
    disputed: list[tuple[str, str]] = []
    for (ref, cand), sons in votes.items():
        known = [s for s in sons if s != UNKNOWN]
        good = [s for s in known if s in GOOD]
        bad = [s for s in known if s not in GOOD]
        if not known and len(sons) >= VOTES:
            continue
        if len(known) < VOTES or len(good) == len(bad):
            disputed.append((ref, cand))
            continue
        side = good if len(good) > len(bad) else bad
        labels[ref][cand] = min(side, key=LABELS.index)
    return labels, sorted(disputed)


def agreement(a: Mapping[str, Mapping[str, str]], b: Mapping[str, Mapping[str, str]]) -> float:
    """Krippendorff's alpha, ordinal, between two judges over the pairs both
    could tell."""
    pairs = [
        (LABELS.index(a[ref][c]), LABELS.index(b[ref][c]))
        for ref in a.keys() & b.keys()
        for c in a[ref].keys() & b[ref].keys()
        if a[ref][c] != UNKNOWN and b[ref][c] != UNKNOWN
    ]
    data = np.array(pairs, dtype=float).T
    return float(krippendorff.alpha(reliability_data=data, level_of_measurement="ordinal"))


def interval(values: Sequence[float], seed: int = 0) -> tuple[float, float, float]:
    """The mean and its 95 % interval, resampling the references."""
    if not values:
        return (math.nan, math.nan, math.nan)
    mean = float(np.mean(values))
    if len(set(values)) == 1:
        return (mean, mean, mean)
    ci = stats.bootstrap(
        (np.asarray(values),),
        np.mean,
        confidence_level=CONFIDENCE,
        n_resamples=10_000,
        method="percentile",
        rng=np.random.default_rng(seed),
    ).confidence_interval
    return (mean, float(ci.low), float(ci.high))


def _per_reference(
    measure: Any, qrels: list[Qrel], run: Mapping[str, Sequence[str]]
) -> dict[str, float]:
    """One measure for each reference the run shows something for: trec_eval
    also scores, at 0, those it shows nothing for."""
    docs = [
        ScoredDoc(ref, cand, float(SHOWN - rank))
        for ref, cands in run.items()
        for rank, cand in enumerate(cands[:SHOWN])
    ]
    return {
        m.query_id: float(m.value)
        for m in ir_measures.iter_calc([measure], qrels, docs)
        if run.get(m.query_id)
    }


def _strata(refs: Sequence[Mapping[str, Any]]) -> dict[str, list[str]]:
    """The references of each stratum, then all of them."""
    out: dict[str, list[str]] = {s: [] for s in STRATA}
    for r in refs:
        out[r["stratum"]].append(r["mbid"])
    return {**{s: m for s, m in out.items() if m}, "all": [r["mbid"] for r in refs]}


def differences(
    refs: Sequence[Mapping[str, Any]],
    a: Mapping[str, float],
    b: Mapping[str, float],
) -> dict[str, tuple[float, float, float]]:
    """System a minus system b on one measure, per stratum, over the references
    both are measured on: the mean difference and its interval."""
    return {
        stratum: interval([a[m] - b[m] for m in members if m in a and m in b])
        for stratum, members in _strata(refs).items()
    }


def report(
    refs: Sequence[Mapping[str, Any]],
    labels: Mapping[str, Mapping[str, str]],
    runs: Mapping[str, Mapping[str, Sequence[str]]],
    listeners: Mapping[str, int],
    controls: Mapping[str, str],
) -> dict[str, Any]:
    """Each system's first SHOWN neighbours against the judged pool, per stratum
    and for all (`systems`): precision strict (même son) and large (with
    parenté) over the judged pairs shown, recall of the pool's good pairs, the
    share of strangers, the share of shown pairs judged, the share of
    neighbours less known than their reference, coverage. Means over
    references with their intervals; `per` keeps each reference's value, for
    the paired differences. The controls are left out of the pool: they test
    the judges, not the systems."""
    judged_controls = [labels[r][c] for r, c in controls.items() if c in labels.get(r, {})]
    labels = {
        ref: {c: v for c, v in by.items() if controls.get(ref) != c} for ref, by in labels.items()
    }
    qrels = [Qrel(r, c, RELEVANCE[v]) for r, by in labels.items() for c, v in by.items()]
    foreign = [Qrel(r, c, int(v == "etranger")) for r, by in labels.items() for c, v in by.items()]
    has_good = {r for r, by in labels.items() if any(v in GOOD for v in by.values())}
    of_ref = {r["mbid"]: r["listeners"] for r in refs}
    strata = _strata(refs)
    out: dict[str, Any] = {"systems": {}, "per": {}}
    for system, run in runs.items():
        shown = {r: list(cs)[:SHOWN] for r, cs in run.items() if cs}
        recall = _per_reference(SetR(rel=1), qrels, shown)
        per = {
            "strict": _per_reference(SetP(rel=2, judged_only=True), qrels, shown),
            "large": _per_reference(SetP(rel=1, judged_only=True), qrels, shown),
            # Recall means something only where the pool holds a good pair; a
            # reference shown nothing found none of them.
            "recall": {r: recall.get(r, 0.0) for r in has_good},
            "foreign": _per_reference(SetP(rel=1, judged_only=True), foreign, shown),
            "judged": _per_reference(Judged @ SHOWN, qrels, shown),
            "less_known": {
                r: float(np.mean([listeners[c] < of_ref[r] for c in cs if c in listeners]))
                for r, cs in shown.items()
                if any(c in listeners for c in cs)
            },
        }
        out["per"][system] = per
        out["systems"][system] = {
            stratum: {
                **{
                    name: interval([per[name][m] for m in members if m in per[name]])
                    for name in MEASURES
                },
                "coverage": sum(1 for m in members if m in shown) / len(members),
                "references": len(members),
            }
            for stratum, members in strata.items()
        }
    out["controls_good"] = (
        sum(v in GOOD for v in judged_controls) / len(judged_controls)
        if judged_controls
        else math.nan
    )
    return out


# --- Reading the delivery and the services ----------------------------------

# Last.fm's and Deezer's answers are measured against, never published (module
# docstring); the requests name the bench, nothing else.
BENCH_UA = {"User-Agent": "musilogy-bench/0.1"}
LASTFM_URL = "https://ws.audioscrobbler.com/2.0/"
DEEZER_URL = "https://api.deezer.com/artist/{}/related"
# A Deezer artist's page, as MusicBrainz relates it (sql/82_urls.sql keeps it).
DEEZER_ARTIST = r"deezer\.com/(?:[a-z]{2}/)?artist/(\d+)"
# Last.fm asks for no more than five requests a second, averaged over five minutes.
SERVICE_INTERVAL = 0.5
# A control: an artist many sources describe, sharing no Discogs style with
# the reference, so that the judges know it and should judge it bad.
CONTROL_MIN_LISTENERS = 1_000
DELIVERY_TABLES = ("artists", "urls", "popularity", "colisten", "same_sound", "styles")


def open_delivery(folder: Path) -> duckdb.DuckDBPyConnection:
    """The bounded connection of the build (build.connect), on a published
    delivery's tables, checked against its manifest and read where they lie."""
    verified_manifest(folder, DELIVERY_TABLES)
    con = connect()
    for table in DELIVERY_TABLES:
        path = (folder / f"{table}.parquet").as_posix().replace("'", "''")
        con.execute(f"CREATE VIEW {table} AS SELECT * FROM read_parquet('{path}')")
    return con


def delivered_run(con: duckdb.DuckDBPyConnection, refs: Sequence[str]) -> dict[str, list[str]]:
    """« Même son » as the delivery holds it: each reference's first DEPTH."""
    rows = con.execute(
        "SELECT artist_mbid, neighbour_mbid FROM same_sound "
        "WHERE artist_mbid IN (SELECT unnest(?)) AND rank <= ? ORDER BY artist_mbid, rank",
        [list(refs), DEPTH],
    ).fetchall()
    run: dict[str, list[str]] = {r: [] for r in refs}
    for ref, neighbour in rows:
        run[ref].append(neighbour)
    return run


def draw_controls(con: duckdb.DuckDBPyConnection, refs: Sequence[str], seed: str) -> dict[str, str]:
    """One control per reference, drawn by digest among the artists of at least
    CONTROL_MIN_LISTENERS listeners and three style-records, none of whose
    styles the reference has."""
    rows = con.execute(
        """
        WITH profile AS (
          SELECT artist_mbid, list(DISTINCT style) AS styles, sum(records) AS n
          FROM styles GROUP BY 1
        ),
        pool AS (
          SELECT p.mbid, f.styles FROM popularity p JOIN profile f ON f.artist_mbid = p.mbid
          WHERE p.user_count >= ? AND f.n >= 3
        ),
        refs AS (
          SELECT r.ref, coalesce(f.styles, []) AS styles
          FROM (SELECT unnest(?) AS ref) r LEFT JOIN profile f ON f.artist_mbid = r.ref
        )
        SELECT r.ref, c.mbid FROM refs r, pool c
        WHERE c.mbid <> r.ref AND NOT list_has_any(r.styles, c.styles)
        QUALIFY row_number() OVER (PARTITION BY r.ref ORDER BY sha256(? || r.ref || c.mbid)) = 1
        """,
        [CONTROL_MIN_LISTENERS, list(refs), seed],
    ).fetchall()
    return dict(rows)


def _ask(url: str, params: dict[str, str]) -> Any:
    time.sleep(SERVICE_INTERVAL)
    return with_retries(partial(get_json, url, params, BENCH_UA), url.split("/")[2])[0]


def fetch_lastfm(refs: Sequence[Mapping[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    """Last.fm's similar artists of each reference, by MBID, else by name."""
    out = {}
    for ref in refs:
        for who in ({"mbid": ref["mbid"]}, {"artist": ref["name"]}):
            asked = {"method": "artist.getSimilar", "limit": str(DEPTH), "format": "json"}
            body = _ask(LASTFM_URL, {**asked, "api_key": key, **who})
            if "error" not in body:
                break
        artists = [] if "error" in body else body.get("similarartists", {}).get("artist", [])
        out[ref["mbid"]] = [
            {"name": a["name"], "mbid": a.get("mbid") or None, "url": a.get("url")}
            for a in artists[:DEPTH]
        ]
    return out


def fetch_deezer(
    con: duckdb.DuckDBPyConnection, refs: Sequence[Mapping[str, Any]]
) -> dict[str, list[dict[str, Any]] | None]:
    """Deezer's related artists of each reference MusicBrainz relates to one
    Deezer artist; None for the others."""
    ids = dict(
        con.execute(
            "SELECT artist_mbid, list(DISTINCT regexp_extract(url, ?, 1)) FROM urls "
            "WHERE artist_mbid IN (SELECT unnest(?)) AND regexp_matches(url, ?) GROUP BY 1",
            [DEEZER_ARTIST, [r["mbid"] for r in refs], DEEZER_ARTIST],
        ).fetchall()
    )
    out: dict[str, list[dict[str, Any]] | None] = {}
    for ref in refs:
        deezer = ids.get(ref["mbid"], [])
        if len(deezer) != 1:
            out[ref["mbid"]] = None
            continue
        body = _ask(DEEZER_URL.format(deezer[0]), {"limit": str(DEPTH)})
        out[ref["mbid"]] = [
            {"name": a["name"], "deezer_id": str(a["id"]), "url": a.get("link")}
            for a in body.get("data", [])[:DEPTH]
        ]
    return out


def resolved_runs(
    con: duckdb.DuckDBPyConnection,
    ours: Mapping[str, Sequence[str]],
    lastfm: Mapping[str, Sequence[Mapping[str, Any]]],
    deezer: Mapping[str, Sequence[Mapping[str, Any]] | None],
) -> tuple[dict[str, dict[str, list[str]]], dict[str, dict[str, Any]]]:
    """The services' answers as candidates of the pool: the MBID the answer
    gives when MusicBrainz knows it, or the one MBID MusicBrainz relates to its
    Deezer artist; else a candidate of ours whose `name_key` (sql/10_bands.sql)
    is the answer's, for this reference; else the answer itself (`lastfm:` or
    `deezer:`), judged from the service's page. Never a name matched across the
    catalogue."""
    answers = [a for by in (lastfm, deezer) for a_s in by.values() for a in a_s or []]
    known = {
        m
        for (m,) in con.execute(
            "SELECT mbid FROM artists WHERE mbid IN (SELECT unnest(?))",
            [[a["mbid"] for a in answers if a.get("mbid")]],
        ).fetchall()
    }
    by_deezer = dict(
        con.execute(
            "SELECT regexp_extract(url, ?, 1) AS id, list(DISTINCT artist_mbid) FROM urls "
            "WHERE regexp_matches(url, ?) AND id IN (SELECT unnest(?)) GROUP BY 1",
            [DEEZER_ARTIST, DEEZER_ARTIST, [a["deezer_id"] for a in answers if a.get("deezer_id")]],
        ).fetchall()
    )
    # The same key as the catalogue's, for the answers' names.
    key_of = dict(
        con.execute(
            "SELECT name, strip_accents(lower(name)) FROM (SELECT unnest(?) AS name)",
            [[a["name"] for a in answers]],
        ).fetchall()
    )
    ours_keys = dict(
        con.execute(
            "SELECT mbid, name_key FROM artists WHERE mbid IN (SELECT unnest(?))",
            [[m for run in ours.values() for m in run]],
        ).fetchall()
    )
    external: dict[str, dict[str, Any]] = {}
    runs: dict[str, dict[str, list[str]]] = {"ours": {r: list(c) for r, c in ours.items()}}
    services: tuple[tuple[str, Mapping[str, Sequence[Mapping[str, Any]] | None]], ...] = (
        ("lastfm", lastfm),
        ("deezer", deezer),
    )
    for system, answers_of in services:
        runs[system] = {}
        for ref, given in answers_of.items():
            if given is None:
                continue
            same_name = {ours_keys[m]: m for m in ours.get(ref, []) if m in ours_keys}
            run = []
            for a in given:
                mbids = by_deezer.get(a.get("deezer_id"), [])
                if a.get("mbid") in known:
                    cand = a["mbid"]
                elif len(mbids) == 1:
                    cand = mbids[0]
                elif key_of[a["name"]] in same_name:
                    cand = same_name[key_of[a["name"]]]
                else:
                    cand = f"{system}:{a.get('deezer_id') or a['name']}"
                    external[cand] = {"mbid": cand, "name": a["name"], "urls": [a.get("url")]}
                run.append(cand)
            runs[system][ref] = run
    return runs, external


def describe(con: duckdb.DuckDBPyConnection, mbids: Sequence[str]) -> dict[str, dict[str, Any]]:
    """What a judge starts from: who the artist is, and the pages MusicBrainz
    relates to it, its MusicBrainz page first."""
    rows = con.execute(
        """
        WITH asked AS (SELECT unnest(?) AS mbid)
        SELECT a.mbid, a.name, nullif(a.disambiguation, ''), a.type, a.y0, a.y_end, a.country,
          list(u.url ORDER BY u.url) FILTER (WHERE u.url IS NOT NULL)
        FROM artists a
        LEFT JOIN (SELECT * FROM urls WHERE artist_mbid IN (SELECT mbid FROM asked)) u
          ON u.artist_mbid = a.mbid
        WHERE a.mbid IN (SELECT mbid FROM asked) GROUP BY ALL
        """,
        [list(mbids)],
    ).fetchall()
    keys = ("mbid", "name", "disambiguation", "type", "y0", "y_end", "country", "urls")
    out = {r[0]: dict(zip(keys, r, strict=True)) for r in rows}
    for info in out.values():
        info["urls"] = [f"https://musicbrainz.org/artist/{info['mbid']}", *(info["urls"] or [])]
    return out


# --- The bench's files (data/bench/<version>/) -------------------------------
#
# references.json   the draw, with the delivery and the consigne it was made with
# answers.json      Last.fm's and Deezer's answers, fetched once
# runs/<system>.json  each system's candidates per reference, frozen
# external.json     the services' answers MusicBrainz does not identify
# controls.json     each reference's control
# targets/<round>/<ref>.json            what a judge is given
# verdicts/<round>/<judge>/<ref>.json   what a judge wrote
#
# A round's pairs go to judges a and b; the pairs they split on, to judge c in
# `<round>-third`; a share of its references, again to judge a in
# `<round>-again`, to measure how stable a judge is.

BENCH_VERSION = "v1"
PER_STRATUM = 50
SEED = "musilogy-bench-v1"
VOTERS = ("a", "b", "c")
# One reference in twenty is judged again.
AGAIN = 20


def _judges(round_: str) -> tuple[str, ...]:
    if round_.endswith("-third"):
        return ("c",)
    if round_.endswith("-again"):
        return ("a2",)
    return ("a", "b")


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, value: Any) -> None:
    with written_aside(path) as aside:
        aside.write_text(json.dumps(value, ensure_ascii=False, indent=1), encoding="utf-8")


def references(folder: Path) -> list[dict[str, Any]]:
    """The bench's references, refused if the consigne changed since the
    draw: verdicts given under two consignes do not mix, the bench takes a
    new version."""
    sample = _read(folder / "references.json")
    if sample["consigne"] != sha256_file(CONSIGNE):
        raise SystemExit(f"{CONSIGNE.name} changed since {folder.name} was drawn: a new version")
    refs: list[dict[str, Any]] = sample["references"]
    return refs


def take_sample(folder: Path, delivery: Path) -> int:
    """Draws the references, once per version."""
    dest = folder / "references.json"
    if dest.exists():
        raise SystemExit(f"{dest} exists: a bench's draw is never taken again")
    con = open_delivery(delivery)
    refs = draw_references(con, PER_STRATUM, SEED)
    names = describe(con, [r["mbid"] for r in refs])
    for r in refs:
        r["name"] = names[r["mbid"]]["name"]
    sample = {"seed": SEED, "delivery": delivery.name, "consigne": sha256_file(CONSIGNE)}
    _write(dest, {**sample, "references": refs})
    return len(refs)


def take_answers(folder: Path, delivery: Path, lastfm_key: str, day: str) -> None:
    """Asks Last.fm and Deezer once per version: their answers move, the
    bench measures the ones it froze."""
    dest = folder / "answers.json"
    if dest.exists():
        raise SystemExit(f"{dest} exists: the services' answers are taken once")
    refs = references(folder)
    con = open_delivery(delivery)
    _write(
        dest,
        {
            "fetched": day,
            "lastfm": fetch_lastfm(refs, lastfm_key),
            "deezer": fetch_deezer(con, refs),
        },
    )


def _runs(folder: Path) -> dict[str, dict[str, list[str]]]:
    return {p.stem: _read(p) for p in sorted((folder / "runs").glob("*.json"))}


def _targets(folder: Path) -> dict[Path, dict[str, Any]]:
    return {p: _read(p) for p in sorted((folder / "targets").glob("*/*.json"))}


def _rounds(targets: Mapping[Path, Mapping[str, Any]]) -> dict[tuple[str, str], str]:
    """The round that first gave each pair: the rounds a and b judge."""
    return {
        (t["ref"]["mbid"], c["mbid"]): p.parent.name
        for p, t in targets.items()
        if _judges(p.parent.name) == ("a", "b")
        for c in t["candidates"]
    }


def make_round(folder: Path, delivery: Path, name: str) -> int:
    """A round of judging: the pairs of the pool no round gave yet. The
    systems are the delivery's « même son », Last.fm and Deezer, frozen at the
    first round, then any run since added under runs/."""
    if not re.fullmatch(r"[a-z0-9]+", name) or (folder / "targets" / name).exists():
        raise SystemExit(f"round {name!r}: lower-case letters and digits, and new")
    mbids = [r["mbid"] for r in references(folder)]
    con = open_delivery(delivery)
    if not (folder / "runs").exists():
        answers = _read(folder / "answers.json")
        runs, external = resolved_runs(
            con, delivered_run(con, mbids), answers["lastfm"], answers["deezer"]
        )
        for system, run in runs.items():
            _write(folder / "runs" / f"{system}.json", run)
        _write(folder / "external.json", external)
        _write(folder / "controls.json", draw_controls(con, mbids, SEED))
    pool = pooled(_runs(folder), DEPTH, _read(folder / "controls.json"), SEED)
    done = _rounds(_targets(folder))
    new = {r: [c for c in pool.get(r, []) if (r, c) not in done] for r in mbids}
    new = {r: cs for r, cs in new.items() if cs}
    known = {
        **describe(con, [c for cs in new.values() for c in cs] + mbids),
        **_read(folder / "external.json"),
    }
    for ref, cands in new.items():
        target = {"ref": known[ref], "candidates": [known[c] for c in cands]}
        _write(folder / "targets" / name / f"{ref}.json", target)
        if _blind(SEED + name, ref) % AGAIN == 0:
            _write(folder / "targets" / f"{name}-again" / f"{ref}.json", target)
    return sum(len(cs) for cs in new.values())


def _votes(folder: Path) -> dict[str, dict[str, dict[str, str]]]:
    """{judge: {ref: {candidate: son}}} from every verdict written."""
    out: dict[str, dict[str, dict[str, str]]] = {}
    for path in sorted((folder / "verdicts").glob("*/*/*.json")):
        verdict = _read(path)
        by_ref = out.setdefault(path.parent.name, {}).setdefault(verdict["ref_mbid"], {})
        by_ref.update({v["mbid"]: v["son"] for v in verdict["verdicts"]})
    return out


def _labels(
    votes: Mapping[str, Mapping[str, Mapping[str, str]]],
) -> tuple[dict[str, dict[str, str]], list[tuple[str, str]]]:
    return final_labels({j: votes[j] for j in VOTERS if j in votes})


def check(folder: Path) -> list[str]:
    """What the judges still owe and what they wrote wrong; the pairs judges a
    and b split on go to judge c, in the third round of their round."""
    targets = _targets(folder)
    found: list[str] = []
    for path, target in targets.items():
        round_, ref = path.parent.name, target["ref"]["mbid"]
        expected = {c["mbid"] for c in target["candidates"]}
        for judge in _judges(round_):
            verdict = folder / "verdicts" / round_ / judge / path.name
            if not verdict.exists():
                found.append(f"{round_}/{judge}/{ref}: missing")
                continue
            found += [
                f"{round_}/{judge}/{ref}: {p}" for p in problems(_read(verdict), ref, expected)
            ]
    if found:
        return found
    votes = _votes(folder)
    _, disputed = _labels(votes)
    rounds = _rounds(targets)
    third: dict[tuple[str, str], list[str]] = {}
    for ref, cand in disputed:
        if cand not in votes.get("c", {}).get(ref, {}):
            third.setdefault((rounds[ref, cand], ref), []).append(cand)
    for (round_, ref), cands in third.items():
        target = targets[folder / "targets" / round_ / f"{ref}.json"]
        given = {**target, "candidates": [c for c in target["candidates"] if c["mbid"] in cands]}
        _write(folder / "targets" / f"{round_}-third" / f"{ref}.json", given)
        found.append(f"{round_}-third/c/{ref}: missing")
    return found


def write_report(folder: Path, delivery: Path) -> dict[str, Any]:
    """The report of every run under runs/ against the judged pool, beside the
    judges' agreement, their stability and the controls."""
    refs = references(folder)
    votes = _votes(folder)
    labels, disputed = _labels(votes)
    runs = _runs(folder)
    con = open_delivery(delivery)
    listeners = dict(
        con.execute(
            "SELECT mbid, user_count FROM popularity WHERE mbid IN (SELECT unnest(?))",
            [list({c for run in runs.values() for cs in run.values() for c in cs})],
        ).fetchall()
    )
    out = report(refs, labels, runs, listeners, _read(folder / "controls.json"))
    out["agreement"] = agreement(votes["a"], votes["b"])
    out["stability"] = agreement(votes["a"], votes["a2"]) if "a2" in votes else math.nan
    out["disputed"] = len(disputed)
    per = out["per"]
    out["differences"] = {
        system: {name: differences(refs, per[system][name], per["ours"][name]) for name in MEASURES}
        for system in runs
        if system != "ours"
    }
    _write(folder / "report.json", out)
    return out
