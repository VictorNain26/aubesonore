"""Commandes AubeSonore : goût, découverte, acquisition, antenne et votes. Chaque module
enregistre ses commandes sur l'application de `common` à son import ; `radio --help` les liste
dans l'ordre des imports ci-dessous, où les étapes de la passe hebdomadaire suivent son ordre
(un test le vérifie)."""

# L'ordre des imports est celui de l'aide : pas de tri. votes avant antenne : votes-select
# tourne entre train et acquire.
from radio.cli import gout  # noqa: I001
from radio.cli import votes
from radio.cli import antenne, ops
from radio.cli.common import app

__all__ = ["antenne", "app", "gout", "ops", "votes"]
