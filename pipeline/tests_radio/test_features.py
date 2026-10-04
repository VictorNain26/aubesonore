import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from radio.acquire.audio import Cue
from radio.core.db import connect
from radio.signals.features import (
    MODELS,
    Features,
    ModelError,
    check_models,
    measure_antenna,
    summarize,
)

NOW = "2026-10-02T12:00:00+00:00"


def test_summary_of_the_whole_title_its_start_and_its_end() -> None:
    # 120 s : 40 patches de 3 s (10 au début, 10 à la fin) et 20 tempos de 6 s (5 et 5).
    dance = np.array([0.2] * 10 + [0.5] * 20 + [0.8] * 10, dtype=np.float32)
    arousal = np.array([3.0] * 10 + [5.0] * 20 + [7.0] * 10, dtype=np.float32)
    valence = np.full(40, 4.0, dtype=np.float32)
    bpm = np.array([90.2] * 4 + [150.0] + [120.0] * 10 + [128.0] * 5, dtype=np.float32)
    f = summarize(dance, valence, arousal, bpm, 120.0)
    assert f.duration_s == 120.0
    assert (f.danceability, f.danceability_start, f.danceability_end) == pytest.approx(
        (0.5, 0.2, 0.8)
    )
    assert (f.arousal, f.arousal_start, f.arousal_end) == pytest.approx((5.0, 3.0, 7.0))
    assert (f.valence, f.valence_start, f.valence_end) == pytest.approx((4.0, 4.0, 4.0))
    assert (f.bpm, f.bpm_start, f.bpm_end) == (120.0, 90.0, 128.0)


def test_octave_errors_at_the_edges_fold_back_to_the_title_tempo() -> None:
    # Forme mesurée le 2026-10-02 sur un vrai titre à 85 bpm : 85, 168, 84… au début.
    bpm = np.array([85, 168, 84, 170, 171] + [85] * 30, dtype=np.float32)
    flat = np.full(35, 0.5, dtype=np.float32)
    f = summarize(flat, flat, flat, bpm, 210.0)
    assert (f.bpm, f.bpm_start) == (85.0, 85.0)


def test_a_title_shorter_than_its_edges_keeps_one_value_each() -> None:
    one = np.array([0.4], dtype=np.float32)
    f = summarize(one, one, one, np.array([100.0], dtype=np.float32), 20.0)
    assert (f.danceability_start, f.danceability_end, f.bpm_end) == pytest.approx((0.4, 0.4, 100.0))


class FakeExtractor:
    def __init__(self, broken: set[str]) -> None:
        self.broken = broken
        self.seen: list[str] = []
        self.cues: dict[str, Cue | None] = {}

    def measure(self, path: Path, cue: Cue | None) -> Features | None:
        self.seen.append(path.name)
        self.cues[path.name] = cue
        if path.name in self.broken:
            return None
        return Features(200.0, *(0.5,) * 9, 120.0, 118.0, 122.0)


def _mp3(path: Path, *tags: str) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=d=1", "-c:a", "libmp3lame"]
        + [x for t in tags for x in ("-metadata", t)]
        + [str(path)],
        check=True,
    )


@pytest.mark.skipif(not (shutil.which("ffmpeg") and shutil.which("ffprobe")), reason="ffmpeg")
def test_titles_on_air_are_measured_once_and_missing_files_named(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    media = tmp_path / "media"
    (media / "antenne").mkdir(parents=True)
    (media / "repos").mkdir()
    # Le titre coupé est mesuré entre ses points de coupe.
    _mp3(media / "antenne" / "1.mp3", "cue_in=0.2", "cue_out=0.9")
    _mp3(media / "repos" / "2.mp3")
    # Le titre au repos est mesuré aussi : il reviendra au fond.
    conn.executemany(
        "INSERT INTO antenne VALUES (?, 'decouverte', ?, ?, ?, ?, 'd', 'd')",
        [
            (1, "decouvertes", 1, "s1", "antenne/1.mp3"),
            (2, "repos", 2, "s2", "repos/2.mp3"),
            (3, "nouveautes", 3, "s3", "antenne/3.mp3"),
        ],
    )
    conn.commit()
    fake = FakeExtractor({"2.mp3"})

    rep = measure_antenna(conn, media, fake, NOW)
    assert (rep.n_todo, rep.n_ok, rep.n_failed, rep.missing) == (3, 1, 1, ["antenne/3.mp3"])
    rows = {
        r[0]: (r[1], r[2])
        for r in conn.execute("SELECT deezer_track_id, status, bpm_end FROM track_features")
    }
    assert rows == {1: ("ok", 122.0), 2: ("audio_failed", None)}

    again = measure_antenna(conn, media, fake, NOW)
    assert (again.n_todo, again.missing) == (1, ["antenne/3.mp3"])  # seul l'absent est retenté
    assert fake.seen == ["1.mp3", "2.mp3"]
    assert fake.cues == {"1.mp3": Cue(0.2, 0.9), "2.mp3": None}


def test_models_are_pinned(tmp_path: Path) -> None:
    with pytest.raises(ModelError, match="absent"):
        check_models(tmp_path)
    for name in MODELS:
        (tmp_path / name).write_bytes(b"pas le modele officiel")
    with pytest.raises(ModelError, match="somme de contrôle"):
        check_models(tmp_path)
