# musilogy — conception

La conception en vigueur de musilogy. La feuille de route est `docs/vision.md`
§7, à la racine. Les chiffres cités ici sont descriptifs ; ceux de chaque livraison sont
dans son `manifest.json`.

## Rôle

musilogy produit, hors ligne et depuis des sources épinglées et datées, les
données de **Musilogy** : pour un artiste, ses voisins en trois onglets — le même
son, le même public, la filiation — et son œuvre. `musilogy load` les copie dans
le schéma `musilogy` de la base du site, qui ne lit que des fonctions SQL (§4).

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

**Deux exceptions au SQL, la co-écoute et le même son** (`colisten.py`,
`samesound.py`). Compter, pour chaque paire d'artistes, les auditeurs qu'ils
partagent, ou comparer chaque couleur à toutes les autres, est un produit de
matrices creuses, des milliards de paires qu'une auto-jointure SQL ne tient pas
(chaque module dit sa taille). La lecture, les filtres, la numérotation et les
raisons restent en SQL (DuckDB) ; scipy ne fait que le produit, le score et les
K meilleurs voisins de chaque artiste.

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
  sur toutes les écoutes ListenBrainz épinglées) : « Écoutés ensemble », les K
  meilleurs voisins de chaque artiste assez écouté, rangés de 1 à K par score,
  à égalité par MBID du voisin. La règle a été mesurée le 2026-10-07 contre le
  service de ListenBrainz (commit 57bcd8d3 de `docs/vision.md`). Gardée une fois
  calculée (`paths.colisten_cache`) : dix heures, pour un résultat qui ne dépend
  que des écoutes épinglées et du code de la règle.
- `same_sound(artist_mbid, neighbour_mbid, rank, score, term)` (`samesound.py`) :
  « Même son », les K artistes dont la couleur est la plus proche, rangés par
  score puis MBID du voisin, chacun avec sa raison (`term`), le style qui pèse
  le plus dans ce que les deux partagent.
- `credits(artist_mbid, other_mbid, records)` (`86_credits.sql`) : deux
  artistes crédités ensemble, dans les deux sens, avec le nombre de disques
  qu'ils partagent.

Les invariants de ces tables sont dans `90_invariants.sql`.

## 3. Les voisins : trois onglets

Chaque onglet répond à une question, avec une source et une méthode, et aucun ne
filtre un autre (`docs/vision.md` §2.2). Chacun est la méthode publiée la plus
simple qui réponde à sa définition, sans couche maison ni seuil réglé sur des
verdicts :

1. **Même son** (`same_sound`, `samesound.py`) : le filtrage par contenu. La
   couleur d'un artiste est son profil de styles Discogs pondérés par leur part
   dans l'œuvre et leur rareté (TF-IDF), comparé par cosinus à celui de **tous**
   les artistes qui en ont un, rabattu pour un profil mince (le lissage
   c / (c + h) de Bell et Koren, 2007, sur ses disques datés).
2. **Écoutés ensemble** (`colisten`, `colisten.py`) : le filtrage collaboratif
   « article à article », la méthode des « ceux qui aiment X aiment aussi Y »
   (Sarwar et al., WWW 2001 ; Linden, Smith et York, *IEEE Internet Computing*,
   2003). Deux artistes se comparent par leurs auditeurs communs, avec le cosinus
   asymétrique d'Aiolli (RecSys 2013, la méthode gagnante du *Million Song
   Dataset Challenge*), qui corrige la popularité, et le même lissage. C'est le
   public, pas le son : aucune couleur ne le filtre.
3. **Filiation** : des faits, sans score. Les appartenances et les autres noms
   de MusicBrainz (`links`), et les artistes crédités avec lui sur ses disques
   (`credits`, `86_credits.sql`), dans MusicBrainz et Discogs.

Les règles, leurs paramètres et leurs invariants sont dans le code cité ; le
manifeste relit les paramètres (`parameters`). Il n'y a pas de juges (leur coût
en quota, 2026-10-22) : ce que livre un onglet se mesure par sa couverture, la
part des artistes qui y ont au moins un voisin, relevée dans la PR qui change
sa règle.

La généalogie (`docs/vision.md` §2.3) est une autre question, avec ses propres
preuves (liens entre genres, faits écrits) ; elle ne passe pas par ces onglets.

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

-- Les trois onglets de voisins. Dans les deux premiers, y_end seulement
-- déclaré, jamais l'année d'un dernier album (musilogy.declared_end).
-- « Même son » : dans leur rang, chacun avec sa raison, un style Discogs.
musilogy.artist_same_sound(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, y0 integer, y_end integer,
  ended boolean, rank integer, term text)
-- « Écoutés ensemble » : dans leur rang.
musilogy.artist_colisten(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, y0 integer, y_end integer,
  ended boolean, rank integer)
-- « Filiation », crédités ensemble : le plus de disques communs d'abord, puis
-- par nom ; les appartenances et autres noms sont artist_bands,
-- artist_member_projects et artist_other_names, plus bas.
musilogy.artist_credits(artist text) RETURNS TABLE (
  mbid text, name text, disambiguation text, y0 integer, records integer)

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
