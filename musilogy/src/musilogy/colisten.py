"""Our co-listening (docs/conception.md §1, `colisten`): for each artist that at
least MIN_LISTENERS users of the ListenBrainz statistics export listen to, its
K closest artists by listeners in common, corrected for popularity.

The rule, measured on the evaluation set (docs/vision.md §2.2, 2026-10-07):
cosine with an asymmetric exponent, score(j, i) = c / (pop_j^ALPHA * pop_i^(1 - ALPHA)),
shrunk by c / (c + SHRINK), c being the users who listen to both and pop the
users who listen to each. Only pairs with at least MIN_COMMON users in common
count.

The one step of the build written in Python rather than SQL: counting the
users every pair of artists shares is a sparse matrix product (33 million
user-artist rows give billions of pairs, about 2 x 10^10 increments as a SQL
self-join). The rows are read, filtered and numbered in SQL; scipy only
multiplies, scores and keeps the top K of each artist."""

from __future__ import annotations

import duckdb
import numpy as np
import scipy.sparse as sp

MIN_LISTENERS = 3
MIN_COMMON = 2
ALPHA = 0.3
SHRINK = 10.0
# The page shows 30 at most; 50 leaves room for the neighbours it cannot show.
K = 50
# Rows of the artist-by-artist product computed at once: about 7 million
# non-zero counts per chunk, a few tens of MB.
CHUNK = 500
# Scored rows handed to DuckDB at once: the whole result held in Python, then
# copied once more to be joined, took the peak to 4.2 GB (2026-10-08).
BATCH = 2_000_000

PARAMETERS = {
    "colisten_min_listeners": MIN_LISTENERS,
    "colisten_min_common": MIN_COMMON,
    "colisten_alpha": ALPHA,
    "colisten_shrink": SHRINK,
    "colisten_k": K,
}


def scores(common: np.ndarray, pop_ref: float, pop_cand: np.ndarray) -> np.ndarray:
    """The rule itself, for one reference artist against its candidates."""
    return np.asarray(
        common / (pop_ref**ALPHA * pop_cand ** (1 - ALPHA)) * common / (common + SHRINK),
        dtype=np.float64,
    )


def build_colisten(con: duckdb.DuckDBPyConnection) -> None:
    """Writes `colisten(artist_mbid, neighbour_mbid, common, score, rank)` from
    `raw_listening`; an empty export gives an empty table."""
    for name, value in PARAMETERS.items():
        # Typed: a bare 0.3 would be a DECIMAL, which the manifest cannot write.
        sql_type = "DOUBLE" if isinstance(value, float) else "INTEGER"
        con.execute(f"SET VARIABLE {name} = {value}::{sql_type}")
    con.execute(
        f"""
        CREATE OR REPLACE TABLE colisten_artists AS
        SELECT (row_number() OVER (ORDER BY artist_mbid) - 1)::INTEGER AS idx,
               artist_mbid, count(DISTINCT user_id)::INTEGER AS listeners
        FROM raw_listening GROUP BY artist_mbid HAVING count(DISTINCT user_id) >= {MIN_LISTENERS}
        """
    )
    listens = con.execute(
        """
        WITH users AS (
          SELECT user_id, (row_number() OVER (ORDER BY user_id) - 1)::INTEGER AS idx
          FROM (SELECT DISTINCT user_id FROM raw_listening)
        )
        SELECT u.idx AS user_idx, a.idx AS artist_idx
        FROM raw_listening r
        JOIN users u USING (user_id)
        JOIN colisten_artists a USING (artist_mbid)
        """
    ).fetchnumpy()
    pop = (
        con.execute("SELECT listeners FROM colisten_artists ORDER BY idx")
        .fetchnumpy()["listeners"]
        .astype(np.float64)
    )
    # Read once: the rows are in the matrix from here on.
    con.execute("DROP TABLE raw_listening")
    users, artists = listens["user_idx"], listens["artist_idx"]
    n_users = int(users.max()) + 1 if len(users) else 0
    b = sp.csr_matrix(
        (np.ones(len(users), np.float32), (users, artists)), shape=(n_users, len(pop))
    )
    # Two entries of one user for one artist were summed on construction: a
    # user counts once.
    b.data[:] = 1
    bt = b.T.tocsr()
    del listens, users, artists

    con.execute(
        "CREATE OR REPLACE TABLE colisten_scored (artist INTEGER, neighbour INTEGER, "
        "common INTEGER, score FLOAT, rank SMALLINT)"
    )
    parts: list[tuple[np.ndarray, ...]] = []
    held = 0

    def flush() -> None:
        nonlocal held
        if not parts:
            return
        batch = {
            name: np.concatenate([part[i] for part in parts])
            for i, name in enumerate(("artist", "neighbour", "common", "score", "rank"))
        }
        con.register("colisten_batch", batch)
        con.execute("INSERT INTO colisten_scored SELECT * FROM colisten_batch")
        con.unregister("colisten_batch")
        parts.clear()
        held = 0

    for start in range(0, len(pop), CHUNK):
        product = (bt[start : start + CHUNK] @ b).tocsr()
        for row in range(product.shape[0]):
            ref = start + row
            lo, hi = product.indptr[row], product.indptr[row + 1]
            cols, common = product.indices[lo:hi], product.data[lo:hi]
            keep = (common >= MIN_COMMON) & (cols != ref)
            cols, common = cols[keep], common[keep].astype(np.float64)
            if not len(cols):
                continue
            score = scores(common, pop[ref], pop[cols])
            top = np.argpartition(-score, K - 1)[:K] if len(score) > K else np.arange(len(score))
            # Score first, then the neighbour's MBID (idx follows it): a tie
            # never depends on the order the product came out in.
            top = top[np.lexsort((cols[top], -score[top]))]
            n = len(top)
            parts.append(
                (
                    np.full(n, ref, np.int32),
                    cols[top].astype(np.int32),
                    common[top].astype(np.int32),
                    score[top].astype(np.float32),
                    np.arange(1, n + 1, dtype=np.int16),
                )
            )
            held += n
        if held >= BATCH:
            flush()
    flush()

    con.execute(
        """
        CREATE OR REPLACE TABLE colisten AS
        SELECT a.artist_mbid::VARCHAR AS artist_mbid, n.artist_mbid::VARCHAR AS neighbour_mbid,
               s.common, s.score, s.rank
        FROM colisten_scored s
        JOIN colisten_artists a ON a.idx = s.artist
        JOIN colisten_artists n ON n.idx = s.neighbour
        """
    )
    con.execute("DROP TABLE colisten_scored")
