"""Les fichiers de modèle d'Essentia, épinglés par leur somme SHA-256 : un fichier absent ou
différent du modèle officiel arrête l'étape qui le lit, avec où le télécharger."""

import hashlib
from pathlib import Path


class ModelError(Exception):
    """Modèle absent, ou différent du modèle officiel épinglé."""


def check_pinned(path: Path, sha256: str, url: str) -> None:
    if not path.is_file():
        raise ModelError(f"modèle absent : {path} (à télécharger depuis {url})")
    # Par blocs : un modèle tient des dizaines de Mo, inutile de le charger pour le hacher.
    with path.open("rb") as f:
        digest = hashlib.file_digest(f, "sha256").hexdigest()
    if digest != sha256:
        raise ModelError(f"somme de contrôle inattendue : {path}")
