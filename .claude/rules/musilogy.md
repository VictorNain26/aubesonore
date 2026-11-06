---
description: Données Musilogy — chargé en ouvrant un fichier de musilogy/
paths:
  - "musilogy/**"
---

# musilogy

Les chemins ci-dessous sont relatifs à `musilogy/`.

Règles métier et commandes : `README.md` (« Installation, tests, exécution ») ; conception, dont le contrat des fonctions SQL que lit le site :
`docs/conception.md` ; place dans le produit : `docs/vision.md` §2 (racine du dépôt). Un avis sur une
méthode ou un affichage de Musilogy part des dossiers de `docs/research/` et des sources qu'ils citent ; une décision
qu'ils ont tranchée ne se rouvre que sur une preuve nouvelle.

## Python

- Dépendances épinglées au patch près : la reproductibilité du pipeline en
  dépend autant que le code.

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
- Un fichier SQL ne lit que des tables produites par un numéro strictement
  inférieur : si une règle a besoin d'une table définie plus loin, c'est la
  numérotation qui est fausse.
- Une valeur dérivée voyage avec sa provenance : publier `y0` à côté de
  `y0_source` laisse le consommateur distinguer le déclaré de l'inféré.
- Un témoin qui manque se tire du dump (`make-fixtures`), il ne s'écrit jamais
  à la main.
- Un écart refusé par `musilogy run` : `README.md` « Comparaison avec la
  livraison précédente » avant tout `--accept-drift`.
- Une source qui n'est pas CC0 ne s'ajoute qu'après une décision écrite dans
  `LICENSE-DATA`.

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
- Un calcul sur les données complètes passe par le skill `musilogy-run` (scope
  mémoire plafonné, débordement sur le SSD externe) ; le chargement en
  production est `/musilogy-load`, que seul Victor lance.
