from collections import Counter
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

import radio.model.model as model_mod
from radio.core.config import ModelConfig
from radio.model.model import Batch, _decide, last_batch, rescore, train
from tests_radio.model_factory import NOW, add_vote, as_news, make_model_db


def test_decide_keeps_the_serving_model_unless_the_new_one_is_as_good() -> None:
    serving = (1, object())
    assert _decide(None, None, None) is None
    assert _decide(serving, 0.8, 0.8) is None
    assert _decide(serving, 0.7, 0.8) == "AUC d'examen 0,700 < 0,800 (modèle en service)"
    assert _decide(serving, None, 0.8) is not None


def _two_batches(conn: Any) -> None:
    conn.execute("INSERT INTO discover_runs VALUES (1, 'd', 'd', 'done'), (2, 'd', 'd', 'done')")
    conn.execute(
        "INSERT INTO candidates (deezer_track_id, run_id, source, seed_artist_id, "
        "neighbour_artist_id) SELECT deezer_track_id, 1 + (deezer_artist_id >= 3000), "
        "'voisin', 1000, deezer_artist_id FROM tracks WHERE origin = 'candidate'"
    )
    conn.commit()


def _scores(conn: Any) -> dict[int, tuple[int, int]]:
    return {
        int(r[0]): (int(r[1]), int(r[2]))
        for r in conn.execute("SELECT deezer_track_id, model_id, accepted FROM scores")
    }


def test_each_batch_and_family_keeps_its_best_and_library_titles_are_not_discoveries(
    tmp_path: Path,
) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    # Les nouveautés de la fournée 1 sont des titres rejetés : elles ne disputent pas la coupure
    # des découvertes, aimées, et gardent leur propre quota.
    as_news(conn, 300000, 300599, run_id=1)
    conn.execute("UPDATE tracks SET origin = 'library' WHERE deezer_track_id = 200000")
    conn.commit()
    cfg = ModelConfig(keep_decouvertes=10, keep_nouveautes=5)
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    scores = _scores(conn)
    assert 200000 not in scores
    groups = {
        int(t): (int(r), s)
        for t, r, s in conn.execute("SELECT deezer_track_id, run_id, source FROM candidates")
    }
    kept = Counter(groups[t] for t, (_, a) in scores.items() if a)
    # La fournée 2 n'a que 6 artistes voisins (3006 à 3011) : 6 retenus, un par artiste.
    assert kept == {(1, "voisin"): 10, (1, "hypem"): 5, (2, "voisin"): 6}
    artist_of = dict(conn.execute("SELECT deezer_track_id, deezer_artist_id FROM tracks"))
    per_artist = Counter((groups[t][0], artist_of[t]) for t, (_, a) in scores.items() if a)
    assert max(per_artist.values()) == 1  # un titre par artiste et par fournée
    assert all(
        t // 100 < 3000
        for t, (_, a) in scores.items()
        if a and groups[t][1] == "voisin" and groups[t][0] == 1
    )


def _kept_and_floored(conn: Any) -> tuple[Counter[tuple[int, str]], Counter[tuple[int, str]]]:
    kept: Counter[tuple[int, str]] = Counter()
    floored: Counter[tuple[int, str]] = Counter()
    for run, source, accepted, below in conn.execute(
        "SELECT c.run_id, c.source, s.accepted, s.floored FROM scores s "
        "JOIN candidates c USING (deezer_track_id)"
    ):
        kept[(int(run), str(source))] += int(accepted)
        floored[(int(run), str(source))] += int(below)
    return +kept, +floored


def test_the_floor_keeps_low_scored_news_off_air_and_counts_them_once_per_artist(
    tmp_path: Path,
) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    # Fournée 1 : 3 artistes aimés (2000 à 2002) et 6 rejetés (3000 à 3005), 4 titres chacun,
    # deviennent des nouveautés ; le quota de 100 n'est jamais épuisé.
    as_news(conn, 200000, 200299, run_id=1)
    as_news(conn, 300000, 300599, run_id=1)
    cfg = ModelConfig(keep_decouvertes=100, keep_nouveautes=100, min_score_nouveautes=0.5)
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    kept, floored = _kept_and_floored(conn)
    # Les aimés passent le plancher, un titre par artiste ; les rejetés restent sous le plancher
    # et sont comptés une fois par artiste, comme ils auraient été retenus.
    assert kept[(1, "hypem")] == 3
    assert floored == {(1, "hypem"): 6}
    assert (
        conn.execute(
            "SELECT MIN(score) >= 0.5 FROM scores JOIN candidates USING (deezer_track_id) "
            "WHERE source = 'hypem' AND accepted = 1"
        ).fetchone()[0]
        == 1
    )
    # Les découvertes n'ont pas de plancher : tous leurs artistes entrent.
    assert kept[(1, "voisin")] == 9 and kept[(2, "voisin")] == 6


def test_a_zero_floor_keeps_every_news_artist(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    as_news(conn, 200000, 200299, run_id=1)
    as_news(conn, 300000, 300599, run_id=1)
    cfg = ModelConfig(keep_decouvertes=100, keep_nouveautes=100)
    assert cfg.floor == {"decouvertes": 0.0, "nouveautes": 0.0}
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    kept, floored = _kept_and_floored(conn)
    assert kept[(1, "hypem")] == 9 and not floored


def test_no_news_above_the_floor_retains_none_and_names_them_all(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    as_news(conn, 300000, 300599, run_id=1)
    cfg = ModelConfig(keep_decouvertes=10, keep_nouveautes=100, min_score_nouveautes=0.5)
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    kept, floored = _kept_and_floored(conn)
    assert (1, "hypem") not in kept and floored == {(1, "hypem"): 6}
    assert kept[(1, "voisin")] == 10 and kept[(2, "voisin")] == 6


def test_news_stopped_by_an_exhausted_quota_are_not_counted_as_floored(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    as_news(conn, 200000, 200299, run_id=1)
    as_news(conn, 300000, 300599, run_id=1)
    cfg = ModelConfig(keep_decouvertes=100, keep_nouveautes=3, min_score_nouveautes=0.5)
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    kept, floored = _kept_and_floored(conn)
    # Les 3 aimés épuisent le quota avant que les rejetés n'atteignent le plancher.
    assert kept[(1, "hypem")] == 3 and not floored


def test_floored_news_are_counted_only_up_to_the_quota_left(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    as_news(conn, 200000, 200299, run_id=1)
    as_news(conn, 300000, 300599, run_id=1)
    cfg = ModelConfig(keep_decouvertes=100, keep_nouveautes=5, min_score_nouveautes=0.5)
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    kept, floored = _kept_and_floored(conn)
    # 3 aimés retenus, 2 places restaient : sans plancher, 2 rejetés seulement seraient entrés.
    assert kept[(1, "hypem")] == 3 and floored == {(1, "hypem"): 2}


def test_a_floored_news_does_not_take_its_artist_away_from_discoveries(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    as_news(conn, 300000, 300599, run_id=1)
    cfg = ModelConfig(keep_decouvertes=100, keep_nouveautes=100, min_score_nouveautes=0.5)
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    # Le moins bien noté de chaque artiste rejeté redevient une découverte : ses nouveautés,
    # mieux notées mais sous le plancher, ne doivent pas lui prendre sa place.
    lowest = [
        int(r[0])
        for r in conn.execute(
            "SELECT deezer_track_id FROM scores s JOIN tracks t USING (deezer_track_id) "
            "WHERE deezer_track_id BETWEEN 300000 AND 300599 "
            "AND score = (SELECT MIN(score) FROM scores JOIN tracks u USING (deezer_track_id) "
            "WHERE u.deezer_artist_id = t.deezer_artist_id)"
        )
    ]
    assert len(lowest) == 6
    conn.executemany(
        "UPDATE candidates SET source = 'voisin', seed_artist_id = 1000, "
        "neighbour_artist_id = ?, detail = NULL WHERE deezer_track_id = ?",
        [(t // 100, t) for t in lowest],
    )
    conn.commit()
    rescore(conn, tmp_path / "models", cfg)
    accepted = {
        int(r[0]) for r in conn.execute("SELECT deezer_track_id FROM scores WHERE accepted")
    }
    assert set(lowest) <= accepted
    kept, floored = _kept_and_floored(conn)
    assert (1, "hypem") not in kept and floored == {(1, "hypem"): 6}


def test_last_batch_counts_the_floored_news_of_the_latest_run(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    as_news(conn, 300600, 300899, source="deezer_editorial", detail="electro")
    cfg = ModelConfig(keep_decouvertes=100, keep_nouveautes=100, min_score_nouveautes=0.5)
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    # Fournée 2 : 12 artistes rejetés de 4 titres ; les nouveautés de 3006 à 3008 sont sous le
    # plancher, les 9 voisins entrent (pas de plancher pour les découvertes).
    assert last_batch(conn) == Batch(2, 48, 9, 3)


def test_a_worse_model_is_kept_out_of_service(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    conn = make_model_db(tmp_path)
    _two_batches(conn)
    cfg = ModelConfig()
    first = train(conn, tmp_path / "models", cfg, NOW)
    for t in (200100, 200200, 200300):
        add_vote(conn, t, "exam", "oui")
    for t in (300100, 300200, 300300):
        add_vote(conn, t, "exam", "non")
    real_fit = model_mod.fit

    def inverted(table: Any, ds: Any, c: ModelConfig) -> Any:
        return real_fit(table, replace(ds, labels=1 - ds.labels), c)

    monkeypatch.setattr(model_mod, "fit", inverted)
    second = train(conn, tmp_path / "models", cfg, NOW)
    assert not second.promoted and second.new_auc == 0.0 and second.current_auc == 1.0
    assert rescore(conn, tmp_path / "models", cfg) == first.model_id
    assert {m for m, _ in _scores(conn).values()} == {first.model_id}
