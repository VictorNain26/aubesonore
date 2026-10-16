"""Outils sur les fichiers audio, partagés par l'acquisition, l'antenne et les mesures : ffprobe,
ffmpeg et rsgain, appelés avec un délai, et les balises écrites dans les fichiers d'antenne.

Points de coupe : ceux de l'AutoCue interne de Liquidsoap 2.4.5 (`autocue.liq`), calculés une
fois ici plutôt qu'à chaque passage, et écrits en balises `cue_in` et `cue_out` qu'AzuraCast lit
et retire de la durée du titre (`StationMedia::getCalculatedLength`, 0.23.8).
"""

import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

# Seuils de l'AutoCue de Liquidsoap 2.4.5 (`settings.autocue.internal.cue_in_threshold` et
# `cue_out_threshold`), relatifs à la sonie intégrée du titre, en dB.
CUE_IN_DB = -34.0
CUE_OUT_DB = -42.0
# Un appel ne porte que sur un fichier : quelques secondes. Ce délai n'arrête qu'un outil bloqué,
# qui sans lui gèlerait la passe jusqu'à son délai de 12 h.
TOOL_TIMEOUT_S = 300.0


class ToolError(Exception):
    """ffprobe, fpcalc, ffmpeg ou rsgain a échoué sur un fichier."""


def run_tool(args: list[str]) -> str:
    try:
        r = subprocess.run(
            args, capture_output=True, text=True, check=False, timeout=TOOL_TIMEOUT_S
        )
    except subprocess.TimeoutExpired:
        # subprocess.run tue l'outil et l'attend avant de relancer l'exception.
        raise ToolError(f"{Path(args[0]).name} : délai de {TOOL_TIMEOUT_S:.0f} s dépassé") from None
    if r.returncode != 0:
        raise ToolError(f"{Path(args[0]).name} : code {r.returncode}")
    return r.stdout


@dataclass(frozen=True)
class Probe:
    codec: str
    duration_s: float
    # Débit du flux audio seul, sans la pochette intégrée ; ffprobe ne le donne pas pour un FLAC.
    kbps: int | None


def probe(path: Path) -> Probe:
    out = json.loads(
        run_tool(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=codec_name,bit_rate:format=duration",
                "-of",
                "json",
                str(path),
            ]
        )
    )
    stream = (out.get("streams") or [{}])[0]
    fmt = out.get("format", {})
    rate = stream.get("bit_rate")
    return Probe(
        codec=str(stream.get("codec_name", "")),
        duration_s=float(fmt.get("duration", 0.0)),
        kbps=int(rate) // 1000 if rate else None,
    )


@dataclass(frozen=True)
class Cue:
    """Début et fin du son, en secondes depuis le début du fichier."""

    cue_in: float
    cue_out: float


def cue_points(path: Path) -> Cue | None:
    """Comme l'AutoCue de Liquidsoap : sonie momentanée EBU R128 par trame de 100 ms (filtre
    `ebur128` de ffmpeg), puis `cue_from_frames`. None si aucune trame n'atteint les seuils."""
    out = run_tool(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostats",
            "-i",
            str(path),
            "-map",
            "0:a:0",
            "-af",
            "ebur128=metadata=1,ametadata=mode=print:file=/dev/stdout",
            "-f",
            "null",
            "-",
        ]
    )
    frames: list[tuple[float, float, float]] = []  # (début, momentanée, intégrée)
    for line in out.splitlines():
        if line.startswith("frame:"):
            frames.append((float(line.rsplit("pts_time:", 1)[1]), math.nan, math.nan))
        elif frames and line.startswith("lavfi.r128.M="):
            frames[-1] = (frames[-1][0], float(line.split("=", 1)[1]), frames[-1][2])
        elif frames and line.startswith("lavfi.r128.I="):
            frames[-1] = (frames[-1][0], frames[-1][1], float(line.split("=", 1)[1]))
    if len(frames) < 2:
        return None
    return cue_from_frames(frames, probe(path).duration_s)


def cue_from_frames(frames: list[tuple[float, float, float]], duration_s: float) -> Cue | None:
    """Trames (début, sonie momentanée, sonie intégrée) : le son commence à la trame qui précède
    la première au-dessus de la sonie intégrée + `CUE_IN_DB`, et finit à la trame qui suit la
    dernière au-dessus de la sonie intégrée + `CUE_OUT_DB`."""
    # Liquidsoap lit la sonie intégrée sur l'avant-dernière trame, la dernière étant incomplète.
    lufs = frames[-2][2]
    loud_in = [i for i, f in enumerate(frames) if f[1] > lufs + CUE_IN_DB]
    loud_out = [i for i, f in enumerate(frames) if f[1] > lufs + CUE_OUT_DB]
    if not loud_in or not loud_out:
        return None
    first, last = loud_in[0], loud_out[-1]
    # Début : la règle finale de Liquidsoap, 0,1 s de marge puis 0,2 s de fondu d'entrée, une
    # coupe de 0,2 s au plus ignorée. Fin : sans son raccourci des fins douces (`max_overlap`),
    # qui sert son propre fondu ; ici on ne retire que le silence.
    cue_in = (frames[first - 1][0] if first > 0 else 0.0) - 0.1
    if cue_in > 0.2:
        cue_in -= 0.2
    cue_out = frames[last + 1][0] if last + 1 < len(frames) else duration_s
    return Cue(cue_in if cue_in > 0.2 else 0.0, cue_out)


def cue_of(path: Path) -> Cue | None:
    """Les points de coupe écrits dans les balises du fichier, s'il en a."""
    tags = _format_tags(path)
    if "cue_in" not in tags or "cue_out" not in tags:
        return None
    return Cue(float(tags["cue_in"]), float(tags["cue_out"]))


def _cue_metadata(cue: Cue) -> list[str]:
    return ["-metadata", f"cue_in={cue.cue_in:.3f}", "-metadata", f"cue_out={cue.cue_out:.3f}"]


@dataclass(frozen=True)
class Tags:
    artist: str
    title: str
    deezer_id: int
    album: str
    cover: bytes | None
    # Écrit en trame TSRC : AzuraCast la lit (getID3) dans le champ `isrc` du média, que le
    # site lit dans le titre en cours (docs/vision.md racine, §4.4).
    isrc: str | None = None


def prepare(src: Path, dest: Path, codec: str, tags: Tags, rsgain: Path) -> None:
    """Tout sauf le MP3 passe en MP3 V0 ; un MP3 n'est jamais réencodé. Balises remplacées,
    points de coupe et pochette intégrée (ffmpeg-formats, muxer mp3), ReplayGain posé."""
    cue = cue_points(src)
    audio = (
        ["-af", "aresample=resampler=soxr:osr=44100", "-c:a", "libmp3lame", "-q:a", "0"]
        if codec != "mp3"
        else ["-c:a", "copy"]
    )
    tmp = dest.with_name(f".{dest.name}")
    cover = dest.with_name(f".{dest.stem}.jpg")
    inputs, maps = ["-i", str(src)], ["-map", "0:a:0"]
    if tags.cover is not None:
        cover.write_bytes(tags.cover)
        inputs += ["-i", str(cover)]
        maps += [
            "-map",
            "1:0",
            "-c:v",
            "copy",
            "-metadata:s:v",
            "title=Album cover",
            "-metadata:s:v",
            "comment=Cover (front)",
        ]
    try:
        run_tool(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                *inputs,
                *maps,
                *audio,
                "-map_metadata",
                "-1",
                "-id3v2_version",
                "3",
                "-metadata",
                f"artist={tags.artist}",
                "-metadata",
                f"title={tags.title}",
                "-metadata",
                f"album={tags.album}",
                "-metadata",
                f"comment=deezer:{tags.deezer_id}",
                *(["-metadata", f"TSRC={tags.isrc}"] if tags.isrc else []),
                *(_cue_metadata(cue) if cue is not None else []),
                "-f",
                "mp3",
                str(tmp),
            ]
        )
        run_tool([str(rsgain), "custom", "-s", "i", "-c", "p", str(tmp)])
        tmp.replace(dest)
    finally:
        cover.unlink(missing_ok=True)
        tmp.unlink(missing_ok=True)


def _format_tags(path: Path) -> dict[str, str]:
    out = json.loads(
        run_tool(
            ["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", str(path)]
        )
    )
    return {k.lower(): str(v) for k, v in out.get("format", {}).get("tags", {}).items()}
