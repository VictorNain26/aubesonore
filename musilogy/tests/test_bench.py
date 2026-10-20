"""The evaluation bench on hand-written data: the draw, the pool, the checks of a
verdict, the vote of the judges and the report's numbers, each known in advance."""

import json
import math
import shutil
import urllib.error
from email.message import Message
from typing import Any

import duckdb
import pytest

from musilogy import bench
from musilogy.bench import (
    agreement,
    delivered_run,
    describe,
    differences,
    draw_controls,
    draw_references,
    final_labels,
    pooled,
    problems,
    report,
    resolved_runs,
)
from musilogy.fetch import ChecksumError, sha256_file

REF = "a0000000-0000-0000-0000-000000000000"


def catalogue():
    """Twelve artists per stratum, all in the co-listening but the last of each."""
    con = duckdb.connect(":memory:")
    rows = [
        (f"{s}{i:07d}-0000-0000-0000-000000000000", n)
        for s, n in (("1", 50), ("2", 5_000), ("3", 50_000))
        for i in range(12)
    ]
    con.execute("CREATE TABLE popularity (mbid VARCHAR, user_count BIGINT)")
    con.executemany("INSERT INTO popularity VALUES (?, ?)", rows)
    con.execute("CREATE TABLE colisten (artist_mbid VARCHAR, neighbour_mbid VARCHAR)")
    con.executemany(
        "INSERT INTO colisten VALUES (?, ?)", [(m, REF) for m, _ in rows if m[1:8] != "0000011"]
    )
    return con


def test_the_draw_takes_as_many_references_from_each_stratum():
    refs = draw_references(catalogue(), per_stratum=4, seed="s")
    assert [r["stratum"] for r in refs].count("tail") == 4
    assert [r["stratum"] for r in refs].count("torso") == 4
    assert [r["stratum"] for r in refs].count("head") == 4
    assert all(
        (r["stratum"], r["listeners"]) in {("tail", 50), ("torso", 5_000), ("head", 50_000)}
        for r in refs
    )


def test_the_draw_is_the_same_for_one_seed_and_another_for_another():
    con = catalogue()
    assert draw_references(con, 4, "s") == draw_references(con, 4, "s")
    assert draw_references(con, 4, "s") != draw_references(con, 4, "t")


def test_the_draw_leaves_out_an_artist_outside_the_co_listening():
    refs = draw_references(catalogue(), per_stratum=12, seed="s")
    assert len(refs) == 33
    assert not any(r["mbid"][1:8] == "0000011" for r in refs)


def test_the_pool_joins_each_systems_first_ones_once_with_the_control():
    runs = {"ours": {REF: ["x", "y", "z"]}, "lastfm": {REF: ["y", "w"]}, "deezer": {}}
    pool = pooled(runs, depth=2, controls={REF: "c"}, seed="s")
    assert sorted(pool[REF]) == ["c", "w", "x", "y"]


def test_the_pool_order_tells_neither_the_system_nor_the_rank():
    a = pooled({"ours": {REF: ["x", "y"]}, "lastfm": {REF: ["w"]}}, 5, {REF: "c"}, "s")
    b = pooled({"lastfm": {REF: ["w"]}, "ours": {REF: ["y", "x"]}}, 5, {REF: "c"}, "s")
    assert a == b


def verdict(**over):
    v = {
        "ref_mbid": REF,
        "verdicts": [
            {"mbid": "x", "son": "meme_son", "appui": "texte", "sources": ["https://a.org/x"]},
            {"mbid": "y", "son": "inconnu", "appui": "aucun", "sources": []},
        ],
    }
    v.update(over)
    return v


def test_a_sound_verdict_has_no_problem():
    assert problems(verdict(), REF, {"x", "y"}) == []


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({"ref_mbid": "other"}, "reference"),
        ({"verdicts": verdict()["verdicts"][:1]}, "missing y"),
        (
            {"verdicts": [*verdict()["verdicts"], {"mbid": "z", "son": "parente"}]},
            "not in the pool: z",
        ),
        ({"verdicts": [{"mbid": "x", "son": "proche", "sources": ["https://a.org"]}]}, "x: son"),
        ({"verdicts": [{"mbid": "x", "son": "parente", "sources": []}]}, "x: no source"),
        ({"verdicts": [{"mbid": "x", "son": "parente", "sources": ["a.org"]}]}, "x: no source"),
    ],
)
def test_a_verdict_is_refused_for(change, expected):
    found = problems(verdict(**change), REF, {"x"} if "missing" not in expected else {"x", "y"})
    assert any(expected in p for p in found), found


def judged(**pairs):
    """{judge: {REF: {candidate: son}}} from candidate=(son of judge a, son of judge b, ...)."""
    judges = "abc"
    out: dict[str, dict[str, dict[str, str]]] = {j: {REF: {}} for j in judges}
    for cand, sons in pairs.items():
        for j, son in zip(judges, sons, strict=False):
            out[j][REF][cand] = son
    return out


def test_the_judges_agreeing_keep_the_lower_of_their_verdicts():
    labels, disputed = final_labels(
        judged(p=("meme_son", "parente"), q=("meme_son", "meme_son"), r=("lointain", "etranger"))
    )
    assert labels[REF] == {"p": "parente", "q": "meme_son", "r": "etranger"}
    assert disputed == []


def test_judges_split_on_good_or_not_call_a_third_one():
    labels, disputed = final_labels(judged(p=("meme_son", "lointain")))
    assert labels[REF] == {}
    assert disputed == [(REF, "p")]
    labels, disputed = final_labels(judged(p=("meme_son", "lointain", "parente")))
    assert labels[REF] == {"p": "parente"}
    assert disputed == []


def test_an_unknown_counts_for_no_side():
    labels, disputed = final_labels(judged(p=("meme_son", "inconnu"), q=("inconnu", "inconnu")))
    assert disputed == [(REF, "p")]
    assert labels[REF] == {}


def test_agreement_is_one_when_two_judges_say_the_same_and_drops_when_they_differ():
    same = judged(p=("meme_son", "meme_son"), q=("etranger", "etranger"), r=("parente", "parente"))
    assert agreement(same["a"], same["b"]) == pytest.approx(1.0)
    split = judged(p=("meme_son", "etranger"), q=("etranger", "meme_son"), r=("parente", "parente"))
    assert agreement(split["a"], split["b"]) < 0


def test_the_report_counts_what_each_system_shows_against_the_judged_pool():
    refs = [
        {"mbid": "r1", "stratum": "head", "listeners": 1000},
        {"mbid": "r2", "stratum": "head", "listeners": 1000},
    ]
    labels = {
        "r1": {"x": "meme_son", "y": "parente", "z": "etranger", "w": "meme_son"},
        "r2": {"x": "parente", "v": "lointain"},
    }
    runs = {"ours": {"r1": ["x", "y", "z", "u"], "r2": []}, "other": {"r1": ["w"], "r2": ["v"]}}
    listeners = {"x": 10, "y": 10_000, "z": 10, "w": 10, "v": 10}
    out = report(refs, labels, runs, listeners, controls={})
    ours = out["systems"]["ours"]["head"]
    # r1 shows x y z judged (u is not): strict 1/3, large 2/3; r2 shows nothing.
    assert ours["strict"][0] == pytest.approx(1 / 3)
    assert ours["large"][0] == pytest.approx(2 / 3)
    assert ours["foreign"][0] == pytest.approx(1 / 3)
    assert ours["judged"][0] == pytest.approx(3 / 4)
    # Recall over the good pairs of the pool: r1 finds x y of x y w, r2 none of x.
    assert ours["recall"][0] == pytest.approx((2 / 3 + 0) / 2)
    assert ours["coverage"] == pytest.approx(1 / 2)
    # Less known than the reference (1 000 listeners): x z, not y.
    assert ours["less_known"][0] == pytest.approx(2 / 3)
    assert out["systems"]["other"]["head"]["large"][0] == pytest.approx((1 + 0) / 2)


def test_the_report_gives_the_share_of_controls_judged_good():
    refs = [{"mbid": "r1", "stratum": "tail", "listeners": 10}]
    labels = {"r1": {"c": "parente", "x": "meme_son"}}
    out = report(refs, labels, {"ours": {"r1": ["x"]}}, {}, controls={"r1": "c"})
    assert out["controls_good"] == pytest.approx(1.0)


def test_a_control_a_system_shows_is_measured_like_any_judged_pair():
    refs = [{"mbid": "r1", "stratum": "tail", "listeners": 10}]
    labels = {"r1": {"c": "etranger", "x": "meme_son"}}
    out = report(refs, labels, {"ours": {"r1": ["x", "c"]}}, {}, controls={"r1": "c"})
    assert out["systems"]["ours"]["tail"]["large"][0] == pytest.approx(0.5)
    assert out["systems"]["ours"]["tail"]["foreign"][0] == pytest.approx(0.5)


def test_recall_leaves_out_a_reference_whose_pool_holds_no_good_pair():
    refs = [{"mbid": "r1", "stratum": "tail", "listeners": 10}]
    out = report(refs, {"r1": {"x": "lointain"}}, {"ours": {"r1": ["x"]}}, {}, controls={})
    assert out["per"]["ours"]["recall"] == {}


def test_recall_leaves_out_a_reference_a_system_gives_no_answer_for():
    refs = [{"mbid": "r1", "stratum": "tail", "listeners": 10}]
    labels = {"r1": {"x": "meme_son"}}
    runs: dict[str, dict[str, list[str]]] = {"ours": {"r1": []}, "deezer": {}}
    out = report(refs, labels, runs, {}, controls={})
    # Ours answered nothing and found nothing; Deezer was never asked.
    assert out["per"]["ours"]["recall"] == {"r1": 0.0}
    assert out["per"]["deezer"]["recall"] == {}


def test_a_verdict_judging_one_candidate_twice_is_refused():
    v = verdict()
    v["verdicts"].append({**v["verdicts"][0], "son": "etranger"})
    assert "judged twice: x" in problems(v, REF, {"x", "y"})


def test_agreement_is_unmeasured_when_the_judges_never_differ_in_kind():
    same = judged(p=("parente", "parente"), q=("parente", "inconnu"))
    assert math.isnan(agreement(same["a"], same["b"]))
    assert math.isnan(agreement({}, {}))


def test_the_differences_pair_the_references_both_systems_are_measured_on():
    refs = [
        {"mbid": "r1", "stratum": "head", "listeners": 1},
        {"mbid": "r2", "stratum": "head", "listeners": 1},
        {"mbid": "r3", "stratum": "tail", "listeners": 1},
    ]
    a = {"r1": 1.0, "r2": 0.5, "r3": 1.0}
    b = {"r1": 0.5, "r2": 0.5}
    diff = differences(refs, a, b)
    assert diff["head"][0] == pytest.approx(0.25)
    assert diff["all"][0] == pytest.approx(0.25)
    assert diff["tail"][0] != diff["tail"][0]  # NaN: r3 is not measured by b


def delivery():
    """A delivery's tables, by hand: a reference r with two « même son »
    neighbours, Deezer artists, styles for the control's draw."""
    con = duckdb.connect(":memory:")
    con.execute(
        "CREATE TABLE artists (mbid VARCHAR, name VARCHAR, disambiguation VARCHAR, "
        "type VARCHAR, y0 INTEGER, y_end INTEGER, country VARCHAR, name_key VARCHAR)"
    )
    con.executemany(
        "INSERT INTO artists VALUES (?, ?, '', 'Group', 1990, NULL, 'FR', NULL)",
        [
            ("r", "Ref"),
            ("n1", "Air"),
            ("n2", "Cassius"),
            ("p", "Pop Star"),
            ("q", "Quiet"),
            ("dz", "Deezer Pick"),
        ],
    )
    con.execute("UPDATE artists SET name_key = strip_accents(lower(name))")
    con.execute("CREATE TABLE urls (artist_mbid VARCHAR, type VARCHAR, url VARCHAR)")
    con.executemany(
        "INSERT INTO urls VALUES (?, 'free streaming', ?)",
        [("dz", "https://www.deezer.com/artist/42"), ("r", "https://www.deezer.com/artist/7")],
    )
    con.execute(
        "CREATE TABLE same_sound (artist_mbid VARCHAR, neighbour_mbid VARCHAR, rank INTEGER)"
    )
    con.executemany(
        "INSERT INTO same_sound VALUES (?, ?, ?)", [("r", "n2", 2), ("r", "n1", 1), ("n1", "r", 1)]
    )
    con.execute("CREATE TABLE popularity (mbid VARCHAR, user_count BIGINT)")
    con.executemany(
        "INSERT INTO popularity VALUES (?, ?)",
        [("p", 5_000), ("q", 5_000), ("n1", 900), ("r", 2_000)],
    )
    con.execute("CREATE TABLE styles (artist_mbid VARCHAR, style VARCHAR, records BIGINT)")
    con.executemany(
        "INSERT INTO styles VALUES (?, ?, ?)",
        [
            ("r", "House", 5),
            ("p", "House", 3),
            ("p", "Pop", 3),
            ("q", "Folk", 4),
            ("n1", "Folk", 9),
        ],
    )
    return con


def delivered(folder):
    """delivery() written as a published delivery, with a co-listening."""
    con = delivery()
    con.execute("CREATE TABLE colisten AS SELECT 'r' AS artist_mbid, 'dz' AS neighbour_mbid")
    folder.mkdir()
    digests = {}
    for table in bench.DELIVERY_TABLES:
        con.execute(f"COPY {table} TO '{folder / table}.parquet' (FORMAT parquet)")
        digests[f"{table}.parquet"] = sha256_file(folder / f"{table}.parquet")
    (folder / "manifest.json").write_text(json.dumps({"output_sha256": digests}), encoding="utf-8")
    return folder


def write_verdict(folder, round_, judge, ref, sons):
    bench._write(
        folder / "verdicts" / round_ / judge / f"{ref}.json",
        {
            "ref_mbid": ref,
            "verdicts": [
                {"mbid": c, "son": s, "sources": ["https://example.org"]} for c, s in sons.items()
            ],
        },
    )


def answered(folder):
    bench._write(
        folder / "answers.json",
        {"lastfm": {"r": [{"name": "Lone", "url": "https://last.fm/lone"}]}, "deezer": {"r": None}},
    )


def test_the_bench_goes_from_the_draw_to_the_report(tmp_path, monkeypatch):
    out = delivered(tmp_path / "out")
    folder = tmp_path / "bench"
    monkeypatch.setattr(bench, "PER_STRATUM", 1)
    # Every reference judged again, to see the stability round hold nothing up.
    monkeypatch.setattr(bench, "AGAIN", 1)
    assert bench.take_sample(folder, out) == 1
    with pytest.raises(SystemExit):
        bench.take_sample(folder, out)
    assert [r["mbid"] for r in bench.references(folder)] == ["r"]
    answered(folder)
    # n1 n2 from ours, Lone from Last.fm, q the control.
    assert bench.make_round(folder, out, "r1") == 4
    target = bench._read(folder / "targets" / "r1" / "r.json")
    assert target["ref"]["name"] == "Ref"
    assert {c["mbid"] for c in target["candidates"]} == {"n1", "n2", "lastfm:Lone", "q"}
    assert bench.make_round(folder, out, "r2") == 0

    assert "r1/a/r: missing" in bench.check(folder)
    sons_a = {"n1": "meme_son", "n2": "parente", "lastfm:Lone": "etranger", "q": "etranger"}
    sons_b = {"n1": "meme_son", "n2": "lointain", "lastfm:Lone": "etranger", "q": "etranger"}
    write_verdict(folder, "r1", "a", "r", sons_a)
    write_verdict(folder, "r1", "b", "r", sons_b)
    # n2 is split: judge c settles it, before judge a has judged again.
    assert bench.check(folder) == ["r1-again/a2/r: missing", "r1-third/c/r: missing"]
    third = bench._read(folder / "targets" / "r1-third" / "r.json")
    assert [c["mbid"] for c in third["candidates"]] == ["n2"]
    write_verdict(folder, "r1-third", "c", "r", {"n2": "parente"})
    write_verdict(folder, "r1-again", "a2", "r", sons_a)
    assert bench.check(folder) == []

    # The report reads what the rounds froze, no delivery.
    shutil.rmtree(out)
    result = bench.write_report(folder)
    assert result["systems"]["ours"]["all"]["large"][0] == pytest.approx(1.0)
    assert result["systems"]["ours"]["all"]["strict"][0] == pytest.approx(0.5)
    assert result["systems"]["lastfm"]["all"]["foreign"][0] == pytest.approx(1.0)
    assert result["controls_good"] == pytest.approx(0.0)
    assert result["differences"]["lastfm"]["large"]["all"][0] == pytest.approx(-1.0)


def test_the_first_round_refuses_a_delivery_other_than_the_one_drawn_on(tmp_path, monkeypatch):
    out = delivered(tmp_path / "out")
    folder = tmp_path / "bench"
    monkeypatch.setattr(bench, "PER_STRATUM", 1)
    bench.take_sample(folder, out)
    answered(folder)
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    (out / "manifest.json").write_text(json.dumps({**manifest, "rebuilt": True}), encoding="utf-8")
    with pytest.raises(SystemExit, match="not the delivery"):
        bench.make_round(folder, out, "r1")


def test_a_first_round_cut_short_freezes_nothing_and_is_taken_again(tmp_path, monkeypatch):
    out = delivered(tmp_path / "out")
    folder = tmp_path / "bench"
    monkeypatch.setattr(bench, "PER_STRATUM", 1)
    bench.take_sample(folder, out)
    answered(folder)

    def fails(*_):
        raise duckdb.OutOfMemoryException("cut short")

    with monkeypatch.context() as m:
        m.setattr(bench, "draw_controls", fails)
        with pytest.raises(duckdb.OutOfMemoryException):
            bench.make_round(folder, out, "r1")
    assert not (folder / "runs").exists()
    assert bench.make_round(folder, out, "r1") == 4


def test_the_bench_refuses_a_delivery_its_manifest_does_not_vouch_for(tmp_path):
    out = delivered(tmp_path / "out")
    (out / "styles.parquet").write_bytes(b"cut short")
    with pytest.raises(ChecksumError):
        bench.open_delivery(out)


def test_a_changed_consigne_refuses_the_bench_drawn_under_the_old_one(tmp_path, monkeypatch):
    out = delivered(tmp_path / "out")
    folder = tmp_path / "bench"
    monkeypatch.setattr(bench, "PER_STRATUM", 1)
    bench.take_sample(folder, out)
    changed = tmp_path / "consigne.md"
    changed.write_text("autre consigne", encoding="utf-8")
    monkeypatch.setattr(bench, "CONSIGNE", changed)
    with pytest.raises(SystemExit, match="new version"):
        bench.references(folder)


def test_the_delivered_run_keeps_each_references_neighbours_in_rank_order():
    assert delivered_run(delivery(), ["r", "q"]) == {"r": ["n1", "n2"], "q": []}


def test_a_control_shares_no_style_with_its_reference_and_is_well_known():
    # p shares House with r; n1 has too few listeners; q is left.
    assert draw_controls(delivery(), ["r"], "s") == {"r": "q"}


def test_the_services_answers_become_mbids_only_on_explicit_links():
    lastfm: dict[str, list[dict[str, Any]]] = {
        "r": [
            {"name": "Air", "mbid": "n1"},
            {"name": "CASSIUS", "mbid": None},
            {"name": "Unknown", "mbid": "nope", "url": "https://last.fm/u"},
        ]
    }
    deezer = {"r": [{"name": "Deezer Pick", "deezer_id": "42"}], "q": None}
    runs, external = resolved_runs(delivery(), {"r": ["n1", "n2"]}, lastfm, deezer)
    # By MBID, by the name of a candidate of ours; an MBID MusicBrainz does not
    # know stays the service's answer, and so does a name of nobody pooled.
    assert runs["lastfm"]["r"] == ["n1", "n2", "lastfm:Unknown"]
    assert runs["deezer"] == {"r": ["dz"]}
    assert external == {
        "lastfm:Unknown": {
            "mbid": "lastfm:Unknown",
            "name": "Unknown",
            "urls": ["https://last.fm/u"],
        }
    }


def test_a_judge_starts_from_the_musicbrainz_page_then_its_links():
    info = describe(delivery(), ["dz", "q"])
    assert info["dz"]["urls"] == [
        "https://musicbrainz.org/artist/dz",
        "https://www.deezer.com/artist/42",
    ]
    assert info["q"]["urls"] == ["https://musicbrainz.org/artist/q"]
    assert info["q"]["disambiguation"] is None


def test_deezer_is_asked_only_for_a_reference_tied_to_one_deezer_artist(monkeypatch):
    asked: list[tuple[str, dict[str, str]]] = []
    answer = {"data": [{"name": "X", "id": 9, "link": "https://www.deezer.com/artist/9"}]}

    def ask(url, params):
        asked.append((url, params))
        return answer

    monkeypatch.setattr(bench, "_ask", ask)
    out = bench.fetch_deezer(delivery(), [{"mbid": "r"}, {"mbid": "q"}])
    assert asked == [("https://api.deezer.com/artist/7/related", {"limit": "10"})]
    assert out == {
        "r": [{"name": "X", "deezer_id": "9", "url": "https://www.deezer.com/artist/9"}],
        "q": None,
    }


def lastfm_asked(monkeypatch, answers):
    asked: list[dict[str, str]] = []
    given = iter(answers)

    def ask(url, params):
        assert url == bench.LASTFM_URL
        asked.append(params)
        return next(given)

    monkeypatch.setattr(bench, "_ask", ask)
    return asked


def test_lastfm_is_asked_by_name_when_it_does_not_know_the_mbid(monkeypatch):
    similar = {"similarartists": {"artist": [{"name": "Y", "url": "u"}]}}
    asked = lastfm_asked(monkeypatch, [{"error": 6}, similar])
    out = bench.fetch_lastfm([{"mbid": "r", "name": "Ref"}], key="k", unique={"r"})
    assert asked[0]["mbid"] == "r"
    assert asked[1]["artist"] == "Ref"
    assert out == {"r": [{"name": "Y", "mbid": None, "url": "u"}]}


def test_lastfm_is_not_asked_by_a_name_other_artists_bear(monkeypatch):
    asked = lastfm_asked(monkeypatch, [{"error": 6}])
    out = bench.fetch_lastfm([{"mbid": "r", "name": "Nova"}], key="k", unique=set())
    assert len(asked) == 1
    assert out == {"r": []}


def test_a_unique_name_is_one_no_other_artist_bears():
    con = delivery()
    con.execute("INSERT INTO artists (mbid, name, name_key) VALUES ('r2', 'REF', 'ref')")
    assert bench.unique_names(con, ["r", "q"]) == {"q"}


def test_a_service_refusing_one_reference_answers_an_error(monkeypatch):
    def refuse(url, *_):
        raise urllib.error.HTTPError(url, 404, "Not Found", Message(), None)

    monkeypatch.setattr(bench, "get_json", refuse)
    monkeypatch.setattr(bench, "SERVICE_INTERVAL", 0)
    assert bench._ask(bench.LASTFM_URL, {}) == {"error": 404}
