"""Client Last.fm — artist.getSimilar.

La clé voyage en paramètre de requête : aucun message d'exception ni log ne contient d'URL.
"""

from typing import Any

import requests
import stamina
from pyrate_limiter import Duration, Limiter, Rate

from radio.core.http import check_status, json_or_none

API = "https://ws.audioscrobbler.com/2.0/"
_NOT_FOUND = 6
_UNAVAILABLE = frozenset({8, 11, 16, 29, 10, 26})  # 10/26 : clé invalide/suspendue, globale


class LastfmError(Exception):
    """Erreur définitive."""


class LastfmUnavailable(Exception):
    """Indisponibilité transitoire, ou problème de clé qui doit arrêter la passe."""


class _NotFound(Exception):
    pass


def _as_list(x: Any) -> list[Any]:
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


class LastfmClient:
    def __init__(
        self,
        api_key: str,
        session: requests.Session | None = None,
        limiter: Limiter | None = None,
    ) -> None:
        self._key = api_key
        self._session = session or requests.Session()
        self._limiter = limiter or Limiter(Rate(4, Duration.SECOND))

    def similar_artists(self, artist: str, limit: int = 100) -> list[str]:
        try:
            body = self._call("artist.getSimilar", artist=artist, limit=limit)
        except _NotFound:
            return []
        try:
            return [str(a["name"]) for a in _as_list(body.get("similarartists", {}).get("artist"))]
        except (KeyError, TypeError, AttributeError):
            raise LastfmError("malformed similar artists") from None

    @stamina.retry(on=LastfmUnavailable, attempts=5, wait_initial=1.0, wait_max=30.0)
    def _call(self, method: str, **params: Any) -> dict[str, Any]:
        self._limiter.try_acquire("lastfm")
        query = {
            "method": method,
            "api_key": self._key,
            "format": "json",
            # Décision mesurée : docs/recherches/2026-10-04-lastfm-autocorrect.md.
            "autocorrect": 1,
            **params,
        }
        try:
            r = self._session.get(API, params=query, timeout=15)
        except requests.RequestException as e:
            raise LastfmUnavailable(type(e).__name__) from None
        body = json_or_none(r)
        if isinstance(body, dict) and "error" in body:
            code = body["error"]
            if code == _NOT_FOUND:
                raise _NotFound
            if code in _UNAVAILABLE:
                raise LastfmUnavailable(f"code {code}")
            raise LastfmError(f"code {code}")
        check_status(r, LastfmUnavailable, LastfmError)
        if not isinstance(body, dict):
            raise LastfmUnavailable("invalid JSON")
        return body
