"""Contrôle et préparation d'un fichier téléchargé (docs/vision.md §5.3, §6).

Identité : empreintes Chromaprint brutes (`fpcalc -raw`) du fichier et de l'extrait Deezer, part
de bits identiques au meilleur décalage. Méthode et seuil mesurés :
docs/recherches/2026-09-30-acquisition-publication-observabilite.md §2.

Points de coupe : ceux de l'AutoCue interne de Liquidsoap 2.4.5 (`autocue.liq`), calculés une
fois ici plutôt qu'à chaque passage, et écrits en balises `cue_in` et `cue_out` qu'AzuraCast lit
et retire de la durée du titre (`StationMedia::getCalculatedLength`, 0.23.8).
"""

import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import numpy.typing as npt
from numpy.lib.stride_tricks import sliding_window_view

from radio.core.config import AcquisitionConfig

Fingerprint = npt.NDArray[np.uint32]
# Fondus d'entrée et de sortie de l'extrait Deezer, écartés de la comparaison.
_FADE_FRAMES = 16
# Seuils de l'AutoCue de Liquidsoap 2.4.5 (`settings.autocue.internal.cue_in_threshold` et
# `cue_out_threshold`), relatifs à la sonie intégrée du titre, en dB.
CUE_IN_DB = -34.0
CUE_OUT_DB = -42.0


class ToolError(Exception):
    """ffprobe, fpcalc, ffmpeg ou rsgain a échoué sur un fichier."""


def _run(args: list[str]) -> str:
    r = subprocess.run(args, capture_output=True, text=True, check=False)
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
        _run(
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
    out = _run(
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


def check(p: Probe, expected_s: int, cfg: AcquisitionConfig) -> str | None:
    """Raison du refus, ou None."""
    if p.codec not in ("mp3", "flac"):
        return f"format {p.codec or 'inconnu'}"
    if abs(p.duration_s - expected_s) > 3:
        return "durée"
    if p.codec == "mp3" and (p.kbps is None or p.kbps < cfg.min_mp3_kbps):
        return "débit"
    return None


def fingerprint(path: Path) -> Fingerprint:
    out = json.loads(_run(["fpcalc", "-raw", "-json", "-length", "0", str(path)]))
    return np.array(out["fingerprint"], dtype=np.int64).astype(np.uint32)


def similarity(file_fp: Fingerprint, preview_fp: Fingerprint) -> float:
    """Meilleure part de bits identiques, sur les décalages où l'extrait tient dans le fichier."""
    core = preview_fp[_FADE_FRAMES:-_FADE_FRAMES]
    if len(core) == 0 or len(file_fp) < len(core):
        return 0.0
    windows = sliding_window_view(file_fp, len(core))
    errors = np.bitwise_count(windows ^ core).sum(axis=1)
    return float(1 - errors.min() / (32 * len(core)))


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
        _run(
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
        _run([str(rsgain), "custom", "-s", "i", "-c", "p", str(tmp)])
        tmp.replace(dest)
    finally:
        cover.unlink(missing_ok=True)
        tmp.unlink(missing_ok=True)


def _format_tags(path: Path) -> dict[str, str]:
    out = json.loads(
        _run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", str(path)])
    )
    return {k.lower(): str(v) for k, v in out.get("format", {}).get("tags", {}).items()}


def isrc_of(path: Path) -> str | None:
    return _format_tags(path).get("tsrc")


def with_isrc(src: Path, dest: Path, isrc: str) -> None:
    """Ajoute la trame TSRC à un MP3 déjà préparé : flux, pochette et autres balises copiés tels
    quels, ReplayGain compris."""
    _retag(src, dest, ["-metadata", f"TSRC={isrc}"])


def with_cue(src: Path, dest: Path, cue: Cue) -> None:
    """Ajoute les points de coupe à un MP3 déjà préparé, sans rien changer d'autre."""
    _retag(src, dest, _cue_metadata(cue))


def _retag(src: Path, dest: Path, metadata: list[str]) -> None:
    _run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(src),
            "-map",
            "0",
            "-c",
            "copy",
            "-map_metadata",
            "0",
            "-id3v2_version",
            "3",
            *metadata,
            "-f",
            "mp3",
            str(dest),
        ]
    )
