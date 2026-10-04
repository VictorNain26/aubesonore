# musilogy

Couche 0 : transforme deux dumps JSON MusicBrainz et un relevé ListenBrainz en huit tables reproductibles et testées, publiées en Parquet. La couche 1 est la frise d'AubeSonore (`site/`) : elle lit ces tables après leur import dans la base du site, jamais musilogy à l'exécution — conception dans `docs/superpowers/specs/2026-10-02-frieze-lineage-design.md`.

## Principe directeur

**La sortie n'affirme jamais plus que ce que la source porte.** Une absence reste une absence : elle n'est ni imputée en silence, ni prolongée, ni arbitrée. Quand une valeur est dérivée, elle est publiée avec la colonne qui dit d'où elle vient, pour que le consommateur distingue une donnée déclarée d'une donnée inférée. Quand une mesure est impossible, la colonne vaut NULL — jamais zéro, qui affirmerait une mesure qui n'a pas eu lieu.

**Population et projection sont deux choses distinctes.** `artists`, `albums`, `genres`, `links`, `lineage` et `popularity` portent la population complète ; `density` est une projection délibérément plus étroite, destinée à la frise. Un filtre d'affichage vit dans la projection, jamais dans la population — sinon la donnée écartée devient irrécupérable en aval.

C'est le changement le plus lourd par rapport à la première version de ce dépôt, qui appliquait le filtre de la frise à la population et n'en publiait que 63 487 groupes sur 682 447, soit 30 % de la masse d'albums réelle.

## Les huit tables

Mesurées sur le dump de référence `20260909-001002` :

| Table | Contenu | Lignes |
|---|---|---|
| `artists` | un artiste — groupe, orchestre, chœur ou personne : ses preuves de dates, sa ligne de vie dérivée, ses genres votés | 2 281 691 |
| `albums` | un point : une sortie d'album créditée à un seul artiste | 1 290 584 |
| `genres` | le vocabulaire porté par `artists`, avec sa fiabilité mesurée | 1 729 |
| `links` | un lien typé entre deux artistes — appartenance, pseudonyme, changement de nom, sous-groupe, professeur, famille… —, avec ses années | 771 147 |
| `lineage` | un modèle d'un artiste — professeur, artiste honoré, homonyme d'origine —, avec la source qui l'affirme | 32 667 |
| `popularity` | les écoutes ListenBrainz d'un artiste, relevées à une date | 989 488 |
| `density` | groupes présents par genre et par année | 58 767 cellules |
| `activity` | groupes distincts présents par année, même population que `density` : le dénominateur qui fait d'une densité une part de l'année | 172 années |

Colonnes réelles (voir `src/musilogy/sql/`) :

- **`artists`** : `mbid`, `name`, `disambiguation`, `name_key`, `type`, `y0_declared`, `y_end_declared`, `y_birth`, `ended`, `country`, `begin_area`, `begin_area_mbid`, `genres_declared` et `genres_from_albums` (listes de `{mbid, name, votes}`, triées), `genres`, `genre_source`, `y_first_album`, `y_last_album`, `y0`, `y0_source`, `y_end`, `y_end_source`, `y_presence_end`.
- **`albums`** : `artist_mbid`, `rg_mbid`, `title`, `y`, `soundtrack`.
- **`genres`** : `genre_mbid`, `name`, `n_artists`, `density_eligible`, `n_candidate_credits`, `multi_artist_drop_pct`.
- **`links`** : `src_mbid`, `dst_mbid`, `type`, `y_begin`, `y_end`.
- **`lineage`** : `artist_mbid`, `model_mbid`, `source`.
- **`popularity`** : `mbid`, `listen_count`, `user_count`, `snapshot`.
- **`density`** : `genre_mbid`, `year`, `present`.

Une table intermédiaire, `presence(mbid, y0, y_presence_end)`, est calculée mais non publiée.

## Les règles

Chaque règle vit dans son fichier SQL numéroté (`src/musilogy/sql/`) ; **la numérotation est un ordre topologique de dépendance**, pas un rang dans une liste, et avance par pas de dix pour qu'une règle s'insère sans renumérotation — `55_` en est un exemple vivant.

- **`10_bands` — Population et lecture des dates.** Tout artiste extrait — groupe, orchestre, chœur ou personne — entre dans `artists` : aucun filtre de date ou de genre. Les personnages, les « autres » et les artistes sans type ne sont pas extraits : ces derniers, 674 240 sur le dump de référence, ne portent presque aucun lien (2,6 %), contre un tiers des personnes. **Le `begin` d'une personne est une naissance, pas un début d'activité** : il est publié dans `y_birth` et ne devient jamais `y0_declared` ; une naissance illisible (8 962) ou future (2) est perdue et comptée comme toute autre date. Son `end`, un décès, clôt bien l'activité et se lit comme toute autre fin. La lecture des dates est déterministe : l'année tient sur les quatre premiers caractères, sinon elle est **absente**, pas devinée. Une date hors de `[1850, année du dump]` — aux deux bords — et une fin antérieure au début sont neutralisées, et **chaque neutralisation alimente un compteur** dans `manifest.json`. Tous les genres sont conservés, triés explicitement par votes décroissants puis par nom.

- **`20_albums` — Albums.** Un release-group compte comme album s'il est de type primaire `Album` (filtré dès l'extraction), crédité à un **seul artiste distinct** présent dans `artists`, daté dans `[1850, année du dump]`, et dont les types secondaires sont vides ou inclus dans `{Soundtrack, Demo}`.

  Les démos sont acceptées parce qu'elles sont une preuve *contemporaine* d'activité précoce : 61,7 % des artistes ayant démo et album studio ont sorti la démo d'abord, 3 ans plus tôt en médiane parmi eux. Les albums live sont exclus pour la raison inverse : **MusicBrainz les date de leur publication, pas du concert** — 914 artistes ont un live daté plus de 20 ans après leur dernier studio, avec des titres qui portent eux-mêmes la vraie date (« Live in Paris (1966) », publié en 2024). Compilations, DJ-mix et remix sont exclus au même titre.

- **`25_band_genres` — Genres d'un groupe.** La règle des dates, appliquée aux genres : **les genres déclarés l'emportent, ceux des albums prennent le relais.** Un groupe qui ne déclare aucun genre reçoit la somme des votes des genres de ses propres albums, ceux que `20_albums` a retenus. Un groupe qui en déclare ne mélange jamais ceux de ses albums : ce sont des votes sur des objets différents, et une union laisserait un album l'emporter sur le groupe. `genre_source` nomme la branche (`declared`, `albums`, ou NULL) ; les deux listes brutes restent publiées à côté de `genres`. Sur le dump de référence, 43,5 % des artistes porteurs d'un genre le tiennent de leurs albums.

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

- **`40_presence` — Présence.** Seuls les artistes dont `y0` est connu. `y_presence_end` borne `y_end` à l'année du dump.

- **`50_genres` — Vocabulaire.** Les genres effectivement portés par `artists.genres`, y compris ceux qu'aucun groupe ne déclare et que seuls des albums portent.

- **`55_genre_reliability` — Fiabilité mesurée.** Pour chaque genre, combien de lignes de crédit ses groupes auraient pu porter (`n_candidate_credits`) — une sortie créditée à deux artistes qui portent tous deux le genre compte deux fois, ce qui distingue les 27 199 crédits mesurés pour `classical` de ses 25 465 release-groups distincts — et quelle part la règle du crédit unique en écarte (`multi_artist_drop_pct`). Un genre sans aucun candidat garde NULL, pas 0. La mesure lit `genres_declared`, pas `genres` : un groupe ne reçoit les genres de ses albums que par des sorties créditées à lui seul, donc tous leurs candidats sont mono-artistes et le taux baisserait par construction — `modern classical` passerait de 78,8 % à 38,7 % et sortirait de l'exclusion. Les personnes restent hors de la mesure : elle qualifie `density`, qui ne compte que des groupes, et les co-crédits d'une personne (compositeur et interprète, leader et accompagnateurs) ne disent rien de ce que la règle coûte à un groupe ; admises, elles feraient sortir 28 genres de plus, dont `free jazz` et `soukous`.

- **`60_density` — Densité.** Délibérément plus étroite que la population : type `Group`, `y0` connu, au moins un genre, **et un genre `density_eligible`** — la règle est matérialisée dans `55_genre_reliability`, ce fichier ne fait que l'appliquer. Un groupe compte dans chacun de ses genres ; les totaux par genre ne s'additionnent pas.

- **`80_links` — Liens.** Toutes les relations d'artiste à artiste, **typées** : `type` garde le nom MusicBrainz (`member of band`, `is person`, `artist rename`, `subgroup`, `teacher`, `parent`…), pour que le consommateur sache ce qu'un lien affirme sans se fier à une catégorie de la couche 0. Le dump porte chaque relation sur ses deux artistes, orientée par `direction` ; elle est lue source → cible des deux côtés, puis dédoublonnée, avec ses années lues par la même macro stricte que partout ailleurs. Les deux extrémités doivent être des artistes de `artists` : un lien vers un personnage ou un artiste sans type n'aurait nulle part où arriver, et ces 38 442 liens écartés sont comptés dans `manifest.json` (`link_exclusions`). **Ce n'est pas de l'influence** : MusicBrainz n'en porte aucune ; un lien est un fait vérifiable, qui a joué où, qui a enseigné à qui.

- **`85_lineage` — Filiation.** `model_mbid` est un modèle d'`artist_mbid`, au sens exact de `source`, lue dans un sens pour les inspirations, dans l'autre pour la descendance. Trois types de `links` : `teacher` (`mb_teacher`, le professeur est la source du lien), `tribute` (`mb_tribute`) et `named after artist` (`mb_named_after`), dont la cible est le modèle. Le sens a été vérifié par l'âge : le professeur est le plus âgé dans 21 918 cas contre 235. Une ligne par paire et par source : les années du lien n'en font pas partie, et une paire affirmée par deux sources reste deux lignes. Les colonnes `ref_status` et `evidence` de la spécification arriveront avec Wikidata, la première source qui les remplit.

- **`87_popularity` — Popularité.** Le nombre d'écoutes (`listen_count`) et d'auditeurs (`user_count`) que ListenBrainz compte pour chaque artiste (`POST /1/popularity/artist`), à la date `snapshot`. C'est l'importance a priori de la frise (spec du 2026-10-02) : elle ordonne l'apparition et l'étiquetage, **elle n'exclut jamais**. Un artiste dont ListenBrainz ne connaît aucune écoute n'a pas de ligne plutôt qu'un zéro qu'il n'a pas déclaré : 1 292 203 artistes sur 2 281 691 (57 %) sur le relevé de référence. Les comptes bougent chaque jour : `musilogy snapshot-popularity` interroge ListenBrainz pour tous les artistes de l'extraction (lots de 1 000, une requête par seconde, en-têtes `X-RateLimit-*` respectés), écrit le relevé dans `data/raw/listenbrainz/<date>/` et son empreinte dans `reference/listenbrainz-<date>.SHA256SUMS`. Comme le dump, un relevé ne se reprend pas : `REFERENCE_POPULARITY` épingle celui que `run` lit et vérifie, et `run` s'arrête s'il manque.

- **`90_invariants` — Contrôles.** Des vues qui doivent toutes renvoyer zéro ligne ; le nom de la vue *est* le nom de l'invariant. Chacune **recalcule indépendamment** ce qu'elle vérifie : une revue a montré qu'un invariant réutilisant la formule de production restait muet sur 265 violations réelles. Les bornes contractuelles y sont codées en dur, aux deux extrémités, sans relire les variables de session de la production ; changer de dump impose donc une modification délibérée de ce fichier — c'est l'intention.

Quatre bornes sont des variables de session posées par `build()` : `dump_year`, `min_year`, `multi_artist_drop_limit` et `min_candidate_credits`.

Les corrections manuelles (`src/musilogy/corrections.csv`, colonnes `mbid, field, value, justification, source`) sont appliquées avant la lecture des dates ; chaque ligne cite une source vérifiable, et un garde-fou échoue au-delà de 50 lignes.

## Pourquoi le répertoire savant sort de la frise

La règle du crédit unique ampute les genres très inégalement, parce qu'un disque classique crédite **compositeur et interprète** : 94,3 % des albums de `classical` sont perdus, 86,3 % de `orchestral`, contre 0,6 % pour `alternative metal`. La densité du classique ne veut donc rien dire.

Coder une liste de genres « classiques » serait un jugement arbitraire à maintenir. L'arbre des genres de Wikidata ne peut pas trancher non plus (voir plus bas), et MusicBrainz encore moins : **il ne publie aucun dump de genres**, et ses genres font partie du système de tags voté par les utilisateurs — une folksonomie plate, sans hiérarchie ni catégorie parente, par conception.

La règle est donc mesurée, pas nommée : `density` écarte les genres dont **la moitié au moins des albums candidats sont perdus, sur un échantillon d'au moins 200**. Le minimum d'échantillon porte du sens : au seuil seul, 35 genres sortiraient, dont `soukous`, `congolese rumba`, `lovers rock`, `punta` et `huayno` — de la musique populaire dont le taux élevé n'est que du bruit d'échantillon.

Résultat, hors personnes : **13 genres écartés, 4 311 paires groupe-genre sur 511 490.** Sur les 192 809 groupes porteurs d'un genre, 189 993 sont intacts, 1 793 gardent leur place grâce à un autre genre, et **1 023 perdent tout genre publiable** — dont 715 `classical` et 343 `string quartet`. 136 de ces 1 023 n'avaient de toute façon aucun `y0` et n'étaient pas plaçables sur la frise : la perte réelle pour `density` est de **887**. Aucun artiste et aucun album n'est supprimé : `classical` reste dans `genres` avec ses 12 240 artistes dans `artists`, dont 9 581 personnes, et leurs albums dans `albums`.

Le coût mesuré de la règle est un faux positif, `mincecore` (73,1 % sur 216 candidats), un micro-genre de grindcore : sur ses 20 groupes, trois sortent de la frise. Aucune exception n'est codée pour lui — une liste d'exceptions serait l'arbitrage qu'on évite.

## Ce que reçoit la couche 1

`data/out/<dump>/` contient les huit tables en Parquet et le manifeste.

`density` est publié plutôt que laissé à recalculer, et `density_eligible` voyage avec le vocabulaire comme une colonne à part entière — la règle elle-même, pas seulement les deux mesures qui la motivent, elles aussi publiées à côté pour qui veut l'auditer plutôt que la croire sur parole. Un consommateur n'a donc aucun seuil à coder en dur : sans cette colonne, reconstruire la densité depuis `artists` et `genres` donne 59 778 cellules au lieu de 58 767 — les 1 011 cellules des treize genres que la couche 0 refuse délibérément de publier. Réimplémenter une règle, c'est là qu'elle se perd.

Chaque ligne porte son `mbid` — la clé de jointure vers `albums`, `links` et MusicBrainz — ses `genres`, et les deux bords avec leurs preuves brutes des deux côtés.

**Attention à `y_presence_end` quand la fin est inconnue.** La colonne vaut alors `y0` : le groupe se réduit à une barre d'un an. Cela concerne **53 761 groupes sur les 175 403 de type `Group` datés et porteurs d'un genre, soit 30,6 %**, dont 9 850 qui ne sont pas terminés et n'ont aucune preuve de fin. Sur ces 175 403, **174 516 alimentent effectivement une cellule** de `density` ; les 887 autres ne portent que des genres exclus. Un groupe formé en 2026 est donc un point, pas une barre ouverte. Pour rendre cela honnêtement, la couche 1 doit lire `ended` et `y_end_source` plutôt que `y_presence_end` seul : c'est le rendu faux le plus probable d'une première intégration.

`manifest.json` porte les empreintes des archives, la date et l'empreinte du relevé ListenBrainz (`popularity`), **les empreintes des huit fichiers Parquet livrés** (`output_sha256`), les comptes, les **paramètres** du run (`dump_year`, `min_year`, `multi_artist_drop_limit`, `min_candidate_credits`), les **entrées** (`rows_loaded` par table brute, le sidecar d'extraction), les anomalies de lecture de dates, les sept compteurs de neutralisation, les exclusions de densité et de liens, le commit et l'empreinte des corrections.

Ces empreintes de sortie sont opposables parce que la livraison est reproductible : à dump et code identiques, deux exécutions écrivent les mêmes octets. L'ordre des lignes est fixé par une clé totale sur chaque table. Un consommateur distingue donc une livraison inchangée d'une nouvelle par sa seule empreinte, sans retélécharger.

## Chargement dans le site

`uv run musilogy load` vérifie les Parquet publiés contre leur manifeste, les copie dans un schéma `musilogy_next` de la base du site, compare les comptes copiés à ceux du manifeste, puis bascule `musilogy_next` en `musilogy` en une transaction : le site ne lit jamais un chargement partiel, et un chargement raté laisse le précédent en place. La connexion vient de l'environnement libpq (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`, `PGSSLROOTCERT`). Le SQL côté Postgres vit dans `src/musilogy/pg/`, numéroté comme `sql/` : `10_tables` avant la copie, les suivants sur le schéma de transit, `90_` une fois la bascule faite.

Six tables sont chargées — `artists`, `genres`, `density`, `links`, `lineage`, `popularity` — plus `manifest` (dump, relevé, commit) ; `albums` reste en Parquet tant qu'aucun écran ne le lit. Les listes de genres, que Postgres ne sait pas typer en structures anonymes, deviennent du `jsonb`, avec leurs `mbid` à côté dans `genre_mbids`. Mesuré sur le dump de référence : environ 3 min, 1,1 Go.

**Ce que lit le site : des fonctions, pas des tables.** Le site ne lit jamais les tables directement : il appelle les fonctions de `pg/90_*.sql`, testées ici contre Postgres. Il dépend de leurs signatures, pas de la disposition des tables. `frieze_genres()`, `frieze_density()` et `frieze_activity()` donnent la vue d'ensemble, limitée aux genres que `density` garde ; `activity` en est le dénominateur, pour lire chaque genre comme une part des groupes de l'année plutôt qu'en nombres absolus, qui ne montreraient que la croissance de MusicBrainz. `frieze_window(genre, de, à, taille, décalage)` donne une page des artistes présents dans un genre sur une période, les plus écoutés d'abord, ceux que ListenBrainz ne connaît pas en dernier, avec le total : personne n'est écarté, la page dit seulement quoi dessiner d'abord. Un genre exclu de la vue d'ensemble reste interrogeable ici. `artist_card(mbid)`, `artist_links(mbid)` (chaque lien lu depuis l'artiste, `forward` s'il en est la source MusicBrainz) et `artist_lineage(mbid)` (inspirations et descendance, chacune avec sa source) donnent la fiche.

**Contemporains, à la demande.** Une fonction, pas une table : `musilogy.contemporaries(mbid, page_size, page_offset)` renvoie une page des artistes dont les années de présence (`y0` à `y_presence_end`) recouvrent celles de l'artiste, qui partagent sa scène et au moins un genre, avec le total de la liste. La scène est le même `begin_area_mbid` — l'identité du lieu, pas son nom, que London partage avec l'Ontario —, sinon le même pays quand l'artiste n'a pas de lieu de début ; `scene` dit lequel a servi. Aucun seuil : la liste est ordonnée par similarité de Jaccard des genres, puis par `mbid`, et chaque ligne porte les genres partagés. Publiée complète, elle ferait environ 188 millions de lignes (extrapolé d'un échantillon de 2 000 artistes, médiane 21, p99 9 667). Le classement lit `scenes`, la projection étroite des 285 284 artistes qui ont une année et un genre : 5 à 30 ms pour un artiste courant, 180 ms pour le pire cas mesuré, un artiste américain sans lieu de début et ses 22 152 contemporains. Sur 300 artistes tirés par `hash(mbid)`, ses 167 104 lignes étaient identiques à celles de l'ancienne macro DuckDB.

## Proximité (relevé, refonte en cours)

`musilogy snapshot-proximity` relève, pour chaque artiste qu'au moins 500 auditeurs écoutent dans le relevé de popularité épinglé (111 402 artistes au 2026-10-04), ses 100 voisins selon ListenBrainz (`labs.api.listenbrainz.org/similar-artists`, algorithme épinglé dans `fetch.SIMILAR_ALGORITHM`) : une ligne par artiste, `{artist_mbid, similar: [{artist_mbid, score}]}`, dans `data/raw/listenbrainz/<date>/artist-similar.jsonl`, empreinte dans `reference/listenbrainz-similar-<date>.SHA256SUMS`. Le service prend un artiste par requête et n'annonce aucune limite : le relevé s'en tient à une requête par seconde, environ 31 heures. Interrompu, il reprend le relevé resté partiel, quel que soit le jour où il a commencé. Les données ListenBrainz sont publiées en CC0 (metabrainz.org/datasets/postgres-dumps) ; le service de similarité, qui en dérive, ne précise pas de licence. Ce relevé nourrit Musilogy (`docs/vision.md` racine, §2) ; son entrée dans `run` et dans le schéma du site vient avec la refonte de musilogy.

## Chiffres de référence

Le **contrat exécutable** est `tests/test_baseline.py` : il confronte le pipeline entier au dump de référence et compare exactement les comptes, la somme des cellules de densité et la répartition des provenances. Les chiffres cités ici sont descriptifs ; en cas de divergence, c'est le test qui fait foi.

Deux situations, deux conduites, à ne pas confondre. **Sur le dump de référence, un écart signale une règle mal implémentée** — jamais un prétexte pour ajuster la ligne de base. **Sur un nouveau dump, tous les chiffres bougent légitimement**, et la ligne de base se régénère : les huit comptes, les trois répartitions de provenance, les neuf compteurs d'anomalies, les sept de neutralisation, les exclusions de densité et de liens, la répartition des liens par type et celle de `lineage` par source. Il faut alors aussi mettre à jour `REFERENCE_DUMP`, la valeur par défaut de `dump_year`, ajouter le `reference/<dump>.SHA256SUMS` correspondant, prendre un relevé ListenBrainz sur la nouvelle extraction et l'épingler dans `REFERENCE_POPULARITY` (l'invariant `popularity_unrequested` refuse un relevé pris sur une autre), et modifier à la main les bornes codées en dur dans les vues de `90_invariants.sql` — cette dernière opération est délibérément manuelle, c'est ce qui empêche une mauvaise variable de satisfaire à la fois la règle et son contrôle. Les extractions vivant dans `data/work/<dump>/`, changer `REFERENCE_DUMP` suffit à repartir d'une extraction neuve, sans rien vider à la main ; le manifeste porte déjà les paramètres du run (section précédente).

Provenance des bords, sur le dump de référence :

| | `declared` | dérivé des albums | inconnu |
|---|---|---|---|
| début (`y0_source`) | 235 246 | 346 442 | 1 700 003 |
| fin (`y_end_source`) | 147 025 | 438 801 | 1 695 865 |
| genres (`genre_source`) | 199 611 | 153 624 | 1 928 456 |

Pour une personne, le début n'est jamais `declared` (sa déclaration est une naissance) et une fin `declared` est un décès.

## Limites assumées

- **Aucune hiérarchie de genres n'est publiée.** L'arbre Wikidata a été retiré après mesure : 323 genres sur les 1 348 du vocabulaire d'alors n'y avaient aucun parent, `free jazz` et `zeuhl` étaient rangés sous `classical`, et surtout `black metal`, `death metal`, `thrash metal` et `doom metal` **ne figuraient pas** parmi les descendants de `metal` — les 3ᵉ, 5ᵉ, 15ᵉ et 19ᵉ genres du vocabulaire. Un arbre qui marche pour le rock et casse sur le metal est pire qu'une absence d'arbre : il a l'air de fonctionner. La requête SPARQL reste dans l'historique git.

- **Une fin dérivée d'un album n'est pas une fin déclarée.** Elle est marquée `y_end_source = 'last_album'`. Parmi les groupes de type `Group` concernés ayant au moins deux albums, **3,38 % ont un dernier album isolé de plus de 15 ans** du précédent (1,04 % au-delà de 25) : des rééditions de fonds historiques qui étirent la ligne de vie. Les écarter demanderait un seuil arbitraire ; l'étiquette de provenance laisse la couche 1 trancher.

- **Le genre est un filtre de notoriété communautaire, et il est daté.** Part de **groupes** datés sans aucun genre, par époque de formation, même en prenant ceux des albums : 34,4 % pour 1967-1979, 43,1 % pour 1980-1999, 53,8 % pour 2000-2014, **75,5 % depuis 2023** (69,3 %, 72,6 %, 78,9 % et 82,7 % sur les seuls genres déclarés). La densité près du présent est doublement une borne basse : par la présence, et parce que les groupes récents sont moins tagués. **L'ordre de grandeur est considérable** : la densité totale culmine en 2014 à 150 046 puis tombe à 17 106 en 2026, soit **−89 % en douze ans**, presque entièrement par artefact. La dernière décennie ne se lit pas comme une tendance.

- **`density` ignore les orchestres, les chœurs et les personnes**, faute d'un modèle de ligne de vie comparable — orchestres et chœurs écartaient déjà 21,4 % des groupes du répertoire savant avant toute mesure. Tous restent dans `artists`, `albums` et `links`.

- **78,9 % des artistes n'ont aucun album** qui passe les règles, et 1 700 003 n'ont aucun début exploitable. La base est complète par choix : la couche 1 filtre, la couche 0 ne jette pas.

## Installation, tests, exécution

Python 3.12 géré par `uv`.

```bash
uv sync
```

Deux niveaux de test :

- `uv run pytest` — suite rapide, quelques secondes, sans dépendance au dump. Tourne sur 33 témoins réels versionnés dans `tests/fixtures/` (extraits authentiques du dump de référence, jamais de données inventées) et sur quelques enregistrements synthétiques pour les formes qu'aucun témoin ne porte.
- `tests/test_load.py` — le chargement et la fonction des contemporains, contre un vrai Postgres jetable désigné par `MUSILOGY_TEST_PG` (chaîne de connexion libpq ; les tests y suppriment et recréent les schémas `musilogy`). Sans elle, ces tests sont sautés, sauf en CI, qui fournit un service Postgres 16 et échoue si la variable manque.
- `uv run pytest -m slow` — ligne de base : confronte le pipeline entier aux ~3 millions d'enregistrements du dump de référence. Exige les extractions dans `data/work/<dump>/` (non versionnées, ~10 min à produire) ; sinon le test est ignoré.

La suite passe depuis n'importe quel répertoire : tous les chemins sont ancrés sur le paquet (`musilogy.paths`), jamais sur le répertoire courant.

```bash
uv run musilogy run                 # fetch → extract → transform → validate → publish
uv run musilogy snapshot-popularity # relevé ListenBrainz daté, à épingler (~1 h)
uv run musilogy snapshot-proximity  # voisins ListenBrainz des artistes d'au moins 500 auditeurs (~31 h, reprenable)
uv run musilogy make-fixtures       # régénère les témoins depuis les extractions
uv run musilogy load                # charge data/out/ dans la base du site (environnement libpq)
```

Aucune sortie du pipeline n'est versionnée ; seules les empreintes et les fixtures le sont.

Qualité : `uv run ruff check`, `uv run ruff format --check`, `uv run mypy`. La CI (`.github/workflows/musilogy.yml`, à la racine d'AubeSonore) passe ces trois contrôles plus la suite rapide ; la suite lente exige le dump et reste manuelle.

## Structure du dépôt

```
src/musilogy/
  fetch.py               télécharge et vérifie une archive MusicBrainz (SHA-256), relève ListenBrainz
  extract.py             projette les enregistrements bruts en flux, sans logique métier
  build.py               enchaîne les fichiers SQL, applique les corrections, vérifie les invariants
  publish.py             écrit les Parquet et manifest.json
  cli.py                 les quatre commandes
  load.py                charge les Parquet publiés dans la base du site
  paths.py               chemins ancrés sur le paquet
  corrections.csv        corrections manuelles, versionné
  reference/             empreintes des archives et des relevés ListenBrainz
  sql/                   les règles, en ordre topologique
  pg/                    les tables et la fonction des contemporains côté Postgres
tests/
  conftest.py            fixtures partagées
  fixtures/              témoins réels versionnés
  test_*.py              une suite par règle, plus test_baseline.py (suite lente)
docs/research/          notes de recherche datées
docs/superpowers/specs/ la spec en vigueur de la frise et de la filiation
```

## Licence et attribution

Les données de base MusicBrainz (artistes, dates, albums, relations) sont **CC0**. Les genres et tags sont des données supplémentaires sous **CC-BY-NC-SA 3.0**. Comme `artists` et `genres` en dépendent, **le jeu de données produit par ce pipeline est distribué sous CC-BY-NC-SA 3.0** : attribution à MusicBrainz obligatoire, usage non commercial uniquement, et partage à l'identique imposé à toute redistribution.

Les comptes d'écoute de ListenBrainz sont sous **CC0** et n'ajoutent aucune contrainte.

Les fixtures versionnées dans `tests/fixtures/` sont des extraits réels du dump MusicBrainz de référence, soumis à la même licence (voir `tests/fixtures/ATTRIBUTION.md`).
