# musilogy

Produit, hors ligne et depuis des sources épinglées et datées, les données de **Musilogy** (`docs/vision.md` à la racine, §2) : pour un artiste, ses voisins en trois onglets — le même son, le même public, la filiation — et son œuvre. Un dump JSON MusicBrainz, le dump des sorties Discogs, des relevés ListenBrainz (popularité, toutes les écoutes), MusicBrainz (statut officiel) et Wikidata (discographie) deviennent dix tables reproductibles et testées, publiées en Parquet ; `musilogy load` les copie dans le schéma `musilogy` de la base du site, qui ne lit que des fonctions SQL. La conception en vigueur, avec le contrat de ces fonctions, est `docs/conception.md` ; la feuille de route est `docs/vision.md` §7.

## Principe directeur

**La sortie n'affirme jamais plus que ce que la source porte.** Une absence reste une absence : elle n'est ni imputée en silence, ni prolongée, ni arbitrée. Quand une valeur est dérivée, elle est publiée avec la colonne qui dit d'où elle vient, pour que le consommateur distingue une donnée déclarée d'une donnée inférée. Quand une mesure est impossible, la colonne vaut NULL — jamais zéro, qui affirmerait une mesure qui n'a pas eu lieu.

**Les tables portent la population complète.** Aucun filtre d'affichage n'y entre : ce que le site montre d'abord se décide dans les fonctions SQL qu'il appelle, qui ordonnent sans exclure. Une donnée écartée en amont serait irrécupérable en aval.

## Les dix tables

Le nombre de lignes de chaque table est dans le `manifest.json` de sa livraison (`counts`) :

| Table | Contenu |
|---|---|
| `artists` | un artiste, de tout type MusicBrainz ou sans type, hors artistes à usage spécial : ses preuves de dates, sa ligne de vie dérivée, ses styles Discogs |
| `albums` | une sortie d'album créditée à un seul artiste ; non chargée dans le site, elle sert les dates |
| `links` | un lien typé entre deux artistes qu'une page montre — appartenance, pseudonyme, changement de nom —, avec ses années |
| `popularity` | les écoutes ListenBrainz d'un artiste, relevées à une date |
| `releases` | un album ou un EP crédité à un artiste, dont les types secondaires se limitent à bande originale et remix ; une ligne par artiste crédité |
| `urls` | une page web qu'une page artiste utilise parmi celles que MusicBrainz relie à un artiste (plateforme d'écoute, site officiel, Wikidata), terminées comprises |
| `colisten` | un voisin « Écoutés ensemble » d'un artiste, selon notre co-écoute, avec ses auditeurs communs, son score et son rang |
| `styles` | un style Discogs des disques d'un artiste, par décennie de première édition, compté en disques ; non chargée dans le site |
| `same_sound` | un voisin « Même son » d'un artiste : une couleur proche de la sienne, avec son score, son rang et sa raison |
| `credits` | deux artistes crédités ensemble sur des disques, avec leur nombre, dans les deux sens |

Colonnes réelles (voir `src/musilogy/sql/`) :

- **`artists`** : `mbid`, `name`, `disambiguation`, `name_key`, `type`, `y0_declared`, `y_end_declared`, `y_birth`, `ended`, `country`, `begin_area`, `begin_area_mbid`, `y_first_album`, `y_last_album`, `y0`, `y0_source`, `y_end`, `y_end_source`, `styles` (liste de `{style, records}`, triée, vide sans Discogs).
- **`albums`** : `artist_mbid`, `rg_mbid`, `title`, `y`, `soundtrack`.
- **`links`** : `src_mbid`, `dst_mbid`, `type`, `y_begin`, `y_end`.
- **`popularity`** : `mbid`, `listen_count`, `user_count`, `snapshot`.
- **`releases`** : `artist_mbid`, `rg_mbid`, `title`, `primary_type` (`Album` ou `EP`), `soundtrack`, `remix`, `y`, `filed_original` (Wikidata le classe album studio ou EP), `official` (MusicBrainz y relève une édition officielle, `snapshot-official`).
- **`urls`** : `artist_mbid`, `type` (type de relation MusicBrainz), `url`, `ended`.
- **`colisten`** : `artist_mbid`, `neighbour_mbid`, `common`, `score`, `rank`.
- **`styles`** : `artist_mbid`, `decade` (NULL pour un disque sans édition datée), `style`, `records`.
- **`same_sound`** : `artist_mbid`, `neighbour_mbid`, `rank`, `score`, `term` (le style de la raison).
- **`credits`** : `artist_mbid`, `other_mbid`, `records`.

`name_key` est la clé de recherche d'un nom tapé : `strip_accents(lower(name))`, « bjork » trouve Björk.

## Les règles

Chaque règle vit dans son fichier SQL numéroté (`src/musilogy/sql/`) ; **la numérotation est un ordre topologique de dépendance**, pas un rang dans une liste, et avance par pas de dix pour qu'une règle s'insère sans renumérotation — `22_` en est un exemple vivant.

- **`10_bands` — Population et lecture des dates.** Tout artiste du dump entre dans `artists`, quel que soit son type, sans type compris, sauf les artistes à usage spécial de MusicBrainz ([unknown], Various Artists, [traditional]…, `SPECIAL_PURPOSE` dans `extract.py`, liste lue le 2026-10-06 sur musicbrainz.org/doc/Style/Unknown_and_untitled/Special_purpose_artist) : aucun filtre de date. **Seule une formation est un début d'activité déclaré** : le `begin` d'un groupe, d'un orchestre ou d'un chœur devient `y0_declared`. **Le `begin` d'une personne est une naissance** : il est publié dans `y_birth` et ne devient jamais `y0_declared` ; celui d'un artiste sans type, d'un personnage ou d'un « autre » peut être l'un ou l'autre, et rien dans le dump ne le dit : parmi ceux qui ont aussi un premier album, 10 % le précèdent de 15 ans ou plus (Lunna, 1946 ; Plague Bearer, 1992), contre 5 % des groupes. Il est écarté et compté (`begin_ambiguous`), et le premier album donne le début, comme pour une personne. Pour la personne, une naissance illisible ou future est perdue et comptée comme toute autre date. Le `end` de tout artiste, un décès comme une séparation, clôt l'activité et se lit de même pour tous les types. La lecture des dates est déterministe : l'année tient sur les quatre premiers caractères, sinon elle est **absente**, pas devinée. Une date hors de `[1850, année du dump]` — aux deux bords — et une fin antérieure au début sont neutralisées, et **chaque neutralisation alimente un compteur** dans `manifest.json`. Les genres et tags de MusicBrainz ne sont pas lus : leur licence n'est pas CC0 (« Licence et attribution »).

- **`20_albums` — Albums.** Un release-group compte comme album s'il est de type primaire `Album` (l'extraction garde aussi les EP, pour `releases`), crédité à un **seul artiste distinct** présent dans `artists`, daté dans `[1850, année du dump]`, et dont les types secondaires sont vides ou inclus dans `{Soundtrack, Demo}`.

  Les démos sont acceptées parce qu'elles sont une preuve *contemporaine* d'activité précoce : la plupart des artistes ayant démo et album studio ont sorti la démo d'abord, des années plus tôt. Les albums live sont exclus pour la raison inverse : **MusicBrainz les date de leur publication, pas du concert** — des centaines d'artistes ont un live daté plus de 20 ans après leur dernier studio, avec des titres qui portent eux-mêmes la vraie date (« Live in Paris (1966) », publié en 2024). Compilations, DJ-mix et remix sont exclus au même titre.

- **`30_bands_lifespan` — Ligne de vie et provenance.** Aux deux bords, **la preuve déclarée l'emporte, l'album prend le relais** : `y0` vaut l'année déclarée, sinon celle du premier album ; `y_end` la fin déclarée, sinon celle du dernier album. `y0_source` et `y_end_source` nomment la branche qui a produit la valeur. Les preuves brutes restent publiées à côté.

  **Une preuve issue d'un album n'est retenue à un bord que si elle ne contredit pas la preuve déclarée à l'autre bord.** Sept garde-fous, chacun compté dans `manifest.json` (`neutralised_inferences`) :

  | garde-fou | cas |
  |---|---|
  | `first_album_after_declared_end` | premier album postérieur à une fin déclarée — une réédition posthume n'est pas une preuve de formation ; pour une personne, la fin est son décès |
  | `last_album_before_declared_begin` | dernier album antérieur à un début déclaré — symétrique, il produisait une fin étiquetée `last_album` qui valait en réalité l'année de début |
  | `first_album_with_begin_below_min_year` | début déclaré sous 1850 donc neutralisé : la source affirme que le groupe précède l'album |
  | `album_with_end_below_min_year` | fin déclarée sous 1850 : tout album lui est postérieur, aucun bord ne s'en déduit — Bach, mort en 1750, enregistré à partir de 1961 |
  | `first_album_with_birth_below_min_year` | personne née avant 1850 : elle précède tout album de la fenêtre — Robert Ballard, né en 1575, commencerait en 2019 |
  | `first_album_before_birth` | premier album antérieur à la naissance : la source se contredit, le début ne s'en déduit pas |
  | `last_album_before_birth` | dernier album antérieur à la naissance : symétrique, la fin ne s'en déduit pas |


- **`22_releases` — Discographie.** Chaque release-group de type primaire `Album` ou `EP` dont les types secondaires se limitent à `Soundtrack` et `Remix` (une bande originale composée par l'artiste, un album de remix font partie de l'œuvre ; live, compilation, démo, DJ-mix, interview n'en font pas), une ligne par artiste crédité présent dans `artists`, sa date illisible comprise (`y` NULL). `filed_original` dit que le relevé Wikidata `discography` le classe album studio ou EP : sa forme « bande originale » couvre aussi des compilations de chansons d'un film, elle ne compte pas. Les disques que la page montre (`artist_releases`, docs/vision.md §2.4) se choisissent dans la fonction ; la table les garde tous. Les exclusions du relevé sont comptées dans `manifest.json` (`discography_exclusions`). **`official` dit que MusicBrainz montre le disque comme l'œuvre de l'artiste**, d'après le relevé du statut officiel (en parties épinglées, `REFERENCE_OFFICIAL`) : pour chaque artiste d'au moins 500 auditeurs qui a un album ou un EP, les release groups que son site liste par défaut, c'est-à-dire pas ceux dont toutes les sorties sont promotionnelles, pirates ou pseudo-sorties. Vrai si un artiste crédité relevé le liste, faux si des artistes crédités ont été relevés et qu'aucun ne le liste, NULL si aucun n'a été relevé ; `artist_releases` écarte les faux, qui ne datent pas non plus le premier album. Sur les artistes joués (2026-10-06), 476 des 4 980 disques sont écartés — *Place Pigalle*, *The Cocaine Sessions*, des EP promotionnels — et 149 restent inconnus. Les statuts sont comptés dans `manifest.json` (`release_status`) ; deux invariants : un artiste interrogé par deux parties, un statut que le relevé ne justifie pas.

- **`80_links` — Liens.** Les relations d'artiste à artiste qu'une page montre (docs/vision.md §2.4), **typées** : faire partie d'un groupe (`member of band`, `founder`, `collaboration`, dont la source est le membre), jouer sous un autre nom (`is person`, dont la source est la personne) et changer de nom (`artist rename`, dont la source est l'ancien nom). `type` garde le nom MusicBrainz, pour que le consommateur sache ce qu'un lien affirme sans se fier à une catégorie de musilogy. La famille, l'enseignement, les musiciens de tournée, les groupes hommage et le reste parlent d'une vie plutôt que de la musique : ils restent dans le dump, comptés dans `manifest.json` (`link_exclusions.not_on_page`). Le dump porte chaque relation sur ses deux artistes, orientée par `direction` ; elle est lue source → cible des deux côtés, puis dédoublonnée, avec ses années lues par la même macro stricte que partout ailleurs. Les deux extrémités doivent être des artistes de `artists` : un lien vers un artiste absent de `artists` n'aurait nulle part où arriver, et ces liens écartés sont comptés (`link_exclusions.to_unextracted_artist`). **Ce n'est pas une proximité** : un lien est un fait vérifiable, qui a joué où ; il ne dit rien du son.

- **`87_popularity` — Popularité.** Le nombre d'écoutes (`listen_count`) et d'auditeurs (`user_count`) que ListenBrainz compte pour chaque artiste (`POST /1/popularity/artist`), à la date `snapshot`. Elle ordonne, **elle n'exclut jamais**. Un artiste dont ListenBrainz ne connaît aucune écoute n'a pas de ligne plutôt qu'un zéro qu'il n'a pas déclaré. Les comptes bougent chaque jour : `musilogy snapshot-popularity` interroge ListenBrainz pour tous les artistes de l'extraction (lots de 1 000, une requête par seconde, en-têtes `X-RateLimit-*` respectés), écrit le relevé dans `data/raw/listenbrainz/<date>/` et son empreinte dans `reference/listenbrainz-<date>.SHA256SUMS`. Comme le dump, un relevé ne se reprend pas : `REFERENCE_POPULARITY` épingle celui que `run` lit et vérifie, et `run` s'arrête s'il manque.


- **`90_invariants` — Contrôles.** Des vues qui doivent toutes renvoyer zéro ligne ; le nom de la vue *est* le nom de l'invariant. Chacune **recalcule indépendamment** ce qu'elle vérifie : une revue a montré qu'un invariant réutilisant la formule de production restait muet sur 265 violations réelles. Les bornes contractuelles y sont codées en dur, aux deux extrémités, sans relire les variables de session de la production ; changer de dump impose donc une modification délibérée de ce fichier — c'est l'intention.

Deux bornes sont des variables de session posées par `build()` : `dump_year` et `min_year`.

- **`82_urls` — Pages web.** Parmi les relations URL d'un artiste de `artists`, celles qu'une page artiste utilise : les plateformes d'écoute par leur domaine (Deezer, Spotify, Apple Music, Bandcamp, SoundCloud), quel que soit le type de relation, et les types `official homepage` et `wikidata` (le site atteint l'article Wikipédia par l'élément Wikidata), avec le type MusicBrainz. Discogs, Wikipédia, les images, VIAF, IMDb, les réseaux sociaux et les autres bases restent dans le dump : aucune page ne les montre. Une relation terminée (`ended`) reste dans la table, marquée ; une même page reliée deux fois sous un même type est une ligne, terminée seulement si toutes le sont.

- **`84_discogs` — Styles (Discogs).** Le dump mensuel des sorties Discogs (`REFERENCE_DISCOGS`, CC0, data.discogs.com), épinglé par l'empreinte que Discogs publie à côté et réduit en flux aux champs qu'une règle lit (`extract.py`) et lu une seule fois par le build (`discogs_work`). La projection porte un compagnon (`extraction.json`, sorties écrites et champs) : écrite avec d'autres champs que ceux que lit le build, elle est refaite ; lue avec moins de sorties qu'elle n'en a écrit, `run` s'arrête sans rien publier. **Un artiste rejoint Discogs par la page Discogs que MusicBrainz lui relie** (`discogs_links`) : un artiste Discogs relié à deux MBID n'en rejoint aucun, écarté et compté, un MBID relié à plusieurs artistes Discogs (des alias) les additionne ; ces comptes et ceux des artistes reliés et des disques sont dans `manifest.json` (`discogs_coverage`). **Un disque est un master Discogs**, ou la sortie elle-même quand elle n'en a pas (le dump écrit `master_id` 0) ; une compilation, une sortie non officielle, une promotion, un sampler ou un mix ne compte pas : ils disent où la musique a circulé, pas où l'artiste l'a faite. `styles` compte les disques par style et par décennie de première édition — un disque porte les styles de toutes ses éditions — ; une année hors de `[1850, année du dump]` n'est pas une date (Discogs porte une sortie de 338). **La ligne d'un artiste** (`artists.styles`, la ligne sous son nom, docs/vision.md §2.4) somme ses disques de chaque style sur toutes les décennies, du plus de disques au moins, à égalité par nom ; elle est vide pour un artiste que Discogs n'atteint pas. **MusicBrainz reste l'autorité sur les dates** : un premier disque Discogs antérieur de plus d'un an à la formation déclarée est compté (`discogs_date_disagreements`), jamais réécrit. Cinq invariants : un style en double, sans artiste, une décennie hors de la fenêtre, un artiste qui n'atteint Discogs que par un identifiant partagé, et une ligne d'artiste qui ne redonne pas ses lignes de `styles` dans cet ordre.

## Co-écoute (toutes les écoutes ListenBrainz)

ListenBrainz publie chaque mois, dans le dossier de son export complet, un dump « Spark » sous CC0 : une archive tar de 242 Go, en Parquet, qui porte toutes les écoutes déjà rapprochées de MusicBrainz. `musilogy snapshot-listens <dump>` la lit en flux, sans jamais la garder : chaque fichier Parquet est réduit à une ligne par utilisateur et par artiste crédité, avec son nombre d'écoutes, puis effacé. Les 32 tranches qui en sortent, réparties par utilisateur, sont rangées sous `data/raw/listenbrainz/listens-<dump>/`. L'empreinte que ListenBrainz publie pour l'archive n'est connue qu'au dernier octet : tant qu'elle ne concorde pas, rien n'est rangé. Elle est épinglée avec celles des tranches sous `reference/listenbrainz-listens-<dump>.SHA256SUMS`, et `REFERENCE_LISTENING` désigne le dump. `run` vérifie chaque tranche et refuse un dossier qui en compte une de plus ou de moins ; ListenBrainz ne garde pas ses dumps, la copie de la projection est donc sauvegardée hors du disque. `colisten.py` en tire `colisten` : la règle, ses seuils et l'exception au SQL qu'elle demande sont dans `docs/conception.md`. Toutes les écoutes de chaque utilisateur comptent, même pour les comptes qui ont écouté des dizaines de milliers d'artistes (`docs/vision.md` §2.2). Sur le dump `2692-20261001-000003` : 2 856 452 793 écoutes, dont 2 484 121 161 rapprochées d'un artiste, réduites à 119 637 055 paires utilisateur-artiste, et 899 265 artistes d'au moins 3 auditeurs (2026-10-09). `colisten` donne des voisins à 899 260 artistes ; toute la construction a pris 13 h 55 de processeur (la co-écoute seule, 10 h dans l'étude du 2026-10-10) et 5,5 Go de mémoire au plus, cache disque compris, dans un scope de 5,5 Go visés (2026-10-11).

## Les trois onglets de voisins

« Même son » (`samesound.py`), « Écoutés ensemble » (`colisten.py`) et la filiation (`links`, `86_credits.sql`) : chacun sa question, sa source et sa méthode, décrites dans `docs/conception.md` §3 ; les règles et leurs paramètres sont dans le code, les paramètres relus par le manifeste.

## Statut officiel MusicBrainz (relevé)

`musilogy snapshot-official` demande à l'API MusicBrainz, pour chaque artiste qu'au moins 500 auditeurs écoutent dans le relevé de popularité épinglé et qui a au moins un album ou un EP dans l'extraction, les albums et EP que montre sa page sur musicbrainz.org : `/ws/2/release-group?artist=…&type=album|ep&release-group-status=website-default`, qui écarte les release groups dont toutes les sorties sont des promotions, des bootlegs ou des pseudo-sorties (musicbrainz.org/doc/MusicBrainz_API, « Browse »). Une ligne par artiste, `{artist_mbid, release_groups}`, dans `data/raw/musicbrainz/<date>/official-release-groups.jsonl`, empreinte dans `reference/musicbrainz-official-<date>.SHA256SUMS`. Chaque release group de la réponse doit créditer l'artiste demandé ; `release_groups` vaut `null` quand MusicBrainz ne connaît plus l'artiste (404) ou répond pour celui avec lequel il a été fusionné depuis le dump : l'artiste reste non relevé. Une requête par seconde, la limite du service (musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), une page de 100 release groups par requête : une trentaine d'heures pour la première partie. Interrompu, il reprend le relevé resté partiel, quel que soit le jour où il a commencé. Sous le seuil, les bootlegs sont rares : les 31 artistes joués sous 500 auditeurs montrent 112 disques, dont un EP promotionnel (2026-10-05). Les données de base MusicBrainz sont sous CC0. Deux parties sont épinglées (`REFERENCE_OFFICIAL`) : 2026-10-05, et 2026-10-06, les 9 062 artistes qui n'ont que des EP ou sont d'un autre type ; `22_releases` s'en sert (règle officielle, plus haut).

## Discographie Wikidata (relevé)

`musilogy snapshot-discography` demande au même service les release groups (MBID, P436) que Wikidata classe album studio, EP ou bande originale, par « nature de l'élément » (P31) ou « forme de l'œuvre » (P7937) : une requête par forme, car les trois réunies prenaient 26,6 s, près de la limite de 60 s, et séparées 5,1, 0,9 et 0,7 s (2026-10-05). Le relevé, trié et dédoublonné, va dans `data/raw/wikidata/<date>/discography.jsonl` (`{rg_mbid, form}`), son empreinte dans `reference/wikidata-discography-<date>.SHA256SUMS`, et `REFERENCE_DISCOGRAPHY` épingle celui que `run` lit. Les identifiants y sont écrits tels que Wikidata les porte : distinguer un MBID d'une faute de saisie (« 12-inch single ») est une règle, comptée dans `discography_exclusions`.

Relevé du 2026-10-05 : 72 397 lignes, 72 170 release groups.

## Ce que reçoit le site

`data/out/<dump>/` contient les dix tables en Parquet et le manifeste.

`manifest.json` porte le dump et l'empreinte de ses archives (`dump`, `archive_sha256`), la date et l'empreinte de chaque relevé (`popularity`, `discography`, `listening`, et les parties de `official`), le dump Discogs lu et le compagnon de sa projection — sorties écrites, champs (`discogs`) —, les comptes (`counts`), **les empreintes des fichiers Parquet livrés** (`output_sha256`), les **paramètres** du run (`parameters` : `dump_year`, `min_year`, les seuils de `colisten`, de `same_sound` et de `credits`), les **entrées** (`inputs` : `rows_loaded` par table brute, le sidecar d'extraction et son accord avec les lignes lues), les compteurs (`r2_anomalies`, `neutralised_inferences`, `link_exclusions`, `discography_exclusions`, `release_status`, `discogs_coverage`, `discogs_date_disagreements`), ce que la comparaison avec la livraison précédente a laissé passer, chaque clé absente quand elle est vide — les écarts acceptés (`accepted_drifts`), les compteurs nouveaux (`new_counters`) et disparus (`gone_counters`), sous la forme qu'écrit `_trace` (`publish.py`) — et le commit (`git_sha`).

Ces empreintes de sortie sont opposables parce que la livraison est reproductible : à dump et code identiques, deux exécutions écrivent les mêmes octets. L'ordre des lignes est fixé par une clé totale sur chaque table. Un consommateur distingue donc une livraison inchangée d'une nouvelle par sa seule empreinte, sans retélécharger.

## Chargement dans le site

`uv run musilogy load` vérifie les Parquet publiés contre leur manifeste, les copie dans un schéma `musilogy_next` de la base du site, compare les comptes copiés à ceux du manifeste, puis bascule `musilogy_next` en `musilogy` en une transaction : le site ne lit jamais un chargement partiel, et un chargement raté laisse le précédent en place. La connexion vient de l'environnement libpq (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`, `PGSSLROOTCERT`). Le SQL côté Postgres vit dans `src/musilogy/pg/`, numéroté comme `sql/` : `10_tables` avant la copie, les suivants sur le schéma de transit, `90_` une fois la bascule faite.

Les tables de `load.TABLES` sont chargées, plus `manifest` (dump, relevés, commit) ; les autres restent en Parquet tant qu'aucune fonction ne les lit, et un score de voisin, qui le range dans la construction, ne se charge pas (`load.PROJECTIONS`). La liste des styles d'un artiste, que Postgres ne sait pas typer en structure anonyme, devient du `jsonb`. `20_search.sql` en tire `search`, la projection étroite de la recherche (`name_key` en collation C, nombre d'auditeurs, MBID), rangée par `name_key`. Mesuré sur un Postgres 16 jetable, avec le dump de référence : 408 s de chargement, 1 259 Mo en tout, dont 192 Mo et 68 Mo d'index pour la projection de recherche. Avec `releases` et `urls` (2026-10-05, sur victorserv) : 214 s, 2 667 Mo, dont 549 Mo pour `releases` et 274 Mo pour `urls`.

**Ce que lit le site : des fonctions, pas des tables.** Il appelle les fonctions de `pg/90_*.sql`, testées ici contre Postgres, et dépend de leurs signatures, pas de la disposition des tables. Le contrat complet est `docs/conception.md` §4.

- `artist_card(mbid)` donne la fiche.
- Les groupes et projets, en deux rubriques plutôt que les types MusicBrainz, les membres (suivis de leurs autres groupes et projets) et les autres noms (docs/vision.md §2.4). `artist_bands(mbid)` donne les membres d'un groupe (`member`) ou les groupes d'une personne (`group`), membre, fondateur et collaboration confondus, une ligne par artiste de la première année déclarée à la dernière. `artist_member_projects(mbid)` donne, à deux pas d'un groupe, les autres groupes de ses membres et les noms sous lesquels ils jouent, seulement ceux qui ont un disque (`artist_releases`), sans l'artiste, ses membres, ses anciens ou nouveaux noms ni les projets auxquels il prend part lui-même (Stereolab dans Uilab, le seul cas chez les 336 artistes joués), avec les membres qui y mènent (`via`), du plus ancien au plus récent. `artist_other_names(mbid)` donne les pseudonymes (`alias`), la personne derrière un pseudonyme (`person`) et les changements de nom (`former`, `later`). Mesuré le 2026-10-05 sur les 336 artistes joués : 161 ont des membres, 129 au moins un projet de membre qui a un disque (médiane 5, 90e centile 18, au plus 65 pour Underground Resistance), 53 d'autres noms ; de Stereolab à McCarthy (Lætitia Sadier, Tim Gane), Monade, Cavern of Anti-Matter, de The Notwist à Lali Puna et 13 & God. Les projets des 336 se calculent en 2 s au total sur le Postgres jetable, 0,3 s pour Underground Resistance.
- `artist_same_sound(mbid)`, `artist_colisten(mbid)` et `artist_credits(mbid)` donnent les onglets « Même son », « Écoutés ensemble » et les crédités ensemble de la filiation, dont les groupes et autres noms viennent des fonctions ci-dessus.
- `artist_releases(mbid)` donne l'œuvre que la page montre (docs/vision.md §2.4) : albums studio, bandes originales et remix, EP à partir du premier album (tous les EP d'un artiste sans album), rien après la fin déclarée d'un groupe sauf ce que Wikidata classe album studio ou EP, et un disque sans année seulement s'il est ainsi classé, en dernier ; du plus récent au plus ancien. Pour les Beatles, de *Let It Be* à *Please Please Me* (1970-1963). `artist_urls(mbid)` ses pages encore à lui (relation non terminée), par type puis URL. Moins d'une milliseconde, cache chaud, sur les Rolling Stones.
- `artist_homonym_rank(mbids)` donne le rang de chaque artiste parmi ceux de son nom exact (`name_key`), les plus écoutés d'abord : le site en tire l'adresse de chaque page (docs/vision.md §5).
- `search_artists(requête, taille)` cherche par préfixe du nom normalisé, les plus écoutés d'abord (`user_count`), ceux que ListenBrainz ne connaît pas en dernier, puis par nom et MBID. La requête est normalisée comme `name_key` (`strip_accents(lower(name))` dans DuckDB) par `musilogy.name_key(text)` : minuscules, décomposition canonique, retrait des marques combinantes — la catégorie Unicode M entière, 2 450 points, mesurée en interrogeant DuckDB sur chaque point de code —, recomposition. Sur le dump de référence, elle redonne le `name_key` de tous les noms sauf 6, des lettres cerclées (Ⓐ) que la libc du Postgres du site ne met pas en minuscule ; le seul bloc des diacritiques latins en manquait 12 987. Une requête vide ne trouve personne. Temps mesurés sur le Postgres jetable, cache chaud, médiane de 7 appels : « a » (157 112 noms) 78 ms, « the » 46 ms, « bjork », « radiohead » ou « sigur ros » moins de 4 ms ; le premier appel après le chargement, cache froid, a pris 1,8 s pour « a ». Lue directement dans `artists`, « a » prenait environ 1 s cache chaud.

## Comparaison avec la livraison précédente

La référence des chiffres est la livraison précédente, pas une liste figée. Avant d'écrire quoi que ce soit, `musilogy run` compare le compte de chaque table, et chaque compteur des groupes de `COUNTER_TABLES` (`publish.py`), à ceux du `manifest.json` de la livraison qu'il remplace (`data/out/<dump>/`, réécrite en place), ou, pour un nouveau dump, de la dernière livraison d'un autre dump. Au-delà de `MAX_DRIFT` (`publish.py`), il ne publie rien et nomme chaque table ou compteur qui a bougé, avec la valeur attendue, l'obtenue et l'écart absolu et relatif ; un compteur que la livraison précédente n'avait pas est signalé comme nouveau, un compteur disparu est signalé, aucun des deux n'arrête le run ; sans livraison précédente, il publie et le dit. Un écart voulu — une règle qui change, un nouveau dump — se comprend avant d'être accepté : on identifie la règle qui l'a produit, on dit dans la PR pourquoi le nouveau compte est le bon, puis on relance avec `--accept-drift NOM`, une fois par table, compteur (`GROUPE.COMPTEUR`) ou groupe de compteurs (`musilogy run --help`) ; un groupe accepte chacun de ses compteurs qui a bougé. Un nom que le build ne compte pas arrête le run ; une table, un compteur ou un groupe accepté qui n'a pas bougé est signalé. Les écarts acceptés, chacun sous le nom de son compteur, et les compteurs nouveaux et disparus sont inscrits dans le manifeste de la nouvelle livraison (`accepted_drifts`, `new_counters`, `gone_counters`). Les invariants (`90_invariants.sql`) restent vérifiés à chaque exécution, écart accepté ou non.

Changer de dump demande aussi de mettre à jour `REFERENCE_DUMP`, la valeur par défaut de `dump_year`, ajouter le `reference/<dump>.SHA256SUMS` correspondant, prendre un relevé ListenBrainz sur la nouvelle extraction et l'épingler dans `REFERENCE_POPULARITY` (l'invariant `popularity_unrequested` refuse un relevé pris sur une autre), et modifier à la main les bornes codées en dur dans les vues de `90_invariants.sql` — cette dernière opération est délibérément manuelle, c'est ce qui empêche une mauvaise variable de satisfaire à la fois la règle et son contrôle. Les extractions vivant dans `data/work/<dump>/`, changer `REFERENCE_DUMP` suffit à repartir d'une extraction neuve, sans rien vider à la main.

La co-écoute, une fois calculée, est gardée dans `data/work/` et relue tant que la règle et les écoutes qui la produisent ne changent pas (`build.colisten_from`).

## Limites assumées

- **Une fin dérivée d'un album n'est pas une fin déclarée.** Elle est marquée `y_end_source = 'last_album'`. Parmi les groupes de type `Group` concernés ayant au moins deux albums, **3,38 % ont un dernier album isolé de plus de 15 ans** du précédent (1,04 % au-delà de 25) : des rééditions de fonds historiques qui étirent la ligne de vie. Les écarter demanderait un seuil arbitraire ; l'étiquette de provenance laisse le site trancher.

- **Les styles ne couvrent qu'une partie des artistes.** Sur la livraison du 2026-10-11, 701 603 des 2 980 293 artistes ont des styles Discogs ; parmi les 387 974 qui avaient des genres MusicBrainz, 130 004 n'ont aucun style, et leur ligne est vide depuis le retrait des genres (2026-10-17).

- **La plupart des artistes n'ont aucun album** qui passe les règles, ni aucun début exploitable. La base est complète par choix : le site ordonne, musilogy ne jette pas.

## Installation, tests, exécution

Python 3.12 géré par `uv`.

```bash
uv sync
```

Deux niveaux de test :

- `uv run pytest` — suite rapide, quelques secondes, sans dépendance au dump. Tourne sur les témoins réels de `cli.WITNESSES`, versionnés dans `tests/fixtures/` (extraits authentiques du dump de référence, jamais de données inventées) et sur quelques enregistrements synthétiques pour les formes qu'aucun témoin ne porte.
- `tests/test_load.py`, `tests/test_artist.py`, `tests/test_search.py`, `tests/test_official.py`, `tests/test_same_sound.py`, `tests/test_colisten.py`, `tests/test_credits.py` — le chargement et les fonctions SQL du site, contre un vrai Postgres jetable désigné par `MUSILOGY_TEST_PG` (chaîne de connexion libpq ; les tests y suppriment et recréent les schémas `musilogy`). Sans elle, ces tests sont sautés, sauf en CI, qui fournit un service Postgres 16 et échoue si la variable manque.

La suite passe depuis n'importe quel répertoire : tous les chemins sont ancrés sur le paquet (`musilogy.paths`), jamais sur le répertoire courant.

```bash
uv run musilogy run                 # fetch → extract → transform → validate → compare → publish
uv run musilogy snapshot-popularity # relevé ListenBrainz daté, à épingler (~1 h)
uv run musilogy snapshot-official   # albums et EP que MusicBrainz montre pour les artistes d'au moins 500 auditeurs (~30 h, reprenable)
uv run musilogy snapshot-discography # relevé Wikidata daté des disques classés album studio, EP ou BO, à épingler
uv run musilogy snapshot-listens <ref>  # toutes les écoutes ListenBrainz, réduites par utilisateur et artiste, à épingler
uv run musilogy make-fixtures       # régénère les témoins depuis les extractions et les relevés épinglés
uv run musilogy load                # charge data/out/ dans la base du site (environnement libpq)
uv run musilogy load --sample       # charge le pipeline passé sur les fixtures : la petite Musilogy d'un poste
```

Aucune sortie du pipeline n'est versionnée ; seules les empreintes et les fixtures le sont.

Qualité : `uv run ruff check`, `uv run ruff format --check`, `uv run mypy`. La CI (`.github/workflows/musilogy.yml`, à la racine d'AubeSonore) passe ces trois contrôles plus la suite.

## Structure du dépôt

```
src/musilogy/
  fetch.py               télécharge et vérifie les archives MusicBrainz et Discogs (SHA-256), relève ListenBrainz, MusicBrainz et Wikidata
  extract.py             projette les enregistrements bruts en flux, sans logique métier
  build.py               enchaîne les fichiers SQL, vérifie les invariants
  colisten.py            notre co-écoute, « Écoutés ensemble » (produit matriciel creux)
  samesound.py           « Même son », chaque couleur contre toutes (produit matriciel creux)
  publish.py             écrit les Parquet et manifest.json
  cli.py                 les commandes
  load.py                charge les Parquet publiés dans la base du site
  paths.py               chemins ancrés sur le paquet
  reference/             empreintes des archives et des relevés épinglés
  sql/                   les règles, en ordre topologique
  pg/                    les tables et les fonctions que lit le site, côté Postgres
tests/
  conftest.py            fixtures partagées
  fixtures/              témoins réels versionnés
  test_*.py              une suite par règle
docs/conception.md       la conception en vigueur : sources, tables, contrat avec le site
docs/research/           notes de recherche datées
```

## Licence et attribution

Toutes les sources lues sont sous **CC0** : les données de base MusicBrainz (artistes, dates, albums, relations, pages web) et son statut officiel, les écoutes et la popularité de ListenBrainz, les relevés Wikidata, le dump des sorties Discogs. Les genres et tags de MusicBrainz, des données supplémentaires sous une licence non commerciale (musicbrainz.org/doc/MusicBrainz_Database), ne sont pas lus : l'extraction les écarte (2026-10-17). Son compagnon (`extraction.json`) garde les champs qu'elle a écrits : une extraction faite avec d'autres, celles d'avant cette date comprises, est refaite par `run` et `make-fixtures`.

La licence du jeu de données produit, fixtures versionnées comprises, reste à fixer par le propriétaire du dépôt (`LICENSE-DATA`). Les fixtures de `tests/fixtures/` sont des extraits réels des sources épinglées (voir `tests/fixtures/ATTRIBUTION.md`) ; `tests/fixtures/discography.jsonl` est un extrait du relevé Wikidata du 2026-10-05, pour les release groups des témoins.
