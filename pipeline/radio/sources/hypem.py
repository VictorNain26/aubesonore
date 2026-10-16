"""Client Hype Machine — API v2 en lecture, sans clé (docs/vision.md §3).

Cette API n'a pas de documentation publique et `api.hypem.com/robots.txt` refuse les robots :
usage choisi en connaissance de cause (2026-10-01), à très faible volume (quelques requêtes par
passe), avec un User-Agent qui nous identifie. Toute réponse hors du format attendu est une
erreur, jamais une liste vide : une source qui change ou ferme se voit dans le rapport.
"""

from dataclasses import dataclass
from typing import Any

import requests
import stamina

from radio.core.http import check_status, json_or_none

API = "https://api.hypem.com/v2"
USER_AGENT = "AubeSonore/3 (+https://radio.aubesonore.fr)"
FAVORITES_PAGE = 50


class HypemError(Exception):
    """Réponse inexploitable : la source est sautée et nommée dans le rapport."""


class HypemNotFound(HypemError):
    """HTTP 404 : utilisateur inconnu, ou page au-delà de la dernière."""


class HypemUnavailable(Exception):
    """Indisponibilité transitoire."""


@dataclass(frozen=True)
class HypemTrack:
    artist: str
    title: str
    duration_s: int
    sitename: str


def _track(d: Any) -> HypemTrack:
    try:
        return HypemTrack(
            artist=str(d["artist"]),
            title=str(d["title"]),
            duration_s=int(d["time"]),
            sitename=str(d["sitename"]),
        )
    except (KeyError, TypeError, ValueError):
        raise HypemError("malformed track") from None


class HypemClient:
    def __init__(self, session: requests.Session | None = None) -> None:
        self._session = session or requests.Session()

    def popular(self, mode: str, page: int) -> list[HypemTrack]:
        """Le classement des blogs : `mode` vaut « now » ou « lastweek »."""
        return [_track(d) for d in self._get("/popular", {"mode": mode, "page": page})]

    def favorites(self, user: str) -> list[HypemTrack]:
        """Tous les favoris publics d'un utilisateur. L'API répond 404 au-delà de la dernière page
        comme pour un utilisateur inconnu : on s'arrête sur une page incomplète, et une 404 dès la
        première page est une erreur."""
        tracks: list[HypemTrack] = []
        page = 1
        while True:
            try:
                batch = self._get(
                    f"/users/{user}/favorites", {"page": page, "count": FAVORITES_PAGE}
                )
            except HypemNotFound:
                if page == 1:
                    raise
                return tracks
            tracks += [_track(d) for d in batch]
            if len(batch) < FAVORITES_PAGE:
                return tracks
            page += 1

    @stamina.retry(on=HypemUnavailable, attempts=3, wait_initial=2.0, wait_max=30.0)
    def _get(self, path: str, params: dict[str, Any]) -> list[Any]:
        try:
            r = self._session.get(
                API + path, params=params, headers={"User-Agent": USER_AGENT}, timeout=15
            )
        except requests.RequestException as e:
            raise HypemUnavailable(type(e).__name__) from None
        if r.status_code == 404:
            raise HypemNotFound("HTTP 404")
        check_status(r, HypemUnavailable, HypemError)
        body = json_or_none(r)
        if body is None:
            raise HypemUnavailable("invalid JSON")
        if not isinstance(body, list):
            raise HypemError("not a list")
        return body
