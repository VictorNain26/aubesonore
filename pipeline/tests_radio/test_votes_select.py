from pathlib import Path

import numpy as np
import pytest

from radio.votes.select import (
    NoScoresError,
    NoServingModelError,
    PendingBallotsError,
    pending_ballots,
    record_vote,
    select_batch,
    week_votes,
)
from tests_radio.model_factory import NOW, make_model_db, serve_scores


def _rng(seed: int = 0) -> np.random.Generator:
    return np.random.default_rng(seed)


def test_exam_from_latest_batch_lesson_most_uncertain(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    sel = select_batch(conn, _rng(), 10, 10, NOW)
    assert sel.selection_id == 1 and sel.model_id == 1
    assert sel.run_id == 2 and sel.n_batch == 48
    assert len(sel.exam) == 10
    assert all(t // 100 % 100 >= 6 for t in sel.exam)  # dernière fournée : artistes 6 à 11
    assert len(sel.lesson) == 10
    assert len({t // 100 for t in sel.lesson}) == 10  # un par artiste
    assert not {t // 100 for t in sel.exam} & {t // 100 for t in sel.lesson}
    ballots = pending_ballots(conn)
    assert sorted(b.position for b in ballots) == list(range(20))
    kinds = {b.deezer_track_id: b.kind for b in ballots}
    assert kinds == {**dict.fromkeys(sel.exam, "exam"), **dict.fromkeys(sel.lesson, "lesson")}
    assert ballots[0].artist.startswith("Art ") and ballots[0].title.startswith("Titre ")


def test_lesson_is_the_closest_to_the_cut_outside_exam_artists(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    sel = select_batch(conn, _rng(), 0, 10, NOW)
    # Coupure 0,5625 (aimé k = 0) : les plus proches sont les aimés k = 0, un par artiste.
    assert sorted(sel.lesson) == [(2000 + a) * 100 for a in range(10)]


def test_lesson_measures_each_family_against_its_own_cut(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    # Les rejetés de la dernière fournée deviennent des nouveautés ; leur meilleur titre (k = 0,
    # note 0,4375) est retenu : c'est la coupure des nouveautés, loin de celle des découvertes.
    conn.execute(
        "UPDATE candidates SET source = 'hypem', seed_artist_id = NULL, "
        "neighbour_artist_id = NULL, detail = 'Blog' WHERE deezer_track_id >= 300600"
    )
    conn.execute("UPDATE scores SET accepted = 1 WHERE deezer_track_id >= 300600 AND score > 0.43")
    conn.commit()
    sel = select_batch(conn, _rng(), 0, 18, NOW)
    news = [(3000 + a) * 100 for a in range(6, 12)]
    assert sorted(sel.lesson) == [(2000 + a) * 100 for a in range(12)] + news


def test_exam_splits_evenly_between_discoveries_and_fresh_picks(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    # Dernière fournée : 24 voisins aimés et 24 nouveautés ; puis 2 nouveautés seulement.
    conn.execute(
        "UPDATE candidates SET source = 'hypem', seed_artist_id = NULL, "
        "neighbour_artist_id = NULL, detail = 'Blog' WHERE deezer_track_id >= 300600"
    )
    conn.commit()
    sel = select_batch(conn, _rng(), 10, 0, NOW)
    assert sum(t >= 300600 for t in sel.exam) == 5 and len(sel.exam) == 10

    conn.execute("DELETE FROM ballots")
    conn.execute(
        "UPDATE candidates SET source = 'voisin', seed_artist_id = 1000, detail = NULL, "
        "neighbour_artist_id = deezer_track_id / 100 WHERE deezer_track_id >= 300602"
    )
    conn.commit()
    sel = select_batch(conn, _rng(), 10, 0, NOW)
    assert sum(t in (300600, 300601) for t in sel.exam) == 2 and len(sel.exam) == 10


def test_an_artist_once_examined_never_gets_a_lesson(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    first = select_batch(conn, _rng(), 10, 0, NOW)
    for b in pending_ballots(conn):
        assert record_vote(conn, b.deezer_track_id, "oui", NOW)
    second = select_batch(conn, _rng(1), 0, 10, NOW)
    assert second.lesson
    assert not {t // 100 for t in first.exam} & {t // 100 for t in second.lesson}


def test_no_new_selection_while_ballots_wait(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    select_batch(conn, _rng(), 10, 10, NOW)
    with pytest.raises(PendingBallotsError) as e:
        select_batch(conn, _rng(), 10, 10, NOW)
    assert e.value.n == 20


def test_votes_empty_the_queue_and_titles_never_return(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    first = select_batch(conn, _rng(), 10, 10, NOW)
    for b in pending_ballots(conn):
        assert record_vote(conn, b.deezer_track_id, "oui", NOW)
    assert pending_ballots(conn) == []
    assert not record_vote(conn, 400000, "oui", NOW)  # jamais présenté
    kinds = dict(
        conn.execute("SELECT deezer_track_id, kind FROM votes WHERE source = 'page'").fetchall()
    )
    assert all(kinds[t] == "exam" for t in first.exam)
    assert all(kinds[t] == "lesson" for t in first.lesson)
    second = select_batch(conn, _rng(1), 10, 10, NOW)
    shown = set(first.exam) | set(first.lesson)
    assert not (set(second.exam) | set(second.lesson)) & shown
    batch_shown = {t for t in shown if t // 100 % 100 >= 6}
    assert second.n_batch == 48 - len(batch_shown)


def test_small_pool_gives_what_there_is(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    sel = select_batch(conn, _rng(), 60, 0, NOW)
    assert len(sel.exam) == 48 and sel.lesson == []


def test_exam_covers_the_whole_batch_and_remembers_the_verdict(tmp_path: Path) -> None:
    # Tiré parmi les seuls retenus, l'examen tronquait les notes du modèle en service et
    # favorisait tout challenger à la promotion.
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    sel = select_batch(conn, _rng(), 48, 0, NOW)
    flags = dict(conn.execute("SELECT deezer_track_id, retained FROM ballots").fetchall())
    assert {t: flags[t] for t in sel.exam} == {t: int(t < 300000) for t in sel.exam}
    assert set(flags.values()) == {0, 1}


def test_lesson_takes_at_most_one_title_per_artist(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    # Deux titres de l'artiste 2000 exactement sur la coupure : sans la garde par artiste, les
    # deux seraient pris.
    conn.execute("UPDATE scores SET score = 0.9 WHERE deezer_track_id = 200000")
    conn.execute("UPDATE scores SET score = 0.5625 WHERE deezer_track_id IN (200001, 200002)")
    conn.commit()
    sel = select_batch(conn, _rng(), 0, 10, NOW)
    assert 200001 in sel.lesson
    assert sum(1 for t in sel.lesson if t // 100 == 2000) == 1


def test_needs_a_serving_model_and_its_scores(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    with pytest.raises(NoServingModelError):
        select_batch(conn, _rng(), 10, 10, NOW)
    conn.execute("INSERT INTO models VALUES (1, 'd', 'f', 1, 'v', '{}', '{}')")
    conn.commit()
    with pytest.raises(NoScoresError):
        select_batch(conn, _rng(), 10, 10, NOW)


def test_a_vote_is_corrected_until_the_next_selection_freezes_it(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    first = select_batch(conn, _rng(), 10, 10, NOW)
    for b in pending_ballots(conn):
        assert record_vote(conn, b.deezer_track_id, "oui", NOW)
    tid = first.lesson[0]
    assert record_vote(conn, tid, "non", "2026-10-11T12:00:00+00:00")
    row = conn.execute(
        "SELECT kind, vote, voted_at FROM votes WHERE deezer_track_id = ?", (tid,)
    ).fetchone()
    assert tuple(row) == ("lesson", "non", NOW)  # l'heure du premier vote reste
    week = week_votes(conn)
    assert [c.ballot.position for c in week] == list(range(20))
    assert {c.ballot.deezer_track_id: c.vote for c in week}[tid] == "non"

    select_batch(conn, _rng(1), 10, 10, NOW)
    assert not record_vote(conn, tid, "oui", NOW)  # figé par la nouvelle sélection
    assert (
        conn.execute("SELECT vote FROM votes WHERE deezer_track_id = ?", (tid,)).fetchone()[0]
        == "non"
    )
    assert week_votes(conn) == []
