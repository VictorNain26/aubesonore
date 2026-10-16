"""Preuve d'identité d'un fichier téléchargé (docs/vision.md §5) : format, durée et débit, puis
empreintes Chromaprint brutes (`fpcalc -raw`) du fichier et de l'extrait Deezer, part de bits
identiques au meilleur décalage. Méthode et seuil mesurés :
docs/recherches/2026-09-30-acquisition-publication-observabilite.md §2.
"""

import json
from pathlib import Path

import numpy as np
import numpy.typing as npt
from numpy.lib.stride_tricks import sliding_window_view

from radio.core.config import AcquisitionConfig
from radio.core.media import Probe, run_tool

Fingerprint = npt.NDArray[np.uint32]
# Fondus d'entrée et de sortie de l'extrait Deezer, écartés de la comparaison.
_FADE_FRAMES = 16


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
    out = json.loads(run_tool(["fpcalc", "-raw", "-json", "-length", "0", str(path)]))
    return np.array(out["fingerprint"], dtype=np.int64).astype(np.uint32)


def similarity(file_fp: Fingerprint, preview_fp: Fingerprint) -> float:
    """Meilleure part de bits identiques, sur les décalages où l'extrait tient dans le fichier."""
    core = preview_fp[_FADE_FRAMES:-_FADE_FRAMES]
    if len(core) == 0 or len(file_fp) < len(core):
        return 0.0
    windows = sliding_window_view(file_fp, len(core))
    errors = np.bitwise_count(windows ^ core).sum(axis=1)
    return float(1 - errors.min() / (32 * len(core)))
