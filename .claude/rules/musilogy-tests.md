---
description: Les deux niveaux de test de musilogy et l'origine des témoins — chargé en ouvrant un fichier de musilogy/tests/
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

## Deux niveaux, deux rôles

```bash
uv run pytest            # suite rapide sur les témoins (défaut, -m 'not slow')
uv run pytest -m slow    # ligne de base sur le dump réel, exige data/work/
```

La suite rapide tourne à chaque changement et garde la CI verte. La ligne de
base rejoue le pipeline complet : elle ne tourne qu'à la demande, prend environ
5 minutes une fois les extractions de `data/work/` produites (une dizaine de
minutes de plus pour les produire).

`tests/` est un paquet : un module de test s'importe par `tests.conftest` ou
`tests.test_x`, et la surcharge mypy `tests.*` de `pyproject.toml` couvre tout
nouveau fichier.

`tests/test_baseline.py` est le contrat exécutable des chiffres : c'est le seul
point d'autorité. Un écart à la ligne de base se comprend avant d'être
entériné — on identifie la règle qui l'a produit, on dit pourquoi le nouveau
chiffre est le bon, puis on met le contrat à jour. Aligner le chiffre attendu
sur le chiffre obtenu sans cette étape supprime le test au lieu de le faire
passer.

## Nommer la casse avant d'écrire le test

Quel changement du code de production ferait échouer ce test ? Un test qui ne
casse que sur une constante volontairement modifiée signale les refontes et
dort sur les bugs.

Les tests prennent des fixtures pytest et ne renvoient rien : `pyproject.toml`
lève `disallow_untyped_defs` pour les modules de `tests/`, les corps restent
vérifiés. Inutile d'annoter `-> None` partout.
