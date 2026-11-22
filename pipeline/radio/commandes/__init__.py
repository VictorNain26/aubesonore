"""Commandes AubeSonore, un module par étape (docs/conception.md, « Vocabulaire »). Chaque module
enregistre ses commandes sur l'application de `commun` à son import ; `radio --help` les liste
dans l'ordre des imports ci-dessous, celui de la passe hebdomadaire."""

# L'ordre des imports est celui de l'aide : pas de tri.
from radio.commandes import bibliotheque  # noqa: I001
from radio.commandes import decouverte
from radio.commandes import empreintes
from radio.commandes import gout
from radio.commandes import votes
from radio.commandes import telechargement
from radio.commandes import antenne
from radio.commandes import mesures
from radio.commandes import grille
from radio.commandes import exploitation
from radio.commandes.commun import app

__all__ = [
    "antenne",
    "app",
    "bibliotheque",
    "decouverte",
    "empreintes",
    "exploitation",
    "gout",
    "grille",
    "mesures",
    "telechargement",
    "votes",
]
