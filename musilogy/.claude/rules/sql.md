---
description: Conventions des règles SQL de musilogy — chargé en ouvrant un fichier de src/musilogy/sql/
paths:
  - "src/musilogy/sql/**/*.sql"
---

# Les règles SQL

Le SQL arbitre, le Python enchaîne et vérifie. Une règle métier qui migre vers
`build.py` sort du seul endroit où elle est lisible d'un bloc.

## Numérotation

Les fichiers sont numérotés par ordre topologique de dépendance, de dix en dix
(`00_macros`, `10_bands`, `20_albums`, … `90_invariants`). Un nouveau palier
s'insère dans un trou existant plutôt que de renuméroter la suite — un fichier
renuméroté casse tout `git log --follow` et toute référence extérieure.

Un fichier ne lit que des tables produites par un numéro strictement inférieur.
Si une règle a besoin d'une table définie plus loin, c'est la numérotation qui
est fausse, pas l'ordre d'exécution qu'il faut contourner.

## Invariants

`90_invariants.sql` définit des vues qui doivent toutes être vides ; le nom de
la vue est le nom de l'invariant.

**Un invariant recalcule indépendamment ce qu'il vérifie.** Réutiliser la
formule ou les variables de session de la production revient à comparer une
valeur à elle-même. `artist_out_of_window` code la fenêtre `[1850, 2026]` en dur
aux deux bornes, précisément pour ne pas relire les `min_year`/`dump_year` dont
dépendent les règles de production : une valeur de variable fausse satisferait
sinon les deux côtés en silence. Changer de dump impose alors d'éditer ces
littéraux, et cette édition délibérée est le but de l'invariant.

Un invariant qui passerait quoi qu'il arrive ne teste rien. Avant de l'écrire,
nommer ce qui le ferait échouer.

## Écriture

- `CREATE OR REPLACE TABLE` pour une donnée matérialisée, `CREATE OR REPLACE
  VIEW` pour un invariant.
- Les macros partagées vivent dans `00_macros.sql` (`yr(s)` extrait l'année
  d'une date partielle). Une expression répétée dans trois fichiers devient une
  macro ; une expression utilisée une fois reste sur place.
- Un commentaire explique une contrainte cachée ou la raison d'un choix, jamais
  ce que le SQL donne déjà à lire. Les bons exemples sont dans
  `90_invariants.sql`.
- Une valeur dérivée voyage avec sa provenance : publier `y0` à côté de
  `y0_source` laisse le consommateur distinguer le déclaré de l'inféré.

## Vérifier un changement

Le pipeline est déterministe : le coût d'une règle se mesure au lieu de se
discuter. DuckDB lit les extractions de `data/work/` en quelques secondes, donc
« combien de groupes perd cette règle ? » se tranche par une requête avant
d'écrire la règle, et le contrefactuel — rejouer la chaîne modifiée et comparer
les tables — donne le coût exact d'une décision.

Les chiffres qui font foi sont dans `tests/test_baseline.py`, seul point
d'autorité. Un chiffre repris ailleurs est descriptif et doit se donner comme
tel.
