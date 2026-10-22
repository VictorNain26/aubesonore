"""« Même son » (docs/conception.md §2, `same_sound`): for each artist Discogs
gives a colour, the K artists whose colour is closest, among every artist with
one, whoever listens to them.

The colour of an artist: the share of its Discogs style-records in each style,
whatever their decade, weighted by the style's rarity (Krautrock says much,
Rock almost nothing), so that a prolific artist does not win by sheer count.
Compared decade by decade, two artists of one sound decades apart missed each
other (BEAK> and Can: 0.20 against 0.77, 2026-10-09). Two colours compare by
their cosine, shrunk by n / (n + SHRINK), n the neighbour's dated records: a
profile of a few records matches anything. Under MIN_STYLE_RECORDS
style-records an artist has no colour.

Like colisten.py, written in Python for one step: comparing every colour with
every other is a sparse matrix product, 5.3 x 10^10 multiply-adds over the
503 892 colours of 2026-10-22. The colours and the reasons are SQL; scipy only
multiplies and keeps the top K of each artist."""

from __future__ import annotations

import multiprocessing
from collections.abc import Iterator
from concurrent.futures import ProcessPoolExecutor
from typing import Any

import duckdb
import numpy as np
import scipy.sparse as sp

from musilogy.colisten import top

MIN_STYLE_RECORDS = 3
SHRINK = 10
# The neighbours the page shows.
K = 8
# Artists compared at once. A row of the product holds every artist sharing a
# style: 77 000 on average over a sample of 500 (2026-10-22), so 200 rows hold
# some fifteen million entries.
BATCH = 200
# The product runs single-threaded in scipy: two processes halve the run
# (55 minutes alone, 2026-10-22), within the two threads the build allows.
WORKERS = 2

PARAMETERS = {
    "same_sound_min_style_records": MIN_STYLE_RECORDS,
    "same_sound_shrink": SHRINK,
    "same_sound_k": K,
}

# What a process compares, set once by _hold: in a worker, the module is
# imported afresh, so K is handed over with the matrices.
_held: dict[str, Any] = {}


def set_parameters(con: duckdb.DuckDBPyConnection) -> None:
    """The rule's parameters as variables, for the manifest and the invariants."""
    for name, value in PARAMETERS.items():
        con.execute(f"SET VARIABLE {name} = {value}::INTEGER")


def _hold(colours: sp.csr_matrix, terms: sp.csr_matrix, shrink: np.ndarray, k: int) -> None:
    _held.update(colours=colours, terms=terms, shrink=shrink, k=k)


def _closest(artists: range) -> tuple[np.ndarray, ...]:
    """The top k of `artists`, by their numbers: their numbers, their
    neighbours', the scores and the ranks."""
    shrink = _held["shrink"]
    product = (_held["colours"][artists.start : artists.stop] @ _held["terms"]).tocsr()
    product.data *= shrink[product.indices]
    parts: list[tuple[np.ndarray, ...]] = []
    for row in range(product.shape[0]):
        ref = artists.start + row
        lo, hi = product.indptr[row], product.indptr[row + 1]
        cols, score = product.indices[lo:hi], product.data[lo:hi]
        keep = (score > 0) & (cols != ref)
        cols, score = cols[keep], score[keep]
        # The numbers follow the MBID: a tie falls to the neighbour's.
        kept = top(score, cols, _held["k"])
        n = len(kept)
        parts.append(
            (
                np.full(n, ref, np.int32),
                cols[kept].astype(np.int32),
                score[kept],
                np.arange(1, n + 1, dtype=np.int16),
            )
        )
    return tuple(np.concatenate([part[i] for part in parts]) for i in range(4))


def _batches(
    colours: sp.csr_matrix, terms: sp.csr_matrix, shrink: np.ndarray
) -> Iterator[tuple[np.ndarray, ...]]:
    n = colours.shape[0]
    batches = [range(start, min(start + BATCH, n)) for start in range(0, n, BATCH)]
    if len(batches) <= 1:
        _hold(colours, terms, shrink, K)
        yield from map(_closest, batches)
        return
    # Spawned, not forked: the build's DuckDB holds threads, and a fork copies
    # their locks in whatever state they are.
    pool = ProcessPoolExecutor(
        WORKERS,
        mp_context=multiprocessing.get_context("spawn"),
        initializer=_hold,
        initargs=(colours, terms, shrink, K),
    )
    try:
        yield from pool.map(_closest, batches)
    finally:
        # A failure downstream drops the batches not started: the workers stop rather than
        # compute every one of them for nothing.
        pool.shutdown(cancel_futures=True)


def build_same_sound(con: duckdb.DuckDBPyConnection) -> None:
    """Writes `same_sound(artist_mbid, neighbour_mbid, rank, score, term)` from
    `styles`; no styles give an empty table."""
    set_parameters(con)
    con.execute(
        """
        CREATE OR REPLACE TABLE colour_artists AS
        SELECT (row_number() OVER (ORDER BY artist_mbid) - 1)::INTEGER AS idx, artist_mbid,
               coalesce(sum(records) FILTER (WHERE decade IS NOT NULL), 0) AS dated
        FROM styles GROUP BY artist_mbid
        HAVING sum(records) >= getvariable('same_sound_min_style_records');
        CREATE OR REPLACE TABLE colour_terms AS
        SELECT (row_number() OVER (ORDER BY style) - 1)::SMALLINT AS term, style,
               ln((SELECT count(DISTINCT artist_mbid) FROM styles) / count(DISTINCT artist_mbid))
                 AS idf
        FROM styles GROUP BY style;
        -- The share of each style in the artist's style-records, by its rarity.
        CREATE OR REPLACE TABLE colour_weights AS
        SELECT a.idx, t.term, sum(s.records) / any_value(n.n) * any_value(t.idf) AS w
        FROM styles s
        JOIN colour_artists a USING (artist_mbid)
        JOIN colour_terms t USING (style)
        JOIN (SELECT artist_mbid, sum(records) AS n FROM styles GROUP BY 1) n USING (artist_mbid)
        GROUP BY a.idx, t.term;
        """
    )
    cells = con.execute("SELECT idx, term, w FROM colour_weights").fetchnumpy()
    dated = con.execute("SELECT dated FROM colour_artists ORDER BY idx").fetchnumpy()["dated"]
    n_terms = int(con.execute("SELECT count(*) FROM colour_terms").fetchone()[0])  # type: ignore[index]
    shrink = (dated / (dated + SHRINK)).astype(np.float64)
    colours = sp.csr_matrix(
        (cells["w"].astype(np.float64), (cells["idx"], cells["term"])),
        shape=(len(dated), n_terms),
    )
    del cells
    norm = np.sqrt(np.asarray(colours.multiply(colours).sum(axis=1)).ravel())
    # A colour of styles every artist carries weighs nothing, and meets no one.
    norm[norm == 0] = 1
    colours = sp.csr_matrix(sp.diags(1 / norm) @ colours)
    terms = colours.T.tocsr()

    con.execute(
        "CREATE OR REPLACE TABLE same_sound_scored "
        "(artist INTEGER, neighbour INTEGER, score DOUBLE, rank SMALLINT)"
    )
    for artist, neighbour, score, rank in _batches(colours, terms, shrink):
        batch = {"artist": artist, "neighbour": neighbour, "score": score, "rank": rank}
        con.register("same_sound_batch", batch)
        con.execute("INSERT INTO same_sound_scored SELECT * FROM same_sound_batch")
        con.unregister("same_sound_batch")

    # Each pair with its reason: the style that weighs most in what the two
    # share, a tie falling to the style's name.
    con.execute(
        """
        CREATE OR REPLACE TABLE same_sound AS
        WITH reasons AS (
          SELECT s.artist, s.neighbour, t.style
          FROM same_sound_scored s
          JOIN colour_weights x ON x.idx = s.artist
          JOIN colour_weights y ON y.idx = s.neighbour AND y.term = x.term
          JOIN colour_terms t ON t.term = x.term
          QUALIFY row_number() OVER (
            PARTITION BY s.artist, s.neighbour ORDER BY x.w * y.w DESC, t.style) = 1
        )
        SELECT a.artist_mbid, n.artist_mbid AS neighbour_mbid, s.rank, s.score, r.style AS term
        FROM same_sound_scored s
        JOIN reasons r USING (artist, neighbour)
        JOIN colour_artists a ON a.idx = s.artist
        JOIN colour_artists n ON n.idx = s.neighbour;
        DROP TABLE same_sound_scored;
        DROP TABLE colour_weights;
        DROP TABLE colour_terms;
        DROP TABLE colour_artists;
        """
    )
