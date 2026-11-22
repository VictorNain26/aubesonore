"""La bibliothèque d'antenne, publiée sur AzuraCast."""

from datetime import UTC, datetime
from pathlib import PurePosixPath

import numpy as np

from radio.antenne.publication import antenne_pass
from radio.commandes import commun
from radio.commandes.commun import (
    _db,
    _echo,
    _editorial,
    _fail,
    _n,
    _record,
    _stage,
    _unavailable,
    app,
)
from radio.sources.azuracast import AzuracastClient, AzuracastUnavailable
from radio.sources.deezer import DeezerClient, DeezerUnavailable


@app.command("antenne")
@_stage("antenne")
def antenne() -> None:
    """Publie les titres prêts, fait vivre chaque titre (fin de séjour, promotion, repos,
    péremption) et fait tourner les repères."""
    settings = commun._settings()
    editorial = _editorial(settings)
    if settings.azuracast_api_key is None:
        _fail("AZURACAST_API_KEY doit être défini dans .env", 2)
    station = AzuracastClient(
        settings.azuracast_url,
        settings.azuracast_api_key.get_secret_value(),
        settings.azuracast_station_id,
    )
    with _db(settings) as conn:
        try:
            rep = antenne_pass(
                conn,
                station,
                DeezerClient(),
                editorial.antenne,
                editorial.grille,
                PurePosixPath(settings.plex_music_root),
                settings.rsgain_bin,
                np.random.default_rng(),
                datetime.now(UTC),
            )
        except AzuracastUnavailable as e:
            _fail(f"AzuraCast indisponible ({e}) : le travail fait est gardé", 1)
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
        _record(
            conn,
            "antenne",
            not rep.errors,
            {
                "publiés": rep.n_published,
                "repères": rep.n_references,
                "repères sans pochette": rep.n_references_no_cover,
                "repères sautés": len(rep.skipped_references),
                "votés non écartés": rep.n_voted_out,
                "titres en trop d'un artiste sortis": rep.n_artist_doubles,
                "promus": rep.n_promoted,
                "non promus, artiste déjà à l'antenne": rep.n_promotions_artist_full,
                "fins de séjour": rep.n_ended,
                "mis au repos": rep.n_rested,
                "revenus au fond": rep.n_returned,
                "périmés": rep.n_expired,
                "repères sortis": rep.n_references_out,
                "repères écartés, artiste déjà à l'antenne": rep.n_references_artist_full,
                "repères écartés, artiste inconnu": rep.n_references_no_artist,
                "oubliés": rep.n_forgotten,
                "inconnus": rep.n_unknown,
                "à l'antenne": rep.n_total,
                "erreurs": len(rep.errors),
            },
        )
    _echo(
        [
            f"Antenne : {_n(rep.n_total)} titres ({_n(rep.n_published)} publiés, "
            f"{_n(rep.n_references)} repères ajoutés, {_n(rep.n_references_out)} sortis)",
            f"  votés « non » écartés : {_n(rep.n_voted_out)}",
            f"  titres en trop d'un artiste sortis : {_n(rep.n_artist_doubles)}",
            f"  fin du premier séjour : {_n(rep.n_promoted)} promus au repos, "
            f"{_n(rep.n_ended)} sortis, {_n(rep.n_promotions_artist_full)} non promus "
            f"(artiste déjà à l'antenne)",
            f"  fond : {_n(rep.n_rested)} mis au repos, {_n(rep.n_returned)} revenus, "
            f"{_n(rep.n_expired)} périmés",
            f"  réalignement : {_n(rep.n_forgotten)} disparus d'AzuraCast oubliés, "
            f"{_n(rep.n_unknown)} fichiers inconnus dans antenne/ et repos/",
            f"  repères sans pochette : {_n(rep.n_references_no_cover)}",
            f"  repères écartés, artiste déjà à l'antenne : "
            f"{_n(rep.n_references_artist_full)}, artiste inconnu : "
            f"{_n(rep.n_references_no_artist)}",
            *(f"  sauté : {s}" for s in rep.skipped_references),
            *(f"  erreur : {e}" for e in rep.errors),
        ]
    )
    if rep.errors:
        _fail(f"{_n(len(rep.errors))} erreurs de publication", 1)
