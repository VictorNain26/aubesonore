import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from radio.acquire.audio import (
    Cue,
    Probe,
    Tags,
    ToolError,
    check,
    cue_of,
    cue_points,
    fingerprint,
    isrc_of,
    prepare,
    probe,
    similarity,
    with_cue,
)
from radio.core.config import AcquisitionConfig

CFG = AcquisitionConfig()
TOOLS = all(shutil.which(t) for t in ("ffmpeg", "ffprobe", "fpcalc", "rsgain"))


def test_similarity_finds_the_excerpt_at_its_offset() -> None:
    rng = np.random.default_rng(0)
    full = rng.integers(0, 2**32, size=400, dtype=np.uint64).astype(np.uint32)
    excerpt = full[100:160].copy()
    assert similarity(full, excerpt) == 1.0
    other = rng.integers(0, 2**32, size=60, dtype=np.uint64).astype(np.uint32)
    assert 0.4 < similarity(full, other) < 0.6
    assert similarity(full[:20], excerpt) == 0.0  # l'extrait ne tient pas dans le fichier


def test_check_reasons() -> None:
    assert check(Probe("mp3", 200.0, 320), 201, CFG) is None
    assert check(Probe("flac", 200.0, 900), 203, CFG) is None
    assert check(Probe("mp3", 200.0, 320), 204, CFG) == "durée"
    assert check(Probe("mp3", 200.0, 128), 200, CFG) == "débit"
    assert check(Probe("aac", 200.0, 256), 200, CFG) == "format aac"
    assert check(Probe("flac", 200.0, None), 200, CFG) is None
    assert check(Probe("mp3", 200.0, None), 200, CFG) == "débit"


def _melody(path: Path, seed: int) -> None:
    """Une note tirée au hasard par quart de seconde : Chromaprint lit les hauteurs de notes, un
    bruit stationnaire donnerait des empreintes presque identiques d'un tirage à l'autre."""
    note = f"floor(12*(sin(floor(t*4)*{seed}7.13)*0.5+0.5))"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc=sin(2*PI*t*220*pow(2\\,{note}/12)):s=44100:d=60",
            "-ac",
            "2",
            str(path),
        ],
        check=True,
    )


@pytest.mark.skipif(not TOOLS, reason="ffmpeg, fpcalc et rsgain requis")
def test_real_tools_identity_and_preparation(tmp_path: Path) -> None:
    full, other = tmp_path / "full.flac", tmp_path / "other.flac"
    _melody(full, 1)
    _melody(other, 2)
    excerpt = tmp_path / "excerpt.mp3"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", "20", "-t", "30", "-i", str(full), str(excerpt)],
        check=True,
    )
    preview = fingerprint(excerpt)
    assert similarity(fingerprint(full), preview) >= CFG.identity_threshold
    assert similarity(fingerprint(other), preview) < CFG.identity_threshold

    p = probe(full)
    assert (p.codec, round(p.duration_s), p.kbps) == ("flac", 60, None)
    cover = tmp_path / "cover.jpg"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=64x64",
            "-frames:v",
            "1",
            str(cover),
        ],
        check=True,
    )
    rsgain = Path(str(shutil.which("rsgain")))
    dest = tmp_path / "123.mp3"
    tags_in = Tags("Artiste", "Titre", 123, "Album", cover.read_bytes(), "FRZ039800212")
    prepare(full, dest, p.codec, tags_in, rsgain)
    tags = _tags(dest)
    assert probe(dest).codec == "mp3"
    assert (tags["artist"], tags["title"], tags["album"], tags["comment"]) == (
        "Artiste",
        "Titre",
        "Album",
        "deezer:123",
    )
    assert "REPLAYGAIN_TRACK_GAIN" in {k.upper() for k in tags}
    assert isrc_of(dest) == "FRZ039800212"
    assert cue_of(dest) == cue_points(full)  # points de coupe du fichier source
    assert _pictures(dest) == 1  # la pochette survit à rsgain
    assert sorted(f.name for f in tmp_path.iterdir() if f.name.startswith(".")) == []

    bare = tmp_path / "124.mp3"
    prepare(dest, bare, "mp3", Tags("Artiste", "Titre", 124, "", None), rsgain)
    assert _pictures(bare) == 0
    assert isrc_of(bare) is None


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


@pytest.mark.skipif(not TOOLS, reason="ffmpeg requis")
def test_mp3_bitrate_ignores_an_embedded_cover(tmp_path: Path) -> None:
    low, covered, cover = tmp_path / "low.mp3", tmp_path / "covered.mp3", tmp_path / "c.png"
    _ffmpeg("-f", "lavfi", "-i", "anoisesrc=d=10", "-c:a", "libmp3lame", "-b:a", "128k", str(low))
    _ffmpeg(
        "-f",
        "lavfi",
        "-i",
        "nullsrc=s=1000x1000,geq=random(1)*255:128:128",
        "-frames:v",
        "1",
        str(cover),
    )
    _ffmpeg(
        "-i",
        str(low),
        "-i",
        str(cover),
        "-map",
        "0:a",
        "-map",
        "1:0",
        "-c",
        "copy",
        "-id3v2_version",
        "3",
        str(covered),
    )
    p = probe(covered)
    assert p.kbps == 128
    assert check(p, 10, CFG) == "débit"


@pytest.mark.skipif(not TOOLS, reason="ffmpeg requis")
def test_failed_preparation_leaves_no_temporary_file(tmp_path: Path) -> None:
    src = tmp_path / "src.flac"
    _melody(src, 1)
    with pytest.raises(ToolError):
        prepare(src, tmp_path / "1.mp3", "flac", Tags("A", "T", 1, "", b"jpeg"), Path("/bin/false"))
    assert sorted(f.name for f in tmp_path.iterdir()) == ["src.flac"]


def _tags(f: Path) -> dict[str, str]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", str(f)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return dict(json.loads(out)["format"]["tags"])


def _pictures(f: Path) -> int:
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=index:stream_disposition=attached_pic",
            "-of",
            "json",
            str(f),
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return sum(s["disposition"]["attached_pic"] for s in json.loads(out)["streams"])


def _sound(path: Path, *parts: tuple[float, float | None]) -> None:
    """Une suite de segments (durée, volume en dB ; None pour du silence numérique)."""
    inputs, labels = [], []
    for i, (seconds, db) in enumerate(parts):
        src = (
            f"anullsrc=r=44100:cl=mono:d={seconds}"
            if db is None
            else f"sine=f=440:r=44100:d={seconds},volume={db}dB"
        )
        inputs += ["-f", "lavfi", "-i", src]
        labels.append(f"[{i}]")
    _ffmpeg(
        *inputs,
        "-filter_complex",
        f"{''.join(labels)}concat=n={len(parts)}:v=0:a=1",
        str(path),
    )


@pytest.mark.skipif(not TOOLS, reason="ffmpeg requis")
def test_cue_points_cut_silence_as_liquidsoap_autocue_does(tmp_path: Path) -> None:
    # Liquidsoap 2.4.5 (autocue.internal), lancé dans le conteneur AzuraCast sur le même son en
    # MP3, a donné cue_in 0,6 : 0,9 (la trame qui précède le son), moins 0,1 et 0,2 s.
    wav = tmp_path / "s.wav"
    _sound(wav, (1, None), (5, -3), (3, None))
    cue = cue_points(wav)
    assert cue is not None
    assert round(cue.cue_in, 3) == 0.6 and 6.0 <= cue.cue_out <= 6.5


@pytest.mark.skipif(not TOOLS, reason="ffmpeg requis")
def test_a_quiet_ending_is_music_not_silence(tmp_path: Path) -> None:
    # 30 dB sous le reste : au-dessus du seuil de fin (- 42 dB sous la sonie intégrée), gardé.
    wav = tmp_path / "s.wav"
    _sound(wav, (5, -3), (2, -33), (2, None))
    cue = cue_points(wav)
    assert cue is not None and cue.cue_in == 0.0 and 6.9 <= cue.cue_out <= 7.5


@pytest.mark.skipif(not TOOLS, reason="ffmpeg requis")
def test_a_hiss_far_below_the_track_is_silence(tmp_path: Path) -> None:
    # Breaks if the thresholds are absolute: the fade of a record ends on a hiss, here 57 dB
    # under the music, below its integrated loudness - 42 dB, so cut.
    wav = tmp_path / "s.wav"
    _ffmpeg(
        "-f",
        "lavfi",
        "-i",
        "sine=f=440:r=44100:d=5,volume=-3dB",
        "-f",
        "lavfi",
        "-i",
        "anoisesrc=r=44100:d=3:c=pink:a=0.001",
        "-filter_complex",
        "[0][1]concat=n=2:v=0:a=1",
        str(wav),
    )
    cue = cue_points(wav)
    assert cue is not None and 5.0 <= cue.cue_out <= 5.6


@pytest.mark.skipif(not TOOLS, reason="ffmpeg requis")
def test_no_sound_gives_no_cue(tmp_path: Path) -> None:
    wav = tmp_path / "s.wav"
    _sound(wav, (3, None))
    assert cue_points(wav) is None


@pytest.mark.skipif(not TOOLS, reason="ffmpeg et rsgain requis")
def test_cue_tags_are_added_without_touching_anything_else(tmp_path: Path) -> None:
    src, dest = tmp_path / "a.mp3", tmp_path / "b.mp3"
    _ffmpeg(
        "-f",
        "lavfi",
        "-i",
        "sine=d=3",
        "-c:a",
        "libmp3lame",
        "-id3v2_version",
        "3",
        "-metadata",
        "TSRC=FRZ039800212",
        str(src),
    )
    subprocess.run([str(shutil.which("rsgain")), "custom", "-s", "i", "-q", str(src)], check=True)
    assert cue_of(src) is None
    with_cue(src, dest, Cue(0.5, 2.5))
    assert cue_of(dest) == Cue(0.5, 2.5)
    assert isrc_of(dest) == "FRZ039800212"
    before, after = _tags(src), _tags(dest)
    assert before["REPLAYGAIN_TRACK_GAIN"] == after["REPLAYGAIN_TRACK_GAIN"]
    assert probe(dest).duration_s == probe(src).duration_s
