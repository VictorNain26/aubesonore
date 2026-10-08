# musilogy — conception

Conception du 2026-10-04, qui remplace celle de la frise et de la filiation
(dans l'historique git). La feuille de route est `docs/vision.md` §7, à la
racine. Les chiffres cités ici sont descriptifs ; le contrat exécutable reste
`tests/test_baseline.py`.

## Rôle

musilogy produit, hors ligne et depuis des sources épinglées et datées, les
données de **Musilogy** : pour un artiste, qui fait le même son, avant lui,
en même temps, après lui ; dans quels groupes ses membres ont joué. `musilogy load` les copie dans le schéma
`musilogy` de la base du site, qui ne lit que des fonctions SQL (§4).

## 1. Sources

| Source | Relevé | Licence |
|---|---|---|
| dump JSON MusicBrainz (artistes, release groups) | `REFERENCE_DUMP` | CC0 (cœur) ; genres CC BY-NC-SA 3.0 |
| popularité ListenBrainz (`/1/popularity/artist`) | `REFERENCE_POPULARITY` | CC0 |
| proximité ListenBrainz (`labs…/similar-artists`) | `REFERENCE_PROXIMITY` | dérivée des données ListenBrainz (CC0) ; le service ne précise pas de licence |
| discographie Wikidata (release groups, P436, classés album studio, EP ou bande originale par P31 ou P7937) | `REFERENCE_DISCOGRAPHY` | CC0 |
| dump mensuel des sorties Discogs (artistes crédités, styles, date, descriptions de format) | `REFERENCE_DISCOGS` | CC0 (data.discogs.com) |
| export des statistiques ListenBrainz (artistes les plus écoutés de chaque utilisateur, de tout temps) | `REFERENCE_LISTENING` | CC0 |

Chaque relevé est pris une fois, son empreinte versionnée sous `reference/`,
et `run` lit celui que la constante épingle.

**Une source, ses tables.** Les sources ne se mélangent jamais dans une même
colonne : `genres` reste MusicBrainz, `styles` reste Discogs,
`proximity` reste ListenBrainz. L'identité d'un artiste est son MBID ; le pont
vers une autre base est une table à part (`discogs_links`), et un pont ambigu
— un artiste Discogs relié à deux MBID — est écarté et compté, jamais deviné.
Quand deux sources se recoupent, une seule fait foi : MusicBrainz pour les
dates, que Discogs ne déplace jamais ; leurs désaccords sont comptés dans le
manifeste (`discogs_date_disagreements`), pas corrigés. Ce qui combine
plusieurs sources — les artistes liés (`docs/vision.md` §7, étape 9.5) — vit dans une
couche dérivée qui lit les tables sources, garde la raison de chaque lien et
ne réécrit jamais une source.

**Une exception au SQL, la co-écoute** (`colisten.py`). Compter, pour chaque
paire d'artistes, les utilisateurs qui écoutent les deux est un produit de
matrices creuses : les 33 millions de lignes utilisateur-artiste de l'export
donnent des milliards de paires, de l'ordre de 2 × 10¹⁰ incréments en
auto-jointure SQL. La lecture, les filtres et la numérotation restent en SQL
(DuckDB) ; scipy ne fait que le produit, le score et les K meilleurs voisins
de chaque artiste. La règle et ses paramètres sont dans le module et dans le
manifeste (`parameters`).

## 2. Tables

**Gardées** : `artists` (identité, type, dates et leur provenance, lieu,
genres ; tout artiste du dump, de tout type ou sans type, hors artistes à usage
spécial, et seule une formation donne un début déclaré : README, `10_bands`), `albums` (non chargée : elle sert les dates, et ne compte que les
albums), `genres` (vocabulaire, publié, non chargé), `links` (appartenances, pseudonymes et changements de nom),
`popularity`. Les tables de la frise et de la filiation sont retirées (historique git).

**Ajoutées** :

- `releases(artist_mbid, rg_mbid, title, primary_type, soundtrack, remix, y,
  filed_original, official)` : chaque album et EP du dump dont les types secondaires se
  limitent à Soundtrack et Remix, une ligne par artiste crédité de la
  population. `filed_original` dit que Wikidata le classe album studio ou EP
  (relevé `discography`, daté et épinglé) : un posthume ainsi classé est de la
  musique nouvelle. `official` dit que MusicBrainz le montre comme l'œuvre
  de l'artiste (relevé `official`, en parties épinglées) : vrai si un artiste
  crédité relevé le liste, faux si les artistes crédités relevés ne le
  listent pas, NULL si aucun n'a été relevé ; `artist_releases` écarte les
  faux. L'extraction garde désormais les EP à côté des albums ; `albums` reste
  limitée aux albums.
- `styles(artist_mbid, decade, style, records)`, tirée du dump Discogs
  (`84_discogs`, README) : les styles des disques de l'artiste par décennie.
  Publiée, non chargée dans le site tant qu'aucune fonction ne la lit.
- `urls(artist_mbid, type, url, ended)` : parmi les pages que MusicBrainz relie
  à un artiste, celles qu'une page artiste utilise (Deezer, Spotify, Apple
  Music, Bandcamp, SoundCloud, site officiel, Wikidata),
  avec le type de relation de MusicBrainz ; `ended` marque une page qui n'est
  plus celle de l'artiste. Une même page reliée deux fois sous un même type est
  une ligne.

- `proximity(artist_mbid, neighbour_mbid, score, rank)` (`89_proximity.sql`,
  sur les parties épinglées du relevé) : les voisins ListenBrainz de chaque
  artiste relevé, `rank` de 1 à 100 dans l'ordre du service. Un voisin absent
  du dump reste dans la table (il n'a pas de fiche). Le service répète parfois
  un voisin pour un même artiste (675 fois sur les 111 402 artistes du
  relevé du 2026-10-04 ; will.i.am aux rangs 58 et 100, scores 45 et 35, chez
  Chuckie, `0145e155…`) : **un voisin répété garde sa meilleure occurrence**,
  le rang le plus petit, qui porte aussi le score le plus haut (le score ne
  remonte jamais le long des rangs du relevé) ; le rang laissé
  libre n'est pas comblé. C'est un dédoublonnage, compté dans le manifeste
  (`proximity_exclusions`), pas une violation ; un doublon de paire restant
  après lui en serait une. Le service donne aussi certains artistes pour leur
  propre voisin (84 des 111 402 artistes relevés) : cette occurrence est
  écartée et comptée de même, son rang laissé libre. Seuls les artistes d'au
  moins 500 auditeurs sont interrogés : `artists.proximity_surveyed` vaut vrai pour chaque artiste dont
  le relevé porte une ligne, même sans voisin (14,8 % des 111 402), faux
  pour les autres, NULL si aucun relevé n'est chargé. Un artiste non relevé
  n'est pas un artiste sans voisin. Le relevé se fait en parties épinglées : chacune
  interroge les artistes éligibles qu'aucune autre n'a interrogés, et aucun
  artiste n'est dans deux parties (invariant `proximity_asked_twice`).
- `colisten(artist_mbid, neighbour_mbid, common, score, rank)` (`colisten.py`,
  sur l'export des statistiques ListenBrainz épinglé) : notre co-écoute. Pour
  chaque artiste qu'au moins 3 utilisateurs écoutent, ses 50 meilleurs voisins
  parmi ceux avec qui il partage au moins 2 auditeurs, au score
  c / (pop_artiste^0,3 × pop_voisin^0,7) × c / (c + 10), où c compte les
  auditeurs communs et pop les auditeurs de chacun : la règle mesurée le
  2026-10-07 contre le service de ListenBrainz (64 % de voisins justes contre
  54 %, et nettement plus d'artistes peu connus parmi eux, `docs/vision.md`
  §2.2). La page en montre 30 au plus : 50 laissent de la marge. Un rang de 1 à 50 sans trou, jamais l'artiste lui-même ; un voisin
  absent du dump reste dans la table, comme dans `proximity`. Publiée, pas encore
  chargée dans le site. Cinq invariants :
  une paire en double, un artiste voisin de lui-même, des rangs hors de 1 à K
  ou troués, une paire sous le seuil d'auditeurs communs, un score qui remonte
  le long des rangs.

- `same_sound(artist_mbid, neighbour_mbid, rank, colisten_rank, source, colour,
  term, decade)` (`88_same_sound.sql`) : « Même son », la première table de la
  couche dérivée (§1). Un voisin de `colisten` y entre quand sa couleur
  s'accorde à celle de l'artiste : leurs profils de styles Discogs (par
  décennie, une décennie voisine à moitié, pondérés par la rareté du style),
  sinon de genres MusicBrainz, comparés par cosinus et rabattus pour un profil
  mince, valent au moins 0,35. C'est la règle mesurée le 2026-10-08 sur 61
  artistes de référence (`docs/vision.md` §2.2) ; ses seuils sont posés dans le
  fichier SQL et relus par le manifeste (`parameters`). `rank` de 1 à n dans
  l'ordre de la co-écoute, `colisten_rank` le rang d'origine ; la raison est le
  style (`term`, avec la `decade` de l'artiste) ou le genre qui pèse le plus
  dans ce que les deux partagent, `source` dit lequel. Un voisin absent du dump
  reste dans la table, comme dans `colisten`. Sept invariants : une paire en
  double, un artiste voisin de lui-même, des rangs troués, un ordre qui
  contredit la co-écoute, une paire absente de la co-écoute ou à un autre rang,
  une couleur sous 0,35 ou une source inconnue, une raison que les deux
  artistes ne portent pas.

## 3. Proximité × temps

La proximité vient de la co-écoute ; le temps lui donne un sens. Un voisin est :

- `before` quand il a commencé (`y0`) plus de 3 ans avant l'artiste ;
- `after` quand il a commencé plus de 3 ans après ;
- `during` sinon ;
- `NULL` quand l'un des deux n'a pas de `y0`.

Le seuil de 3 ans (`pg/90_artist.sql`, `artist_neighbours` et `artist_same_sound`) est à juger sur des artistes connus (T. Rex,
1967 : Kinks et Beatles avant, Bowie et Roxy Music pendant, Ramones et Clash
après) et à mesurer avant d'être changé.

## 4. Contrat avec le site

Le site n'appelle que ces fonctions. Toutes sont `STABLE`, en SQL, et rendent
zéro ligne pour un MBID inconnu. Une fonction **livrée** existe dans
`src/musilogy/pg/90_*.sql` et est testée ici contre Postgres ; elle est en
production après le premier `musilogy load` qui suit sa fusion. Une fonction
**à livrer** n'existe encore nulle part : le site doit la traiter comme
absente (code `42883`).

| Fonction | État |
|---|---|
| `artist_card` | livrée ; `proximity_surveyed` ajoutée par #286 |
| `artist_bands` | livrée par #342 |
| `artist_member_projects` | livrée par #342 |
| `artist_other_names` | livrée par #342 |
| `search_artists` | livrée par #286 |
| `artist_neighbours` | livrée avec la table `proximity` |
| `artist_releases` | livrée par #337, règle de la page par #338 |
| `artist_urls` | livrée par #337 |
| `artist_same_sound` | livrée avec la table `same_sound` |

```sql
-- Fiche. proximity_surveyed : vrai si l'artiste a été interrogé dans le
-- relevé de proximité épinglé, même sans voisin, faux sinon, NULL si le
-- chargement ne porte aucun relevé. Un artiste non relevé n'est pas un
-- artiste sans voisin.
musilogy.artist_card(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, country text,
  begin_area text, y_birth integer, y0 integer, y0_source text, y_end integer,
  y_end_source text, ended boolean, genres jsonb, genre_source text,
  listen_count bigint, user_count bigint, proximity_surveyed boolean)

-- Voisins ListenBrainz dans l'ordre du service (rang), avec leur côté dans
-- le temps (§3) ; les rangs ne sont pas renumérotés quand un voisin absent du
-- dump est écarté.
musilogy.artist_neighbours(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, y0 integer,
  y_end integer, ended boolean, score integer, rank integer, side text)

-- « Même son » : les voisins de la co-écoute dont la couleur s'accorde, dans
-- leur rang, chacun avec sa raison (source 'styles' : term est un style
-- Discogs, decade la décennie de l'artiste ; 'genres' : term est un genre
-- MusicBrainz, decade NULL) et son côté dans le temps (§3) ; les rangs ne sont
-- pas renumérotés quand un voisin absent du dump est écarté.
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

Un voisin absent du dump n'apparaît pas : la fonction
joint `artists`, faute de nom à montrer.

`artist_neighbours`, mesurée le 2026-10-06 sur un Postgres jetable chargé du
dump de référence et du relevé entier, pour Joy Division (100 voisins) :
environ 1 ms d'exécution, cache chaud. La table pèse 877 Mo dans la base,
index compris (555 Mo sans).

`search_artists` normalise la requête comme `name_key` l'est dans DuckDB
(`strip_accents(lower(name))`), par une fonction Postgres interne,
`musilogy.name_key(text)`, que le site n'a pas à appeler ; le préfixe se lit
dans `search`, une projection étroite créée au chargement (README,
« Chargement dans le site », pour la normalisation et ses mesures).

## 5. Exécution

- Les relevés longs (proximité, statut officiel) se font en parties, une
  requête par seconde au plus : une partie interroge les artistes qu'aucune
  partie épinglée n'a interrogés et reprend le fichier partiel si elle est
  interrompue. Ils tournent en service systemd transitoire plafonné
  (`systemd-run --user --unit=musilogy-proximity -p MemoryMax=1G`). À la fin,
  la commande écrit l'empreinte de la partie dans `reference/` : versionner ce
  fichier et ajouter sa date à `REFERENCE_PROXIMITY` ou `REFERENCE_OFFICIAL`
  épingle la partie, et `run` les lit toutes.
- La construction reste plafonnée comme avant (`musilogy/CLAUDE.md`).
