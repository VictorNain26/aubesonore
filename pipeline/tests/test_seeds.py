from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from radio.core.config import DiscoverConfig
from radio.core.db import connect
from radio.discover.seeds import draw_seeds, finish_run, recently_used, start_run
from radio.library.artists import LibraryArtist

A = [LibraryArtist(i, f"A{i}", plays) for i, plays in [(1, 0), (2, 100), (3, 5)]]
NOW = datetime(2026, 9, 25, tzinfo=UTC)
CFG = DiscoverConfig(seeds_per_run=2, seed_cooldown_days=30)


def ids(artists: list[LibraryArtist]) -> set[int]:
    return {a.deezer_artist_id for a in artists}


def test_draw_without_replacement() -> None:
    got = draw_seeds(A, set(), 3, np.random.default_rng(0))
    assert sorted(a.deezer_artist_id for a in got) == [1, 2, 3]


def test_draw_respects_exclusion_and_pool_size() -> None:
    assert ids(draw_seeds(A, {2}, 5, np.random.default_rng(0))) == {1, 3}
    assert draw_seeds(A, {1, 2, 3}, 5, np.random.default_rng(0)) == []


def test_listened_artists_are_favoured_but_everyone_keeps_a_chance() -> None:
    rng = np.random.default_rng(42)
    counts = Counter(draw_seeds(A[:2], set(), 1, rng)[0].deezer_artist_id for _ in range(4000))
    # Poids 1 (aucune écoute) contre 4 (plafond) : 20 % contre 80 %.
    assert 0.15 < counts[1] / 4000 < 0.25


def test_run_lifecycle(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    run = start_run(conn, A, CFG, NOW, np.random.default_rng(0))
    assert not run.resumed and len(run.seeds) == 2 and run.n_dropped == 0
    again = start_run(conn, A, CFG, NOW, np.random.default_rng(99))
    assert again.resumed and again.run_id == run.run_id and again.seeds == run.seeds
    finish_run(conn, run.run_id, NOW)
    nxt = start_run(conn, A, CFG, NOW + timedelta(days=1), np.random.default_rng(0))
    assert not nxt.resumed and ids(nxt.seeds).isdisjoint(ids(run.seeds))


def test_cooldown_counts_only_finished_runs(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    run = start_run(conn, A, CFG, NOW, np.random.default_rng(0))
    assert recently_used(conn, NOW, 30) == set()
    finish_run(conn, run.run_id, NOW)
    assert recently_used(conn, NOW + timedelta(days=29), 30) == ids(run.seeds)
    assert recently_used(conn, NOW + timedelta(days=31), 30) == set()


def test_resumed_run_drops_seeds_gone_from_library(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    run = start_run(conn, A, CFG, NOW, np.random.default_rng(0))
    gone = run.seeds[0].deezer_artist_id
    rest = [a for a in A if a.deezer_artist_id != gone]
    again = start_run(conn, rest, CFG, NOW, np.random.default_rng(0))
    assert again.resumed and again.n_dropped == 1 and gone not in ids(again.seeds)
