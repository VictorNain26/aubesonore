"""Le modèle de goût : entraînement et notes."""

from radio.commandes import commun
from radio.commandes.commun import (
    _batch_line,
    _db,
    _dec,
    _echo,
    _editorial,
    _fail,
    _n,
    _now,
    _record,
    _stage,
    app,
)
from radio.gout.exemples import MissingExamplesError
from radio.gout.modele import (
    TrainReport,
    favorites_retained,
    last_batch,
    rescore,
    train,
    trained_on,
    votes_count,
    votes_digest,
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


@app.command("gout")
@_stage("gout")
def gout() -> None:
    """Entraîne le modèle s'il y a des votes nouveaux ou corrigés, puis note les candidats."""
    settings = commun._settings()
    cfg = _editorial(settings).model
    models_dir = settings.trained_models_dir
    lines = []
    with _db(settings) as conn:
        if votes_digest(conn) == trained_on(conn):
            lines.append(
                f"Aucun vote nouveau ni corrigé ({_n(votes_count(conn))} votes) : "
                "pas de réentraînement"
            )
        else:
            try:
                lines += _train_lines(train(conn, models_dir, cfg, _now()))
            except MissingExamplesError:
                _fail(
                    "Exemples insuffisants (il faut des titres de la bibliothèque et des négatifs "
                    "mesurés) : lancer radio negatifs puis radio empreintes",
                    1,
                )
        model_id = rescore(conn, models_dir, cfg)
        batch = last_batch(conn)
        favorites = favorites_retained(conn, models_dir)
        _record(
            conn,
            "gout",
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
