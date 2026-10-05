# musilogy — conception

Conception du 2026-10-04. Elle remplace la spec de la frise et de la filiation
(`docs/superpowers/specs/2026-10-02-frieze-lineage-design.md`, retirée ; son
texte reste dans l'historique git) : la vision du 2026-10-04 (`docs/vision.md`
à la racine, §2) abandonne la frise des genres, la filiation tirée de
MusicBrainz et les contemporains par lieu de début. Les chiffres cités ici
sont descriptifs ; le contrat exécutable reste `tests/test_baseline.py`.

## Rôle

musilogy produit, hors ligne et depuis des sources épinglées et datées, les
données de **Musilogy** : pour un artiste, qui faisait cette musique avant
lui, en même temps, après lui ; qui il a cité comme influence ; dans quels
groupes ses membres ont joué. `musilogy load` les copie dans le schéma
`musilogy` de la base du site, qui ne lit que des fonctions SQL (§4).

## 1. Sources

| Source | Relevé | Licence |
|---|---|---|
| dump JSON MusicBrainz (artistes, release groups) | `REFERENCE_DUMP` | CC0 (cœur) ; genres CC BY-NC-SA 3.0 |
| popularité ListenBrainz (`/1/popularity/artist`) | `REFERENCE_POPULARITY` | CC0 |
| proximité ListenBrainz (`labs…/similar-artists`) | `REFERENCE_PROXIMITY` | dérivée des données ListenBrainz (CC0) ; le service ne précise pas de licence |
| influences Wikidata (P737 « influencé par », entre deux éléments qui portent un MBID, P434) | `REFERENCE_INFLUENCES` | CC0 |
| discographie Wikidata (release groups, P436, classés album studio, EP ou bande originale par P31 ou P7937) | `REFERENCE_DISCOGRAPHY` | CC0 |

Chaque relevé est pris une fois, son empreinte versionnée sous `reference/`,
et `run` lit celui que la constante épingle.

## 2. Tables

**Gardées** : `artists` (identité, type, dates et leur provenance, lieu,
genres), `albums` (non chargée : elle sert les dates, et ne compte que les
albums), `genres` (vocabulaire), `links` (relations typées entre artistes),
`popularity`.

**Retirées**, avec leurs étapes SQL, leurs invariants et leurs tests :
`presence`, la fiabilité des genres pour la densité (`55_genre_reliability`),
`density`, `activity`, `lineage`, et côté Postgres `scenes`,
`contemporaries()`, `frieze_*()`, `artist_lineage()`. Les colonnes de
`genres` qui ne servaient que la densité (`n_candidate_credits`,
`multi_artist_drop_pct`, `density_eligible`) partent aussi.

**Ajoutées** :

- `releases(artist_mbid, rg_mbid, title, primary_type, soundtrack, remix, y,
  filed_original)` : chaque album et EP du dump dont les types secondaires se
  limitent à Soundtrack et Remix, une ligne par artiste crédité de la
  population. `filed_original` dit que Wikidata le classe album studio ou EP
  (relevé `discography`, daté et épinglé) : un posthume ainsi classé est de la
  musique nouvelle. L'extraction garde désormais les EP à côté des albums ;
  `albums` reste limitée aux albums.
- `urls(artist_mbid, type, url, ended)` : parmi les pages que MusicBrainz relie
  à un artiste, celles qu'une page artiste utilise (Deezer, Spotify, Apple
  Music, Bandcamp, SoundCloud, site officiel, Wikidata, Wikipédia, images),
  avec le type de relation de MusicBrainz ; `ended` marque une page qui n'est
  plus celle de l'artiste. Une même page reliée deux fois sous un même type est
  une ligne.

- `proximity(artist_mbid, neighbour_mbid, score, rank)` *(à livrer, après
  le relevé)* : les voisins ListenBrainz de chaque artiste relevé, `rank` de 1
  à 100 dans l'ordre du service. Un voisin absent du dump reste dans la table
  (il n'a pas de fiche). Le service répète parfois un voisin pour un même
  artiste (5 des 1 039 premiers artistes du relevé, revue du 2026-10-04 ;
  will.i.am deux fois, scores 45 et 35, chez `0145e155…`) : **un voisin répété garde sa meilleure
  occurrence**, le rang le plus petit. C'est un dédoublonnage, compté dans le
  manifeste, pas une violation ; un doublon de paire restant après lui en
  serait une. Les artistes interrogés sont gardés à part, y compris ceux qui
  n'ont aucun voisin : seuls ceux d'au moins 500 auditeurs le sont, et un
  artiste non relevé n'est pas un artiste sans voisin.
- `influences(artist_mbid, influence_mbid, statement)` : `artist_mbid` cite
  `influence_mbid` comme influence selon Wikidata ; `statement` est
  l'identifiant complet de la déclaration (`Q123$GUID`), pour la citer. Les déclarations
  dépréciées sont écartées. Un élément Wikidata peut porter plusieurs MBID :
  une déclaration donne une ligne par paire de MBID, et la table garde une
  déclaration par paire (la plus petite si deux déclarations donnent la même
  paire). Une extrémité absente du dump reste dans la table. Relevé du
  2026-10-04 : 9 517 paires (8 612 déclarations), 5 661 MBID distincts
  (2 589 qui citent, 3 728 cités), dont 9 266 paires entre deux artistes du
  dump ; `artist_influences` en rend au moins une pour 61 des 288 artistes
  joués à cette date (24 en citent, 49 sont cités).

## 3. Proximité × temps

La proximité vient de la co-écoute : **elle ne dit jamais « influencé par »**.
Le temps lui donne un sens. Un voisin est :

- `before` quand il a commencé (`y0`) plus de 3 ans avant l'artiste ;
- `after` quand il a commencé plus de 3 ans après ;
- `during` sinon ;
- `NULL` quand l'un des deux n'a pas de `y0`.

Le seuil de 3 ans est un calcul nommé, à juger sur des artistes connus (T. Rex,
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
| `artist_links` | livrée |
| `artist_influences` | livrée par #286 |
| `search_artists` | livrée par #286 |
| `artist_neighbours` | à livrer, après le relevé de proximité (§5) |
| `artist_releases` | livrée par #337, règle de la page par #338 |
| `artist_urls` | livrée par #337 |

```sql
-- Fiche. proximity_surveyed : vrai si l'artiste a été interrogé dans le
-- relevé de proximité épinglé, faux sinon, NULL tant qu'aucun relevé n'est
-- chargé (NULL partout aujourd'hui). Un artiste non relevé n'est pas un
-- artiste sans voisin.
musilogy.artist_card(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, country text,
  begin_area text, y_birth integer, y0 integer, y0_source text, y_end integer,
  y_end_source text, ended boolean, genres jsonb, genre_source text,
  listen_count bigint, user_count bigint, proximity_surveyed boolean)

-- Liens typés (inchangée) ; le site garde les types de groupe.
musilogy.artist_links(artist text) RETURNS TABLE (
  type text, direction text, other_mbid text, other_name text,
  other_disambiguation text, other_y0 integer, y_begin integer, y_end integer)

-- À livrer. Voisins ListenBrainz, rangés, avec leur côté dans le temps (§3).
musilogy.artist_neighbours(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, y0 integer,
  y_end integer, ended boolean, score integer, rank integer, side text)

-- Influences déclarées, dans les deux sens : 'cited' (l'artiste cite
-- l'autre), 'cited_by' (l'autre cite l'artiste).
musilogy.artist_influences(artist text) RETURNS TABLE (
  direction text, mbid text, name text, disambiguation text, y0 integer,
  statement text)

-- Recherche par nom, pour entrer dans Musilogy par un artiste quelconque :
-- préfixe du nom normalisé (`name_key`), les plus écoutés d'abord.
musilogy.search_artists(query text, page_size integer) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, y0 integer,
  user_count bigint)

-- Ce que la page montre de l'œuvre (docs/vision.md §2.4) : les albums (studio,
-- bande originale, remix) et les EP à partir du premier album, ou tous les EP
-- d'un artiste sans album ; pour un groupe dont la fin est déclarée, rien
-- après elle sauf ce que Wikidata classe album studio ou EP. Du plus ancien au
-- plus récent, sans année en dernier, puis par titre et MBID.
musilogy.artist_releases(artist text) RETURNS TABLE (
  mbid text, title text, primary_type text, soundtrack boolean, remix boolean,
  y integer)

-- Pages que MusicBrainz relie à l'artiste et qui sont encore les siennes
-- (relation non terminée), avec le type de relation de MusicBrainz ; par
-- type puis URL.
musilogy.artist_urls(artist text) RETURNS TABLE (type text, url text)
```

Un voisin ou une influence absents du dump n'apparaissent pas : la fonction
joint `artists`, faute de nom à montrer.

`artist_influences` rend chaque direction dans l'ordre du temps (`y0`, les
artistes sans année en dernier, puis le MBID). `statement` est l'identifiant
complet de la déclaration Wikidata, `Q123$GUID`, tel que Wikidata l'écrit (un
« q » minuscule sur certaines déclarations anciennes). Le lien qui y mène est
`https://www.wikidata.org/wiki/Q123#Q123$GUID` : la page de l'élément (son
identifiant en majuscule ; `wiki/q19848` redirige vers `wiki/Q19848`), et pour
ancre la déclaration telle quelle. Vérifié le 2026-10-04 sur la page de U2
(`https://www.wikidata.org/wiki/Q396`), dont le HTML porte
`<div id="Q396$f3eaf34b-4149-e380-038a-5141879aadff" class="wikibase-statementview …">`,
et sur `Q19848`, où la déclaration ancienne garde son « q » :
`id="q19848$bbc07573-44e4-3526-c337-998471c7f0d4"`.

`search_artists` normalise la requête comme `name_key` l'est dans DuckDB
(`strip_accents(lower(name))`), par une fonction Postgres interne,
`musilogy.name_key(text)`, que le site n'a pas à appeler : sur le dump de
référence, elle redonne le `name_key` de tous les noms sauf 6 (des lettres
cerclées, Ⓐ, que la libc du Postgres du site ne met pas en minuscule). Une
requête vide ne trouve personne. Le préfixe se lit dans `search`, une
projection étroite créée au chargement (`name_key` en collation C, nombre
d'auditeurs, MBID) : mesuré sur un Postgres 16 jetable chargé du dump de
référence, cache chaud, 78 ms pour « a » (157 112 noms), 46 ms pour « the »,
moins de 4 ms pour un nom complet.

## 5. Exécution

- Le relevé de proximité prend plusieurs jours : 111 402 artistes, une
  requête par seconde au plus, mais un débit réel mesuré d'environ 0,6
  artiste par seconde (2026-10-04), pannes du service comprises, soit plus de
  deux jours, davantage si les pannes s'allongent. Il tourne en service
  systemd transitoire plafonné
  (`systemd-run --user --unit=musilogy-proximity -p MemoryMax=1G`), et reprend
  le relevé partiel s'il est interrompu.
- La construction reste plafonnée comme avant (`musilogy/CLAUDE.md`).
