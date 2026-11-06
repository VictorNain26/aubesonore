---
description: Données Musilogy — chargé en ouvrant un fichier de musilogy/
paths:
  - "musilogy/**"
---

# musilogy

Les chemins ci-dessous sont relatifs à `musilogy/` ; les commandes partent de la
racine de la worktree, où Claude Code est lancé (`CLAUDE.md` racine), par
`uv --directory musilogy run …`.

Les données de Musilogy (`docs/vision.md` à la racine, §2), produites hors
ligne depuis des sources épinglées et transformées en tables Parquet
reproductibles, que `musilogy load` copie dans le schéma `musilogy` de la base
du site. La conception en vigueur, dont le contrat des fonctions SQL que le site
appelle, est `docs/conception.md` ; les règles métier sont dans le `README.md`.
Ce qui vaut pour tout le dépôt AubeSonore est dans le `CLAUDE.md` racine.

## Python

- Dépendances épinglées au patch près : la reproductibilité du pipeline en
  dépend autant que le code.
- Chemins ancrés sur le paquet (`musilogy.paths`), jamais sur le répertoire
  courant : la suite de tests doit passer depuis n'importe où.
- Séparer le calcul de l'entrée-sortie : une fonction qui fait les deux est
  difficile à tester.
- `mypy` plutôt que `ty` : `ty` est encore en 0.0.x, et adosser la vérification
  de types à un outil dont la sémantique peut bouger contredit l'épinglage.

## Architecture

- musilogy produit des tables, pas des vues d'affichage. Un filtre ou un ordre
  qui sert au rendu appartient aux fonctions que lit le site (`pg/90_*.sql`) ;
  la population reste complète. Confondre les deux fait disparaître des données
  qu'on ne sait plus récupérer en aval.
- Le site ne lit que des fonctions SQL, dont les signatures sont un contrat
  (`docs/conception.md` §4) : en changer une se signale, elle ne se glisse pas
  dans une PR.
- Les règles vivent dans le SQL ; le Python enchaîne et vérifie, il n'arbitre
  pas.
- Le SQL Postgres (`src/musilogy/pg/`) est numéroté comme `sql/` : `10_tables`
  avant la copie, les suivants sur le schéma de transit, `90_` après la bascule.
  Ce qu'une fonction Postgres calcule n'a pas de double DuckDB. Seule exception,
  assumée et testée (`test_search.py`) : `name_key`, calculée par DuckDB pour
  les tables et refaite en Postgres pour comparer la recherche de l'auditeur.
- Les chiffres d'une livraison sont dans son `manifest.json`, la référence est
  la livraison précédente : `musilogy run` compare les comptes des tables et
  les compteurs du manifeste avant de publier et refuse au-delà de `MAX_DRIFT`
  (`publish.py`). Un écart refusé se comprend avant d'être accepté : on
  identifie la règle qui l'a produit, on dit dans la PR pourquoi le nouveau
  compte est le bon, puis on relance avec `--accept-drift NOM` (une table,
  `GROUPE.COMPTEUR`, ou un groupe pour chacun de ses compteurs qui a bougé),
  que le manifeste de la livraison garde, avec les compteurs nouveaux et
  disparus. Accepter sans
  cette étape retire le contrôle au lieu de le passer.

## Mesurer plutôt que raisonner

Les extractions complètes vivent dans `data/work/` et DuckDB les lit en
quelques secondes. Une question chiffrée — « combien de liens perd cette
règle ? » — se tranche par une requête, pas par un raisonnement plausible ; le
pipeline étant déterministe, un contrefactuel est toujours possible. Un critère
d'acceptation se donne en nombre ou en code de sortie : « `musilogy run` publie
sans `--accept-drift links` » plutôt que « corriger les liens ».

Une étude sur un échantillon dit si une règle est juste, jamais ce qu'elle coûte.
Avant d'écrire les tests et le code d'une règle qui parcourt une grande table
(`colisten`, les écoutes, `releases`), ses requêtes les plus lourdes passent sur
les données complètes du serveur, sous la borne de `build.connect()`, et la PR
donne le nombre de lignes produites face à la livraison précédente, leur pic de
mémoire et leur durée : un volume multiplié dit souvent une règle fausse avant
même son coût. On conçoit pour cette échelle d'emblée,
suivant le guide de performance de DuckDB : des clés entières plutôt que des
MBID en texte, un opérateur bloquant par requête, les tables intermédiaires
libérées dès qu'elles ne servent plus.

## Données sur victorserv

- Les données vivent hors de tout checkout, dans `~/musilogy-data` (`data/`
  n'est pas versionné) ; seule la worktree du serveur qui lance un traitement
  sur ces données s'y relie, par `ln -s ~/musilogy-data musilogy/data`
  (`CLAUDE.md` racine, « Where to develop »).
- Le dump de référence (`REFERENCE_DUMP`, `src/musilogy/__init__.py`) n'est
  plus publié par MetaBrainz : cette copie est la seule, ne jamais la supprimer
  ni l'écraser.

## Commandes

Installation, tests (Postgres compris), contrôles de la CI et commandes du
pipeline : `README.md`, « Installation, tests, exécution ».

Sur victorserv : un calcul sur les données complètes passe par le skill
`musilogy-run` (scope mémoire plafonné, débordement sur le SSD externe) ; le
chargement en production est `/musilogy-load`, que seul Victor lance.

## Licence

Musilogy ne lit que des sources CC0 (`LICENSE-DATA`). Les genres et tags
MusicBrainz, données supplémentaires sous licence non commerciale, ne sont pas
lus : une source qui n'est pas CC0 ne s'ajoute qu'après une décision écrite
dans `LICENSE-DATA`. La licence du jeu produit, fixtures versionnées
comprises, reste à fixer par le propriétaire.
