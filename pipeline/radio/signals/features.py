"""Mesures de chaque titre à l'antenne, pour l'enchaînement (docs/vision.md §7.3,
docs/recherches/2026-10-02-mesures-titres.md).

Chaîne officielle MTG, un seul réseau d'embedding : MSD-MusiCNN, puis les têtes danceability et
DEAM (valence, arousal), moyennées par patch ; tempo par TempoCNN (vote majoritaire, recommandé
pour un tempo constant). Chaque valeur est donnée sur le titre entier, sur ses `EDGE_S` premières
et sur ses `EDGE_S` dernières secondes : une transition se joue entre la fin d'un titre et le
début du suivant. Le titre, c'est ce qui passe à l'antenne : entre ses points de coupe quand le
fichier en porte, et sa durée en découle. Le fichier d'antenne est lu, jamais écrit.
"""

import hashlib
import json
import logging
import os
import sqlite3
from collections import Counter
from dataclasses import astuple, dataclass, field
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import numpy.typing as npt

from radio.acquire.audio import Cue, ToolError, cue_of

logger = logging.getLogger(__name__)

BASE_URL = "https://essentia.upf.edu/models/"
MODELS = {
    "msd-musicnn-1.pb": (
        "feature-extractors/musicnn/",
        "cdea0722bcee7f731286843f2233e3aa69887bb5c3e2dce011eff55f38d04f3e",
    ),
    "danceability-msd-musicnn-1.pb": (
        "classification-heads/danceability/",
        "874a4b86afc9e12de3f15a47baf9ff1ac676ace109c56203e26103f2259eb95e",
    ),
    "danceability-msd-musicnn-1.json": (
        "classification-heads/danceability/",
        "9ec56f2b1e710da394c25245524f5caa772905f5978fc585dc1d2f6d248a2b48",
    ),
    "deam-msd-musicnn-2.pb": (
        "classification-heads/deam/",
        "beb5eeb0909266eeb78b8d6bb1323b10829cf2fe55e3c01a13fa1846fa98b371",
    ),
    "deam-msd-musicnn-2.json": (
        "classification-heads/deam/",
        "079df8d538d093ba35c34b7fbee01ff2773c4469be5281520f55d585295a3c58",
    ),
    "deeptemp-k16-3.pb": (
        "tempo/tempocnn/",
        "21c328332a221695dd6e8572728c617373064df882e8f81da6d88dc3a821e3b3",
    ),
}
FEATURES_TAG = "msd-musicnn-1/hop187+danceability-msd-musicnn-1+deam-msd-musicnn-2+deeptemp-k16-3"
EDGE_S = 30.0
# Patches MusiCNN sans recouvrement (187 trames, ~3 s) : même moyenne qu'au pas par défaut (93),
# pour moitié moins de calcul (mesures du 2026-10-02).
MUSICNN_HOP = 187

Floats = npt.NDArray[np.float32]


class ModelError(Exception):
    """Modèle absent, ou différent du modèle officiel épinglé."""


def check_models(models_dir: Path) -> None:
    for name, (folder, sha) in MODELS.items():
        path = models_dir / name
        if not path.is_file():
            raise ModelError(f"modèle absent : {path} (à télécharger depuis {BASE_URL}{folder})")
        if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
            raise ModelError(f"somme de contrôle inattendue : {path}")


@dataclass(frozen=True)
class Features:
    duration_s: float
    danceability: float
    danceability_start: float
    danceability_end: float
    arousal: float
    arousal_start: float
    arousal_end: float
    valence: float
    valence_start: float
    valence_end: float
    bpm: float
    bpm_start: float
    bpm_end: float


def _edges(values: Floats, duration_s: float) -> tuple[float, float, float]:
    """Moyenne sur le titre, ses premières et ses dernières `EDGE_S` secondes. Les valeurs sont
    réparties régulièrement sur la durée : le pas se déduit de leur nombre."""
    k = max(1, round(len(values) * EDGE_S / duration_s))
    return float(values.mean()), float(values[:k].mean()), float(values[-k:].mean())


def _majority(values: Floats) -> float:
    return float(Counter(np.round(values).tolist()).most_common(1)[0][0])


def _same_octave(values: Floats, bpm: float) -> Floats:
    """Ramène au tempo du titre les valeurs à un facteur 2 ou 3 près, à 4 % (« Accuracy2 »,
    Schreiber et Müller, ISMIR 2018, §4) : sur les quelques valeurs d'un début ou d'une fin,
    une erreur d'octave l'emporte sinon."""
    out = values.copy()
    for factor in (2.0, 3.0, 0.5, 1 / 3):
        hit = np.abs(values / (bpm * factor) - 1) <= 0.04
        out[hit] = values[hit] / factor
    return out


def summarize(
    danceable: Floats, valence: Floats, arousal: Floats, local_bpm: Floats, duration_s: float
) -> Features:
    k = max(1, round(len(local_bpm) * EDGE_S / duration_s))
    bpm = _majority(local_bpm)
    folded = _same_octave(local_bpm, bpm)
    return Features(
        duration_s,
        *_edges(danceable, duration_s),
        *_edges(arousal, duration_s),
        *_edges(valence, duration_s),
        bpm,
        _majority(folded[:k]),
        _majority(folded[-k:]),
    )


class FeatureExtractor:
    def __init__(self, models_dir: Path) -> None:
        check_models(models_dir)
        # Avant l'import : un fil TensorFlow, comme l'empreinte (radio/signals/audio.py).
        os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "1")
        os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
        import essentia
        from essentia.standard import (
            MonoLoader,
            TempoCNN,
            TensorflowPredict2D,
            TensorflowPredictMusiCNN,
        )

        essentia.log.infoActive = False

        def classes(name: str) -> list[str]:
            return list(json.loads((models_dir / name).read_text(encoding="utf-8"))["classes"])

        # L'ordre des classes change d'une tête à l'autre : il se lit dans le .json officiel.
        self._danceable = classes("danceability-msd-musicnn-1.json").index("danceable")
        deam = classes("deam-msd-musicnn-2.json")
        self._valence, self._arousal = deam.index("valence"), deam.index("arousal")
        self._loader: Any = MonoLoader()
        self._embed: Any = TensorflowPredictMusiCNN(
            graphFilename=str(models_dir / "msd-musicnn-1.pb"),
            output="model/dense/BiasAdd",
            patchHopSize=MUSICNN_HOP,
        )
        self._dance: Any = TensorflowPredict2D(
            graphFilename=str(models_dir / "danceability-msd-musicnn-1.pb"), output="model/Softmax"
        )
        self._deam: Any = TensorflowPredict2D(
            graphFilename=str(models_dir / "deam-msd-musicnn-2.pb"), output="model/Identity"
        )
        self._tempo: Any = TempoCNN(graphFilename=str(models_dir / "deeptemp-k16-3.pb"))

    def _load(self, path: Path, rate: int) -> Floats | None:
        try:
            self._loader.configure(filename=str(path), sampleRate=rate, resampleQuality=4)
            audio: Floats = self._loader()
        except RuntimeError:
            return None
        return audio if audio.size else None

    def measure(self, path: Path, cue: Cue | None) -> Features | None:
        """None si l'audio est illisible ou trop court pour un patch."""
        a16 = self._load(path, 16000)
        a11 = self._load(path, 11025)
        if a16 is None or a11 is None:
            return None
        if cue is not None:
            a16 = a16[int(cue.cue_in * 16000) : int(cue.cue_out * 16000)]
            a11 = a11[int(cue.cue_in * 11025) : int(cue.cue_out * 11025)]
            if not a16.size or not a11.size:
                return None
        try:
            emb = np.asarray(self._embed(a16), dtype=np.float32)
            if emb.ndim != 2 or emb.shape[0] == 0:
                return None
            dance = np.asarray(self._dance(emb), dtype=np.float32)
            av = np.asarray(self._deam(emb), dtype=np.float32)
            _, local_bpm, _ = self._tempo(a11)
        except RuntimeError:
            return None
        local = np.asarray(local_bpm, dtype=np.float32)
        if local.size == 0:
            return None
        return summarize(
            dance[:, self._danceable],
            av[:, self._valence],
            av[:, self._arousal],
            local,
            a16.size / 16000,
        )


class Extractor(Protocol):
    def measure(self, path: Path, cue: Cue | None) -> Features | None: ...


@dataclass
class FeaturesReport:
    n_todo: int
    n_ok: int = 0
    n_failed: int = 0
    missing: list[str] = field(default_factory=list)


def measure_antenna(
    conn: sqlite3.Connection, media_dir: Path, extractor: Extractor, now: str, batch: int = 20
) -> FeaturesReport:
    """Mesure les titres pas encore mesurés, à l'antenne et au repos (ils reviendront au fond).
    Un fichier absent du dossier média n'est pas noté : il est nommé, et retenté à la passe
    suivante."""
    todo = conn.execute(
        """
        SELECT n.deezer_track_id, n.path FROM antenne n
        LEFT JOIN track_features f USING (deezer_track_id)
        WHERE f.deezer_track_id IS NULL ORDER BY n.deezer_track_id
        """
    ).fetchall()
    rep = FeaturesReport(n_todo=len(todo))
    rows: list[tuple[object, ...]] = []

    def flush() -> None:
        with conn:
            conn.executemany(f"INSERT INTO track_features VALUES ({', '.join('?' * 17)})", rows)
        rows.clear()

    for i, (tid, rel) in enumerate(todo, 1):
        if i % 50 == 0:
            logger.info("features: %d/%d tracks processed", i, len(todo))
        path = media_dir / str(rel)
        if not path.is_file():
            rep.missing.append(str(rel))
            continue
        try:
            cue = cue_of(path)
        except ToolError:
            rep.n_failed += 1
            rows.append((tid, "audio_failed", FEATURES_TAG, now, *([None] * 13)))
            continue
        feats = extractor.measure(path, cue)
        if feats is None:
            rep.n_failed += 1
            rows.append((tid, "audio_failed", FEATURES_TAG, now, *([None] * 13)))
        else:
            rep.n_ok += 1
            rows.append((tid, "ok", FEATURES_TAG, now, *astuple(feats)))
        if len(rows) >= batch:
            flush()
    flush()
    return rep
