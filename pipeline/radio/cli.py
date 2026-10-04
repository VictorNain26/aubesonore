"""Commandes AubeSonore : goût, découverte, acquisition, antenne et votes."""

import functools
import logging
import os
import sqlite3
import sys
from collections import Counter
from collections.abc import Callable
from contextlib import closing
from datetime import UTC, datetime, time, timedelta
from pathlib import PurePosixPath
from typing import NoReturn, ParamSpec, TypeVar
from zoneinfo import ZoneInfo

import numpy as np
import requests
import typer
import uvicorn
from plexapi.exceptions import PlexApiException
from pydantic import ValidationError

from radio.acquire.run import acquire_pass
from radio.acquire.sockseek import SockseekError
from radio.antenna import grille as grille_mod
from radio.antenna.sync import IsrcReport, antenne_pass, isrc_backfill
from radio.core.backup import BackupError, backup
from radio.core.config import Editorial, Settings, load_editorial
from radio.core.db import connect
from radio.core.report import invocation_stages, last_stages, record_stage
from radio.discover.favorites import favorites_pass
from radio.discover.fresh import NoBatchError, fresh_pass
from radio.discover.negatives import import_negatives, load_negatives
from radio.discover.run import NoLibraryArtistsError, discover_pass
from radio.library.artists import register_library
from radio.library.match import coverage, match_library
from radio.library.sync import EmptyLibraryError, sync_library
from radio.model.dataset import MissingExamplesError
from radio.model.model import (
    Batch,
    TrainReport,
    favorites_retained,
    last_batch,
    rescore,
    train,
    trained_on,
    votes_count,
)
from radio.notify.whatsapp import WhatsAppError, send_whatsapp
from radio.signals import features
from radio.signals.audio import EffnetEmbedder, ModelError
from radio.signals.measure import measure_tracks
from radio.signals.table import load_signals
from radio.sources.azuracast import AzuracastClient, AzuracastUnavailable
from radio.sources.deezer import DeezerClient, DeezerUnavailable
from radio.sources.hypem import HypemClient, HypemError, HypemUnavailable
from radio.sources.lastfm import LastfmClient, LastfmUnavailable
from radio.sources.plex import LibraryGuardError, PlexSource
from radio.votes.access import AccessVerifier
from radio.votes.app import create_app
from radio.votes.select import NoScoresError, NoServingModelError, PendingBallotsError, select_batch
from radio.votes.status import Status, load_status
from radio.votes.suivi import load_suivi, suivi_lines

app = typer.Typer(no_args_is_help=True, add_completion=False)

_REASONS = (
    ("no_duration", "sans durée"),
    ("no_result", "sans résultat"),
    ("no_exact_match", "sans correspondance exacte"),
)


_P = ParamSpec("_P")
_R = TypeVar("_R")
_last_error: str | None = None
_stage_recorded = False


def _fail(message: str, code: int) -> NoReturn:
    global _last_error
    _last_error = message
    typer.echo(message, err=True)
    raise typer.Exit(code)


def _record(conn: sqlite3.Connection, stage: str, ok: bool, counts: dict[str, object]) -> None:
    global _stage_recorded
    record_stage(conn, stage, ok, counts)
    _stage_recorded = True


def _record_failure(stage: str, error: str) -> None:
    try:
        settings = _settings()
    except typer.Exit:
        return  # .env invalide : pas de base où écrire, le message est déjà sorti
    with _db(settings) as conn:
        record_stage(conn, stage, False, {"erreur": error})


def _stage(name: str) -> Callable[[Callable[_P, _R]], Callable[_P, _R]]:
    """Une étape de la passe qui échoue écrit quand même sa ligne de rapport (§8.1). D'une
    exception imprévue, seul le type est gardé : son message peut porter une URL signée."""

    def wrap(fn: Callable[_P, _R]) -> Callable[_P, _R]:
        @functools.wraps(fn)
        def run(*args: _P.args, **kwargs: _P.kwargs) -> _R:
            global _last_error, _stage_recorded
            _last_error, _stage_recorded = None, False
            try:
                return fn(*args, **kwargs)
            except typer.Exit as e:
                if e.exit_code != 0 and not _stage_recorded:
                    _record_failure(name, _last_error or f"code {e.exit_code}")
                raise
            except Exception as e:
                if not _stage_recorded:
                    _record_failure(name, type(e).__name__)
                raise

        return run

    return wrap


def _n(x: int) -> str:
    return f"{x:,}".replace(",", "\u202f")  # espace fine insécable


def _rate(x: float) -> str:
    return f"{100 * x:.1f} %".replace(".", ",")


def _pct(a: int, b: int) -> str:
    return _rate(a / b if b else 0.0)


def _dec(x: float | None) -> str:
    return "—" if x is None else f"{x:.3f}".replace(".", ",")


def _echo(lines: list[str]) -> None:
    for line in lines:
        typer.echo(line)


def _settings() -> Settings:
    try:
        return Settings()
    except ValidationError as e:
        _fail(f".env invalide : {', '.join(str(x['loc'][0]) for x in e.errors())}", 2)


def _editorial(settings: Settings) -> Editorial:
    return load_editorial(settings.config_dir / "editorial.toml")


def _db(settings: Settings) -> closing[sqlite3.Connection]:
    return closing(connect(settings.data_dir / "radio.db"))


def _lastfm(settings: Settings) -> LastfmClient:
    if settings.lastfm_api_key is None:
        _fail("LASTFM_API_KEY doit être défini dans .env", 2)
    return LastfmClient(settings.lastfm_api_key.get_secret_value())


def _unavailable(e: Exception) -> str:
    source = "Deezer" if isinstance(e, DeezerUnavailable) else "Last.fm"
    return f"{source} indisponible ({e}) : le travail fait est gardé, relancer plus tard"


def _now() -> str:
    return datetime.now(UTC).isoformat()


@app.callback()
def main() -> None:
    """AubeSonore — goût, découverte, acquisition, antenne et votes."""
    logging.basicConfig(
        level=logging.INFO, stream=sys.stderr, format="%(asctime)s %(levelname)s %(message)s"
    )
    # À WARNING, urllib3 peut journaliser l'URL complète, clé Last.fm comprise.
    logging.getLogger("urllib3").setLevel(logging.ERROR)


@app.command("library-sync")
@_stage("library-sync")
def library_sync() -> None:
    """Lit la bibliothèque Plex et la rapproche de Deezer."""
    settings = _settings()
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
        done, total = coverage(conn)
        _record(
            conn,
            "library-sync",
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
        ]
    )


@app.command()
@_stage("discover")
def discover() -> None:
    """Tire des graines dans la bibliothèque et découvre des titres candidats."""
    settings = _settings()
    editorial = _editorial(settings)
    lastfm = _lastfm(settings)
    with _db(settings) as conn:
        try:
            rep = discover_pass(
                conn,
                DeezerClient(),
                lastfm,
                editorial.discover,
                datetime.now(UTC),
                np.random.default_rng(),
            )
        except NoLibraryArtistsError:
            _fail(
                "Aucun artiste de la bibliothèque rapproché : lancer d'abord radio library-sync", 1
            )
        except (DeezerUnavailable, LastfmUnavailable) as e:
            _fail(_unavailable(e), 1)
        _record(
            conn,
            "discover",
            True,
            {
                "graines": rep.n_seeds,
                "voisins": rep.n_neighbours,
                "ajoutés": rep.n_added,
                "sautés": len(rep.skipped),
            },
        )
    kind = "reprise" if rep.resumed else "nouvelle"
    lines = [
        f"Découverte : passe n°{rep.run_id} ({kind}), {_n(rep.n_seeds)} graines → "
        f"{_n(rep.n_neighbours)} voisins, {_n(rep.n_seen)} titres vus → {_n(rep.n_added)} "
        f"ajoutés, {_n(rep.n_duplicates)} doublons, {_n(rep.n_filtered)} écartés (pas "
        f"l'artiste principal ou sans extrait), {_n(len(rep.skipped))} sautés"
    ]
    if rep.n_dropped:
        lines.append(
            f"  {_n(rep.n_dropped)} graines de la passe reprise ont quitté la bibliothèque"
        )
    _echo(lines + [f"  sauté : {s}" for s in rep.skipped])


@app.command()
@_stage("nouveautes")
def nouveautes() -> None:
    """Ajoute à la dernière fournée des titres récents choisis par des humains (Hype Machine,
    sélections éditoriales Deezer), chacun avec sa source."""
    settings = _settings()
    editorial = _editorial(settings)
    with _db(settings) as conn:
        try:
            rep = fresh_pass(
                conn,
                DeezerClient(),
                HypemClient(),
                editorial.nouveautes,
                editorial.library.duration_tolerance_s,
                _now(),
            )
        except NoBatchError:
            _fail("Aucune fournée de découverte : lancer d'abord radio discover", 1)
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
        _record(
            conn,
            "nouveautes",
            not rep.skipped,
            {
                "vus": dict(rep.seen),
                "ajoutés": dict(rep.added),
                "déjà vus": dict(rep.already),
                "non trouvés sur Deezer": rep.n_unmatched,
                "déjà dans la bibliothèque": rep.n_known,
                "sources sautées": rep.skipped,
            },
        )
    _echo(
        [
            f"Nouveautés (fournée n°{rep.run_id}) : "
            + ", ".join(
                f"{src} {_n(rep.added[src])} ajoutés sur {_n(n)} vus "
                f"({_n(rep.already[src])} déjà vus)"
                for src, n in rep.seen.items()
            ),
            f"  non trouvés sur Deezer : {_n(rep.n_unmatched)}, déjà dans la bibliothèque : "
            f"{_n(rep.n_known)}",
            *(f"  source sautée : {s}" for s in rep.skipped),
        ]
    )
    if rep.skipped:
        _fail("Une source de nouveautés est en panne : voir ci-dessus", 1)


@app.command()
@_stage("favoris")
def favoris() -> None:
    """Relit les favoris Hype Machine de Victor : déjà aimés, ils ne sont plus des découvertes."""
    settings = _settings()
    editorial = _editorial(settings)
    user = editorial.nouveautes.hypem_favorites_user
    with _db(settings) as conn:
        if user is None:
            _record(conn, "favoris", True, {"compte": "aucun"})
            _echo(
                ["Favoris Hype Machine : aucun compte configuré (nouveautes.hypem_favorites_user)"]
            )
            return
        try:
            rep = favorites_pass(
                conn,
                DeezerClient(),
                HypemClient(),
                user,
                editorial.library.duration_tolerance_s,
                _now(),
            )
        except (HypemError, HypemUnavailable) as e:
            _fail(f"Favoris Hype Machine illisibles ({type(e).__name__} : {e})", 1)
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
        _record(
            conn,
            "favoris",
            True,
            {
                "favoris": rep.n_seen,
                "trouvés sur Deezer": rep.n_matched,
                "non trouvés sur Deezer": rep.n_unmatched,
                "déjà dans la bibliothèque": rep.n_library,
                "retirés": rep.n_dropped,
            },
        )
    _echo(
        [
            f"Favoris Hype Machine : {_n(rep.n_matched)} trouvés sur Deezer sur {_n(rep.n_seen)}"
            f" (dont {_n(rep.n_library)} déjà dans la bibliothèque), {_n(rep.n_unmatched)} non"
            f" trouvés, {_n(rep.n_dropped)} retirés"
        ]
    )


@app.command("negatives-sync")
def negatives_sync() -> None:
    """Importe les titres des artistes négatifs de démarrage (config/negatives.toml)."""
    settings = _settings()
    editorial = _editorial(settings)
    try:
        negatives = load_negatives(settings.config_dir / "negatives.toml")
    except ValidationError as e:
        _fail(f"negatives.toml invalide : {e.error_count()} erreurs", 2)
    except ValueError as e:
        _fail(f"negatives.toml invalide : {e}", 2)
    with _db(settings) as conn:
        try:
            rep = import_negatives(
                conn, DeezerClient(), negatives, editorial.discover.tracks_per_neighbour, _now()
            )
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
    _echo(
        [
            f"Négatifs : {_n(rep.n_artists)} artistes ({_n(rep.n_already)} déjà importés) → "
            f"{_n(rep.n_added)} titres ajoutés, {_n(rep.n_duplicates)} doublons, "
            f"{_n(rep.n_filtered)} écartés, {_n(len(rep.skipped))} sautés",
            *(f"  sauté : {s}" for s in rep.skipped),
        ]
    )


@app.command()
@_stage("signals")
def signals() -> None:
    """Mesure l'empreinte audio de tous les titres connus (bibliothèque, candidats, négatifs)."""
    settings = _settings()
    try:
        embedder = EffnetEmbedder(settings.effnet_model)
    except ModelError as e:
        _fail(f"Modèle EffNet refusé : {e}", 2)
    now = _now()
    with _db(settings) as conn:
        reg = register_library(conn, now)
        try:
            meas = measure_tracks(conn, DeezerClient(), embedder, now)
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
        origins = Counter(load_signals(conn).origins)
        _record(
            conn,
            "signals",
            True,
            {
                "à mesurer": meas.n_todo,
                "mesurés": meas.n_ok,
                "sans extrait": meas.n_no_preview,
                "empreinte ratée": meas.n_audio_failed,
                "disparus": meas.n_gone,
                "erreurs": len(meas.errors),
            },
        )
    _echo(
        [
            f"Bibliothèque inscrite : {_n(reg.n_tracks)} titres, {_n(reg.n_artists)} artistes "
            f"({_n(reg.n_removed)} retirés)",
            f"Titres : {_n(meas.n_todo)} à mesurer → {_n(meas.n_ok)} mesurés, "
            f"{_n(meas.n_no_preview)} sans extrait, {_n(meas.n_audio_failed)} empreinte ratée, "
            f"{_n(meas.n_gone)} disparus de Deezer, {_n(len(meas.errors))} en erreur",
            *(f"  erreur : {x}" for x in meas.errors),
            f"Empreintes prêtes : {_n(origins.total())} titres (bibliothèque "
            f"{_n(origins['library'])}, candidats {_n(origins['candidate'])}, négatifs "
            f"{_n(origins['negative'])})",
        ]
    )


@app.command()
@_stage("acquire")
def acquire() -> None:
    """Télécharge les titres retenus sur Soulseek, prouve leur identité et les prépare."""
    settings = _settings()
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
                "artiste déjà en rotation ou deux fois à l'antenne": rep.n_artist_waiting,
                "échecs": dict(rep.failures),
            },
        )
    _echo(
        [
            f"Acquisition : {_n(rep.n_wanted)} demandés → {_n(rep.n_ready)} prêts "
            f"({_pct(rep.n_ready, rep.n_attempted)} des tentés), "
            f"{_n(sum(rep.failures.values()))} en échec",
            f"  prêts sans pochette : {_n(rep.n_no_cover)}",
            f"  retenus en attente, leur artiste ayant déjà un titre en rotation ou deux à "
            f"l'antenne : "
            f"{_n(rep.n_artist_waiting)}",
            *(f"  {reason} : {_n(n)}" for reason, n in rep.failures.most_common()),
        ]
    )
    if rep.n_unindexed:
        _fail(
            f"Sockseek s'est arrêté avant {_n(rep.n_unindexed)} titres, non comptés comme "
            "tentatives : voir le journal",
            1,
        )
    if not rate_ok:
        _fail(f"Taux d'acquisition sous {_rate(cfg.min_success_rate)} : à examiner", 1)


@app.command()
@_stage("antenne")
def antenne() -> None:
    """Publie les titres prêts, fait vivre chaque titre (fin de séjour, promotion, repos,
    péremption) et fait tourner les repères."""
    settings = _settings()
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
                "promus": rep.n_promoted,
                "fins de séjour": rep.n_ended,
                "mis au repos": rep.n_rested,
                "revenus au fond": rep.n_returned,
                "périmés": rep.n_expired,
                "repères sortis": rep.n_references_out,
                "repères écartés, artiste déjà deux fois à l'antenne": rep.n_references_artist_full,
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
            f"  fin du premier séjour : {_n(rep.n_promoted)} promus au repos, "
            f"{_n(rep.n_ended)} sortis",
            f"  fond : {_n(rep.n_rested)} mis au repos, {_n(rep.n_returned)} revenus, "
            f"{_n(rep.n_expired)} périmés",
            f"  réalignement : {_n(rep.n_forgotten)} disparus d'AzuraCast oubliés, "
            f"{_n(rep.n_unknown)} fichiers inconnus dans antenne/ et repos/",
            f"  repères sans pochette : {_n(rep.n_references_no_cover)}",
            f"  repères écartés, artiste déjà deux fois à l'antenne : "
            f"{_n(rep.n_references_artist_full)}, artiste inconnu : "
            f"{_n(rep.n_references_no_artist)}",
            *(f"  sauté : {s}" for s in rep.skipped_references),
            *(f"  erreur : {e}" for e in rep.errors),
        ]
    )
    if rep.errors:
        _fail(f"{_n(len(rep.errors))} erreurs de publication", 1)


@app.command("antenne-isrc")
def antenne_isrc() -> None:
    """Rattrapage ponctuel : écrit l'ISRC dans chaque fichier déjà à l'antenne. Se relance sans
    effet sur les titres déjà étiquetés."""
    settings = _settings()
    if settings.azuracast_api_key is None:
        _fail("AZURACAST_API_KEY doit être défini dans .env", 2)
    station = AzuracastClient(
        settings.azuracast_url,
        settings.azuracast_api_key.get_secret_value(),
        settings.azuracast_station_id,
    )
    rep = IsrcReport()
    with _db(settings) as conn:
        try:
            isrc_backfill(conn, station, DeezerClient(), rep)
        except AzuracastUnavailable as e:
            _fail(f"AzuraCast indisponible ({e}) : le travail fait est gardé", 1)
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
    _echo(
        [
            f"ISRC : {_n(rep.n_tagged)} fichiers étiquetés, {_n(rep.n_already)} l'étaient déjà",
            f"  sans ISRC chez Deezer : {_n(rep.n_no_isrc)}, disparus de Deezer : {_n(rep.n_gone)}",
            f"  en cours ou en file, à reprendre : {_n(rep.n_busy)}",
            *(f"  erreur : {e}" for e in rep.errors),
        ]
    )
    if rep.errors:
        _fail(f"{_n(len(rep.errors))} erreurs", 1)


@app.command()
@_stage("mesures")
def mesures() -> None:
    """Mesure les titres à l'antenne (dansabilité, arousal, valence, tempo ; titre entier, début,
    fin) pour l'enchaînement."""
    settings = _settings()
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
    settings = _settings()
    cfg = _editorial(settings).grille
    if settings.azuracast_api_key is None:
        _fail("AZURACAST_API_KEY doit être défini dans .env", 2)
    station = AzuracastClient(
        settings.azuracast_url,
        settings.azuracast_api_key.get_secret_value(),
        settings.azuracast_station_id,
    )
    try:
        tz = ZoneInfo(station.timezone())
        now = datetime.now(tz)
        day = now.date() if aujourdhui else now.date() + timedelta(days=1)
        hours = list(range(now.hour + 1, 24)) if aujourdhui else list(range(24))
        history = station.last_played((now - timedelta(days=14)).isoformat(), now.isoformat())
        # Un titre en file passe même si son heure est réécrite, une fois remis à Liquidsoap :
        # il compte comme joué à son heure prévue.
        for song, at in station.queued().items():
            history[song] = max(history.get(song, at), at)
        with _db(settings) as conn:
            midnight = datetime.combine(day, time(0), tzinfo=tz).timestamp()
            played = grille_mod.with_published(conn, history, now.timestamp(), midnight, hours)
            plan = grille_mod.plan_day(
                grille_mod.load_titres(conn), played, cfg, day, hours, midnight
            )
            errors = grille_mod.publish(plan, station)
            grille_mod.record(conn, plan, midnight)
            _record(
                conn,
                "grille",
                not errors and not plan.empty_slots,
                {
                    "jour": day.isoformat(),
                    "heures": len(hours),
                    "créneaux": plan.slots,
                    "créneaux vides": plan.empty_slots,
                    "titres non mesurés": plan.unmeasured,
                    "titres en retard": plan.late,
                    "tour en jours": {c: round(d, 2) for c, d in plan.turnover_days.items()},
                    "titres par artiste au plus": plan.max_per_artist,
                    "erreurs": len(errors),
                },
            )
    except AzuracastUnavailable as e:
        _fail(f"AzuraCast indisponible ({e})", 1)
    _echo(
        [
            f"Grille du {day.isoformat()} : {_n(len(hours))} heures, créneaux "
            + ", ".join(f"{c} {_n(n)}" for c, n in plan.slots.items()),
            f"  créneaux vides : {_n(plan.empty_slots)}, titres pas encore mesurés : "
            f"{_n(plan.unmeasured)}, titres pas joués depuis plus de deux tours : "
            f"{_n(plan.late)}",
            "  tour de chaque catégorie : "
            + ", ".join(f"{c} {d:.1f} j" for c, d in plan.turnover_days.items())
            + f" ; titres d'un même artiste à l'antenne : {_n(plan.max_per_artist)} au plus",
            *(f"  erreur : {e}" for e in errors),
        ]
    )
    # Une heure prévoit un titre de plus qu'elle n'en joue : un créneau vide entame cette marge,
    # au-delà le secours joue à la place de la grille (vision §1). La grille publiée est gardée,
    # et l'échec fait alerter Gatus.
    problems = [f"{_n(len(errors))} heures mal écrites"] if errors else []
    if plan.empty_slots:
        problems.append(f"{_n(plan.empty_slots)} créneaux vides : le secours peut jouer")
    if problems:
        _fail(" ; ".join(problems), 1)


def _train_lines(r: TrainReport) -> list[str]:
    c = r.counts
    verdict = "promu" if r.promoted else "non promu"
    return [
        f"Exemples : bibliothèque {_n(c['library'])}, oui {_n(c['vote_yes'])}, "
        f"non {_n(c['vote_no'])}, négatifs faibles {_n(c['weak'])} "
        f"({_n(r.n_weak_excluded)} écartés) ; {_n(r.n_votes_unmeasured)} votes sans empreinte",
        f"Examen : {_n(r.n_exam)} votes, AUC {_dec(r.new_auc)} (modèle en service : "
        f"{_dec(r.current_auc)})",
        f"Modèle n°{r.model_id} : {verdict} — {r.verdict}",
    ]


def _batch_line(b: Batch) -> str:
    return (
        f"Dernière fournée (passe n°{b.run_id}) : {_n(b.retained)} retenus sur {_n(b.n)} candidats"
    )


@app.command("train")
@_stage("train")
def train_command() -> None:
    """Entraîne le modèle s'il y a de nouveaux votes, puis note les candidats."""
    settings = _settings()
    cfg = _editorial(settings).model
    models_dir = settings.data_dir / "models"
    lines = []
    with _db(settings) as conn:
        n = votes_count(conn)
        if n == trained_on(conn):
            lines.append(f"Aucun nouveau vote ({_n(n)} votes) : pas de réentraînement")
        else:
            try:
                lines += _train_lines(train(conn, models_dir, cfg, _now()))
            except MissingExamplesError:
                _fail(
                    "Exemples insuffisants (il faut des titres de la bibliothèque et des négatifs "
                    "mesurés) : lancer radio negatives-sync puis radio signals",
                    1,
                )
        model_id = rescore(conn, models_dir, cfg)
        batch = last_batch(conn)
        favorites = favorites_retained(conn, models_dir)
        _record(
            conn,
            "train",
            model_id is not None,
            {
                "modèle en service": model_id,
                "candidats": batch.n if batch else 0,
                "retenus": batch.retained if batch else 0,
                "favoris retenus": None if favorites is None else round(favorites.share, 3),
            },
        )
    if model_id is None:
        lines.append("Aucun modèle en service : candidats non notés")
    else:
        lines.append(f"Candidats notés par le modèle n°{model_id}")
        if batch is not None:
            lines.append(_batch_line(batch))
        if favorites is not None:
            lines.append(
                f"Favoris Hype Machine retenus par ce modèle : {favorites.share:.0%} de "
                f"{_n(favorites.n)} (le hasard en retiendrait {favorites.chance:.0%})"
            )
    _echo(lines)


def _status(settings: Settings, editorial: Editorial) -> Status:
    with _db(settings) as conn:
        return load_status(
            conn,
            settings.data_dir / "models",
            editorial.model.exam_window,
            editorial.votes.quiet_days,
            datetime.now(UTC),
        )


def _status_lines(st: Status, quiet_days: int, votes_active: bool) -> list[str]:
    if st.model_id is None:
        lines = ["Aucun modèle en service"]
    else:
        lines = [f"Modèle n°{st.model_id} : AUC d'examen {_dec(st.exam_auc)} sur {_n(st.n_exam)}"]
    if st.yes is None:
        lines.append("Taux de oui des retenus : aucun vote d'examen sur la page")
    else:
        y = st.yes
        lines.append(
            f"Taux de oui des retenus : {_rate(y.rate)} [{_rate(y.low)} - {_rate(y.high)}] "
            f"sur {_n(y.n)} votes d'examen"
        )
    lines += [
        f"Dernier vote d'examen : {st.last_exam_vote or 'aucun'}",
        f"Votes des {quiet_days} derniers jours : {_n(st.recent_votes)}",
        f"Titres en attente de vote : {_n(st.pending)} "
        f"(dernière sélection : {st.last_selection or 'aucune'})",
    ]
    # Sans page de vote publiée, la sélection est volontairement hors de la passe : rien à signaler.
    if votes_active and st.pending == 0:
        if st.last_selection is None:
            lines.append("ALERTE : aucune sélection encore tirée (passe hebdomadaire en échec ?)")
        elif st.stale_selection_days is not None and st.stale_selection_days > quiet_days:
            lines.append(
                f"ALERTE : aucune sélection depuis {_n(st.stale_selection_days)} jours "
                "(passe hebdomadaire en échec ?)"
            )
    if st.batch is not None:
        lines.append(_batch_line(st.batch))
    return lines


def _stage_lines(stages: list[tuple[str, str, bool, dict[str, object]]]) -> list[str]:
    return [
        f"{'  ' if ok else '✗ '}{stage} ({at[:16].replace('T', ' ')}) : "
        + ", ".join(f"{k} {v}" for k, v in counts.items())
        for stage, at, ok, counts in stages
    ]


# Étapes de deploy/systemd/radio-weekly.service : chacune doit avoir laissé sa ligne de rapport.
PASS_STAGES = (
    "library-sync",
    "discover",
    "nouveautes",
    "favoris",
    "signals",
    "train",
    "votes-select",
    "acquire",
    "antenne",
    "mesures",
    "grille",
)


@app.command()
def check() -> None:
    """Juge la passe systemd en cours : une étape en échec, ou aucune découverte publiée, la fait
    échouer (et Gatus alerte)."""
    invocation = os.environ.get("INVOCATION_ID")
    if not invocation:
        _fail("INVOCATION_ID absent : radio check juge une passe lancée par systemd", 2)
    with _db(_settings()) as conn:
        stages = invocation_stages(conn, invocation)
    failed = [s for s, ok, _ in stages if not ok]
    missing = [s for s in PASS_STAGES if s not in {name for name, _, _ in stages}]
    published = sum(int(str(c.get("publiés", 0))) for s, _, c in stages if s == "antenne")
    _echo(
        [f"Passe : {_n(len(stages))} étapes, {_n(len(failed))} en échec, {_n(published)} publiés"]
    )
    if failed:
        _fail(f"Étapes en échec : {', '.join(failed)} (radio report)", 1)
    if missing:
        _fail(f"Étapes sans rapport (tuées ?) : {', '.join(missing)} (journal systemd)", 1)
    if published == 0:
        _fail("Aucune découverte publiée cette semaine (radio report)", 1)


@app.command("backup")
def backup_command() -> None:
    """Copie la base (API de sauvegarde SQLite, vérifiée) et les modèles dans RADIO_BACKUP_DIR."""
    settings = _settings()
    if settings.backup_dir is None:
        _fail("RADIO_BACKUP_DIR doit être défini dans .env", 2)
    try:
        target = backup(
            settings.data_dir / "radio.db",
            settings.data_dir / "models",
            settings.backup_dir,
            datetime.now(UTC).date(),
            _editorial(settings).backup.keep_days,
        )
    except (BackupError, sqlite3.Error, OSError) as e:
        _fail(f"Sauvegarde ratée : {e}", 1)
    _echo([f"Sauvegarde : {target}"])


@app.command()
def report() -> None:
    """État : dernières étapes, modèle en service, taux de oui, votes, dernière fournée."""
    settings = _settings()
    editorial = _editorial(settings)
    with _db(settings) as conn:
        stages = last_stages(conn)
        suivi = load_suivi(conn, editorial.nouveautes)
    status = _status_lines(
        _status(settings, editorial), editorial.votes.quiet_days, bool(settings.votes_url)
    )
    _echo(["Dernières étapes :", *_stage_lines(stages), *status, *suivi_lines(suivi)])


@app.command("votes-select")
@_stage("votes-select")
def votes_select() -> None:
    """Tire la sélection de la semaine : examen au hasard sur toute la fournée, leçon par
    incertitude."""
    settings = _settings()
    v = _editorial(settings).votes
    with _db(settings) as conn:
        try:
            sel = select_batch(
                conn,
                np.random.default_rng(),
                v.exam_per_selection,
                v.lesson_per_selection,
                _now(),
            )
        except PendingBallotsError as e:
            _record(conn, "votes-select", True, {"en attente de vote": e.n})
            typer.echo(f"{_n(e.n)} titres encore en attente de vote : pas de nouvelle sélection")
            return
        except NoServingModelError:
            _fail("Aucun modèle en service : lancer radio train", 1)
        except NoScoresError:
            _fail("Le modèle en service n'a noté aucun candidat : lancer radio train", 1)
        _record(
            conn,
            "votes-select",
            True,
            {"examen": len(sel.exam), "leçon": len(sel.lesson), "fournée": sel.n_batch},
        )
    if sel.selection_id is None:
        typer.echo("Rien à présenter : tous les candidats notés ont déjà été présentés")
        return
    typer.echo(
        f"Sélection n°{sel.selection_id} (modèle n°{sel.model_id}, fournée n°{sel.run_id}) : "
        f"{_n(len(sel.exam))} d'examen parmi {_n(sel.n_batch)} titres de la fournée, "
        f"{_n(len(sel.lesson))} de leçon"
    )


@app.command("votes-serve")
def votes_serve() -> None:
    """Sert la page de vote en local ; le tunnel Cloudflare la publie derrière Access."""
    settings = _settings()
    team, aud = settings.cf_access_team_domain, settings.cf_access_aud
    if not team or not aud:
        _fail("CF_ACCESS_TEAM_DOMAIN et CF_ACCESS_AUD doivent être définis dans .env", 2)
    web = create_app(
        settings.data_dir / "radio.db",
        DeezerClient(),
        AccessVerifier(team, aud),
        _editorial(settings).nouveautes,
    )
    uvicorn.run(web, host=settings.votes_host, port=settings.votes_port)


def _page_ok(settings: Settings) -> bool:
    """Sonde le serveur local seulement : tunnel ou règle Access en panne non détectés."""
    try:
        r = requests.get(f"http://{settings.votes_host}:{settings.votes_port}/sante", timeout=5)
    except requests.RequestException:
        return False
    return r.status_code == 200


@app.command("votes-remind")
def votes_remind() -> None:
    """Envoie le rappel WhatsApp : titres en attente, taux de oui, alertes."""
    settings = _settings()
    editorial = _editorial(settings)
    if settings.whatsapp_phone is None or settings.callmebot_apikey is None:
        _fail("WHATSAPP_PHONE et CALLMEBOT_APIKEY doivent être définis dans .env", 2)
    if not settings.votes_url:
        _fail("RADIO_VOTES_URL doit être défini dans .env", 2)
    st = _status(settings, editorial)
    head = (
        f"AubeSonore : {_n(st.pending)} titres à écouter — {settings.votes_url}"
        if st.pending
        else "AubeSonore : aucun titre en attente de vote"
    )
    with _db(settings) as conn:
        to_adjust = load_suivi(conn, editorial.nouveautes).to_adjust
    suivi = f"Suivi : {settings.votes_url.rstrip('/')}/suivi" + (
        f" ({_n(len(to_adjust))} points à ajuster)" if to_adjust else ""
    )
    lines = [head, suivi] + ([] if _page_ok(settings) else ["Page de vote injoignable"])
    text = "\n".join(lines + _status_lines(st, editorial.votes.quiet_days, True))
    typer.echo(text)
    try:
        send_whatsapp(
            settings.whatsapp_phone.get_secret_value(),
            settings.callmebot_apikey.get_secret_value(),
            text,
        )
    except WhatsAppError as e:
        _fail(f"Rappel WhatsApp non envoyé : {e}", 1)
    typer.echo("Rappel WhatsApp envoyé")
