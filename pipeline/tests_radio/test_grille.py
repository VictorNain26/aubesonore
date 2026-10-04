import json
import sqlite3
from collections.abc import Iterable
from datetime import date
from pathlib import Path

import numpy as np
import pytest
import responses
from typer.testing import CliRunner

import radio.cli as cli
from radio.antenna.grille import (
    Titre,
    bloc,
    load_titres,
    m3u,
    plan_day,
    playlist_name,
    publish,
    record,
    shares,
    slot_sequence,
    with_published,
)
from radio.core.config import Categorie, Creneau, GrilleConfig, Settings
from radio.core.db import connect
from radio.core.report import last_stages
from radio.sources.azuracast import AzuracastClient
from tests_radio.model_factory import make_model_db

FRIDAY = date(2026, 10, 2)
SATURDAY = date(2026, 10, 3)
MIDNIGHT = 1_790_892_000.0  # 2026-10-02 00:00, Europe/Paris
ENTERED = "2026-10-01T00:00:00+02:00"


def _titre(tid: int, categorie: Categorie, q: float, artist: int | None = None) -> Titre:
    v = np.full(3, q)
    return Titre(
        tid, artist or tid, categorie, f"antenne/{tid}.mp3", f"s{tid}", v, v, v, True, MIDNIGHT
    )


def _grille(**stocks: int) -> GrilleConfig:
    """Grille aux parts d'origine, dont chaque stock vaut celui demandé (100 par défaut)."""
    parts: dict[Categorie, float] = {
        "nouveautes": 1 / 3,
        "decouvertes": 1 / 3,
        "fond": 1 / 6,
        "reperes": 1 / 6,
    }
    return GrilleConfig(
        categories={
            c: Creneau(part=p, passages=p * 14.6 * 168 / stocks.get(c, 100))
            for c, p in parts.items()
        }
    )


def test_blocks_of_the_day_and_the_weekend_party() -> None:
    assert [bloc(1, h) for h in (3, 4, 6, 12, 20, 23)] == [
        "nuit",
        "fin_de_nuit",
        "matin",
        "apres_midi",
        "soir",
        "nuit",
    ]
    assert bloc(5, 20) == bloc(5, 23) == bloc(6, 2) == bloc(6, 21) == bloc(7, 2) == "fete"
    assert (bloc(6, 3), bloc(6, 4), bloc(6, 5), bloc(7, 4), bloc(1, 2)) == (
        "nuit",
        "nuit",
        "fin_de_nuit",
        "nuit",
        "nuit",
    )
    assert playlist_name(5, 9) == "Grille ven 09h"


def test_slots_follow_the_shares_evenly() -> None:
    seq = slot_sequence(
        {"nouveautes": 1 / 3, "decouvertes": 1 / 3, "fond": 1 / 6, "reperes": 1 / 6}, 12
    )
    assert seq.count("nouveautes") == seq.count("decouvertes") == 4
    assert seq.count("fond") == seq.count("reperes") == 2
    assert "fond" in seq[:6] and "reperes" in seq[:6]  # réparties, pas regroupées en fin


def test_a_category_short_of_its_stock_gives_its_share_away() -> None:
    titres = [_titre(i, "decouvertes", 0.5) for i in range(100)]
    titres += [_titre(1000 + i, "reperes", 0.5) for i in range(25)]
    s = shares(titres, _grille())
    # Découvertes pleines (1/3), repères au quart (1/6 x 1/4), le reste vide.
    assert abs(s["decouvertes"] - (1 / 3) / (1 / 3 + 1 / 24)) < 1e-9
    assert s["nouveautes"] == s["fond"] == 0


def test_the_least_recently_played_pass_and_each_artist_once_a_day() -> None:
    titres = [_titre(i, "decouvertes", 0.5, artist=i // 2) for i in range(40)]
    played = {f"s{i}": 1000.0 + i for i in range(40)}
    played["s39"] = 0.0  # le plus ancien passage
    plan = plan_day(titres, played, _grille(decouvertes=40), FRIDAY, [8], MIDNIGHT)
    chosen = plan.hours[8]
    assert len(chosen) == 16  # ceil(14,6) + 1 créneaux
    assert 39 in {t.tid for t in chosen}
    assert len({t.artist for t in chosen}) == len(chosen)


def test_each_title_goes_to_the_hour_that_resembles_it_and_the_hour_drifts() -> None:
    calm = [_titre(i, "decouvertes", 0.1 + i / 1000) for i in range(16)]
    lively = [_titre(100 + i, "decouvertes", 0.9 - i / 1000) for i in range(16)]
    plan = plan_day(calm + lively, {}, _grille(decouvertes=32), FRIDAY, [3, 21], MIDNIGHT)
    assert {t.tid for t in plan.hours[3]} == {t.tid for t in calm}  # nuit
    assert {t.tid for t in plan.hours[21]} == {t.tid for t in lively}  # fête du vendredi
    # La nuit part de sa cible (0,25) : le plus proche d'abord, puis chaque fois le plus proche.
    order = [round(float(t.q[0]), 3) for t in plan.hours[3]]
    assert order == sorted(order, reverse=True)


def test_an_artist_waits_three_hours_and_a_title_goes_back_in_rotation() -> None:
    # 20 titres d'artistes distincts pour 16 créneaux par heure.
    titres = [_titre(i, "decouvertes", 0.5) for i in range(20)]
    hours = [8, 9, 10, 11, 12]
    plan = plan_day(titres, {}, _grille(decouvertes=20), FRIDAY, hours, MIDNIGHT)
    eight, nine, ten, eleven, noon = ({t.artist for t in plan.hours[h]} for h in hours)
    assert len(eight) == 16 and len(nine) == 4 and not eight & nine  # 4 artistes libres à 9 h
    # L'heure est réordonnée : placé à 8 h, un artiste peut passer jusqu'à 9 h, et revient à
    # 12 h au plus tôt ; ceux de 9 h, à 13 h.
    assert not ten and not eleven
    assert noon and noon <= eight


def test_a_title_rests_whatever_its_mood() -> None:
    # Le titre le plus proche de la cible vient de passer : moins de 60 % d'un tour de repos. La
    # fenêtre de recherche couvre toute la catégorie : seule la règle de repos peut l'écarter.
    near = _titre(0, "decouvertes", 0.25)  # cible de la nuit
    others = [_titre(i, "decouvertes", 0.9, artist=1000 + i) for i in range(1, 200)]
    # Joué 4 h avant l'heure de 1 h : la séparation d'artiste (3 h) le permet, pas le repos. Les
    # autres ont joué 21 h avant : moins de deux tours, aucun passage forcé ne le masque.
    played = {f"s{i}": MIDNIGHT - 20 * 3600 for i in range(1, 200)} | {"s0": MIDNIGHT - 3 * 3600}
    grille = _grille(decouvertes=200).model_copy(update={"marge": 2.0})
    plan = plan_day([near, *others], played, grille, FRIDAY, [1], MIDNIGHT)
    # Tour : 200 titres pour 16 x 24 créneaux, ~12,5 h ; repos minimum ~7,5 h.
    assert 0 not in {t.tid for t in plan.hours[1]}


def test_a_starved_title_plays_whatever_its_mood_and_ahead_of_closer_ones() -> None:
    # 100 titres pour 384 créneaux par jour : un tour dure 6,25 h, le repos 3,75 h. Les titres
    # proches de la cible sont reposés (7 h) ; le titre loin n'a pas joué depuis 13 h, plus de
    # deux tours : il passe d'office dans l'heure, devant eux.
    far = _titre(0, "decouvertes", 1.0)
    close = [_titre(i, "decouvertes", 0.25) for i in range(1, 100)]
    played = {f"s{i}": MIDNIGHT - 7 * 3600 for i in range(1, 100)} | {"s0": MIDNIGHT - 13 * 3600}
    plan = plan_day([far, *close], played, _grille(decouvertes=100), FRIDAY, [0], MIDNIGHT)
    assert 0 in {t.tid for t in plan.hours[0]}
    assert plan.late == 1


def test_rotation_wins_over_mood_for_a_title_far_from_every_hour() -> None:
    # 32 titres à 0,5 pour 16 créneaux par heure, et un titre extrême, loin de toute cible.
    titres = [_titre(i, "decouvertes", 0.5) for i in range(32)]
    odd = Titre(
        99,
        99,
        "decouvertes",
        "antenne/99.mp3",
        "s99",
        np.array([1.0, 0.0, 0.0]),
        np.zeros(3),
        np.zeros(3),
        True,
        MIDNIGHT,
    )
    played = {f"s{i}": MIDNIGHT - 3600 for i in range(32)} | {"s99": MIDNIGHT - 3 * 86400}
    plan = plan_day([*titres, odd], played, _grille(decouvertes=33), FRIDAY, [8, 9], MIDNIGHT)
    assert 99 in {t.tid for h in (8, 9) for t in plan.hours[h]}
    assert plan.late == 1  # 3 jours sans passer, pour un tour de 2 h (33 titres, 384 créneaux)


def test_an_artist_heard_late_yesterday_waits_three_hours_after_midnight() -> None:
    # Breaks if the separation ignores the history. Artist 7 heads the rotation (titles 1 to 9,
    # never played) and was heard at 23:00 the day before: not before 2:00.
    titres = [_titre(i, "decouvertes", 0.5, artist=7 if i < 10 else 1000 + i) for i in range(400)]
    played = {"s0": MIDNIGHT - 3600}
    plan = plan_day(titres, played, _grille(decouvertes=400), FRIDAY, [0, 1, 2], MIDNIGHT)
    assert 7 not in {t.artist for h in (0, 1) for t in plan.hours[h]}
    assert 7 in {t.artist for t in plan.hours[2]}


def test_the_hour_published_but_not_yet_played_counts_for_the_next_day(tmp_path: Path) -> None:
    # Breaks if the grid written at 23:00 ignores its own hour of 23 h, not yet in the history.
    conn = make_model_db(tmp_path)
    titres = [_titre(i, "decouvertes", 0.5) for i in range(400)]
    grille = _grille(decouvertes=400)
    today = plan_day(titres, {}, grille, FRIDAY, [23], MIDNIGHT)
    record(conn, today, MIDNIGHT)
    late = {t.artist for t in today.hours[23]}

    played = with_published(conn, {}, MIDNIGHT + 23 * 3600, MIDNIGHT + 86400, range(24))
    tomorrow = plan_day(titres, played, grille, SATURDAY, [0, 1, 2, 3], MIDNIGHT + 86400)

    assert not late & {t.artist for h in (0, 1, 2) for t in tomorrow.hours[h]}
    assert set(played) == {t.song_id for t in today.hours[23]}


def test_the_sunday_pass_frees_the_hours_it_rewrites(tmp_path: Path) -> None:
    # Breaks if the hours the plan rewrites still count as published: on 2026-10-04 the pass of
    # 06:38 kept every title and artist of the night's grid for 7 h-23 h, and from noon each hour
    # had 4 to 6 titles out of 16, the rest played by the fallback.
    conn = make_model_db(tmp_path)
    titres = [_titre(i, "decouvertes", 0.5) for i in range(400)]
    grille = _grille(decouvertes=400)
    night = plan_day(titres, {}, grille, FRIDAY, list(range(24)), MIDNIGHT)
    record(conn, night, MIDNIGHT)
    history = {t.song_id: MIDNIGHT + h * 3600 + 1800 for h in range(6) for t in night.hours[h]}
    now, rest = MIDNIGHT + 6.5 * 3600, list(range(7, 24))

    played = with_published(conn, history, now, MIDNIGHT, rest)
    plan = plan_day(titres, played, grille, FRIDAY, rest, MIDNIGHT)

    assert plan.empty_slots == 0 and all(len(plan.hours[h]) == 16 for h in rest)
    # L'heure en cours, publiée et pas réécrite, compte toujours.
    assert all(played[t.song_id] == MIDNIGHT + 7 * 3600 for t in night.hours[6])
    # Le même plan, quand les heures réécrites comptent, laisse le secours jouer.
    stale = with_published(conn, history, now, MIDNIGHT, [])
    assert plan_day(titres, stale, grille, FRIDAY, rest, MIDNIGHT).empty_slots > 0


def test_a_published_hour_counts_until_it_ends_unless_the_plan_rewrites_it(
    tmp_path: Path,
) -> None:
    # The grid of tomorrow written by hand at 15:30: today's hours from 15 h still play, an hour
    # gone by no longer counts, and tomorrow's hours already published are rewritten.
    conn = make_model_db(tmp_path)
    rows = [(14, "past"), (15, "now"), (20, "tonight"), (24 + 3, "tomorrow")]
    published = [(MIDNIGHT + h * 3600, song) for h, song in rows]
    conn.executemany("INSERT INTO grille VALUES (?, ?)", published)
    conn.commit()
    played = with_published(conn, {}, MIDNIGHT + 15.5 * 3600, MIDNIGHT + 86400, range(24))
    assert played == {"now": MIDNIGHT + 16 * 3600, "tonight": MIDNIGHT + 21 * 3600}


def test_missing_titles_leave_empty_slots() -> None:
    titres = [_titre(i, "decouvertes", 0.5) for i in range(10)]
    plan = plan_day(titres, {}, _grille(decouvertes=10), FRIDAY, [8], MIDNIGHT)
    assert len(plan.hours[8]) == 10 and plan.empty_slots == 6


def test_titles_on_air_are_read_with_their_measures_as_quantiles(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    for i, tid in enumerate((200000, 200001, 200002)):
        conn.execute(
            "INSERT INTO antenne VALUES (?, 'decouverte', 'decouvertes', ?, ?, ?, ?, ?)",
            (tid, tid, f"s{tid}", f"antenne/{tid}.mp3", ENTERED, ENTERED),
        )
        if i < 2:
            values = [float(i + 1)] * 12
            conn.execute(
                "INSERT INTO track_features VALUES (?, 'ok', 'm', 'd', 200, "
                + ", ".join("?" * 12)
                + ")",
                (tid, *values),
            )
    conn.execute(
        "INSERT INTO antenne VALUES (200003, 'decouverte', 'repos', 9, 's9', 'repos/9.mp3', ?, ?)",
        (ENTERED, ENTERED),
    )
    conn.commit()
    titres = {t.tid: t for t in load_titres(conn)}
    assert set(titres) == {200000, 200001, 200002}  # le repos est hors antenne
    assert list(titres[200000].q) == [0.5, 0.5, 0.5] and list(titres[200001].q) == [1, 1, 1]
    assert not titres[200002].measured and list(titres[200002].q_end) == [0.5, 0.5, 0.5]
    assert titres[200000].since == MIDNIGHT - 86400


class FakeStation:
    def __init__(self, found: dict[str, int] | None = None) -> None:
        self.existing = {"Grille ven 08h": 7}
        self.created: list[tuple[str, int, int]] = []
        self.filled: dict[int, str] = {}
        self.found = found or {}

    def playlists(self) -> dict[str, int]:
        return dict(self.existing)

    def create_hour_playlist(self, name: str, day: int, hour: int) -> int:
        self.created.append((name, day, hour))
        return 100 + hour

    def fill_playlist(self, playlist_id: int, m3u_text: str) -> int:
        self.filled[playlist_id] = m3u_text
        return self.found.get(str(playlist_id), m3u_text.count("\n") - 1)


def test_publish_writes_each_hour_into_its_playlist() -> None:
    titres = [_titre(i, "decouvertes", 0.5) for i in range(32)]
    plan = plan_day(titres, {}, _grille(decouvertes=32), FRIDAY, [8, 9], MIDNIGHT)
    station = FakeStation(found={"109": 3})
    errors = publish(plan, station)
    assert station.created == [("Grille ven 09h", 5, 9)]
    assert station.filled[7] == m3u(plan.hours[8])
    assert station.filled[7].startswith("#EXTM3U\nantenne/")
    assert errors == ["Grille ven 09h : 3 titres retrouvés sur 16"]


API = "http://127.0.0.1:8080/api/station/1"


@responses.activate
def test_client_hour_playlists_history_and_import() -> None:
    responses.get(
        API + "/history",
        json=[
            {"played_at": 10, "song": {"id": "a"}},
            {"played_at": 30, "song": {"id": "a"}},
            {"played_at": 20, "song": {"id": "b"}},
        ],
    )
    responses.get(API + "/playlists", json=[{"id": 10, "name": "AubeSonore"}])
    responses.post(API + "/playlists", json={"id": 11})
    responses.delete(API + "/playlist/11/empty", json={"success": True})
    responses.post(
        API + "/playlist/11/import",
        json={
            "success": True,
            "import_results": [{"path": "a", "match": "a"}, {"path": "b", "match": None}],
        },
    )
    responses.get("http://127.0.0.1:8080/api/station/1", json={"timezone": "Europe/Paris"})
    c = AzuracastClient("http://127.0.0.1:8080", "k")
    assert c.last_played("2026-10-01", "2026-10-02") == {"a": 30.0, "b": 20.0}
    assert responses.calls[0].request.params == {"start": "2026-10-01", "end": "2026-10-02"}
    assert c.playlists() == {"AubeSonore": 10}
    assert c.create_hour_playlist("Grille ven 23h", 5, 23) == 11
    body = json.loads(responses.calls[2].request.body)
    assert body["order"] == "sequential" and body["avoid_duplicates"] is False
    assert body["schedule_items"] == [
        {
            "start_time": 2300,
            "end_time": 0,
            "start_date": None,
            "end_date": None,
            "days": [5],
            "loop_once": True,
        }
    ]
    assert c.fill_playlist(11, "#EXTM3U\na\nb\n") == 1
    assert b"playlist_file" in responses.calls[4].request.body
    assert c.timezone() == "Europe/Paris"


@responses.activate
def test_client_reads_when_each_queued_title_will_play() -> None:
    responses.get(
        API + "/queue",
        json=[
            {"song": {"id": "a"}, "cued_at": 100, "played_at": 400},
            {"song": {"id": "b"}, "cued_at": 200, "played_at": None},  # pas encore estimé
        ],
    )
    c = AzuracastClient("http://127.0.0.1:8080", "k")
    assert c.queued() == {"a": 400.0, "b": 200.0}


class FakeAzuracast(FakeStation):
    def __init__(self) -> None:
        super().__init__()
        self.queue: dict[str, float] = {}

    def timezone(self) -> str:
        return "Europe/Paris"

    def last_played(self, start: str, end: str) -> dict[str, float]:
        return {"s2": 50.0}

    def queued(self) -> dict[str, float]:
        return self.queue


@pytest.fixture
def grille_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> FakeAzuracast:
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "editorial.toml").write_text("")
    settings = Settings(
        _env_file=None,
        plex_token="tok",
        plex_music_section="Musique",
        azuracast_api_key="k",
        RADIO_DATA_DIR=tmp_path / "data",
        RADIO_CONFIG_DIR=cfg,
    )
    monkeypatch.setattr(cli, "_settings", lambda: settings)
    station = FakeAzuracast()
    monkeypatch.setattr(cli, "AzuracastClient", lambda *a: station)
    return station


def _on_air(tmp_path: Path, n: int) -> None:
    with connect(tmp_path / "data" / "radio.db") as conn:
        conn.executemany(
            "INSERT INTO antenne VALUES (?, 'decouverte', 'decouvertes', ?, ?, ?, ?, ?)",
            [(i, i, f"s{i}", f"antenne/{i}.mp3", ENTERED, ENTERED) for i in range(1, n + 1)],
        )


def test_grille_command_writes_a_full_day(tmp_path: Path, grille_env: FakeAzuracast) -> None:
    _on_air(tmp_path, 400)
    res = CliRunner().invoke(cli.app, ["grille"])
    assert res.exit_code == 0, res.output
    assert "créneaux vides : 0" in res.stdout
    assert len(grille_env.filled) == 24


def test_an_empty_slot_is_published_then_fails_the_grid(
    tmp_path: Path, grille_env: FakeAzuracast
) -> None:
    # Breaks if an empty slot passes in silence: it eats the hour's margin of one title, beyond
    # which the fallback plays (vision §1), and only a failed command makes Gatus alert.
    _on_air(tmp_path, 10)
    res = CliRunner().invoke(cli.app, ["grille"])
    assert res.exit_code == 1
    assert len(grille_env.filled) == 24  # la grille publiée est gardée
    with connect(tmp_path / "data" / "radio.db") as conn:
        stages = [s for s in last_stages(conn) if s[0] == "grille"]
        n_rows = conn.execute("SELECT COUNT(*) FROM stage_reports").fetchone()[0]
    assert n_rows == 1 and not stages[0][2]
    empty = stages[0][3]["créneaux vides"]
    assert isinstance(empty, int) and empty > 0
    assert f"{empty} créneaux vides : le secours peut jouer" in res.output


def test_the_grid_counts_what_azuracast_has_already_queued(
    tmp_path: Path, grille_env: FakeAzuracast, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Breaks if the queue is ignored: AzuraCast queues ~20 min ahead, and a title already handed
    # to Liquidsoap plays even when its hour is rewritten; placed again, it would play twice.
    _on_air(tmp_path, 400)
    grille_env.queue = {"s1": 1_791_130_000.0}
    seen: list[dict[str, float]] = []
    real = cli.grille_mod.with_published

    def spy(
        conn: sqlite3.Connection,
        played: dict[str, float],
        now: float,
        midnight: float,
        hours: Iterable[int],
    ) -> dict[str, float]:
        seen.append(played)
        return real(conn, played, now, midnight, hours)

    monkeypatch.setattr(cli.grille_mod, "with_published", spy)
    res = CliRunner().invoke(cli.app, ["grille"])
    assert res.exit_code == 0, res.output
    assert seen == [{"s2": 50.0, "s1": 1_791_130_000.0}]
