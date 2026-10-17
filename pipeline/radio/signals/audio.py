"""Empreinte sonore Discogs-EffNet d'un extrait Deezer de 30 s.

Chaîne officielle MTG (docs/recherches/2026-09-23-essentia-effnet.md §1.1) : graphe
bs64, sortie PartitionedCall:1, MonoLoader à 16 kHz avec resampleQuality=4. Un seul MonoLoader,
reconfiguré à chaque extrait : en créer un par fichier produit des milliers d'avertissements (§4).
Pas de patchHopSize=128 : sur 30 s, les deux pas tiennent dans un seul lot de 64 patches, le pas
par défaut (62) ne coûte rien de plus. Vecteur de titre = moyenne des patches puis norme L2 :
convention maison, non documentée par MTG (§2).
"""

import hashlib
import os
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

MODEL_URL = (
    "https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb"
)
MODEL_SHA256 = "3ed9af50d5367c0b9c795b294b00e7599e4943244f4cbd376869f3bfc87721b1"
MODEL_TAG = "discogs-effnet-bs64-1/hop62/mean-l2"
DIM = 1280


class ModelError(Exception):
    """Modèle absent, ou différent du modèle officiel épinglé."""


def single_thread_tensorflow() -> None:
    """À appeler avant d'importer essentia : TensorFlow lit ces variables à la création de sa
    session. Un fil chacun : sur cette machine partagée, le moins de CPU pour presque le même
    temps (§5.3)."""
    os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "1")
    os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")


def check_model(path: Path) -> None:
    if not path.is_file():
        raise ModelError(f"modèle absent : {path} (à télécharger depuis {MODEL_URL})")
    if hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
        raise ModelError(f"somme de contrôle inattendue : {path}")


def to_blob(v: npt.NDArray[np.float32]) -> bytes:
    return np.asarray(v, dtype="<f4").tobytes()


def from_blob(b: bytes) -> npt.NDArray[np.float32]:
    return np.frombuffer(b, dtype="<f4").astype(np.float32)


class EffnetEmbedder:
    def __init__(self, model: Path) -> None:
        check_model(model)
        single_thread_tensorflow()
        import essentia
        from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs

        essentia.log.infoActive = False
        self._loader: Any = MonoLoader()
        self._net: Any = TensorflowPredictEffnetDiscogs(
            graphFilename=str(model), output="PartitionedCall:1"
        )

    def embed(self, data: bytes, suffix: str = ".mp3") -> npt.NDArray[np.float32] | None:
        """Vecteur unitaire de 1 280 valeurs, ou None si l'audio est illisible ou trop court."""
        with tempfile.NamedTemporaryFile(suffix=suffix) as f:
            f.write(data)
            f.flush()
            try:
                self._loader.configure(filename=f.name, sampleRate=16000, resampleQuality=4)
                audio = self._loader()
            except RuntimeError:
                return None
        if audio.size == 0:
            return None
        # Un extrait plus court qu'un patch EffNet (~2,05 s) fait renvoyer une liste Python vide
        # par le réseau, pas un ndarray : convertir avant de vérifier la forme.
        try:
            raw = self._net(audio)
        except RuntimeError:
            return None
        patches = np.asarray(raw, dtype=np.float32)
        if patches.ndim != 2 or patches.shape[0] == 0:
            return None
        v = patches.mean(axis=0)
        norm = float(np.linalg.norm(v))
        if not np.isfinite(norm) or norm == 0.0:
            return None
        unit: npt.NDArray[np.float32] = (v / norm).astype(np.float32)
        return unit
