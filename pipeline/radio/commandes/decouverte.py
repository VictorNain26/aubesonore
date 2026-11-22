"""La fournée : voisins des graines, nouveautés, favoris Hype Machine, négatifs."""

from datetime import UTC, datetime

import numpy as np
from pydantic import ValidationError

from radio.commandes import commun
from radio.commandes.commun import (
    _db,
    _echo,
    _editorial,
    _exclusive,
    _fail,
    _n,
    _now,
    _record,
    _stage,
    _unavailable,
    app,
)
from radio.decouverte.favoris import favorites_pass
from radio.decouverte.fournee import NoLibraryArtistsError, discover_pass
from radio.decouverte.negatifs import import_negatives, load_negatives
from radio.decouverte.nouveautes import NoBatchError, fresh_pass
from radio.sources.deezer import DeezerClient, DeezerUnavailable
from radio.sources.hypem import HypemClient, HypemError, HypemUnavailable
from radio.sources.lastfm import LastfmUnavailable


@app.command("decouverte")
@_stage("decouverte")
def decouverte() -> None:
    """Tire des graines dans la bibliothèque et découvre des titres candidats."""
    settings = commun._settings()
    editorial = _editorial(settings)
    lastfm = commun._lastfm(settings)
    with _db(settings) as conn:
        try:
            rep = discover_pass(
                conn,
                DeezerClient(),
                lastfm,
                editorial.decouverte,
                datetime.now(UTC),
                np.random.default_rng(),
            )
        except NoLibraryArtistsError:
            _fail(
                "Aucun artiste de la bibliothèque rapproché : lancer d'abord radio bibliotheque", 1
            )
        except (DeezerUnavailable, LastfmUnavailable) as e:
            _fail(_unavailable(e), 1)
        _record(
            conn,
            "decouverte",
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


@app.command("nouveautes")
@_stage("nouveautes")
def nouveautes() -> None:
    """Ajoute à la dernière fournée des titres récents choisis par des humains (Hype Machine,
    sélections éditoriales Deezer), chacun avec sa source."""
    settings = commun._settings()
    editorial = _editorial(settings)
    with _db(settings) as conn:
        try:
            rep = fresh_pass(
                conn,
                DeezerClient(),
                HypemClient(),
                editorial.nouveautes,
                editorial.bibliotheque.ecart_duree_s,
                _now(),
            )
        except NoBatchError:
            _fail("Aucune fournée de découverte : lancer d'abord radio decouverte", 1)
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


@app.command("favoris")
@_stage("favoris")
def favoris() -> None:
    """Relit les favoris Hype Machine de Victor : déjà aimés, ils ne sont plus des découvertes."""
    settings = commun._settings()
    editorial = _editorial(settings)
    user = editorial.nouveautes.compte_favoris_hypem
    with _db(settings) as conn:
        if user is None:
            _record(conn, "favoris", True, {"compte": "aucun"})
            _echo(
                ["Favoris Hype Machine : aucun compte configuré (nouveautes.compte_favoris_hypem)"]
            )
            return
        try:
            rep = favorites_pass(
                conn,
                DeezerClient(),
                HypemClient(),
                user,
                editorial.bibliotheque.ecart_duree_s,
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


@app.command("negatifs")
def negatifs() -> None:
    """Importe les titres des artistes négatifs de démarrage (config/negatives.toml)."""
    settings = commun._settings()
    editorial = _editorial(settings)
    try:
        negatives = load_negatives(settings.config_dir / "negatives.toml")
    except ValidationError as e:
        _fail(f"negatives.toml invalide : {e.error_count()} erreurs", 2)
    except ValueError as e:
        _fail(f"negatives.toml invalide : {e}", 2)
    with _exclusive(), _db(settings) as conn:
        try:
            rep = import_negatives(
                conn, DeezerClient(), negatives, editorial.decouverte.titres_par_voisin, _now()
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
