# musilogy — conception

La conception en vigueur de musilogy. La feuille de route est `docs/vision.md`
§7, à la racine. Les chiffres cités ici sont descriptifs ; ceux de chaque livraison sont
dans son `manifest.json`.

## Rôle

musilogy produit, hors ligne et depuis des sources épinglées et datées, les
données de **Musilogy** : pour un artiste, les artistes du même son ; dans quels groupes ses membres ont joué. `musilogy load` les copie dans le schéma
`musilogy` de la base du site, qui ne lit que des fonctions SQL (§4).

## Méthode des artistes similaires

Les artistes similaires (`docs/vision.md` §2.2) viennent d'une seule chaîne, faite de méthodes
reconnues, sans couche maison :

1. **Qui écoute quoi** : pour chaque utilisateur de ListenBrainz, les artistes qu'il écoute,
   identifiés par leur MBID.
2. **Le même public** (`colisten`) : le filtrage collaboratif « article à article », la méthode des
   « ceux qui aiment X aiment aussi Y » (Sarwar et al., WWW 2001 ; Linden, Smith et York, *IEEE
   Internet Computing*, 2003). Deux artistes se comparent par leurs auditeurs communs, avec le
   cosinus asymétrique d'Aiolli (RecSys 2013, la méthode gagnante du *Million Song Dataset
   Challenge*), c / (pop_artiste^α × pop_voisin^(1−α)), qui corrige la popularité, et le lissage
   c / (c + h) de Bell et Koren (2007), qui se méfie d'un lien porté par peu d'auditeurs.
3. **Le même son** (`same_sound`) : un recommandeur hybride « en cascade » (Burke, *User Modeling
   and User-Adapted Interaction*, 2002) : la co-écoute propose, la couleur filtre. La couleur est
   un profil de styles Discogs pondérés par leur rareté et leur part dans l'œuvre, comparé par
   cosinus (TF-IDF, la base du filtrage par contenu) ; un artiste qui a moins de trois disques
   stylés n'a pas de couleur.
4. **Le classement** : le score de la co-écoute, parmi les voisins que la couleur confirme.
5. **La mesure** : le banc d'évaluation (`src/musilogy/bench.py`, `musilogy bench`). Des
   références tirées au hasard par tranche de popularité ; les premiers voisins de chaque système
   regroupés (le *pooling* de TREC ; Ellis et al., ISMIR 2002 pour la vérité terrain de la
   similarité d'artistes) ; chaque paire jugée une fois à partir de sources, par deux juges et un
   troisième quand ils divergent, selon `docs/consigne-juges.md` ; précision, rappel sur le pool
   et couverture par référence, avec leurs intervalles de confiance. Ses données restent hors du
   dépôt (`paths.bench_dir`).

La co-écoute se lit dans les deux sens : un artiste parmi les voisins de l'artiste, ou dont
l'artiste est un voisin, au plus haut des deux scores. La couleur se compare toutes décennies
confondues : la comparer décennie par décennie, un choix maison, écartait les artistes d'un même
son à des décennies d'écart sans rendre les paires gardées plus justes (2026-10-09).

La généalogie (`docs/vision.md` §2.3) est une autre question, avec ses propres preuves (liens
entre genres, faits écrits) ; elle ne passe pas par la co-écoute.

## 1. Sources

| Source | Relevé | Licence |
|---|---|---|
| dump JSON MusicBrainz (artistes, release groups ; les genres et tags, non CC0, ne sont pas lus) | `REFERENCE_DUMP` | CC0 (cœur) |
| popularité ListenBrainz (`/1/popularity/artist`) | `REFERENCE_POPULARITY` | CC0 |
| discographie Wikidata (release groups, P436, classés album studio, EP ou bande originale par P31 ou P7937) | `REFERENCE_DISCOGRAPHY` | CC0 |
| dump mensuel des sorties Discogs (artistes crédités, styles, date, descriptions de format) | `REFERENCE_DISCOGS` | CC0 (data.discogs.com) |
| dump Spark ListenBrainz (toutes les écoutes rapprochées de MusicBrainz), réduit à une ligne par utilisateur et par artiste | `REFERENCE_LISTENING` | CC0 |

Chaque relevé est pris une fois, son empreinte versionnée sous `reference/`,
et `run` lit celui que la constante épingle.

**Une source, ses tables.** Les sources ne se mélangent jamais dans une même
colonne : `styles` reste Discogs,
`colisten` reste ListenBrainz. L'identité d'un artiste est son MBID ; le pont
vers une autre base est une table à part (`discogs_links`), et un pont ambigu
— un artiste Discogs relié à deux MBID — est écarté et compté, jamais deviné.
Quand deux sources se recoupent, une seule fait foi : MusicBrainz pour les
dates, que Discogs ne déplace jamais ; leurs désaccords sont comptés dans le
manifeste (`discogs_date_disagreements`), pas corrigés. Ce qui combine
plusieurs sources — les proches (`docs/vision.md` §2.2) — vit dans une
couche dérivée qui lit les tables sources, garde la raison de chaque lien et
ne réécrit jamais une source.

**Une exception au SQL, la co-écoute** (`colisten.py`). Compter, pour chaque
paire d'artistes, les utilisateurs qui écoutent les deux est un produit de
matrices creuses : les 120 millions de lignes utilisateur-artiste de toutes
les écoutes donnent des milliards de paires, de l'ordre de 9 × 10¹¹
incréments en auto-jointure SQL. La lecture, les filtres et la numérotation restent en SQL
(DuckDB) ; scipy ne fait que le produit, le score et les K meilleurs voisins
de chaque artiste. La règle et ses paramètres sont dans le module et dans le
manifeste (`parameters`).

## 2. Tables

**Le socle** : `artists` (identité, type, dates et leur provenance, lieu,
styles Discogs ; tout artiste du dump, de tout type ou sans type, hors artistes à usage
spécial, et seule une formation donne un début déclaré : README, `10_bands`), `albums` (non chargée : elle sert les dates, et ne compte que les
albums), `links` (appartenances, pseudonymes et changements de nom),
`popularity`.

**L'œuvre, les styles, les pages et la proximité** :

- `releases(artist_mbid, rg_mbid, title, primary_type, soundtrack, remix, y,
  filed_original, official)` : chaque album et EP du dump dont les types secondaires se
  limitent à Soundtrack et Remix, une ligne par artiste crédité de la
  population. `filed_original` dit que Wikidata le classe album studio ou EP
  (relevé `discography`, daté et épinglé) : un posthume ainsi classé est de la
  musique nouvelle. `official` dit que MusicBrainz le montre comme l'œuvre
  de l'artiste (relevé `official`, en parties épinglées) : vrai si un artiste
  crédité relevé le liste, faux si les artistes crédités relevés ne le
  listent pas, NULL si aucun n'a été relevé ; `artist_releases` écarte les
  faux. L'extraction garde les EP à côté des albums ; `albums` reste
  limitée aux albums.
- `styles(artist_mbid, decade, style, records)`, tirée du dump Discogs
  (`84_discogs`, README) : les styles des disques de l'artiste par décennie.
  `artists.styles` en somme les disques de chaque style sur toutes les
  décennies, du plus de disques au moins, à égalité par nom : la ligne sous le
  nom de l'artiste (`docs/vision.md` §2.4), vide sans Discogs.
  Publiée, non chargée dans le site tant qu'aucune fonction ne la lit.
- `urls(artist_mbid, type, url, ended)` : parmi les pages que MusicBrainz relie
  à un artiste, celles qu'une page artiste utilise (Deezer, Spotify, Apple
  Music, Bandcamp, SoundCloud, site officiel, Wikidata),
  avec le type de relation de MusicBrainz ; `ended` marque une page qui n'est
  plus celle de l'artiste. Une même page reliée deux fois sous un même type est
  une ligne.

- `colisten(artist_mbid, neighbour_mbid, common, score, rank)` (`colisten.py`,
  sur toutes les écoutes ListenBrainz épinglées) : notre co-écoute. Pour
  chaque artiste qu'au moins 3 utilisateurs écoutent, ses 50 meilleurs voisins
  parmi ceux avec qui il partage au moins 2 auditeurs, au score
  c / (pop_artiste^0,3 × pop_voisin^0,7) × c / (c + 10), où c compte les
  auditeurs communs et pop les auditeurs de chacun : la règle mesurée le
  2026-10-07 contre le service de ListenBrainz (64 % de voisins justes contre
  54 %, et nettement plus d'artistes peu connus parmi eux ; la mesure est au
  commit 57bcd8d3 de `docs/vision.md`). « Même son » cherche la couleur parmi les 50. Un rang de 1 à 50 sans
  trou, jamais l'artiste lui-même ; un voisin absent du dump reste dans la
  table. Publiée, non chargée dans le site : `same_sound` la lit. Cinq invariants :
  une paire en double, un artiste voisin de lui-même, des rangs hors de 1 à K
  ou troués, une paire sous le seuil d'auditeurs communs, un rang qui ne suit pas
  l'ordre du score puis du MBID du voisin.

- `same_sound(artist_mbid, neighbour_mbid, rank, colisten_score, source, colour,
  term, decade)` (`88_same_sound.sql`) : « Même son », la première table de la
  couche dérivée (§1). Un voisin de `colisten`, dans un sens ou dans l'autre, y
  entre quand sa couleur s'accorde à celle de l'artiste : leurs profils de
  styles Discogs (toutes décennies confondues, pondérés par la rareté du style),
  comparés par cosinus et rabattus pour un profil mince (ses disques datés),
  valent au moins 0,35 ; un artiste sans profil Discogs n'a pas de voisin. C'est
  la règle mesurée une fois sur 75 artistes, 87 % de bons voisins parmi les 8
  premiers (`docs/vision.md` §2.2, 2026-10-11), quand les genres MusicBrainz
  tenaient encore lieu de couleur à un artiste sans Discogs (retirés le
  2026-10-17, leur licence n'étant pas CC0) ;
  ses seuils sont posés dans le fichier SQL et relus par le manifeste
  (`parameters`). `rank` de 1 à n par `colisten_score`, le plus haut score de
  co-écoute des deux sens, à égalité par MBID du voisin ; la raison est le style
  (`term`, avec la `decade` où l'artiste en a le plus de disques, NULL s'il n'a
  aucun disque daté de ce style) qui pèse le plus dans ce que les deux
  partagent ; `source` nomme la couleur, toujours `styles`. Tout voisin est un
  artiste du dump : sa couleur vient de ses styles, que seul un artiste du dump
  porte. La couleur se
  somme en décimal exact, pour qu'une livraison reste la même octet pour
  octet. Sept invariants : une paire en
  double, un artiste voisin de lui-même, des rangs troués, un ordre qui
  contredit le score de co-écoute, une paire absente de la co-écoute dans les
  deux sens ou à un autre score,
  une couleur sous 0,35 ou une source autre que `styles`, une raison que les deux
  artistes ne portent pas.

## 3. Proximité × temps

La proximité vient de la co-écoute ; le temps lui donne un sens. Un voisin est :

- `before` quand il a commencé (`y0`) plus de 3 ans avant l'artiste ;
- `after` quand il a commencé plus de 3 ans après ;
- `during` sinon ;
- `NULL` quand l'un des deux n'a pas de `y0`.

Le seuil de 3 ans (`pg/90_artist.sql`, `musilogy.side`) est à juger sur des artistes connus (T. Rex,
1967 : Kinks et Beatles avant, Bowie et Roxy Music pendant, Ramones et Clash
après) et à mesurer avant d'être changé.

## 4. Contrat avec le site

Le site n'appelle que ces fonctions. Toutes sont `STABLE`, en SQL, et rendent
zéro ligne pour un MBID inconnu. Chacune vit dans `src/musilogy/pg/90_*.sql`, testée ici
contre Postgres, et passe en production au premier `musilogy load` qui suit sa fusion ; d'ici
là, le site la traite comme absente (code `42883`).

```sql
-- Le rang de chaque artiste parmi ceux de son nom exact (name_key) : les plus
-- écoutés sur ListenBrainz d'abord, ceux qu'il ne connaît pas en dernier, puis
-- par MBID. Le site en tire l'adresse d'une page quand il la publie : le nom
-- seul pour le premier, un suffixe par rang pour les autres.
musilogy.artist_homonym_rank(artists text[]) RETURNS TABLE (mbid text, homonym_rank integer)

-- Fiche.
musilogy.artist_card(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, country text,
  begin_area text, y_birth integer, y0 integer, y0_source text, y_end integer,
  y_end_source text, ended boolean, styles jsonb,
  listen_count bigint, user_count bigint)
-- styles : [{style, records}], les styles Discogs de l'artiste, disques sommés
-- sur toutes les décennies, du plus de disques au moins, à égalité par nom ;
-- [] pour un artiste que Discogs n'atteint pas.

-- « Même son » : les 8 premiers voisins de la co-écoute, dans un sens ou dans
-- l'autre, dont la couleur s'accorde, la profondeur à laquelle la règle a été
-- mesurée (la table les garde tous), dans leur rang, chacun avec sa raison
-- (source 'styles', la seule : term est un style Discogs, decade la décennie où
-- l'artiste en a le plus de disques, NULL s'il n'en a aucun daté) et son côté
-- dans le temps (§3, musilogy.side) ;
-- y_end seulement déclaré, jamais l'année d'un dernier album.
musilogy.artist_same_sound(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, y0 integer,
  y_end integer, ended boolean, rank integer, source text, term text,
  decade integer, side text)

-- Recherche par nom, pour entrer dans Musilogy par un artiste quelconque :
-- préfixe du nom normalisé (`name_key`), les plus écoutés d'abord.
musilogy.search_artists(query text, page_size integer) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, y0 integer,
  user_count bigint)

-- Ce que la page montre de l'œuvre (docs/vision.md §2.4) : les albums (studio,
-- bande originale, remix) et les EP à partir du premier album, ou tous les EP
-- d'un artiste sans album ; pour un groupe dont la fin est déclarée, rien
-- après elle sauf ce que Wikidata classe album studio ou EP. Du plus récent au
-- plus ancien, sans année en dernier, puis par titre et MBID.
musilogy.artist_releases(artist text) RETURNS TABLE (
  mbid text, title text, primary_type text, soundtrack boolean, remix boolean,
  y integer)

-- Membres d'un groupe ('member' : l'autre en fait partie) ou groupes d'une
-- personne ('group' : l'artiste fait partie de l'autre) ; membre, fondateur et
-- collaboration sont une seule relation (docs/vision.md §2.4). Plusieurs
-- relations entre les deux font une ligne, de la première année déclarée à la
-- dernière. Rôle, puis année de début (sans année en dernier), puis nom.
musilogy.artist_bands(artist text) RETURNS TABLE (
  role text, mbid text, name text, disambiguation text, y0 integer,
  y_begin integer, y_end integer)

-- Projets des membres, à deux pas d'un groupe : les autres groupes de ses
-- membres et les noms sous lesquels ils jouent, seulement ceux qui ont un
-- disque (artist_releases) ; ni l'artiste, ni un de ses membres, ni un de ses
-- anciens ou nouveaux noms, ni un projet auquel il prend part lui-même (ses
-- groupes le disent). `via` : les membres qui y mènent. Du plus ancien au plus
-- récent (y0).
musilogy.artist_member_projects(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, y0 integer, via text[])

-- Autres noms : 'alias' (nom sous lequel la personne joue), 'person' (la
-- personne derrière un nom de scène), 'former' et 'later' (changement de
-- nom). Du plus ancien au plus récent.
musilogy.artist_other_names(artist text) RETURNS TABLE (
  kind text, mbid text, name text, disambiguation text, y0 integer)

-- Pages que MusicBrainz relie à l'artiste et qui sont encore les siennes
-- (relation non terminée), avec le type de relation de MusicBrainz ; par
-- type puis URL.
musilogy.artist_urls(artist text) RETURNS TABLE (type text, url text)
```

`artist_homonym_rank` classe les six Nirvana en 191 ms (production, 2026-10-12), par
la projection `search`, indexée sur `name_key`.

`artist_same_sound`, mesurée le 2026-10-09 sur un Postgres jetable : 0,07 ms
pour Daft Punk, index chaud. La table pèse 484 Mo dans la base, index compris.

`search_artists` normalise la requête comme `name_key` l'est dans DuckDB
(`strip_accents(lower(name))`), par une fonction Postgres interne,
`musilogy.name_key(text)`, que le site n'a pas à appeler ; le préfixe se lit
dans `search`, une projection étroite créée au chargement (README,
« Chargement dans le site », pour la normalisation et ses mesures).

## 5. Exécution

- Le relevé long (statut officiel) se fait en parties, une
  requête par seconde au plus : une partie interroge les artistes qu'aucune
  partie épinglée n'a interrogés et reprend le fichier partiel si elle est
  interrompue. Il tourne en service systemd transitoire plafonné
  (`systemd-run --user --unit=musilogy-official -p MemoryMax=1G`). À la fin,
  la commande écrit l'empreinte de la partie dans `reference/` : versionner ce
  fichier et ajouter sa date à `REFERENCE_OFFICIAL` épingle la partie, et
  `run` les lit toutes.
- La construction reste plafonnée comme avant (`.claude/rules/musilogy.md`).
