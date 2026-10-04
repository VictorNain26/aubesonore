# musilogy

Les données de Musilogy (`docs/vision.md` à la racine, §2), produites hors
ligne depuis des sources épinglées et datées : un dump JSON MusicBrainz et des
relevés ListenBrainz et Wikidata transformés en tables Parquet reproductibles, que
`musilogy load` copie dans le schéma `musilogy` de la base du site. La
conception en vigueur, dont le contrat des fonctions SQL que le site appelle,
est `docs/conception.md` ; les règles métier et les chiffres sont dans le
`README.md` ; ce fichier décrit comment on travaille sur ce dépôt.

Les conventions qui ne servent qu'à un endroit sont chargées à la demande :
`.claude/rules/sql.md` en ouvrant `src/musilogy/sql/`, `.claude/rules/tests.md`
en ouvrant `tests/`, et `/baseline` pour instruire un écart à la ligne de base.

## Python

- Python 3.12, `uv` pour l'environnement et l'exécution, dépendances épinglées
  au patch près — la reproductibilité du pipeline en dépend autant que le code.
- `pathlib` partout, et des chemins ancrés sur le paquet plutôt que sur le
  répertoire courant : `musilogy.paths` existe pour ça, et la suite de tests
  doit passer depuis n'importe où.
- Séparer le calcul de l'entrée-sortie, comme le fait déjà le paquet :
  `extract.py` projette sans règle métier, `build.py` orchestre, `publish.py`
  écrit. Une fonction qui fait les deux est difficile à tester.
- `ruff` pour le lint et le format, `mypy` pour les types. `ty` est plus rapide
  et cohérent avec l'outillage Astral, mais il est encore en 0.0.x : adosser la
  vérification de types à un outil dont la sémantique peut bouger contredit
  l'épinglage au patch près que le reste du dépôt s'impose.

## Architecture

- **musilogy produit des tables, pas des vues d'affichage.** Un filtre ou un
  ordre qui sert au rendu appartient aux fonctions que lit le site
  (`pg/90_*.sql`) ; la population reste complète. Confondre les deux fait
  disparaître des données qu'on ne sait plus récupérer en aval.
- **Le site ne lit que des fonctions SQL**, dont les signatures sont un
  contrat (`docs/conception.md` §4) : en changer une se signale, elle ne se
  glisse pas dans une PR.
- **Une valeur dérivée voyage avec sa provenance.** Publier `y0` à côté de
  `y0_source` permet au consommateur de distinguer une donnée déclarée d'une
  donnée inférée, au lieu de lui faire confiance à l'aveugle.
- **Les règles vivent dans le SQL** ; le Python enchaîne et vérifie, il
  n'arbitre pas.
- **Une donnée de référence n'a qu'un seul point d'autorité.** Le contrat
  exécutable des chiffres est `tests/test_baseline.py`. Un chiffre repris
  ailleurs — README, commentaire — est descriptif et doit se donner comme tel :
  c'est la duplication silencieuse qui finit par diverger, et c'est la source
  la plus courante de documentation qui se contredit.

## Mesurer plutôt que raisonner

Les extractions complètes vivent dans `data/work/` et DuckDB y lit un JSONL de
plusieurs centaines de Mo en quelques secondes. Une question chiffrée —
« combien de liens perd cette règle ? », « combien d'artistes perdent leur
date ? » — se tranche par une requête, pas par un raisonnement plausible, et
le résultat est opposable. Le pipeline étant déterministe, un contrefactuel est
toujours possible.

C'est aussi ce qui rend le travail délégué praticable ici : un critère
d'acceptation se donne en nombre ou en code de sortie. « le chiffre `links` de
`tests/test_baseline.py` ne bouge pas » vaut mieux que « corriger les liens ».

## Dépôt

- Les sorties du pipeline (`data/`) ne sont pas versionnées — seules les
  empreintes et les fixtures le sont.
- Sur victorserv, les données vivent hors de tout checkout, dans
  `~/musilogy-data` : une worktree s'y relie par
  `ln -s ~/musilogy-data musilogy/data`. Le dump de référence
  `20260909-001002` n'est plus publié par MetaBrainz : cette copie est la
  seule.
- La CI (`.github/workflows/musilogy.yml`, à la racine d'AubeSonore) passe le
  lint, les types et la suite rapide, tests Postgres compris (service
  Postgres 16) ; la suite lente exige le dump et tourne à la demande.

## Commandes

```bash
cd musilogy                   # toutes les commandes partent d'ici
uv sync
uv run pytest                 # suite rapide, sur les témoins
uv run pytest -m slow         # ligne de base sur le dump réel, exige data/work/
uv run musilogy run           # fetch → extract → transform → validate → publish (relevés épinglés exigés)
uv run musilogy snapshot-popularity  # relevé ListenBrainz daté, à épingler
uv run musilogy snapshot-proximity   # voisins ListenBrainz, plusieurs jours, reprenable
uv run musilogy snapshot-official    # disques officiels MusicBrainz, ~30 h, reprenable
uv run musilogy snapshot-influences  # influences Wikidata, quelques secondes, à épingler
uv run musilogy snapshot-discography # disques classés par Wikidata, quelques secondes, à épingler
uv run musilogy make-fixtures # depuis les extractions et les relevés épinglés
uv run musilogy load          # charge data/out/ dans la base du site (environnement libpq)
MUSILOGY_TEST_PG='host=… dbname=…' uv run pytest  # tests Postgres compris : un Postgres jetable, jamais celui du site
```

Le SQL côté Postgres vit dans `src/musilogy/pg/`, numéroté comme `sql/` :
`10_tables` avant la copie, les suivants sur le schéma de transit, `90_` après
la bascule. Une règle n'y existe qu'en un exemplaire : ce qu'une fonction
Postgres calcule n'a pas de double DuckDB.

Charger la base du site, depuis victorserv (le port de `aubesonore-db` n'est
publié que sur `127.0.0.1:5433`, et `pg_hba.conf` impose TLS ; le certificat
couvre `localhost`) :

```bash
PGPASSWORD="$(grep '^POSTGRES_PASSWORD=' ~/aubesonore/site/.env | cut -d= -f2-)" \
PGHOST=localhost PGPORT=5433 PGUSER=aubesonore PGDATABASE=aubesonore \
PGSSLMODE=verify-full PGSSLROOTCERT=~/aubesonore/site/certs/ca.crt \
systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=3584M -p MemorySwapMax=0 \
  nice -n 10 uv run musilogy load   # ~7 min sur un Postgres jetable, sans la proximité (2026-10-04)
```

Sur victorserv, `pytest -m slow` et `musilogy run` partent dans un scope
plafonné : `build.connect()` borne DuckDB (2 Go, 2 threads, 10 Go de
débordement dans `data/tmp/`), mais pas le cache disque ni Python, et les
services de la machine occupent déjà la moitié de ses 16 Go. Le 2026-10-02,
une requête sans borne l'a gelée. Construire, publier et charger le dump de
référence culmine à 2,1 Go de mémoire résidente (2026-10-04).

```bash
systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=3584M -p MemorySwapMax=0 \
  nice -n 10 uv run pytest -m slow   # ~5 min
```

## Licence

Les données de base MusicBrainz sont CC0, mais les genres et tags sont
CC-BY-NC-SA 3.0. Comme `artists` et `genres` en dépendent, le jeu produit est
CC-BY-NC-SA 3.0 : attribution, usage non commercial, partage à l'identique. Les
fixtures versionnées suivent la même licence. Toute question de diffusion des
sorties part de là.
