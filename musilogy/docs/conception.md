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

Chaque relevé est pris une fois, son empreinte versionnée sous `reference/`,
et `run` lit celui que la constante épingle.

## 2. Tables

**Gardées** : `artists` (identité, type, dates et leur provenance, lieu,
genres), `albums` (non chargée : elle sert les dates), `genres` (vocabulaire),
`links` (relations typées entre artistes), `popularity`.

**Retirées**, avec leurs étapes SQL, leurs invariants et leurs tests :
`presence`, la fiabilité des genres pour la densité (`55_genre_reliability`),
`density`, `activity`, `lineage`, et côté Postgres `scenes`,
`contemporaries()`, `frieze_*()`, `artist_lineage()`. Les colonnes de
`genres` qui ne servaient que la densité (`n_candidate_credits`,
`multi_artist_drop_pct`, `density_eligible`) partent aussi.

**Ajoutées** :

- `proximity(artist_mbid, neighbour_mbid, score, rank)` : les voisins
  ListenBrainz de chaque artiste relevé, `rank` de 1 à 100 dans l'ordre du
  service. Un voisin absent du dump reste dans la table (il n'a pas de
  fiche) ; un doublon de paire est une violation.
- `influences(artist_mbid, influence_mbid, statement)` : `artist_mbid` cite
  `influence_mbid` comme influence selon Wikidata ; `statement` est
  l'identifiant de la déclaration, pour la citer.

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

Le site n'appelle que ces fonctions, testées ici contre Postgres. Toutes sont
`STABLE`, en SQL, et rendent zéro ligne pour un MBID inconnu.

```sql
-- Fiche (inchangée).
musilogy.artist_card(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, type text, country text,
  begin_area text, y_birth integer, y0 integer, y0_source text, y_end integer,
  y_end_source text, ended boolean, genres jsonb, genre_source text,
  listen_count bigint, user_count bigint)

-- Liens typés (inchangée) ; le site garde les types de groupe.
musilogy.artist_links(artist text) RETURNS TABLE (
  type text, direction text, other_mbid text, other_name text,
  other_disambiguation text, other_y0 integer, y_begin integer, y_end integer)

-- Voisins ListenBrainz, rangés, avec leur côté dans le temps (§3).
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
```

Un voisin ou une influence absents du dump n'apparaissent pas : la fonction
joint `artists`, faute de nom à montrer.

## 5. Exécution

- Le relevé de proximité prend environ 31 heures (111 402 artistes, une
  requête par seconde) : il tourne en service systemd transitoire plafonné
  (`systemd-run --user --unit=musilogy-proximity -p MemoryMax=1G`), et reprend
  le relevé partiel s'il est interrompu.
- La construction reste plafonnée comme avant (`musilogy/CLAUDE.md`).
