from pathlib import Path

import numpy as np
import pytest

from radio.library.weights import play_weight
from radio.model.dataset import (
    LIBRARY,
    VOTE_NO,
    VOTE_YES,
    WEAK,
    MissingExamplesError,
    build_labels,
    weights,
)
from radio.signals.table import load_signals
from tests.model_factory import add_vote, make_model_db


def test_categories_and_exam(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path, n_artists=3, per_artist=2)
    add_vote(conn, 200000, "lesson", "oui")
    add_vote(conn, 300000, "lesson", "non")
    add_vote(conn, 300001, "lesson", "passer")
    add_vote(conn, 200100, "exam", "oui")
    add_vote(conn, 300100, "exam", "non")
    table = load_signals(conn)
    lab = build_labels(conn, table, 60)
    assert lab.train.counts() == {"library": 6, "vote_yes": 1, "vote_no": 1, "weak": 6}
    ids = table.track_ids
    assert ids[lab.exam.rows].tolist() == [200100, 300100]
    assert lab.exam.labels.tolist() == [1, 0]
    assert not set(ids[lab.train.rows].tolist()) & {200100, 300100, 300001}
    yes = lab.train.rows[lab.train.categories == VOTE_YES]
    assert ids[yes].tolist() == [200000]


def test_library_weights_follow_plays(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path, n_artists=3, per_artist=2)
    table = load_signals(conn)
    lab = build_labels(conn, table, 60)
    plays = {
        r[0]: r[1]
        for r in conn.execute(
            "SELECT m.deezer_track_id, t.plays FROM deezer_matches m JOIN library_tracks t "
            "USING (plex_key)"
        )
    }
    lib = lab.train.categories == LIBRARY
    for row, w in zip(lab.train.rows[lib], lab.train.base_weights[lib], strict=True):
        assert w == pytest.approx(play_weight(plays[int(table.track_ids[row])]))


def test_a_vote_overrides_the_origin(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path, n_artists=3, per_artist=2)
    add_vote(conn, 100000, "lesson", "non")
    table = load_signals(conn)
    lab = build_labels(conn, table, 60)
    row = int(np.flatnonzero(table.track_ids == 100000)[0])
    i = int(np.flatnonzero(lab.train.rows == row)[0])
    assert (lab.train.categories[i], lab.train.labels[i]) == (VOTE_NO, 0)


def test_weak_negatives_close_to_the_library_are_excluded(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path, n_artists=3, per_artist=2)
    # Même nom qu'un artiste de la bibliothèque.
    conn.execute("UPDATE artists SET name = 'Lib 0' WHERE deezer_artist_id = 4000")
    # Même clé de dédoublonnage qu'un titre de la bibliothèque.
    key = conn.execute("SELECT dedupe_key FROM tracks WHERE deezer_track_id = 100010").fetchone()
    conn.execute("UPDATE tracks SET dedupe_key = ? WHERE deezer_track_id = 400100", (key[0],))
    conn.commit()
    table = load_signals(conn)
    lab = build_labels(conn, table, 60)
    assert lab.n_weak_excluded == 3
    assert lab.train.counts()["weak"] == 3


def test_exam_window_keeps_the_latest_votes(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path, n_artists=3, per_artist=2)
    add_vote(conn, 200000, "exam", "oui", at="2026-09-24T10:00:00+00:00")
    add_vote(conn, 200001, "exam", "non", at="2026-09-24T11:00:00+00:00")
    add_vote(conn, 200100, "exam", "oui", at="2026-09-24T12:00:00+00:00")
    add_vote(conn, 999, "lesson", "oui")
    table = load_signals(conn)
    lab = build_labels(conn, table, 2)
    assert table.track_ids[lab.exam.rows].tolist() == [200001, 200100]
    assert lab.n_votes_unmeasured == 1
    # Hors fenêtre, un titre d'examen ne s'entraîne pas pour autant.
    assert 200000 not in table.track_ids[lab.train.rows].tolist()


def test_weights_balance_the_classes(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path, n_artists=3, per_artist=2)
    add_vote(conn, 300000, "lesson", "non")
    table = load_signals(conn)
    ds = build_labels(conn, table, 60).train
    w = weights(ds, 0.1)
    assert w[ds.labels == 1].sum() == pytest.approx(1.0)
    assert w[ds.labels == 0].sum() == pytest.approx(1.0)
    weak, no = w[ds.categories == WEAK], w[ds.categories == VOTE_NO]
    assert weak[0] / no[0] == pytest.approx(0.1 / 4.0)
    w0 = weights(ds, 0.0)
    assert (w0[ds.categories == WEAK] == 0).all()


def test_weights_need_both_classes(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path, n_artists=3, per_artist=2)
    table = load_signals(conn)
    ds = build_labels(conn, table, 60).train
    with pytest.raises(MissingExamplesError):
        weights(ds, 0.0)


def test_another_version_of_an_exam_title_is_not_trained_on(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path, n_artists=3, per_artist=2)
    library_key = conn.execute(
        "SELECT dedupe_key FROM tracks WHERE origin = 'library' ORDER BY deezer_track_id"
    ).fetchone()[0]
    conn.execute("UPDATE tracks SET dedupe_key = ? WHERE deezer_track_id = 200000", (library_key,))
    conn.commit()
    add_vote(conn, 200000, "exam", "oui")
    lab = build_labels(conn, load_signals(conn), 60)
    assert lab.train.counts()["library"] == 5
    assert lab.n_votes == 1
