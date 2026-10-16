---
description: Les niveaux de test de musilogy et l'origine des témoins — chargé en ouvrant un fichier de musilogy/tests/
paths:
  - "musilogy/tests/**/*.py"
---

# Tester musilogy

Ce qui suit est propre à ce dépôt.

## Les témoins viennent du dump

`uv run musilogy make-fixtures` extrait les fixtures du vrai dump MusicBrainz.
Un cas fabriqué à la main valide ma compréhension de la source, pas la source :
si un témoin manque, on le tire du dump, on n'invente pas la ligne.

Les fixtures versionnées ne s'éditent pas à la main — elles se régénèrent.

## Les niveaux de test

Les niveaux de test et ce que chacun exige : `README.md` (« Installation,
tests, exécution »). La suite rapide tourne à chaque changement et garde la CI
verte.

`tests/` est un paquet : un module de test s'importe par `tests.conftest` ou
`tests.test_x`, et la surcharge mypy `tests.*` de `pyproject.toml` couvre tout
nouveau fichier.

## Nommer la casse avant d'écrire le test

Quel changement du code de production ferait échouer ce test ? Un test qui ne
casse que sur une constante volontairement modifiée signale les refontes et
dort sur les bugs.

Les tests prennent des fixtures pytest et ne renvoient rien : `pyproject.toml`
lève `disallow_untyped_defs` pour les modules de `tests/`, les corps restent
vérifiés. Inutile d'annoter `-> None` partout.
