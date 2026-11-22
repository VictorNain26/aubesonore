"""Les fichiers de modèle d'Essentia, épinglés par leur somme SHA-256 : un fichier absent ou
différent du modèle officiel arrête l'étape qui le lit, avec où le télécharger."""

import hashlib
from pathlib import Path


class ModelError(Exception):
    """Modèle absent, ou différent du modèle officiel épinglé."""


def check_pinned(path: Path, sha256: str, url: str) -> None:
    if not path.is_file():
        raise ModelError(f"modèle absent : {path} (à télécharger depuis {url})")
    if hashlib.sha256(path.read_bytes()).hexdigest() != sha256:
        raise ModelError(f"somme de contrôle inattendue : {path}")
