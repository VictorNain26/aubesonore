"""Le goût et la découverte : bibliothèque, candidats, nouveautés, favoris, négatifs,
empreintes et modèle."""

from collections import Counter
from datetime import UTC, datetime
from pathlib import PurePosixPath

import numpy as np
import requests
from plexapi.exceptions import PlexApiException
from pydantic import ValidationError

from radio.cli import common
from radio.cli.common import (
    _batch_line,
    _db,
    _dec,
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
from radio.discover.favorites import favorites_pass
from radio.discover.fresh import NoBatchError, fresh_pass
from radio.discover.negatives import import_negatives, load_negatives
from radio.discover.run import NoLibraryArtistsError, discover_pass
from radio.library.artists import register_library
from radio.library.match import coverage, match_library
from radio.library.sync import EmptyLibraryError, sync_library
from radio.model.dataset import MissingExamplesError
from radio.model.model import (
    TrainReport,
    favorites_retained,
    last_batch,
    rescore,
    train,
    trained_on,
    votes_count,
)
from radio.signals.audio import EffnetEmbedder, ModelError
from radio.signals.measure import measure_tracks
from radio.signals.table import load_signals
from radio.sources.deezer import DeezerClient, DeezerUnavailable
from radio.sources.hypem import HypemClient, HypemError, HypemUnavailable
from radio.sources.lastfm import LastfmUnavailable
from radio.sources.plex import LibraryGuardError, PlexSource

_REASONS = (
    ("no_duration", "sans durée"),
    ("no_result", "sans résultat"),
    ("no_exact_match", "sans correspondance exacte"),
)


@app.command("library-sync")
@_stage("library-sync")
def library_sync() -> None:
    """Lit la bibliothèque Plex et la rapproche de Deezer."""
    settings = common._settings()
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
            f"Bibliothèque inscrite : {_n(reg.n_tracks)} titres, {_n(reg.n_artists)} artistes "
            f"({_n(reg.n_removed)} retirés)",
        ]
    )


@app.command()
@_stage("discover")
def discover() -> None:
    """Tire des graines dans la bibliothèque et découvre des titres candidats."""
    settings = common._settings()
    editorial = _editorial(settings)
    lastfm = common._lastfm(settings)
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
    settings = common._settings()
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
    settings = common._settings()
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
    settings = common._settings()
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
    settings = common._settings()
    try:
        embedder = EffnetEmbedder(settings.effnet_model)
    except ModelError as e:
        _fail(f"Modèle EffNet refusé : {e}", 2)
    now = _now()
    with _db(settings) as conn:
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
            f"Titres : {_n(meas.n_todo)} à mesurer → {_n(meas.n_ok)} mesurés, "
            f"{_n(meas.n_no_preview)} sans extrait, {_n(meas.n_audio_failed)} empreinte ratée, "
            f"{_n(meas.n_gone)} disparus de Deezer, {_n(len(meas.errors))} en erreur",
            *(f"  erreur : {x}" for x in meas.errors),
            f"Empreintes prêtes : {_n(origins.total())} titres (bibliothèque "
            f"{_n(origins['library'])}, candidats {_n(origins['candidate'])}, négatifs "
            f"{_n(origins['negative'])})",
        ]
    )


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


@app.command("train")
@_stage("train")
def train_command() -> None:
    """Entraîne le modèle s'il y a de nouveaux votes, puis note les candidats."""
    settings = common._settings()
    cfg = _editorial(settings).model
    models_dir = settings.trained_models_dir
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
                "nouveautés sous le plancher": batch.floored if batch else 0,
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
