"""L'acquisition et l'antenne : téléchargement, publication, mesures et grille."""

from datetime import UTC, datetime
from pathlib import PurePosixPath

import numpy as np
import typer

from radio.acquire.run import acquire_pass
from radio.acquire.sockseek import SockseekError
from radio.antenna import grille as grille_mod
from radio.antenna.sync import antenne_pass
from radio.cli import common
from radio.cli.common import (
    _db,
    _echo,
    _editorial,
    _fail,
    _n,
    _now,
    _pct,
    _rate,
    _record,
    _stage,
    _unavailable,
    app,
)
from radio.signals import features
from radio.sources.azuracast import AzuracastClient, AzuracastUnavailable
from radio.sources.deezer import DeezerClient, DeezerUnavailable


@app.command()
@_stage("acquire")
def acquire() -> None:
    """Télécharge les titres retenus sur Soulseek, prouve leur identité et les prépare."""
    settings = common._settings()
    cfg = _editorial(settings).acquisition
    if not settings.soulseek_user or settings.soulseek_password is None:
        _fail("SOULSEEK_USER et SOULSEEK_PASSWORD doivent être définis dans .env", 2)
    if settings.runtime_dir is None:
        _fail("ni RUNTIME_DIRECTORY ni XDG_RUNTIME_DIR : pas de tmpfs pour la config Sockseek", 2)
    now = _now()
    with _db(settings) as conn:
        try:
            rep = acquire_pass(
                conn,
                DeezerClient(),
                (
                    settings.data_dir / "acquisition" / now[:19].replace(":", ""),
                    settings.data_dir / "antenne",
                    settings.runtime_dir,
                ),
                (settings.sockseek_bin, settings.rsgain_bin),
                (settings.soulseek_user, settings.soulseek_password.get_secret_value()),
                cfg,
                now,
            )
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
        except SockseekError as e:
            _fail(f"Sockseek en échec ({e}) : aucune tentative comptée, relancer plus tard", 1)
        rate = rep.n_ready / rep.n_attempted if rep.n_attempted else 1.0
        rate_ok = rep.n_attempted < cfg.min_attempts_for_rate or rate >= cfg.min_success_rate
        _record(
            conn,
            "acquire",
            rate_ok and not rep.n_unindexed,
            {
                "demandés": rep.n_wanted,
                "prêts": rep.n_ready,
                "sans pochette": rep.n_no_cover,
                "non tentés": rep.n_unindexed,
                "artiste déjà à l'antenne": rep.n_artist_waiting,
                "échecs": dict(rep.failures),
            },
        )
    _echo(
        [
            f"Acquisition : {_n(rep.n_wanted)} demandés → {_n(rep.n_ready)} prêts "
            f"({_pct(rep.n_ready, rep.n_attempted)} des tentés), "
            f"{_n(sum(rep.failures.values()))} en échec",
            f"  prêts sans pochette : {_n(rep.n_no_cover)}",
            f"  retenus en attente, leur artiste ayant déjà un titre à l'antenne : "
            f"{_n(rep.n_artist_waiting)}",
            *(f"  {reason} : {_n(n)}" for reason, n in rep.failures.most_common()),
        ]
    )
    if rep.n_unindexed:
        _fail(
            f"Sockseek s'est arrêté avant {_n(rep.n_unindexed)} titres, non comptés comme "
            "tentatives : voir data/acquisition/sockseek.log",
            1,
        )
    if not rate_ok:
        _fail(f"Taux d'acquisition sous {_rate(cfg.min_success_rate)} : à examiner", 1)


@app.command()
@_stage("antenne")
def antenne() -> None:
    """Publie les titres prêts, fait vivre chaque titre (fin de séjour, promotion, repos,
    péremption) et fait tourner les repères."""
    settings = common._settings()
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


@app.command()
@_stage("mesures")
def mesures() -> None:
    """Mesure les titres à l'antenne (dansabilité, arousal, valence, tempo ; titre entier, début,
    fin) pour l'enchaînement."""
    settings = common._settings()
    try:
        extractor = features.FeatureExtractor(settings.models_dir)
    except features.ModelError as e:
        _fail(f"Modèles de mesure refusés : {e}", 2)
    with _db(settings) as conn:
        rep = features.measure_antenna(conn, settings.azuracast_media_dir, extractor, _now())
        _record(
            conn,
            "mesures",
            not rep.missing,
            {
                "à mesurer": rep.n_todo,
                "mesurés": rep.n_ok,
                "audio illisible": rep.n_failed,
                "fichiers absents": len(rep.missing),
            },
        )
    _echo(
        [
            f"Titres à l'antenne : {_n(rep.n_todo)} à mesurer → {_n(rep.n_ok)} mesurés, "
            f"{_n(rep.n_failed)} illisibles, {_n(len(rep.missing))} fichiers absents",
            *(f"  absent : {m}" for m in rep.missing),
        ]
    )
    if rep.missing:
        _fail(f"Fichiers d'antenne absents de {settings.azuracast_media_dir}", 1)


@app.command()
@_stage("grille")
def grille(
    aujourdhui: bool = typer.Option(
        False, "--aujourdhui", help="Les heures restantes d'aujourd'hui, au lieu de demain."
    ),
) -> None:
    """Écrit la grille d'une journée dans les playlists horaires d'AzuraCast : qui passe, à
    quelle heure, dans quel ordre."""
    settings = common._settings()
    cfg = _editorial(settings).grille
    if settings.azuracast_api_key is None:
        _fail("AZURACAST_API_KEY doit être défini dans .env", 2)
    station = AzuracastClient(
        settings.azuracast_url,
        settings.azuracast_api_key.get_secret_value(),
        settings.azuracast_station_id,
    )
    with _db(settings) as conn:
        try:
            plan, errors = grille_mod.grille_pass(conn, station, cfg, aujourdhui, datetime.now(UTC))
        except AzuracastUnavailable as e:
            _fail(f"AzuraCast indisponible ({e})", 1)
        _record(
            conn,
            "grille",
            not errors and not plan.short_hours,
            {
                "jour": plan.day.isoformat(),
                "heures": len(plan.hours),
                "créneaux": plan.slots,
                "heures courtes": plan.short_hours,
                "créneaux cédés": plan.empty_slots,
                "titres non mesurés": plan.unmeasured,
                "titres en retard": plan.late,
                "tour en jours": {c: round(d, 2) for c, d in plan.turnover_days.items()},
                "titres par artiste au plus": plan.max_per_artist,
                "erreurs": len(errors),
            },
        )
    _echo(
        [
            f"Grille du {plan.day.isoformat()} : {_n(len(plan.hours))} heures, créneaux "
            + ", ".join(f"{c} {_n(n)}" for c, n in plan.slots.items()),
            f"  heures courtes : {_n(plan.short_hours)}, créneaux cédés à une autre catégorie : "
            f"{_n(plan.empty_slots)}, titres pas encore mesurés : "
            f"{_n(plan.unmeasured)}, titres pas joués depuis plus de deux tours : "
            f"{_n(plan.late)}",
            "  tour de chaque catégorie : "
            + ", ".join(f"{c} {d:.1f} j" for c, d in plan.turnover_days.items())
            + f" ; titres d'un même artiste à l'antenne : {_n(plan.max_per_artist)} au plus",
            *(f"  erreur : {e}" for e in errors),
        ]
    )
    # Une heure que ses titres ne couvrent pas s'épuise, et le secours joue à la place de la
    # grille (vision §1). La grille publiée est gardée, et l'échec fait alerter Gatus.
    problems = [f"{_n(len(errors))} heures mal écrites"] if errors else []
    if plan.short_hours:
        problems.append(f"{_n(plan.short_hours)} heures trop courtes : le secours jouera")
    if problems:
        _fail(" ; ".join(problems), 1)
