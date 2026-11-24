"""Les empreintes EffNet des extraits Deezer."""

from collections import Counter

from radio.commandes import commun
from radio.commandes.commun import (
    _db,
    _echo,
    _fail,
    _n,
    _now,
    _record,
    _stage,
    _unavailable,
    app,
)
from radio.empreintes.calcul import calculer_empreintes
from radio.empreintes.effnet import EffnetEmbedder
from radio.empreintes.table import charger_empreintes
from radio.socle.epingles import ModelError
from radio.sources.deezer import DeezerClient, DeezerUnavailable


@app.command("empreintes")
@_stage("empreintes")
def empreintes() -> None:
    """Mesure l'empreinte audio de tous les titres connus (bibliothèque, candidats, négatifs)."""
    settings = commun._settings()
    try:
        embedder = EffnetEmbedder(settings.effnet_model)
    except ModelError as e:
        _fail(f"Modèle EffNet refusé : {e}", 2)
    now = _now()
    with _db(settings) as conn:
        try:
            meas = calculer_empreintes(conn, DeezerClient(), embedder, now)
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
        origins = Counter(charger_empreintes(conn).origins)
        _record(
            conn,
            "empreintes",
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
