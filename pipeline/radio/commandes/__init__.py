"""Commandes AubeSonore : goût, découverte, acquisition, antenne et votes. Chaque module
enregistre ses commandes sur l'application de `common` à son import ; `radio --help` les liste
dans l'ordre des imports ci-dessous, où les étapes de la passe hebdomadaire suivent son ordre."""

# L'ordre des imports est celui de l'aide : pas de tri. votes avant antenne : tirage
# tourne entre gout et telechargement.
from radio.commandes import gout  # noqa: I001
from radio.commandes import votes
from radio.commandes import antenne, exploitation
from radio.commandes.commun import app

__all__ = ["antenne", "app", "exploitation", "gout", "votes"]
