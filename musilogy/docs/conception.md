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

Les dix tables, ce que chacune porte et le fichier qui la construit, sont dans
le README (« Les dix tables ») ; les règles qui les produisent, dans le README
(« Les règles ») et dans ce code ; leurs invariants, dans `90_invariants.sql`.

## 3. Les voisins : trois onglets

Chaque onglet répond à une question, avec une source et une méthode, et aucun ne
filtre un autre ; ce que chaque onglet veut dire pour l'auditeur est dans
`docs/vision.md` §2.2. Chacun est la méthode publiée la plus simple qui réponde à
sa définition, sans couche maison ni seuil réglé sur des verdicts :

1. **Même son** (`same_sound`, `samesound.py`) : le filtrage par contenu. La
   couleur d'un artiste est son profil de styles Discogs pondérés par leur part
   dans l'œuvre et leur rareté (TF-IDF), comparé par cosinus à celui de **tous**
   les artistes qui en ont un, rabattu pour un profil mince (le lissage
   c / (c + h) de Bell et Koren, 2007, sur ses disques datés). Chaque voisin
   porte sa raison (`term`), le style qui pèse le plus dans ce que les deux
   partagent.
2. **Écoutés ensemble** (`colisten`, `colisten.py`) : le filtrage collaboratif
   « article à article », la méthode des « ceux qui aiment X aiment aussi Y »
   (Sarwar et al., WWW 2001 ; Linden, Smith et York, *IEEE Internet Computing*,
   2003). Deux artistes se comparent par leurs auditeurs communs, avec le cosinus
   asymétrique d'Aiolli (RecSys 2013, la méthode gagnante du *Million Song
   Dataset Challenge*), qui corrige la popularité, et le même lissage, sur toutes
   les écoutes ListenBrainz épinglées. La co-occurrence d'écoute est la source la
   plus proche du jugement humain de similarité (Berenzweig et al., 2004). C'est
   le public, pas le son : aucune couleur ne le filtre. La règle a été mesurée le
   2026-10-07 contre le service de ListenBrainz (commit 57bcd8d3 de
   `docs/vision.md`).
3. **Filiation** : des faits, sans score. Les appartenances et les autres noms
   de MusicBrainz (`links`), et les artistes crédités avec lui sur ses disques
   (`credits`, `86_credits.sql`), dans MusicBrainz et Discogs.

Les règles, leurs paramètres et leurs invariants sont dans le code cité ; le
manifeste relit les paramètres (`parameters`). Ce que livre un onglet se mesure
par sa couverture (`docs/vision.md` §2.2, « La mesure »), relevée dans la PR qui
change sa règle.

La généalogie (`docs/vision.md` §2.3) est une autre question, avec ses propres
preuves (liens entre genres, faits écrits) ; elle ne passe pas par ces onglets.

## 4. Contrat avec le site

Le site n'appelle que ces fonctions. Toutes sont `STABLE`, en SQL, et rendent
zéro ligne pour un MBID inconnu. Chacune passe en production au premier
`musilogy load` qui suit sa fusion ; d'ici là, le site la traite comme absente
(code `42883`). Leurs signatures et leur ordre de tri sont dans
`src/musilogy/pg/90_artist.sql` et `src/musilogy/pg/90_search.sql`, chacune
commentée ; `tests/test_artist.py`, `test_same_sound.py`, `test_colisten.py` et
`test_credits.py` vérifient contre Postgres les signatures que le site lit.

- `artist_homonym_rank(artists)` : le rang de chaque artiste parmi ceux de son
  nom exact, les plus écoutés d'abord ; le site en tire l'adresse d'une page
  (`docs/vision.md` §5).
- `artist_card(artist)` : la fiche — identité, dates et leur provenance, lieu,
  styles Discogs, écoutes.
- `artist_same_sound(artist)` : l'onglet « Même son », chaque voisin avec sa
  raison.
- `artist_colisten(artist)` : l'onglet « Écoutés ensemble ».
- `artist_credits(artist)` : les crédités ensemble de la filiation, le plus de
  disques communs d'abord.
- `artist_bands(artist)` : les membres d'un groupe ou les groupes d'une
  personne (`docs/vision.md` §2.4).
- `artist_member_projects(artist)` : les autres groupes et noms des membres
  d'un groupe, ceux qui ont un disque, avec les membres qui y mènent.
- `artist_other_names(artist)` : pseudonymes, personne derrière un nom de
  scène, changements de nom.
- `artist_releases(artist)` : l'œuvre que la page montre (`docs/vision.md`
  §2.4).
- `artist_urls(artist)` : les pages encore à l'artiste.
- `search_artists(query, page_size)` : la recherche par préfixe du nom, les plus
  écoutés d'abord ; elle normalise la requête par `musilogy.name_key(text)`, que
  le site n'a pas à appeler, et lit la projection `search` créée au chargement
  (README, « Chargement dans le site »).

`artist_homonym_rank` classe les six Nirvana en 191 ms (production, 2026-10-12), par
la projection `search`, indexée sur `name_key`.

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
