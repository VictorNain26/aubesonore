"""Client AzuraCast 0.23.8 — endpoints réellement utilisés (docs/vision.md §7.2).

Formes vérifiées dans la spécification OpenAPI de l'instance et le code au commit 62a30e5
(docs/recherches/2026-09-30-acquisition-publication-observabilite.md §3). Jamais de
`PUT /file/{id}` : il réécrit et supprime les balises du fichier.
"""

import base64
from dataclasses import dataclass
from typing import Any

import requests
import stamina

import radio.core.http  # noqa: F401  (enregistre le hook de relance)


class AzuracastError(Exception):
    """Refus définitif (4xx) ou réponse inattendue."""


class AzuracastUnavailable(Exception):
    """Indisponibilité transitoire (réseau, 5xx)."""


@dataclass(frozen=True)
class Media:
    id: int
    song_id: str
    path: str


class AzuracastClient:
    def __init__(
        self, url: str, api_key: str, station: int = 1, session: requests.Session | None = None
    ) -> None:
        self._api = f"{url.rstrip('/')}/api"
        self._station = station
        self._headers = {"X-API-Key": api_key}
        self._session = session or requests.Session()

    def files(self) -> list[Media]:
        return [
            Media(int(m["id"]), str(m["song_id"]), str(m["path"]))
            for m in self._call("GET", self._at("/files"))
        ]

    def upload(self, path: str, data: bytes) -> Media:
        m = self._call(
            "POST", self._at("/files"), json={"path": path, "file": base64.b64encode(data).decode()}
        )
        return Media(int(m["id"]), str(m["song_id"]), str(m["path"]))

    def download(self, media_id: int) -> bytes:
        """Le fichier tel qu'AzuraCast le sert (`GET /file/{id}/play`)."""
        return self._request("GET", self._at(f"/file/{media_id}/play")).content

    def delete(self, paths: list[str]) -> list[str]:
        """Supprime des fichiers ; renvoie les erreurs signalées par AzuraCast."""
        r = self._call("PUT", self._at("/files/batch"), json={"do": "delete", "files": paths})
        return [str(e) for e in r.get("errors") or []]

    def move(self, paths: list[str], directory: str) -> list[str]:
        """Déplace des fichiers dans `directory` sans réécrire leurs balises (`do=move`,
        BatchAction::doMove au tag 0.23.8) ; renvoie les erreurs signalées par AzuraCast."""
        r = self._call(
            "PUT",
            self._at("/files/batch"),
            json={"do": "move", "files": paths, "currentDirectory": "", "directory": directory},
        )
        return [str(e) for e in r.get("errors") or []]

    def last_played(self, start: str, end: str) -> dict[str, float]:
        """Dernier passage (horodatage UNIX) de chaque titre entre `start` et `end` (ISO 8601),
        d'après `GET /station/{id}/history`."""
        out: dict[str, float] = {}
        for h in self._call("GET", self._at("/history"), params={"start": start, "end": end}):
            song = str(h["song"]["id"])
            out[song] = max(out.get(song, 0.0), float(h["played_at"]))
        return out

    def queued(self) -> dict[str, float]:
        """Heure où chaque titre en file d'attente doit passer (`GET /station/{id}/queue`) :
        `played_at`, ou `cued_at` tant qu'AzuraCast ne l'a pas estimée (`StationQueue`, 0.23.8)."""
        out: dict[str, float] = {}
        for q in self._call("GET", self._at("/queue")):
            song = str(q["song"]["id"])
            at = float(q["cued_at"] if q["played_at"] is None else q["played_at"])
            out[song] = max(out.get(song, at), at)
        return out

    def start_next_s(self) -> float:
        """Avance, en secondes, du titre suivant sur la fin du précédent : AzuraCast le fait partir
        `getCrossfadeDuration()` avant la fin, soit `crossfade` * 1,5, ou 0 si le fondu est coupé,
        ce qu'AutoCue impose (`Queue::addDurationToTime`, `StationBackendConfiguration`, 0.23.8)."""
        backend = self._call("GET", f"/admin/station/{self._station}")["backend_config"]
        crossfade = float(backend["crossfade"])
        if backend["enable_auto_cue"] or backend["crossfade_type"] == "none" or crossfade <= 0:
            return 0.0
        return round(crossfade * 1.5, 2)

    def timezone(self) -> str:
        return str(self._call("GET", f"/station/{self._station}")["timezone"])

    def playlists(self) -> dict[str, int]:
        return {str(p["name"]): int(p["id"]) for p in self._call("GET", self._at("/playlists"))}

    def create_hour_playlist(self, name: str, day: int, hour: int) -> int:
        """Playlist séquentielle programmée une heure par semaine, jouée une fois (`loop_once`),
        sans évitement des doublons : l'ordre écrit est l'ordre joué. `start_date` et `end_date`
        sont lus sans valeur par défaut (StationScheduleRepository::setScheduleItems, 0.23.8)."""
        p = self._call(
            "POST",
            self._at("/playlists"),
            json={
                "name": name,
                "type": "default",
                "source": "songs",
                "order": "sequential",
                "is_enabled": True,
                "avoid_duplicates": False,
                "include_in_requests": False,
                "weight": 3,
                "schedule_items": [
                    {
                        "start_time": hour * 100,
                        "end_time": (hour + 1) % 24 * 100,
                        "start_date": None,
                        "end_date": None,
                        "days": [day],
                        "loop_once": True,
                    }
                ],
            },
        )
        return int(p["id"])

    def fill_playlist(self, playlist_id: int, m3u: str) -> int:
        """Vide la playlist puis importe le M3U dans l'ordre (ImportAction, 0.23.8) ; renvoie le
        nombre de chemins retrouvés."""
        self._call("DELETE", f"{self._at('/playlist')}/{playlist_id}/empty")
        r = self._call(
            "POST",
            f"{self._at('/playlist')}/{playlist_id}/import",
            files={"playlist_file": ("grille.m3u", m3u.encode(), "audio/x-mpegurl")},
        )
        return sum(1 for x in r.get("import_results") or [] if x.get("match"))

    def empty_playlist(self, playlist_id: int) -> None:
        self._call("DELETE", f"{self._at('/playlist')}/{playlist_id}/empty")

    def busy_song_ids(self) -> set[str]:
        """Titre en cours, et titres en file d'attente ou déjà préparés par Liquidsoap : jamais
        supprimés. `now_playing` est nul quand la station est hors ligne."""
        busy = {str(q["song"]["id"]) for q in self._call("GET", self._at("/queue"))}
        playing = self._call("GET", f"/nowplaying/{self._station}")["now_playing"]
        if playing is not None:
            busy.add(str(playing["song"]["id"]))
        return busy

    def _at(self, path: str) -> str:
        return f"/station/{self._station}{path}"

    def _call(self, method: str, path: str, **kw: Any) -> Any:
        return self._request(method, path, **kw).json()

    @stamina.retry(on=AzuracastUnavailable, attempts=5, wait_initial=1.0, wait_max=30.0)
    def _request(self, method: str, path: str, **kw: Any) -> requests.Response:
        try:
            r = self._session.request(
                method, self._api + path, headers=self._headers, timeout=120, **kw
            )
        except requests.RequestException as e:
            raise AzuracastUnavailable(type(e).__name__) from None
        if r.status_code >= 500:
            raise AzuracastUnavailable(f"HTTP {r.status_code}")
        if r.status_code >= 400:
            raise AzuracastError(f"HTTP {r.status_code}")
        return r
