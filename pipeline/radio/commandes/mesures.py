"""Les mesures d'écoute des titres à l'antenne."""

from radio.commandes import commun
from radio.commandes.commun import (
    _db,
    _echo,
    _fail,
    _n,
    _now,
    _record,
    _stage,
    app,
)
from radio.mesures import musicnn
from radio.socle.epingles import ModelError


@app.command("mesures")
@_stage("mesures")
def mesures() -> None:
    """Mesure les titres à l'antenne (dansabilité, arousal, valence, tempo ; titre entier, début,
    fin) pour l'enchaînement."""
    settings = commun._settings()
    try:
        extractor = musicnn.FeatureExtractor(settings.models_dir)
    except ModelError as e:
        _fail(f"Modèles de mesure refusés : {e}", 2)
    with _db(settings) as conn:
        rep = musicnn.measure_antenna(conn, settings.azuracast_media_dir, extractor, _now())
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
