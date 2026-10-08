# musilogy

Produit, hors ligne et depuis des sources épinglées et datées, les données de **Musilogy** (`docs/vision.md` à la racine, §2) : pour un artiste, qui fait le même son, avant lui, en même temps, après lui ; dans quels groupes ses membres ont joué. Un dump JSON MusicBrainz, le dump des sorties Discogs, des relevés ListenBrainz (popularité, proximité), MusicBrainz (statut officiel) et Wikidata (discographie) deviennent dix tables reproductibles et testées, publiées en Parquet ; `musilogy load` les copie dans le schéma `musilogy` de la base du site, qui ne lit que des fonctions SQL. La conception en vigueur, avec le contrat de ces fonctions, est `docs/conception.md` ; la feuille de route est `docs/vision.md` §7.

## Principe directeur

**La sortie n'affirme jamais plus que ce que la source porte.** Une absence reste une absence : elle n'est ni imputée en silence, ni prolongée, ni arbitrée. Quand une valeur est dérivée, elle est publiée avec la colonne qui dit d'où elle vient, pour que le consommateur distingue une donnée déclarée d'une donnée inférée. Quand une mesure est impossible, la colonne vaut NULL — jamais zéro, qui affirmerait une mesure qui n'a pas eu lieu.

**Les tables portent la population complète.** Aucun filtre d'affichage n'y entre : ce que le site montre d'abord se décide dans les fonctions SQL qu'il appelle, qui ordonnent sans exclure. Une donnée écartée en amont serait irrécupérable en aval.

## Les onze tables

Mesurées sur le dump de référence `20260909-001002` :

| Table | Contenu | Lignes |
|---|---|---|
| `artists` | un artiste, de tout type MusicBrainz ou sans type, hors artistes à usage spécial : ses preuves de dates, sa ligne de vie dérivée, ses genres votés | 2 980 293 |
| `albums` | une sortie d'album créditée à un seul artiste ; non chargée dans le site, elle sert les dates | 1 419 423 |
| `genres` | le vocabulaire porté par `artists` | 1 740 |
| `links` | un lien typé entre deux artistes qu'une page montre — appartenance, pseudonyme, changement de nom —, avec ses années | 701 614 |
| `popularity` | les écoutes ListenBrainz d'un artiste, relevées à une date | 1 366 777 |
| `releases` | un album ou un EP crédité à un artiste, dont les types secondaires se limitent à bande originale et remix ; une ligne par artiste crédité | 2 556 274 |
| `urls` | une page web qu'une page artiste utilise parmi celles que MusicBrainz relie à un artiste (plateforme d'écoute, site officiel, Wikidata), terminées comprises | 1 991 446 |
| `proximity` | un voisin ListenBrainz d'un artiste, avec son rang et son score | 4 973 236 |
| `colisten` | un voisin d'un artiste selon notre co-écoute, avec ses auditeurs communs, son score et son rang ; non chargée dans le site | 18 473 211 |
| `styles` | un style Discogs des disques d'un artiste, par décennie de première édition, compté en disques ; non chargée dans le site | 4 359 024 |
| `same_sound` | un proche « Même son » d'un artiste : un voisin de sa co-écoute dont la couleur s'accorde, avec son rang et sa raison | 2 345 979 |

Colonnes réelles (voir `src/musilogy/sql/`) :

- **`artists`** : `mbid`, `name`, `disambiguation`, `name_key`, `type`, `y0_declared`, `y_end_declared`, `y_birth`, `ended`, `country`, `begin_area`, `begin_area_mbid`, `genres_declared` et `genres_from_albums` (listes de `{mbid, name, votes}`, triées), `genres`, `genre_source`, `y_first_album`, `y_last_album`, `y0`, `y0_source`, `y_end`, `y_end_source`, `proximity_surveyed`.
- **`albums`** : `artist_mbid`, `rg_mbid`, `title`, `y`, `soundtrack`.
- **`genres`** : `genre_mbid`, `name`, `n_artists`.
- **`links`** : `src_mbid`, `dst_mbid`, `type`, `y_begin`, `y_end`.
- **`popularity`** : `mbid`, `listen_count`, `user_count`, `snapshot`.
- **`releases`** : `artist_mbid`, `rg_mbid`, `title`, `primary_type` (`Album` ou `EP`), `soundtrack`, `remix`, `y`, `filed_original` (Wikidata le classe album studio ou EP).
- **`urls`** : `artist_mbid`, `type` (type de relation MusicBrainz), `url`, `ended`.
- **`proximity`** : `artist_mbid`, `neighbour_mbid`, `score`, `rank`.
- **`colisten`** : `artist_mbid`, `neighbour_mbid`, `common`, `score`, `rank`.
- **`styles`** : `artist_mbid`, `decade` (NULL pour un disque sans édition datée), `style`, `records`.
- **`same_sound`** : `artist_mbid`, `neighbour_mbid`, `rank`, `colisten_rank`, `source` (`styles` ou `genres`), `colour`, `term` (le style ou le genre de la raison), `decade` (la décennie de l'artiste pour un style, NULL pour un genre).

`name_key` est la clé de recherche d'un nom tapé : `strip_accents(lower(name))`, « bjork » trouve Björk.

## Les règles

Chaque règle vit dans son fichier SQL numéroté (`src/musilogy/sql/`) ; **la numérotation est un ordre topologique de dépendance**, pas un rang dans une liste, et avance par pas de dix pour qu'une règle s'insère sans renumérotation — `25_` en est un exemple vivant.

- **`10_bands` — Population et lecture des dates.** Tout artiste du dump entre dans `artists`, quel que soit son type, sans type compris, sauf les artistes à usage spécial de MusicBrainz ([unknown], Various Artists, [traditional]…, `SPECIAL_PURPOSE` dans `extract.py`, liste lue le 2026-10-06 sur musicbrainz.org/doc/Style/Unknown_and_untitled/Special_purpose_artist) : aucun filtre de date ou de genre. **Seule une formation est un début d'activité déclaré** : le `begin` d'un groupe, d'un orchestre ou d'un chœur devient `y0_declared`. **Le `begin` d'une personne est une naissance** : il est publié dans `y_birth` et ne devient jamais `y0_declared` ; celui d'un artiste sans type, d'un personnage ou d'un « autre » peut être l'un ou l'autre, et rien dans le dump ne le dit : parmi ceux qui ont aussi un premier album, 10 % le précèdent de 15 ans ou plus (Lunna, 1946 ; Plague Bearer, 1992), contre 5 % des groupes. Il est écarté et compté (`begin_ambiguous`), et le premier album donne le début, comme pour une personne. Pour la personne, une naissance illisible (8 962) ou future (2) est perdue et comptée comme toute autre date. Le `end` de tout artiste, un décès comme une séparation, clôt l'activité et se lit de même pour tous les types. La lecture des dates est déterministe : l'année tient sur les quatre premiers caractères, sinon elle est **absente**, pas devinée. Une date hors de `[1850, année du dump]` — aux deux bords — et une fin antérieure au début sont neutralisées, et **chaque neutralisation alimente un compteur** dans `manifest.json`. Tous les genres sont conservés, triés explicitement par votes décroissants puis par nom.

- **`20_albums` — Albums.** Un release-group compte comme album s'il est de type primaire `Album` (l'extraction garde aussi les EP, pour `releases`), crédité à un **seul artiste distinct** présent dans `artists`, daté dans `[1850, année du dump]`, et dont les types secondaires sont vides ou inclus dans `{Soundtrack, Demo}`.

  Les démos sont acceptées parce qu'elles sont une preuve *contemporaine* d'activité précoce : 61,7 % des artistes ayant démo et album studio ont sorti la démo d'abord, 3 ans plus tôt en médiane parmi eux. Les albums live sont exclus pour la raison inverse : **MusicBrainz les date de leur publication, pas du concert** — 925 artistes ont un live daté plus de 20 ans après leur dernier studio, avec des titres qui portent eux-mêmes la vraie date (« Live in Paris (1966) », publié en 2024). Compilations, DJ-mix et remix sont exclus au même titre.

- **`25_band_genres` — Genres d'un artiste.** La règle des dates, appliquée aux genres : **les genres déclarés l'emportent, ceux des albums prennent le relais.** Un artiste qui ne déclare aucun genre reçoit la somme des votes des genres de ses propres albums, ceux que `20_albums` a retenus. Un artiste qui en déclare ne mélange jamais ceux de ses albums : ce sont des votes sur des objets différents, et une union laisserait un album l'emporter sur l'artiste. `genre_source` nomme la branche (`declared`, `albums`, ou NULL) ; les deux listes brutes restent publiées à côté de `genres`. Sur le dump de référence, 45,4 % des artistes porteurs d'un genre le tiennent de leurs albums.

- **`30_bands_lifespan` — Ligne de vie et provenance.** Aux deux bords, **la preuve déclarée l'emporte, l'album prend le relais** : `y0` vaut l'année déclarée, sinon celle du premier album ; `y_end` la fin déclarée, sinon celle du dernier album. `y0_source` et `y_end_source` nomment la branche qui a produit la valeur. Les preuves brutes restent publiées à côté.

  **Une preuve issue d'un album n'est retenue à un bord que si elle ne contredit pas la preuve déclarée à l'autre bord.** Sept garde-fous, chacun compté :

  | garde-fou | cas | compte |
  |---|---|---|
  | `first_album_after_declared_end` | premier album postérieur à une fin déclarée — une réédition posthume n'est pas une preuve de formation ; pour une personne, la fin est son décès | 2 039 |
  | `last_album_before_declared_begin` | dernier album antérieur à un début déclaré — symétrique, il produisait une fin étiquetée `last_album` qui valait en réalité l'année de début | 271 |
  | `first_album_with_begin_below_min_year` | début déclaré sous 1850 donc neutralisé : la source affirme que le groupe précède l'album | 73 |
  | `album_with_end_below_min_year` | fin déclarée sous 1850 : tout album lui est postérieur, aucun bord ne s'en déduit — Bach, mort en 1750, enregistré à partir de 1961 | 235 |
  | `first_album_with_birth_below_min_year` | personne née avant 1850 : elle précède tout album de la fenêtre — Robert Ballard, né en 1575, commencerait en 2019 | 326 |
  | `first_album_before_birth` | premier album antérieur à la naissance : la source se contredit, le début ne s'en déduit pas | 32 |
  | `last_album_before_birth` | dernier album antérieur à la naissance : symétrique, la fin ne s'en déduit pas | 17 |

- **`50_genres` — Vocabulaire.** Les genres effectivement portés par `artists.genres`, y compris ceux qu'aucun artiste ne déclare et que seuls des albums portent.

- **`22_releases` — Discographie.** Chaque release-group de type primaire `Album` ou `EP` dont les types secondaires se limitent à `Soundtrack` et `Remix` (une bande originale composée par l'artiste, un album de remix font partie de l'œuvre ; live, compilation, démo, DJ-mix, interview n'en font pas), une ligne par artiste crédité présent dans `artists`, sa date illisible comprise (`y` NULL). `filed_original` dit que le relevé Wikidata `discography` le classe album studio ou EP : sa forme « bande originale » couvre aussi des compilations de chansons d'un film, elle ne compte pas. Les disques que la page montre (`artist_releases`, docs/vision.md §2.4) se choisissent dans la fonction ; la table les garde tous. Sur le dump de référence, 1 968 255 lignes d'albums et 588 019 d'EP, dont 70 196 classés par Wikidata ; les exclusions du relevé sont comptées dans `manifest.json` (`discography_exclusions`). **`official` dit que MusicBrainz montre le disque comme l'œuvre de l'artiste**, d'après le relevé du statut officiel (en parties épinglées, `REFERENCE_OFFICIAL`) : pour chaque artiste d'au moins 500 auditeurs qui a un album ou un EP, les release groups que son site liste par défaut, c'est-à-dire pas ceux dont toutes les sorties sont promotionnelles, pirates ou pseudo-sorties. Vrai si un artiste crédité relevé le liste, faux si des artistes crédités ont été relevés et qu'aucun ne le liste, NULL si aucun n'a été relevé ; `artist_releases` écarte les faux, qui ne datent pas non plus le premier album. Sur les artistes joués (2026-10-06), 476 des 4 980 disques sont écartés — *Place Pigalle*, *The Cocaine Sessions*, des EP promotionnels — et 149 restent inconnus. Les statuts sont comptés dans `manifest.json` (`release_status`) ; deux invariants : un artiste interrogé par deux parties, un statut que le relevé ne justifie pas.

- **`80_links` — Liens.** Les relations d'artiste à artiste qu'une page montre (docs/vision.md §2.4), **typées** : faire partie d'un groupe (`member of band`, `founder`, `collaboration`, dont la source est le membre), jouer sous un autre nom (`is person`, dont la source est la personne) et changer de nom (`artist rename`, dont la source est l'ancien nom). `type` garde le nom MusicBrainz, pour que le consommateur sache ce qu'un lien affirme sans se fier à une catégorie de musilogy. La famille, l'enseignement, les musiciens de tournée, les groupes hommage et le reste parlent d'une vie plutôt que de la musique : ils restent dans le dump, comptés dans `manifest.json` (`link_exclusions.not_on_page`, 110 205 sur le dump de référence). Le dump porte chaque relation sur ses deux artistes, orientée par `direction` ; elle est lue source → cible des deux côtés, puis dédoublonnée, avec ses années lues par la même macro stricte que partout ailleurs. Les deux extrémités doivent être des artistes de `artists` : un lien vers un artiste absent de `artists` n'aurait nulle part où arriver, et ces 25 liens écartés sont comptés (`link_exclusions.to_unextracted_artist`). **Ce n'est pas une proximité** : un lien est un fait vérifiable, qui a joué où ; il ne dit rien du son.

- **`87_popularity` — Popularité.** Le nombre d'écoutes (`listen_count`) et d'auditeurs (`user_count`) que ListenBrainz compte pour chaque artiste (`POST /1/popularity/artist`), à la date `snapshot`. Elle ordonne, **elle n'exclut jamais**. Un artiste dont ListenBrainz ne connaît aucune écoute n'a pas de ligne plutôt qu'un zéro qu'il n'a pas déclaré : 1 613 516 artistes sur 2 980 293 (54 %) sur le relevé de référence. Les comptes bougent chaque jour : `musilogy snapshot-popularity` interroge ListenBrainz pour tous les artistes de l'extraction (lots de 1 000, une requête par seconde, en-têtes `X-RateLimit-*` respectés), écrit le relevé dans `data/raw/listenbrainz/<date>/` et son empreinte dans `reference/listenbrainz-<date>.SHA256SUMS`. Comme le dump, un relevé ne se reprend pas : `REFERENCE_POPULARITY` épingle celui que `run` lit et vérifie, et `run` s'arrête s'il manque.

- **`89_proximity` — Voisins ListenBrainz.** Pour chaque artiste que le relevé de proximité a interrogé, ses voisins dans l'ordre du service : `rank` est la place dans la réponse, à partir de 1, `score` celui du service. **La proximité vient de la co-écoute** ; le temps lui donne un côté, dans la fonction que lit le site (section « Chargement »). Le service répète parfois un voisin pour un même artiste — 675 fois sur les 111 402 artistes du relevé du 2026-10-04 ; will.i.am aux rangs 58 et 100 chez Chuckie — : **un voisin répété garde sa meilleure occurrence**, le rang le plus petit, qui porte aussi le score le plus haut (le score ne remonte jamais le long des rangs du relevé) ; le rang qu'il laisse libre n'est pas comblé, et les occurrences écartées sont comptées dans `manifest.json` (`proximity_exclusions`). Le service donne aussi certains artistes pour leur propre voisin (84 des 111 402 artistes du relevé ; Usurper au rang 1) : jamais un voisin, l'occurrence est écartée et comptée de même, son rang laissé libre. Un voisin absent de `artists` reste dans la table, et la fonction que lit le site ne le montre pas : 1 056 lignes (0,02 %), 105 artistes distincts, 97 absents du dump du 2026-09-09 et 8 artistes à usage spécial (507 lignes, Various Artists en tête). Seuls les artistes d'au moins 500 auditeurs sont interrogés : `artists.proximity_surveyed` vaut vrai pour chaque artiste dont le relevé porte une ligne, même sans voisin (18 375 sur les 118 016 artistes des deux parties, 15,6 % ; sur la première, 29 % des artistes de 500 à 1 000 auditeurs, 0,6 % au-delà de 20 000), faux pour les autres, NULL quand aucun relevé n'est chargé. Un artiste non relevé n'est pas un artiste sans voisin. **Le relevé se fait en parties** (`REFERENCE_PROXIMITY`, de la plus ancienne à la plus récente) : à une requête par seconde, il ne se reprend jamais en entier ; une partie interroge les artistes d'au moins 500 auditeurs dans la popularité épinglée qu'aucune partie épinglée n'a interrogés, et `run` les lit comme une seule table. Six invariants : un rang hors de 1 à 100, un MBID mal formé ou un score absent, un artiste voisin de lui-même, un artiste interrogé par deux parties, une paire en double, et une ligne qui n'est pas la meilleure occurrence de sa paire dans le relevé.

- **`90_invariants` — Contrôles.** Des vues qui doivent toutes renvoyer zéro ligne ; le nom de la vue *est* le nom de l'invariant. Chacune **recalcule indépendamment** ce qu'elle vérifie : une revue a montré qu'un invariant réutilisant la formule de production restait muet sur 265 violations réelles. Les bornes contractuelles y sont codées en dur, aux deux extrémités, sans relire les variables de session de la production ; changer de dump impose donc une modification délibérée de ce fichier — c'est l'intention.

Deux bornes sont des variables de session posées par `build()` : `dump_year` et `min_year`.

Les corrections manuelles (`src/musilogy/corrections.csv`, colonnes `mbid, field, value, justification, source`) sont appliquées avant la lecture des dates ; chaque ligne cite une source vérifiable, et un garde-fou échoue au-delà de 50 lignes.

- **`82_urls` — Pages web.** Parmi les relations URL d'un artiste de `artists`, celles qu'une page artiste utilise : les plateformes d'écoute par leur domaine (Deezer, Spotify, Apple Music, Bandcamp, SoundCloud), quel que soit le type de relation, et les types `official homepage` et `wikidata` (le site atteint l'article Wikipédia par l'élément Wikidata), avec le type MusicBrainz. Discogs, Wikipédia, les images, VIAF, IMDb, les réseaux sociaux et les autres bases restent dans le dump : aucune page ne les montre. Une relation terminée (`ended`) reste dans la table, marquée ; une même page reliée deux fois sous un même type est une ligne, terminée seulement si toutes le sont. Sur le dump de référence, 1 991 446 pages pour 997 839 artistes, dont 24 671 terminées.

- **`84_discogs` — Styles (Discogs).** Le dump mensuel des sorties Discogs (`REFERENCE_DISCOGS`, CC0, data.discogs.com), épinglé par l'empreinte que Discogs publie à côté et réduit en flux aux champs qu'une règle lit (`extract.py`, 19 492 392 sorties) et lu une seule fois par le build (`discogs_work`). La projection porte un compagnon (`extraction.json`, sorties écrites et champs) : écrite avec d'autres champs que ceux que lit le build, elle est refaite ; lue avec moins de sorties qu'elle n'en a écrit, `run` s'arrête sans rien publier. **Un artiste rejoint Discogs par la page Discogs que MusicBrainz lui relie** (`discogs_links`) : un artiste Discogs relié à deux MBID n'en rejoint aucun, écarté et compté (352 identifiants), un MBID relié à plusieurs artistes Discogs (des alias) les additionne ; 1 266 088 artistes sont reliés. **Un disque est un master Discogs**, ou la sortie elle-même quand elle n'en a pas (le dump écrit `master_id` 0) ; une compilation, une sortie non officielle, une promotion, un sampler ou un mix ne compte pas (4 234 631 sorties) : ils disent où la musique a circulé, pas où l'artiste l'a faite. `styles` compte les disques par style et par décennie de première édition — un disque porte les styles de toutes ses éditions — ; une année hors de `[1850, année du dump]` n'est pas une date (Discogs porte une sortie de 338). **MusicBrainz reste l'autorité sur les dates** : un premier disque Discogs antérieur de plus d'un an à la formation déclarée est compté (`discogs_date_disagreements`, 1 748), jamais réécrit. Quatre invariants : un style en double, sans artiste, une décennie hors de la fenêtre, et un artiste qui n'atteint Discogs que par un identifiant partagé.

## Proximité ListenBrainz (relevé)

`musilogy snapshot-proximity` relève, pour chaque artiste qu'au moins 500 auditeurs écoutent dans le relevé de popularité épinglé (111 402 artistes au 2026-10-04), ses 100 voisins selon ListenBrainz (`labs.api.listenbrainz.org/similar-artists`, algorithme épinglé dans `fetch.SIMILAR_ALGORITHM`) : une ligne par artiste, `{artist_mbid, similar: [{artist_mbid, score}]}`, dans `data/raw/listenbrainz/<date>/artist-similar.jsonl`, empreinte dans `reference/listenbrainz-similar-<date>.SHA256SUMS`. Le service prend un artiste par requête et n'annonce aucune limite : le relevé s'en tient à une requête par seconde au plus. Le débit réel mesuré, pannes du service comprises, est d'environ 0,6 artiste par seconde (2026-10-04) : plusieurs jours pour le relevé entier. Interrompu, il reprend le relevé resté partiel, quel que soit le jour où il a commencé. Les données ListenBrainz sont publiées en CC0 (metabrainz.org/datasets/postgres-dumps) ; le service de similarité, qui en dérive, ne précise pas de licence. `REFERENCE_PROXIMITY` épingle le relevé que `run` lit et vérifie, et `run` s'arrête s'il manque, comme pour les autres relevés : une partie n'est épinglée qu'une fois son empreinte, écrite par la commande à la fin du relevé, versionnée sous `reference/`. Deux parties sont épinglées : 2026-10-04, les groupes et les personnes (111 402 artistes), et 2026-10-06, les artistes des autres types (6 614).

## Co-écoute (export des statistiques ListenBrainz)

ListenBrainz publie chaque mois, dans le dossier de son export complet, un export de statistiques sous CC0 ; son premier fichier, `artists_all_time.jsonl`, donne pour chaque utilisateur ses artistes les plus écoutés de tout temps (jusqu'à 1 000). `run` le télécharge s'il manque — en flux depuis l'archive de 22 Go, dont `tar` n'extrait que ce fichier de 4 Go avant de s'arrêter (`zstd` doit être installé) — et le vérifie contre l'empreinte épinglée sous `reference/listenbrainz-statistics-<export>.SHA256SUMS` ; `REFERENCE_LISTENING` désigne l'export. L'empreinte que ListenBrainz publie couvre l'archive entière, jamais téléchargée : c'est celle du fichier qui fait foi. `colisten.py` en tire `colisten` : la règle, ses seuils et l'exception au SQL qu'elle demande sont dans `docs/conception.md`. Sur l'export `2692-20261001-000003` : 95 872 utilisateurs, 33 393 707 paires utilisateur-artiste, 371 602 artistes d'au moins 3 auditeurs, dont 371 582 ont des voisins (18 473 211 lignes ; 0,08 % des voisins sont absents du dump), en 11 min environ et 2,7 Go de mémoire au plus (2026-10-08).

## Même son

`88_same_sound.sql` tire de `colisten`, `styles` et des genres d'`artists` la table `same_sound` (`docs/vision.md` §2.2) : un voisin de la co-écoute y entre quand il partage la couleur de l'artiste. La couleur d'un artiste est son profil de styles Discogs, la part de ses disques dans chaque style et décennie pondérée par la rareté du style (le logarithme du nombre d'artistes stylés sur le nombre d'artistes qui portent ce style), à partir de 3 disques stylés ; à défaut, son profil de genres MusicBrainz, pondéré de même par les votes. Deux profils se comparent par cosinus, un style de la décennie voisine comptant à moitié, et la similarité est rabattue de n / (n + 10) pour un voisin dont le profil compte n disques datés, les seuls qui peuvent concorder (n / (n + 3) en votes pour les genres) : un profil mince ressemble à tout. Les styles font foi quand les deux artistes en ont et en partagent un, à n'importe quelle décennie ; quand l'un des deux n'a pas de profil Discogs, les genres s'ils en partagent un. Deux profils Discogs sans style commun ne sont pas rattrapés par un genre large : parmi les paires jugées, 1 sur 3 de ces voisins était bon (2026-10-09). Un voisin entre à partir de 0,35 ; il garde son ordre de co-écoute (`colisten_rank`) et reçoit un rang de 1 à n, et sa raison : le style qui pèse le plus dans ce qu'ils partagent, sommé sur les décennies, avec la décennie de l'artiste qui y pèse le plus, ou le genre qui pèse le plus. Les produits se somment en décimal exact : des doubles additionnés par des threads parallèles changeraient d'ordre d'une exécution à l'autre, et la livraison avec eux. Un profil fait de disques sans date n'a pas de couleur.

La règle et ses seuils sont ceux de la mesure du 2026-10-08 (`docs/vision.md` §2.2, règle `agree_0.35`) : la construction redonne à l'identique les listes jugées des 61 artistes de référence. Sur le dump de référence et l'export `2692-20261001-000003` : 2 345 979 lignes pour 192 769 artistes, 52 % de ceux qui ont des voisins de co-écoute (12 proches en moyenne, 8 en médiane), dont 301 508 par les genres ; 14 min de construction environ et 2,3 Go de mémoire au plus, débordement compris (2026-10-09). Les 3 075 voisins qu'un profil sans date aurait fait passer (0 / 0) sont écartés.

## Statut officiel MusicBrainz (relevé)

`musilogy snapshot-official` demande à l'API MusicBrainz, pour chaque artiste qu'au moins 500 auditeurs écoutent dans le relevé de popularité épinglé et qui a au moins un album ou un EP dans l'extraction, les albums et EP que montre sa page sur musicbrainz.org : `/ws/2/release-group?artist=…&type=album|ep&release-group-status=website-default`, qui écarte les release groups dont toutes les sorties sont des promotions, des bootlegs ou des pseudo-sorties (musicbrainz.org/doc/MusicBrainz_API, « Browse »). Une ligne par artiste, `{artist_mbid, release_groups}`, dans `data/raw/musicbrainz/<date>/official-release-groups.jsonl`, empreinte dans `reference/musicbrainz-official-<date>.SHA256SUMS`. Chaque release group de la réponse doit créditer l'artiste demandé ; `release_groups` vaut `null` quand MusicBrainz ne connaît plus l'artiste (404) ou répond pour celui avec lequel il a été fusionné depuis le dump : l'artiste reste non relevé. Une requête par seconde, la limite du service (musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), une page de 100 release groups par requête : une trentaine d'heures pour la première partie. Interrompu, il reprend comme la proximité. Sous le seuil, les bootlegs sont rares : les 31 artistes joués sous 500 auditeurs montrent 112 disques, dont un EP promotionnel (2026-10-05). Les données de base MusicBrainz sont sous CC0. Deux parties sont épinglées (`REFERENCE_OFFICIAL`) : 2026-10-05, et 2026-10-06, les 9 062 artistes qui n'ont que des EP ou sont d'un autre type ; `22_releases` s'en sert (règle officielle, plus haut).

## Discographie Wikidata (relevé)

`musilogy snapshot-discography` demande au même service les release groups (MBID, P436) que Wikidata classe album studio, EP ou bande originale, par « nature de l'élément » (P31) ou « forme de l'œuvre » (P7937) : une requête par forme, car les trois réunies prenaient 26,6 s, près de la limite de 60 s, et séparées 5,1, 0,9 et 0,7 s (2026-10-05). Le relevé, trié et dédoublonné, va dans `data/raw/wikidata/<date>/discography.jsonl` (`{rg_mbid, form}`), son empreinte dans `reference/wikidata-discography-<date>.SHA256SUMS`, et `REFERENCE_DISCOGRAPHY` épingle celui que `run` lit. Les identifiants y sont écrits tels que Wikidata les porte : distinguer un MBID d'une faute de saisie (« 12-inch single ») est une règle, comptée dans `discography_exclusions`.

Relevé du 2026-10-05 : 72 397 lignes, 72 170 release groups.

## Ce que reçoit le site

`data/out/<dump>/` contient les onze tables en Parquet et le manifeste.

`manifest.json` porte le dump et l'empreinte de ses archives (`dump`, `archive_sha256`), la date et l'empreinte de chaque relevé (`popularity`, `discography`, et les parties de `proximity` et `official`), le dump Discogs lu et le compagnon de sa projection — sorties écrites, champs (`discogs`) —, les comptes (`counts`), **les empreintes des fichiers Parquet livrés** (`output_sha256`), les **paramètres** du run (`parameters` : `dump_year`, `min_year`, les seuils de `colisten` et de `same_sound`), les **entrées** (`inputs` : `rows_loaded` par table brute, le sidecar d'extraction et son accord avec les lignes lues), les compteurs (`r2_anomalies`, `neutralised_inferences`, `link_exclusions`, `discography_exclusions`, `proximity_exclusions`, `release_status`, `discogs_coverage`, `discogs_date_disagreements`), le commit (`git_sha`) et l'empreinte des corrections (`corrections_sha256`).

Ces empreintes de sortie sont opposables parce que la livraison est reproductible : à dump et code identiques, deux exécutions écrivent les mêmes octets. L'ordre des lignes est fixé par une clé totale sur chaque table. Un consommateur distingue donc une livraison inchangée d'une nouvelle par sa seule empreinte, sans retélécharger.

## Chargement dans le site

`uv run musilogy load` vérifie les Parquet publiés contre leur manifeste, les copie dans un schéma `musilogy_next` de la base du site, compare les comptes copiés à ceux du manifeste, puis bascule `musilogy_next` en `musilogy` en une transaction : le site ne lit jamais un chargement partiel, et un chargement raté laisse le précédent en place. La connexion vient de l'environnement libpq (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`, `PGSSLROOTCERT`). Le SQL côté Postgres vit dans `src/musilogy/pg/`, numéroté comme `sql/` : `10_tables` avant la copie, les suivants sur le schéma de transit, `90_` une fois la bascule faite.

Sept tables sont chargées — `artists`, `links`, `popularity`, `releases`, `urls`, `proximity`, `same_sound` — plus `manifest` (dump, relevés, commit) ; `albums`, `genres`, `colisten` et `styles` restent en Parquet tant qu'aucune fonction ne les lit. Les listes de genres, que Postgres ne sait pas typer en structures anonymes, deviennent du `jsonb`. `20_search.sql` en tire `search`, la projection étroite de la recherche (`name_key` en collation C, nombre d'auditeurs, MBID), rangée par `name_key`. Mesuré sur un Postgres 16 jetable, avec le dump de référence : 408 s de chargement, 1 259 Mo en tout, dont 192 Mo et 68 Mo d'index pour la projection de recherche. Avec `releases` et `urls` (2026-10-05, sur victorserv) : 214 s, 2 667 Mo, dont 549 Mo pour `releases` et 274 Mo pour `urls`. Avec `proximity` (2026-10-06, Postgres jetable sur victorserv) : 565 s, 2 941 Mo, dont 877 Mo pour `proximity`. `same_sound` pèse 488 Mo, index compris (2026-10-09, Postgres jetable sur victorserv).

**Ce que lit le site : des fonctions, pas des tables.** Il appelle les fonctions de `pg/90_*.sql`, testées ici contre Postgres, et dépend de leurs signatures, pas de la disposition des tables. Le contrat complet est `docs/conception.md` §4.

- `artist_card(mbid)` donne la fiche ; sa colonne `proximity_surveyed` dit si l'artiste a été interrogé dans le relevé de proximité chargé, NULL si le chargement n'en porte aucun : un artiste non relevé n'est pas un artiste sans voisin.
- Les groupes et projets, en trois rubriques plutôt que les types MusicBrainz (docs/vision.md §2.4). `artist_bands(mbid)` donne les membres d'un groupe (`member`) ou les groupes d'une personne (`group`), membre, fondateur et collaboration confondus, une ligne par artiste de la première année déclarée à la dernière. `artist_member_projects(mbid)` donne, à deux pas d'un groupe, les autres groupes de ses membres et les noms sous lesquels ils jouent, seulement ceux qui ont un disque (`artist_releases`), sans l'artiste, ses membres, ses anciens ou nouveaux noms ni les projets auxquels il prend part lui-même (Stereolab dans Uilab, le seul cas chez les 336 artistes joués), avec les membres qui y mènent (`via`), du plus ancien au plus récent. `artist_other_names(mbid)` donne les pseudonymes (`alias`), la personne derrière un pseudonyme (`person`) et les changements de nom (`former`, `later`). Mesuré le 2026-10-05 sur les 336 artistes joués : 161 ont des membres, 129 au moins un projet de membre qui a un disque (médiane 5, 90e centile 18, au plus 65 pour Underground Resistance), 53 d'autres noms ; de Stereolab à McCarthy (Lætitia Sadier, Tim Gane), Monade, Cavern of Anti-Matter, de The Notwist à Lali Puna et 13 & God. Les projets des 336 se calculent en 2 s au total sur le Postgres jetable, 0,3 s pour Underground Resistance.
- `artist_same_sound(mbid)` donne les 8 premiers proches « Même son », la profondeur mesurée, dans leur rang, chacun avec sa raison (`source`, `term`, `decade`) et son côté dans le temps, lu comme pour `artist_neighbours` (`musilogy.side`). Mesuré le 2026-10-09 sur le Postgres jetable : 0,07 ms d'exécution pour Daft Punk, index chaud.
- `artist_neighbours(mbid)` donne les voisins ListenBrainz dans l'ordre du service, chacun avec son côté dans le temps : `before` s'il a commencé (`y0`) plus de 3 ans avant l'artiste, `after` plus de 3 ans après, `during` sinon, NULL si l'un des deux n'a pas d'année. Un voisin absent du dump n'apparaît pas, faute de nom, et les rangs des autres ne sont pas renumérotés. Mesuré le 2026-10-06 sur un Postgres jetable chargé du dump de référence et du relevé entier, pour Joy Division (100 voisins) : environ 1 ms d'exécution, cache chaud.
- `artist_releases(mbid)` donne l'œuvre que la page montre (docs/vision.md §2.4) : albums studio, bandes originales et remix, EP à partir du premier album (tous les EP d'un artiste sans album), rien après la fin déclarée d'un groupe sauf ce que Wikidata classe album studio ou EP, et un disque sans année seulement s'il est ainsi classé, en dernier ; du plus récent au plus ancien. Pour les Beatles, de *Let It Be* à *Please Please Me* (1970-1963). `artist_urls(mbid)` ses pages encore à lui (relation non terminée), par type puis URL. Moins d'une milliseconde, cache chaud, sur les Rolling Stones.
- `search_artists(requête, taille)` cherche par préfixe du nom normalisé, les plus écoutés d'abord (`user_count`), ceux que ListenBrainz ne connaît pas en dernier, puis par nom et MBID. La requête est normalisée comme `name_key` (`strip_accents(lower(name))` dans DuckDB) par `musilogy.name_key(text)` : minuscules, décomposition canonique, retrait des marques combinantes — la catégorie Unicode M entière, 2 450 points, mesurée en interrogeant DuckDB sur chaque point de code —, recomposition. Sur le dump de référence, elle redonne le `name_key` de tous les noms sauf 6, des lettres cerclées (Ⓐ) que la libc du Postgres du site ne met pas en minuscule ; le seul bloc des diacritiques latins en manquait 12 987. Une requête vide ne trouve personne. Temps mesurés sur le Postgres jetable, cache chaud, médiane de 7 appels : « a » (157 112 noms) 78 ms, « the » 46 ms, « bjork », « radiohead » ou « sigur ros » moins de 4 ms ; le premier appel après le chargement, cache froid, a pris 1,8 s pour « a ». Lue directement dans `artists`, « a » prenait environ 1 s cache chaud.

## Chiffres de référence

Le **contrat exécutable** est `tests/test_baseline.py` : il confronte le pipeline entier au dump de référence et compare exactement les comptes et la répartition des provenances. Les chiffres cités ici sont descriptifs ; en cas de divergence, c'est le test qui fait foi.

Deux situations, deux conduites, à ne pas confondre. **Sur le dump de référence, un écart signale une règle mal implémentée** — jamais un prétexte pour ajuster la ligne de base. **Sur un nouveau dump, tous les chiffres bougent légitimement**, et la ligne de base se régénère : les comptes des tables, les trois répartitions de provenance, les compteurs du manifeste (dix d'anomalies, sept de neutralisation, les exclusions de liens, de discographie et de proximité, le statut officiel, la couverture Discogs) et la répartition des liens par type. Il faut alors aussi mettre à jour `REFERENCE_DUMP`, la valeur par défaut de `dump_year`, ajouter le `reference/<dump>.SHA256SUMS` correspondant, prendre un relevé ListenBrainz sur la nouvelle extraction et l'épingler dans `REFERENCE_POPULARITY` (l'invariant `popularity_unrequested` refuse un relevé pris sur une autre), puis un relevé de proximité sur ce relevé de popularité, épinglé dans `REFERENCE_PROXIMITY`, et modifier à la main les bornes codées en dur dans les vues de `90_invariants.sql` — cette dernière opération est délibérément manuelle, c'est ce qui empêche une mauvaise variable de satisfaire à la fois la règle et son contrôle. Les extractions vivant dans `data/work/<dump>/`, changer `REFERENCE_DUMP` suffit à repartir d'une extraction neuve, sans rien vider à la main.

Provenance des bords, sur le dump de référence :

| | `declared` | dérivé des albums | inconnu |
|---|---|---|---|
| début (`y0_source`) | 235 246 | 420 208 | 2 324 839 |
| fin (`y_end_source`) | 148 933 | 512 131 | 2 319 229 |
| genres (`genre_source`) | 211 764 | 176 210 | 2 592 319 |

Pour une personne, le début n'est jamais `declared` (sa déclaration est une naissance) et une fin `declared` est un décès.

## Limites assumées

- **Aucune hiérarchie de genres n'est publiée.** L'arbre Wikidata a été retiré après mesure : 323 genres sur les 1 348 du vocabulaire d'alors n'y avaient aucun parent, `free jazz` et `zeuhl` étaient rangés sous `classical`, et surtout `black metal`, `death metal`, `thrash metal` et `doom metal` **ne figuraient pas** parmi les descendants de `metal` — les 3ᵉ, 5ᵉ, 15ᵉ et 19ᵉ genres du vocabulaire. Un arbre qui marche pour le rock et casse sur le metal est pire qu'une absence d'arbre : il a l'air de fonctionner. La requête SPARQL reste dans l'historique git.

- **Une fin dérivée d'un album n'est pas une fin déclarée.** Elle est marquée `y_end_source = 'last_album'`. Parmi les groupes de type `Group` concernés ayant au moins deux albums, **3,38 % ont un dernier album isolé de plus de 15 ans** du précédent (1,04 % au-delà de 25) : des rééditions de fonds historiques qui étirent la ligne de vie. Les écarter demanderait un seuil arbitraire ; l'étiquette de provenance laisse le site trancher.

- **Le genre est un filtre de notoriété communautaire, et il est daté.** Part de **groupes** datés sans aucun genre, par époque de formation, même en prenant ceux des albums : 34,4 % pour 1967-1979, 43,1 % pour 1980-1999, 53,8 % pour 2000-2014, **75,5 % depuis 2023**. Les artistes récents sont moins tagués.

- **81,4 % des artistes n'ont aucun album** qui passe les règles, et 2 324 839 n'ont aucun début exploitable. La base est complète par choix : le site ordonne, musilogy ne jette pas.

## Installation, tests, exécution

Python 3.12 géré par `uv`.

```bash
uv sync
```

`zstd` doit être installé : `run` en a besoin pour lire l'export des statistiques ListenBrainz.

Trois niveaux de test :

- `uv run pytest` — suite rapide, quelques secondes, sans dépendance au dump. Tourne sur les témoins réels de `cli.WITNESSES`, versionnés dans `tests/fixtures/` (extraits authentiques du dump de référence, jamais de données inventées) et sur quelques enregistrements synthétiques pour les formes qu'aucun témoin ne porte.
- `tests/test_load.py`, `tests/test_artist.py`, `tests/test_search.py`, `tests/test_official.py` — le chargement et les fonctions SQL du site, contre un vrai Postgres jetable désigné par `MUSILOGY_TEST_PG` (chaîne de connexion libpq ; les tests y suppriment et recréent les schémas `musilogy`). Sans elle, ces tests sont sautés, sauf en CI, qui fournit un service Postgres 16 et échoue si la variable manque.
- `uv run pytest -m slow` — ligne de base : confronte le pipeline entier aux ~3 millions d'enregistrements du dump de référence. Exige les extractions dans `data/work/<dump>/` (non versionnées, ~10 min à produire) ; sinon le test est ignoré.

La suite passe depuis n'importe quel répertoire : tous les chemins sont ancrés sur le paquet (`musilogy.paths`), jamais sur le répertoire courant.

```bash
uv run musilogy run                 # fetch → extract → transform → validate → publish
uv run musilogy snapshot-popularity # relevé ListenBrainz daté, à épingler (~1 h)
uv run musilogy snapshot-proximity  # voisins ListenBrainz des artistes d'au moins 500 auditeurs (plusieurs jours, reprenable)
uv run musilogy snapshot-official   # albums et EP que MusicBrainz montre pour les artistes d'au moins 500 auditeurs (~30 h, reprenable)
uv run musilogy snapshot-discography # relevé Wikidata daté des disques classés album studio, EP ou BO, à épingler
uv run musilogy make-fixtures       # régénère les témoins depuis les extractions et les relevés épinglés
uv run musilogy load                # charge data/out/ dans la base du site (environnement libpq)
```

Aucune sortie du pipeline n'est versionnée ; seules les empreintes et les fixtures le sont.

Qualité : `uv run ruff check`, `uv run ruff format --check`, `uv run mypy`. La CI (`.github/workflows/musilogy.yml`, à la racine d'AubeSonore) passe ces trois contrôles plus la suite rapide ; la suite lente exige le dump et reste manuelle.

## Structure du dépôt

```
src/musilogy/
  fetch.py               télécharge et vérifie les archives MusicBrainz et Discogs (SHA-256), relève ListenBrainz, MusicBrainz et Wikidata
  extract.py             projette les enregistrements bruts en flux, sans logique métier
  build.py               enchaîne les fichiers SQL, applique les corrections, vérifie les invariants
  publish.py             écrit les Parquet et manifest.json
  cli.py                 les commandes
  load.py                charge les Parquet publiés dans la base du site
  paths.py               chemins ancrés sur le paquet
  corrections.csv        corrections manuelles, versionné
  reference/             empreintes des archives et des relevés épinglés
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

Les comptes d'écoute de ListenBrainz et les données de Wikidata sont sous **CC0** et n'ajoutent aucune contrainte. `tests/fixtures/discography.jsonl` est un extrait du relevé Wikidata du 2026-10-05, pour les release groups des témoins.
 `tests/fixtures/proximity.jsonl` est le début du relevé de proximité du 2026-10-04 : ses 120 premières lignes, qui portent des artistes à 100 voisins, d'autres sans aucun et un voisin répété (ligne 119).

Les fixtures versionnées dans `tests/fixtures/` sont des extraits réels du dump MusicBrainz de référence, soumis à la même licence (voir `tests/fixtures/ATTRIBUTION.md`).
