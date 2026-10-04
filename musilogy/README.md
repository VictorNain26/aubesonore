# musilogy

Produit, hors ligne et depuis des sources épinglées et datées, les données de **Musilogy** (`docs/vision.md` à la racine, §2) : pour un artiste, qui faisait cette musique avant lui, en même temps, après lui ; qui il a cité comme influence ; dans quels groupes ses membres ont joué. Un dump JSON MusicBrainz, un relevé ListenBrainz et un relevé Wikidata deviennent six tables reproductibles et testées, publiées en Parquet ; `musilogy load` les copie dans le schéma `musilogy` de la base du site, qui ne lit que des fonctions SQL. La conception en vigueur, avec la feuille de route des tables et le contrat de ces fonctions, est `docs/conception.md`.

## Principe directeur

**La sortie n'affirme jamais plus que ce que la source porte.** Une absence reste une absence : elle n'est ni imputée en silence, ni prolongée, ni arbitrée. Quand une valeur est dérivée, elle est publiée avec la colonne qui dit d'où elle vient, pour que le consommateur distingue une donnée déclarée d'une donnée inférée. Quand une mesure est impossible, la colonne vaut NULL — jamais zéro, qui affirmerait une mesure qui n'a pas eu lieu.

**Les tables portent la population complète.** Aucun filtre d'affichage n'y entre : ce que le site montre d'abord se décide dans les fonctions SQL qu'il appelle, qui ordonnent sans exclure. Une donnée écartée en amont serait irrécupérable en aval.

## Les six tables

Mesurées sur le dump de référence `20260909-001002` :

| Table | Contenu | Lignes |
|---|---|---|
| `artists` | un artiste — groupe, orchestre, chœur ou personne : ses preuves de dates, sa ligne de vie dérivée, ses genres votés | 2 281 691 |
| `albums` | une sortie d'album créditée à un seul artiste ; non chargée dans le site, elle sert les dates | 1 290 584 |
| `genres` | le vocabulaire porté par `artists` | 1 729 |
| `links` | un lien typé entre deux artistes — appartenance, pseudonyme, changement de nom, sous-groupe, professeur, famille… —, avec ses années | 771 147 |
| `popularity` | les écoutes ListenBrainz d'un artiste, relevées à une date | 989 488 |
| `influences` | une influence déclarée sur Wikidata entre deux MBID, avec la déclaration qui l'affirme | 9 517 |

Colonnes réelles (voir `src/musilogy/sql/`) :

- **`artists`** : `mbid`, `name`, `disambiguation`, `name_key`, `type`, `y0_declared`, `y_end_declared`, `y_birth`, `ended`, `country`, `begin_area`, `begin_area_mbid`, `genres_declared` et `genres_from_albums` (listes de `{mbid, name, votes}`, triées), `genres`, `genre_source`, `y_first_album`, `y_last_album`, `y0`, `y0_source`, `y_end`, `y_end_source`.
- **`albums`** : `artist_mbid`, `rg_mbid`, `title`, `y`, `soundtrack`.
- **`genres`** : `genre_mbid`, `name`, `n_artists`.
- **`links`** : `src_mbid`, `dst_mbid`, `type`, `y_begin`, `y_end`.
- **`popularity`** : `mbid`, `listen_count`, `user_count`, `snapshot`.
- **`influences`** : `artist_mbid`, `influence_mbid`, `statement`.

`name_key` est la clé de recherche d'un nom tapé : `strip_accents(lower(name))`, « bjork » trouve Björk.

## Les règles

Chaque règle vit dans son fichier SQL numéroté (`src/musilogy/sql/`) ; **la numérotation est un ordre topologique de dépendance**, pas un rang dans une liste, et avance par pas de dix pour qu'une règle s'insère sans renumérotation — `25_` en est un exemple vivant.

- **`10_bands` — Population et lecture des dates.** Tout artiste extrait — groupe, orchestre, chœur ou personne — entre dans `artists` : aucun filtre de date ou de genre. Les personnages, les « autres » et les artistes sans type ne sont pas extraits : ces derniers, 674 240 sur le dump de référence, ne portent presque aucun lien (2,6 %), contre un tiers des personnes. **Le `begin` d'une personne est une naissance, pas un début d'activité** : il est publié dans `y_birth` et ne devient jamais `y0_declared` ; une naissance illisible (8 962) ou future (2) est perdue et comptée comme toute autre date. Son `end`, un décès, clôt bien l'activité et se lit comme toute autre fin. La lecture des dates est déterministe : l'année tient sur les quatre premiers caractères, sinon elle est **absente**, pas devinée. Une date hors de `[1850, année du dump]` — aux deux bords — et une fin antérieure au début sont neutralisées, et **chaque neutralisation alimente un compteur** dans `manifest.json`. Tous les genres sont conservés, triés explicitement par votes décroissants puis par nom.

- **`20_albums` — Albums.** Un release-group compte comme album s'il est de type primaire `Album` (filtré dès l'extraction), crédité à un **seul artiste distinct** présent dans `artists`, daté dans `[1850, année du dump]`, et dont les types secondaires sont vides ou inclus dans `{Soundtrack, Demo}`.

  Les démos sont acceptées parce qu'elles sont une preuve *contemporaine* d'activité précoce : 61,7 % des artistes ayant démo et album studio ont sorti la démo d'abord, 3 ans plus tôt en médiane parmi eux. Les albums live sont exclus pour la raison inverse : **MusicBrainz les date de leur publication, pas du concert** — 914 artistes ont un live daté plus de 20 ans après leur dernier studio, avec des titres qui portent eux-mêmes la vraie date (« Live in Paris (1966) », publié en 2024). Compilations, DJ-mix et remix sont exclus au même titre.

- **`25_band_genres` — Genres d'un artiste.** La règle des dates, appliquée aux genres : **les genres déclarés l'emportent, ceux des albums prennent le relais.** Un artiste qui ne déclare aucun genre reçoit la somme des votes des genres de ses propres albums, ceux que `20_albums` a retenus. Un artiste qui en déclare ne mélange jamais ceux de ses albums : ce sont des votes sur des objets différents, et une union laisserait un album l'emporter sur l'artiste. `genre_source` nomme la branche (`declared`, `albums`, ou NULL) ; les deux listes brutes restent publiées à côté de `genres`. Sur le dump de référence, 43,5 % des artistes porteurs d'un genre le tiennent de leurs albums.

- **`30_bands_lifespan` — Ligne de vie et provenance.** Aux deux bords, **la preuve déclarée l'emporte, l'album prend le relais** : `y0` vaut l'année déclarée, sinon celle du premier album ; `y_end` la fin déclarée, sinon celle du dernier album. `y0_source` et `y_end_source` nomment la branche qui a produit la valeur. Les preuves brutes restent publiées à côté.

  **Une preuve issue d'un album n'est retenue à un bord que si elle ne contredit pas la preuve déclarée à l'autre bord.** Sept garde-fous, chacun compté :

  | garde-fou | cas | compte |
  |---|---|---|
  | `first_album_after_declared_end` | premier album postérieur à une fin déclarée — une réédition posthume n'est pas une preuve de formation ; pour une personne, la fin est son décès | 2 000 |
  | `last_album_before_declared_begin` | dernier album antérieur à un début déclaré — symétrique, il produisait une fin étiquetée `last_album` qui valait en réalité l'année de début | 271 |
  | `first_album_with_begin_below_min_year` | début déclaré sous 1850 donc neutralisé : la source affirme que le groupe précède l'album | 73 |
  | `album_with_end_below_min_year` | fin déclarée sous 1850 : tout album lui est postérieur, aucun bord ne s'en déduit — Bach, mort en 1750, enregistré à partir de 1961 | 235 |
  | `first_album_with_birth_below_min_year` | personne née avant 1850 : elle précède tout album de la fenêtre — Robert Ballard, né en 1575, commencerait en 2019 | 326 |
  | `first_album_before_birth` | premier album antérieur à la naissance : la source se contredit, le début ne s'en déduit pas | 32 |
  | `last_album_before_birth` | dernier album antérieur à la naissance : symétrique, la fin ne s'en déduit pas | 17 |

- **`50_genres` — Vocabulaire.** Les genres effectivement portés par `artists.genres`, y compris ceux qu'aucun artiste ne déclare et que seuls des albums portent.

- **`80_links` — Liens.** Toutes les relations d'artiste à artiste, **typées** : `type` garde le nom MusicBrainz (`member of band`, `is person`, `artist rename`, `subgroup`, `teacher`, `parent`…), pour que le consommateur sache ce qu'un lien affirme sans se fier à une catégorie de musilogy. Le dump porte chaque relation sur ses deux artistes, orientée par `direction` ; elle est lue source → cible des deux côtés, puis dédoublonnée, avec ses années lues par la même macro stricte que partout ailleurs. Les deux extrémités doivent être des artistes de `artists` : un lien vers un personnage ou un artiste sans type n'aurait nulle part où arriver, et ces 38 442 liens écartés sont comptés dans `manifest.json` (`link_exclusions`). **Ce n'est pas de l'influence** : MusicBrainz n'en porte aucune ; un lien est un fait vérifiable, qui a joué où, qui a enseigné à qui. Les influences déclarées viennent de Wikidata (`88_influences`).

- **`87_popularity` — Popularité.** Le nombre d'écoutes (`listen_count`) et d'auditeurs (`user_count`) que ListenBrainz compte pour chaque artiste (`POST /1/popularity/artist`), à la date `snapshot`. Elle ordonne, **elle n'exclut jamais**. Un artiste dont ListenBrainz ne connaît aucune écoute n'a pas de ligne plutôt qu'un zéro qu'il n'a pas déclaré : 1 292 203 artistes sur 2 281 691 (57 %) sur le relevé de référence. Les comptes bougent chaque jour : `musilogy snapshot-popularity` interroge ListenBrainz pour tous les artistes de l'extraction (lots de 1 000, une requête par seconde, en-têtes `X-RateLimit-*` respectés), écrit le relevé dans `data/raw/listenbrainz/<date>/` et son empreinte dans `reference/listenbrainz-<date>.SHA256SUMS`. Comme le dump, un relevé ne se reprend pas : `REFERENCE_POPULARITY` épingle celui que `run` lit et vérifie, et `run` s'arrête s'il manque.

- **`88_influences` — Influences déclarées.** `artist_mbid` cite `influence_mbid` comme influence selon Wikidata (« influencé par », P737), et `statement` est l'identifiant de la déclaration (`Q…$…`), pour la citer. Le relevé (section suivante) donne une ligne par déclaration et par paire de MBID — un élément Wikidata peut en porter plusieurs (P434) ; la table garde **une déclaration par paire de MBID**, la plus petite quand deux déclarations donnent la même paire (aucune sur le relevé de référence). Aucune extrémité n'est filtrée : 251 des 9 517 paires ont un MBID que `artists` ne porte pas, et ce sont les fonctions du site, qui joignent `artists`, qui les laissent de côté faute de nom. Trois invariants : une paire en double, un MBID qui n'a pas la forme d'un UUID en minuscules ou une déclaration sans identifiant, et une ligne que le relevé n'affirme pas dans ce sens.

- **`90_invariants` — Contrôles.** Des vues qui doivent toutes renvoyer zéro ligne ; le nom de la vue *est* le nom de l'invariant. Chacune **recalcule indépendamment** ce qu'elle vérifie : une revue a montré qu'un invariant réutilisant la formule de production restait muet sur 265 violations réelles. Les bornes contractuelles y sont codées en dur, aux deux extrémités, sans relire les variables de session de la production ; changer de dump impose donc une modification délibérée de ce fichier — c'est l'intention.

Deux bornes sont des variables de session posées par `build()` : `dump_year` et `min_year`.

Les corrections manuelles (`src/musilogy/corrections.csv`, colonnes `mbid, field, value, justification, source`) sont appliquées avant la lecture des dates ; chaque ligne cite une source vérifiable, et un garde-fou échoue au-delà de 50 lignes.

## Proximité ListenBrainz (relevé)

`musilogy snapshot-proximity` relève, pour chaque artiste qu'au moins 500 auditeurs écoutent dans le relevé de popularité épinglé (111 402 artistes au 2026-10-04), ses 100 voisins selon ListenBrainz (`labs.api.listenbrainz.org/similar-artists`, algorithme épinglé dans `fetch.SIMILAR_ALGORITHM`) : une ligne par artiste, `{artist_mbid, similar: [{artist_mbid, score}]}`, dans `data/raw/listenbrainz/<date>/artist-similar.jsonl`, empreinte dans `reference/listenbrainz-similar-<date>.SHA256SUMS`. Le service prend un artiste par requête et n'annonce aucune limite : le relevé s'en tient à une requête par seconde au plus. Le débit réel mesuré, pannes du service comprises, est d'environ 0,6 artiste par seconde (2026-10-04) : plusieurs jours pour le relevé entier. Interrompu, il reprend le relevé resté partiel, quel que soit le jour où il a commencé. Les données ListenBrainz sont publiées en CC0 (metabrainz.org/datasets/postgres-dumps) ; le service de similarité, qui en dérive, ne précise pas de licence. La table `proximity` et la fonction `artist_neighbours` (`docs/conception.md`, §2 à §4) viennent une fois le relevé épinglé.

## Influences Wikidata (relevé)

`musilogy snapshot-influences` pose une seule requête SPARQL au Wikidata Query Service (`query.wikidata.org/sparql`, avec l'en-tête `User-Agent` de contact qu'exige le service) : chaque déclaration « influencé par » (P737) non dépréciée dont le sujet et l'objet portent un MBID artiste (P434, valeurs de meilleur rang). Le service coupe une requête à 60 s et accorde 60 s de calcul par minute à chaque client ; celle-ci répond en 3 à 5 s, sans pagination. Le relevé, trié, va dans `data/raw/wikidata/<date>/influences.jsonl` (`{artist_mbid, influence_mbid, statement}`), son empreinte dans `reference/wikidata-influences-<date>.SHA256SUMS`, et `REFERENCE_INFLUENCES` épingle celui que `run` lit ; `run` s'arrête s'il manque. Les données de Wikidata sont sous CC0.

Relevé du 2026-10-04 : 9 517 paires issues de 8 612 déclarations, 5 661 MBID distincts (2 589 qui citent, 3 728 cités). Des 288 artistes joués par l'antenne à cette date (285 dans le dump), `artist_influences` en rend au moins une pour 61 : 24 en citent, 49 sont cités.

## Ce que reçoit le site

`data/out/<dump>/` contient les six tables en Parquet et le manifeste.

`manifest.json` porte les empreintes des archives, la date et l'empreinte des relevés ListenBrainz (`popularity`) et Wikidata (`influences`), **les empreintes des fichiers Parquet livrés** (`output_sha256`), les comptes, les **paramètres** du run (`dump_year`, `min_year`), les **entrées** (`rows_loaded` par table brute, le sidecar d'extraction), les anomalies de lecture de dates, les sept compteurs de neutralisation, les exclusions de liens, le commit et l'empreinte des corrections.

Ces empreintes de sortie sont opposables parce que la livraison est reproductible : à dump et code identiques, deux exécutions écrivent les mêmes octets. L'ordre des lignes est fixé par une clé totale sur chaque table. Un consommateur distingue donc une livraison inchangée d'une nouvelle par sa seule empreinte, sans retélécharger.

## Chargement dans le site

`uv run musilogy load` vérifie les Parquet publiés contre leur manifeste, les copie dans un schéma `musilogy_next` de la base du site, compare les comptes copiés à ceux du manifeste, puis bascule `musilogy_next` en `musilogy` en une transaction : le site ne lit jamais un chargement partiel, et un chargement raté laisse le précédent en place. La connexion vient de l'environnement libpq (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`, `PGSSLROOTCERT`). Le SQL côté Postgres vit dans `src/musilogy/pg/`, numéroté comme `sql/` : `10_tables` avant la copie, les suivants sur le schéma de transit, `90_` une fois la bascule faite.

Cinq tables sont chargées — `artists`, `genres`, `links`, `popularity`, `influences` — plus `manifest` (dump, relevés, commit) ; `albums` reste en Parquet. Les listes de genres, que Postgres ne sait pas typer en structures anonymes, deviennent du `jsonb`. `20_search.sql` en tire `search`, la projection étroite de la recherche (`name_key` en collation C, nombre d'auditeurs, MBID), rangée par `name_key`. Mesuré sur un Postgres 16 jetable, avec le dump de référence : 408 s de chargement, 1 259 Mo en tout, dont 192 Mo et 68 Mo d'index pour la projection de recherche.

**Ce que lit le site : des fonctions, pas des tables.** Il appelle les fonctions de `pg/90_*.sql`, testées ici contre Postgres, et dépend de leurs signatures, pas de la disposition des tables. Le contrat complet, fonctions à venir comprises, est `docs/conception.md` §4.

- `artist_card(mbid)` donne la fiche ; sa colonne `proximity_surveyed` dira si l'artiste a été interrogé dans le relevé de proximité épinglé, et vaut NULL tant qu'aucun relevé n'est chargé, c'est-à-dire partout aujourd'hui : un artiste non relevé n'est pas un artiste sans voisin. `artist_links(mbid)` chaque lien lu depuis l'artiste (`forward` s'il en est la source MusicBrainz).
- `artist_influences(mbid)` donne les influences déclarées dans les deux sens, `cited` (l'artiste cite l'autre) puis `cited_by`, chacune dans l'ordre du temps et avec sa déclaration Wikidata. Un artiste absent du dump n'en a aucune, comme il n'a pas de fiche.
- `search_artists(requête, taille)` cherche par préfixe du nom normalisé, les plus écoutés d'abord (`user_count`), ceux que ListenBrainz ne connaît pas en dernier, puis par nom et MBID. La requête est normalisée comme `name_key` (`strip_accents(lower(name))` dans DuckDB) par `musilogy.name_key(text)` : minuscules, décomposition canonique, retrait des marques combinantes — la catégorie Unicode M entière, 2 450 points, mesurée en interrogeant DuckDB sur chaque point de code —, recomposition. Sur le dump de référence, elle redonne le `name_key` de tous les noms sauf 6, des lettres cerclées (Ⓐ) que la libc du Postgres du site ne met pas en minuscule ; le seul bloc des diacritiques latins en manquait 12 987. Une requête vide ne trouve personne. Temps mesurés sur le Postgres jetable, cache chaud, médiane de 7 appels : « a » (157 112 noms) 78 ms, « the » 46 ms, « bjork », « radiohead » ou « sigur ros » moins de 4 ms ; le premier appel après le chargement, cache froid, a pris 1,8 s pour « a ». Lue directement dans `artists`, « a » prenait environ 1 s cache chaud.

## Chiffres de référence

Le **contrat exécutable** est `tests/test_baseline.py` : il confronte le pipeline entier au dump de référence et compare exactement les comptes et la répartition des provenances. Les chiffres cités ici sont descriptifs ; en cas de divergence, c'est le test qui fait foi.

Deux situations, deux conduites, à ne pas confondre. **Sur le dump de référence, un écart signale une règle mal implémentée** — jamais un prétexte pour ajuster la ligne de base. **Sur un nouveau dump, tous les chiffres bougent légitimement**, et la ligne de base se régénère : les comptes des tables, les trois répartitions de provenance, les neuf compteurs d'anomalies, les sept de neutralisation, les exclusions de liens et la répartition des liens par type. Le compte des influences entre deux artistes du dump bouge avec lui. Il faut alors aussi mettre à jour `REFERENCE_DUMP`, la valeur par défaut de `dump_year`, ajouter le `reference/<dump>.SHA256SUMS` correspondant, prendre un relevé ListenBrainz sur la nouvelle extraction et l'épingler dans `REFERENCE_POPULARITY` (l'invariant `popularity_unrequested` refuse un relevé pris sur une autre), et modifier à la main les bornes codées en dur dans les vues de `90_invariants.sql` — cette dernière opération est délibérément manuelle, c'est ce qui empêche une mauvaise variable de satisfaire à la fois la règle et son contrôle. Les extractions vivant dans `data/work/<dump>/`, changer `REFERENCE_DUMP` suffit à repartir d'une extraction neuve, sans rien vider à la main.

Provenance des bords, sur le dump de référence :

| | `declared` | dérivé des albums | inconnu |
|---|---|---|---|
| début (`y0_source`) | 235 246 | 346 442 | 1 700 003 |
| fin (`y_end_source`) | 147 025 | 438 801 | 1 695 865 |
| genres (`genre_source`) | 199 611 | 153 624 | 1 928 456 |

Pour une personne, le début n'est jamais `declared` (sa déclaration est une naissance) et une fin `declared` est un décès.

## Limites assumées

- **Aucune hiérarchie de genres n'est publiée.** L'arbre Wikidata a été retiré après mesure : 323 genres sur les 1 348 du vocabulaire d'alors n'y avaient aucun parent, `free jazz` et `zeuhl` étaient rangés sous `classical`, et surtout `black metal`, `death metal`, `thrash metal` et `doom metal` **ne figuraient pas** parmi les descendants de `metal` — les 3ᵉ, 5ᵉ, 15ᵉ et 19ᵉ genres du vocabulaire. Un arbre qui marche pour le rock et casse sur le metal est pire qu'une absence d'arbre : il a l'air de fonctionner. La requête SPARQL reste dans l'historique git.

- **Une fin dérivée d'un album n'est pas une fin déclarée.** Elle est marquée `y_end_source = 'last_album'`. Parmi les groupes de type `Group` concernés ayant au moins deux albums, **3,38 % ont un dernier album isolé de plus de 15 ans** du précédent (1,04 % au-delà de 25) : des rééditions de fonds historiques qui étirent la ligne de vie. Les écarter demanderait un seuil arbitraire ; l'étiquette de provenance laisse le site trancher.

- **Le genre est un filtre de notoriété communautaire, et il est daté.** Part de **groupes** datés sans aucun genre, par époque de formation, même en prenant ceux des albums : 34,4 % pour 1967-1979, 43,1 % pour 1980-1999, 53,8 % pour 2000-2014, **75,5 % depuis 2023**. Les artistes récents sont moins tagués.

- **78,9 % des artistes n'ont aucun album** qui passe les règles, et 1 700 003 n'ont aucun début exploitable. La base est complète par choix : le site ordonne, musilogy ne jette pas.

## Installation, tests, exécution

Python 3.12 géré par `uv`.

```bash
uv sync
```

Trois niveaux de test :

- `uv run pytest` — suite rapide, quelques secondes, sans dépendance au dump. Tourne sur 33 témoins réels versionnés dans `tests/fixtures/` (extraits authentiques du dump de référence, jamais de données inventées) et sur quelques enregistrements synthétiques pour les formes qu'aucun témoin ne porte.
- `tests/test_load.py`, `tests/test_artist.py`, `tests/test_search.py` — le chargement et les fonctions SQL du site, contre un vrai Postgres jetable désigné par `MUSILOGY_TEST_PG` (chaîne de connexion libpq ; les tests y suppriment et recréent les schémas `musilogy`). Sans elle, ces tests sont sautés, sauf en CI, qui fournit un service Postgres 16 et échoue si la variable manque.
- `uv run pytest -m slow` — ligne de base : confronte le pipeline entier aux ~3 millions d'enregistrements du dump de référence. Exige les extractions dans `data/work/<dump>/` (non versionnées, ~10 min à produire) ; sinon le test est ignoré.

La suite passe depuis n'importe quel répertoire : tous les chemins sont ancrés sur le paquet (`musilogy.paths`), jamais sur le répertoire courant.

```bash
uv run musilogy run                 # fetch → extract → transform → validate → publish
uv run musilogy snapshot-popularity # relevé ListenBrainz daté, à épingler (~1 h)
uv run musilogy snapshot-proximity  # voisins ListenBrainz des artistes d'au moins 500 auditeurs (plusieurs jours, reprenable)
uv run musilogy snapshot-influences # relevé Wikidata daté des influences déclarées, à épingler (quelques secondes)
uv run musilogy make-fixtures       # régénère les témoins depuis les extractions
uv run musilogy load                # charge data/out/ dans la base du site (environnement libpq)
```

Aucune sortie du pipeline n'est versionnée ; seules les empreintes et les fixtures le sont.

Qualité : `uv run ruff check`, `uv run ruff format --check`, `uv run mypy`. La CI (`.github/workflows/musilogy.yml`, à la racine d'AubeSonore) passe ces trois contrôles plus la suite rapide ; la suite lente exige le dump et reste manuelle.

## Structure du dépôt

```
src/musilogy/
  fetch.py               télécharge et vérifie une archive MusicBrainz (SHA-256), relève ListenBrainz et Wikidata
  extract.py             projette les enregistrements bruts en flux, sans logique métier
  build.py               enchaîne les fichiers SQL, applique les corrections, vérifie les invariants
  publish.py             écrit les Parquet et manifest.json
  cli.py                 les commandes
  load.py                charge les Parquet publiés dans la base du site
  paths.py               chemins ancrés sur le paquet
  corrections.csv        corrections manuelles, versionné
  reference/             empreintes des archives et des relevés ListenBrainz et Wikidata
  sql/                   les règles, en ordre topologique
  pg/                    les tables et les fonctions que lit le site, côté Postgres
tests/
  conftest.py            fixtures partagées
  fixtures/              témoins réels versionnés
  test_*.py              une suite par règle, plus test_baseline.py (suite lente)
docs/conception.md       la conception en vigueur : sources, tables, contrat avec le site
docs/research/           notes de recherche datées
```

## Licence et attribution

Les données de base MusicBrainz (artistes, dates, albums, relations) sont **CC0**. Les genres et tags sont des données supplémentaires sous **CC-BY-NC-SA 3.0**. Comme `artists` et `genres` en dépendent, **le jeu de données produit par ce pipeline est distribué sous CC-BY-NC-SA 3.0** : attribution à MusicBrainz obligatoire, usage non commercial uniquement, et partage à l'identique imposé à toute redistribution.

Les comptes d'écoute de ListenBrainz et les données de Wikidata sont sous **CC0** et n'ajoutent aucune contrainte. `tests/fixtures/influences.jsonl` est un extrait du relevé Wikidata du 2026-10-04 : les déclarations qui touchent un artiste des témoins.

Les fixtures versionnées dans `tests/fixtures/` sont des extraits réels du dump MusicBrainz de référence, soumis à la même licence (voir `tests/fixtures/ATTRIBUTION.md`).
