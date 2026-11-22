"""La bibliothèque Plex, rapprochée de Deezer."""

from pathlib import PurePosixPath

import requests
from plexapi.exceptions import PlexApiException

from radio.bibliotheque.artistes import register_library
from radio.bibliotheque.rapprochement import coverage, match_library
from radio.bibliotheque.synchro import EmptyLibraryError, sync_library
from radio.commandes import commun
from radio.commandes.commun import (
    _db,
    _echo,
    _editorial,
    _fail,
    _n,
    _now,
    _pct,
    _record,
    _stage,
    _unavailable,
    app,
)
from radio.sources.deezer import DeezerClient, DeezerUnavailable
from radio.sources.plex import LibraryGuardError, PlexSource

_REASONS = (
    ("no_duration", "sans durée"),
    ("no_result", "sans résultat"),
    ("no_exact_match", "sans correspondance exacte"),
)


@app.command("bibliotheque")
@_stage("bibliotheque")
def bibliotheque() -> None:
    """Lit la bibliothèque Plex et la rapproche de Deezer."""
    settings = commun._settings()
    editorial = _editorial(settings)
    if settings.plex_token is None or not settings.plex_music_section:
        _fail("PLEX_TOKEN et PLEX_MUSIC_SECTION doivent être définis dans .env", 2)
    now = _now()
    try:
        tracks = PlexSource(
            settings.plex_url,
            settings.plex_token.get_secret_value(),
            settings.plex_music_section,
            PurePosixPath(settings.plex_music_root),
        ).tracks()
    except LibraryGuardError as e:
        _fail(f"Bibliothèque refusée : {e}", 2)
    except (requests.RequestException, PlexApiException) as e:
        _fail(f"Plex en erreur ({type(e).__name__})", 1)
    with _db(settings) as conn:
        try:
            sync = sync_library(conn, tracks, now)
            rep = match_library(conn, DeezerClient(), editorial.library.duration_tolerance_s, now)
        except EmptyLibraryError:
            _fail("Plex n'a renvoyé aucun titre : rien n'a été modifié", 1)
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
        reg = register_library(conn, now)
        done, total = coverage(conn)
        _record(
            conn,
            "bibliotheque",
            True,
            {
                "titres": sync.n_tracks,
                "rapprochés": rep.n_matched,
                "non trouvés": sum(rep.unmatched.values()),
                "erreurs": len(rep.errors),
                "couverture": done / total if total else 0.0,
            },
        )
    details = ", ".join(
        f"{label} {_n(rep.unmatched[k])}" for k, label in _REASONS if rep.unmatched.get(k)
    )
    _echo(
        [
            f"Bibliothèque Plex : {_n(sync.n_tracks)} titres ({_n(sync.n_added)} ajoutés, "
            f"{_n(sync.n_changed)} modifiés, {_n(sync.n_removed)} retirés)",
            f"Rapprochement Deezer : {_n(rep.n_todo)} à traiter → {_n(rep.n_matched)} trouvés, "
            f"{_n(sum(rep.unmatched.values()))} non trouvés"
            + (f" ({details})" if details else "")
            + f", {_n(len(rep.errors))} en erreur",
            *(f"  erreur : {err}" for err in rep.errors),
            f"Couverture : {_n(done)} / {_n(total)} titres rapprochés ({_pct(done, total)})",
            f"Bibliothèque inscrite : {_n(reg.n_tracks)} titres, {_n(reg.n_artists)} artistes "
            f"({_n(reg.n_removed)} retirés)",
        ]
    )
