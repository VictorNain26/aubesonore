"""Clé de dédoublonnage des titres découverts, plus large que le rapprochement strict.

Deux versions d'un même titre (« Song », « Song (Remastered 2011) », « Song - Radio Edit ») ne
donnent qu'un candidat : on retire toutes les parenthèses et crochets, un suffixe « - … » qui parle
de remaster, d'édition ou de version, puis ces mots eux-mêmes.
"""

import re

from radio.bibliotheque.rapprochement import normalize

_GROUPS = re.compile(r"\([^()]*\)|\[[^\[\]]*\]")
_DASH_TAIL = re.compile(r"\s[-\u2013\u2014]\s.*\b(?:remaster\w*|edit|version)\b.*$", re.IGNORECASE)
_WORDS = re.compile(r"\b(?:remaster\w*|edit|version)\b", re.IGNORECASE)


def dedupe_key(artist: str, title: str) -> str:
    t = _WORDS.sub(" ", _DASH_TAIL.sub("", _GROUPS.sub(" ", title)))
    # Un titre fait seulement de crochets (« (Interlude) ») garde ses mots.
    nt = normalize(t) or normalize(title)
    return f"{normalize(artist)}|{nt}"
