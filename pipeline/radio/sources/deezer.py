"""Client Deezer (API publique, sans authentification) — endpoints réellement utilisés.

Quota documenté : 50 requêtes / 5 s par IP ; on vise 40 / 5 s.
"""

import re
from dataclasses import dataclass, field
from typing import Any

import requests
import stamina
from pyrate_limiter import Duration, Limiter, Rate

import radio.core.http  # noqa: F401  (enregistre le hook de relance)

API = "https://api.deezer.com"
_TRANSIENT_CODES = frozenset({4, 700})
_NO_DATA = 800
# ISO 3901 : pays (2 lettres), déclarant (3), année (2), numéro (5).
_ISRC = re.compile(r"[A-Z]{2}[A-Z0-9]{3}[0-9]{7}")


class DeezerError(Exception):
    """Erreur définitive : relancer ne servirait à rien."""


class DeezerUnavailable(Exception):
    """Indisponibilité transitoire (quota, surcharge, réseau)."""


@dataclass(frozen=True)
class DeezerTrack:
    id: int
    title: str
    title_short: str
    duration_s: int
    rank: int
    artist_id: int
    artist_name: str
    has_preview: bool


@dataclass(frozen=True)
class DeezerAlbum:
    title: str
    cover_url: str | None


@dataclass(frozen=True)
class TrackPage:
    track: DeezerTrack
    # Signée et expirante : jamais stockée, journalisée ni affichée.
    preview_url: str | None = field(repr=False)
    album: DeezerAlbum | None
    # Absent de la recherche, seulement dans `GET /track` ; None quand Deezer n'en a pas.
    isrc: str | None = None


@dataclass(frozen=True)
class DeezerArtist:
    id: int
    name: str


def _track(d: Any) -> DeezerTrack:
    try:
        return DeezerTrack(
            id=int(d["id"]),
            title=str(d["title"]),
            title_short=str(d.get("title_short") or d["title"]),
            duration_s=int(d["duration"]),
            rank=int(d.get("rank") or 0),
            artist_id=int(d["artist"]["id"]),
            artist_name=str(d["artist"]["name"]),
            has_preview=bool(d.get("preview")),
        )
    except (KeyError, TypeError, ValueError):
        raise DeezerError("malformed track") from None


def _isrc(value: Any) -> str | None:
    """Un ISRC mal formé vaut absence : il ne désignerait aucun enregistrement."""
    return value if isinstance(value, str) and _ISRC.fullmatch(value) else None


def _artist(d: Any) -> DeezerArtist:
    try:
        return DeezerArtist(id=int(d["id"]), name=str(d["name"]))
    except (KeyError, TypeError, ValueError):
        raise DeezerError("malformed artist") from None


class DeezerClient:
    def __init__(
        self, session: requests.Session | None = None, limiter: Limiter | None = None
    ) -> None:
        self._session = session or requests.Session()
        self._limiter = limiter or Limiter(Rate(40, Duration.SECOND * 5))

    def search_tracks(self, query: str, limit: int = 10) -> list[DeezerTrack]:
        body = self._get("/search/track", {"q": query, "limit": limit})
        return [_track(d) for d in body.get("data") or []]

    def related(self, artist_id: int) -> list[DeezerArtist]:
        body = self._get(f"/artist/{artist_id}/related", {})
        return [_artist(d) for d in body.get("data") or []]

    def top(self, artist_id: int, limit: int = 10) -> list[DeezerTrack]:
        body = self._get(f"/artist/{artist_id}/top", {"limit": limit})
        return [_track(d) for d in body.get("data") or []]

    def editorial_selection(self, genre_id: int) -> list[int]:
        """Les albums choisis par les éditeurs Deezer pour un genre."""
        body = self._get(f"/editorial/{genre_id}/selection", {})
        try:
            return [int(a["id"]) for a in body.get("data") or []]
        except (KeyError, TypeError, ValueError):
            raise DeezerError("malformed selection") from None

    def album_tracks(self, album_id: int) -> list[DeezerTrack]:
        body = self._get(f"/album/{album_id}/tracks", {"limit": 100})
        return [_track(d) for d in body.get("data") or []]

    def track(self, track_id: int) -> tuple[DeezerTrack, str | None] | None:
        """Le titre et une URL d'extrait fraîche. L'URL est signée et expire : ne jamais la
        stocker, la journaliser ni la mettre dans un message."""
        page = self.track_page(track_id)
        return None if page is None else (page.track, page.preview_url)

    def track_page(self, track_id: int) -> TrackPage | None:
        """`GET /track` en entier : le titre, une URL d'extrait fraîche, l'album avec sa
        pochette et l'ISRC, en une seule requête."""
        body = self._get(f"/track/{track_id}", {})
        if "id" not in body:
            return None
        preview, album = body.get("preview"), body.get("album")
        info = None
        if isinstance(album, dict):
            cover = album.get("cover_xl")
            info = DeezerAlbum(str(album.get("title") or ""), str(cover) if cover else None)
        return TrackPage(
            _track(body), str(preview) if preview else None, info, _isrc(body.get("isrc"))
        )

    @stamina.retry(on=DeezerUnavailable, attempts=5, wait_initial=1.0, wait_max=30.0)
    def download(self, url: str) -> bytes:
        try:
            r = self._session.get(url, timeout=30)
        except requests.RequestException as e:
            raise DeezerUnavailable(type(e).__name__) from None
        if r.status_code == 429 or r.status_code >= 500:
            raise DeezerUnavailable(f"download HTTP {r.status_code}")
        if r.status_code >= 400 or not r.content:
            raise DeezerError(f"download HTTP {r.status_code}")
        return r.content

    @stamina.retry(on=DeezerUnavailable, attempts=5, wait_initial=1.0, wait_max=30.0)
    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        self._limiter.try_acquire("deezer")
        try:
            r = self._session.get(API + path, params=params, timeout=15)
        except requests.RequestException as e:
            raise DeezerUnavailable(type(e).__name__) from None
        body: Any
        try:
            body = r.json()
        except ValueError:
            body = None
        if isinstance(body, dict) and body.get("error"):
            err = body["error"]
            code = err.get("code") if isinstance(err, dict) else None
            if code in _TRANSIENT_CODES:
                raise DeezerUnavailable(f"code {code}")
            if code == _NO_DATA:
                return {"data": []}
            raise DeezerError(f"code {code}")
        if r.status_code == 429 or r.status_code >= 500:
            raise DeezerUnavailable(f"HTTP {r.status_code}")
        if r.status_code >= 400:
            raise DeezerError(f"HTTP {r.status_code}")
        if not isinstance(body, dict):
            raise DeezerUnavailable("invalid JSON")
        return body
