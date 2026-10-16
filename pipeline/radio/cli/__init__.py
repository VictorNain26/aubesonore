"""Commandes AubeSonore : goût, découverte, acquisition, antenne et votes. Chaque module
enregistre ses commandes sur l'application de `common` à son import ; `radio --help` les liste
dans l'ordre des imports ci-dessous, celui de la passe hebdomadaire."""

# L'ordre des imports est celui de l'aide : pas de tri.
from radio.cli import gout  # noqa: I001
from radio.cli import antenne, ops, votes
from radio.cli.common import app

__all__ = ["antenne", "app", "gout", "ops", "votes"]
