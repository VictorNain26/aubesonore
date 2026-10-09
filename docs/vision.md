# AubeSonore — vision produit et architecture

Révisée le 2026-10-09 : Musilogy sert à découvrir des artistes du même son, de toutes les époques (§2). Ce document fixe une direction pour ce qui traverse les pièces : les
produits, qui possède quoi, comment les pièces se parlent. Chaque pièce garde sa conception propre
(`pipeline/docs/vision.md`, `site/CLAUDE.md`, `azuracast/RUNBOOK.md`, `musilogy/docs/conception.md`)
et ne doit pas le contredire. C'est une direction, pas un règlement : une règle se rediscute quand
l'usage ou une mesure la contredit, et quand le système réel contredit ce document, le système a
raison et le document se corrige.

## 1. Une radio, une page par artiste

**AubeSonore** est une webradio de découverte dans la couleur de Victor : des titres qu'on ne
connaît pas, qu'il aurait pu choisir. Son goût (Plex) et ses votes (page privée) décident de ce
qui passe ; les auditeurs écoutent, gardent, apprennent qui joue.

**La page artiste** existe pour tout artiste qui a un MBID. Elle répond à deux questions : *qui
est-ce ?* et *où aller ensuite ?* **Musilogy** est la partie « où aller ensuite » de cette page
(§2), et sa porte d'entrée par un nom, la recherche ; ce n'est pas un second type de page. La
radio et les pages se nourrissent : une page amène des auditeurs à l'antenne, l'antenne amène à
ses pages.

**L'objectif du moment est d'attirer des auditeurs.** Au 2026-10-04, la radio n'a pas
d'auditeur régulier : 3 comptes, un seul qui garde des titres. Tout fonctionne donc sans compte ;
le compte personnalise, il ne débloque rien. Les pages artiste, trouvées par un moteur de
recherche, sont le premier moyen d'être découvert.

### 1.1 Le parcours

| Geste | Question | Surface | Ce qui y répond |
|---|---|---|---|
| **Écouter** | « Qu'est-ce qui passe ? » | accueil | le direct, ce qui vient de passer, les plus gardés |
| **Garder** | « Je ne veux pas le perdre » | bibliothèque, compte | aimer, retrouver, être prévenu quand l'artiste repasse |
| **Savoir** | « Qui est-ce ? » | page artiste | portrait, quelques lignes sur lui, où l'écouter, ses albums et EP, vos titres gardés |
| **Découvrir** | « Où aller ensuite ? » | la même page ; la recherche pour y entrer par un nom | des artistes du même son, de toutes les époques, les plus pertinents d'abord ; ses groupes et ceux de ses membres |

Les gestes se bouclent : le titre en cours mène à sa page, et chaque artiste cité sur une page
mène à la sienne. Avoir été joué ajoute des sections à une page (vos titres gardés), pas une autre
page. Une section n'apparaît que si elle a quelque chose à montrer, et chaque page garde le lecteur
du direct.

### 1.2 Ce que les produits ne sont pas

- **Pas un service à la demande.** On écoute le direct ; pour un titre précis, le site mène à une
  plateforme par un lien réel, jamais par une recherche déguisée.
- **Pas une affirmation sans preuve.** Un proche entre sur une preuve mesurée, que les données
  gardent ; une absence reste une absence, et la page ne propose rien plutôt que du bruit.
- **Pas de mécanique à l'écran.** Les pages parlent à des auditeurs, avec leurs mots : pas de
  jargon, pas de nom d'outil ni de base de données, pas de licence. Les sources et leurs licences
  sont créditées dans les Mentions légales ; la provenance reste dans les données. Dire d'où vient
  une information en mots simples reste possible quand ça aide à lui faire confiance (« les
  auditeurs de X écoutent aussi »). Un extrait de Wikipédia renvoie à son article, comme sa licence
  l'exige.
- **Pas une boucle de goût.** Ce que les auditeurs gardent ne nourrit pas l'antenne : la radio est
  dans la couleur de Victor, pas dans celle de son audience.
- **Pas une page pour n'importe quel nom.** Une page existe pour un artiste qui a un MBID, ou que
  l'antenne a joué ; jamais pour un nom tapé dans une adresse ou une API.

## 2. Musilogy : où aller ensuite

### 2.1 Le but

**Faire découvrir des artistes qu'on ne connaît pas**, à partir d'un artiste qu'on aime ou qu'on
vient d'entendre : des artistes qui ont **le même son**, de toutes les époques, les plus
pertinents d'abord. Chaque nom mène à sa page, et de proche en proche on découvre. Le but vaut
pour tous les artistes, anciens comme récents, connus comme confidentiels, et Musilogy cherche à
être **le plus complet possible**.

Musilogy est une référence factuelle : ce qui y fait foi est ce que les données et les sources
qui décrivent la musique établissent (critiques, encyclopédies, classements des styles, écoutes
publiques), jamais un goût, pas même celui de la radio. Là où aucune preuve fiable ne relie un
artiste à un autre, la page ne propose rien plutôt que du bruit.

### 2.2 Les proches : les preuves et la pertinence

**Un artiste devient le proche d'un autre sur preuve.** Trois sortes de preuves sont admises,
chacune seulement une fois mesurée (plus bas) :

| Preuve | Ce qu'elle établit | Source | État |
|---|---|---|---|
| **Le même public et le même courant** | qui écoute l'un écoute l'autre (dans un sens ou dans l'autre), et leurs styles s'accordent, à n'importe quelle époque | notre co-écoute, corrigée de la popularité (`musilogy/docs/conception.md`, `colisten`), sur les écoutes publiques de ListenBrainz (CC0) ; les styles Discogs de leurs disques (environ 600 sous-genres, CC0), sinon leurs genres MusicBrainz | mesurée : 81 % de bons parmi les 8 premiers, sans étranger (2026-10-08, même époque, un seul sens) ; dans les deux sens et entre époques, 70 à 92 % sur les paires déjà jugées (2026-10-09), à confirmer |
| **Un fait écrit** | une influence citée, une reprise, un échantillon, un héritage, dans un article qui le source | Wikipédia (CC BY-SA), retenu quand les courants des deux artistes s'accordent aussi | à construire et à mesurer |
| **Des courants parents** | deux courants dont l'un est né de l'autre (krautrock → post-punk) | Wikidata et MusicBrainz (CC0), infobox Wikipédia (CC BY-SA) ; les styles Discogs y sont reliés par Wikidata (753 sur 756) | relevé d'étude du 2026-10-09 (1 638 liens entre styles) ; à mesurer |

**Ce qui ne prouve rien à lui seul** : le label (mesuré : 26 % de bons), une influence déclarée
sans parenté de son, la popularité, l'époque. Le service des artistes similaires de ListenBrainz
part, remplacé par notre co-écoute.

**La pertinence classe.** Les proches se rangent par la force de leurs preuves : la proximité
d'écoute et de courant, et un fait écrit qui s'y ajoute. Jamais par la popularité, jamais par
l'ancienneté. Le temps n'écarte personne : un héritier de 2015 compte autant qu'un contemporain.
Chaque lien garde dans les données la preuve qui l'a fait entrer ; l'écran ne l'affiche pas.

**La précision d'abord.** Une règle se choisit sur la part de bons parmi les proches qu'elle
montre, artiste de référence par artiste de référence, et sur la borne basse de son intervalle de
confiance, jamais sur une moyenne qui cacherait des erreurs. On ne montre que des proches
confirmés, sans compléter une liste trop courte. Un classement est un calcul nommé et documenté,
jamais un jugement.

**Être complet, pour l'ancien comme pour le récent.** Au 2026-10-09, la part des artistes qui ont
au moins un proche « Même son » baisse avec leur public : 81 % au-delà de 1 000 auditeurs, 38 %
de 100 à 999, 17 % de 20 à 99, 1,3 % en dessous ; et un artiste ancien reste enfermé dans son
époque (Can : 7 proches, tous de 1965-1973). Trois causes, mesurées :

- **les écoutes sont tronquées** : l'export des statistiques ne garde que les 1 000 artistes les
  plus écoutés de chaque utilisateur, plafond qu'atteignent 31 % d'entre eux ; les écoutes
  complètes de ListenBrainz (CC0) lèvent ce plafond ;
- **la couleur se comparait décennie par décennie**, ce qui écartait les autres époques sans
  rendre la règle plus juste ;
- **la co-écoute ne se lisait que dans un sens** : les artistes dont le public écoute Can
  (BEAK>, Kosmischer Läufer…) n'étaient pas comptés.

La couverture se mesure par décennie de début et par tranche d'auditeurs, après chaque
changement. Ce qui reste sans proche une fois toutes les preuves en place se décide sur cette
mesure.

**Une règle n'entre en ligne que mesurée.** Le jeu d'évaluation compte les 61 références de
l'étude du 2026-10-08 (surtout des artistes peu écoutés) et 30 artistes joués tirés par décennie
de début, de 1960 à 2010. Chaque paire est jugée à partir de sources citées : même son, parenté,
lointain, étranger ou inconnu. Une partie des paires est jugée deux fois, pour mesurer l'accord
entre juges, et un audit en refait un échantillon avec de meilleures sources. Pour les 30
artistes joués, leurs précurseurs et héritiers documentés ont été établis d'abord, depuis des
sources (`~/musilogy-data/study/lineage/documented/`), pour mesurer ce que les règles oublient.
Le jeu se juge par référence, avec son intervalle de confiance, par époque et par tranche
d'auditeurs ; une règle qui gagne en moyenne mais perd sur une époque ou sur les artistes peu
écoutés est rejetée. Les clics des auditeurs départagent plus tard deux règles, sans jamais
nourrir les proches, ce qui ferait boucle.

**Ce que la page montre d'autre**, des faits, jamais des proximités :

| Information | Question de l'auditeur | Source | État |
|---|---|---|---|
| **Genres** | « Qu'est-ce que c'est ? » | les styles Discogs par époque, sinon les genres MusicBrainz | à faire (§7) |
| **Groupes et projets** | « Où sont allés ses membres ? » | MusicBrainz : appartenances, pseudonymes, changements de nom ; 129 des 161 groupes joués ont au moins un projet de membre qui a un disque (2026-10-05) | en ligne |
| **Albums et EP** | « Qu'a-t-il sorti, par où commencer ? » | MusicBrainz | en ligne |
| **Écouter ailleurs** | « Où l'écouter en entier ? » | les liens que MusicBrainz déclare | en ligne |

**L'audio**, la couleur du son elle-même, n'est pas une source pour tous : les extraits Deezer
sont exclus par leurs conditions (§2.5), AcousticBrainz est mesuré trop faible (AUC 0,65). Les
fichiers de la bibliothèque Plex sont la seule source légale : une piste pour les artistes de la
bibliothèque, plus tard.

**La popularité ne s'affiche pas.** Le nombre d'auditeurs que donne ListenBrainz (ses propres
écoutes et celles de MLHD+, un historique de Last.fm) sert à deux choses techniques : classer la
recherche (« The Beatles » de Liverpool avant le groupe doo-wop de Philadelphie) et borner les
relevés longs, que les limites des API (une requête par seconde) rendent impossibles sur les 2,98
millions d'artistes. Il ne choisit pas les proches.

Le dossier de recherche qui fonde ces choix : `musilogy/docs/research/2026-10-09-filiation.md`.

### 2.3 La liste des proches

- **Les plus pertinents d'abord**, sans regroupement par époque ni raison affichée : chaque nom
  mène à sa page. Une première série courte, le reste en dépliant ; la forme se décide avec la
  page, essayée sur ordinateur et sur téléphone, et ne range jamais par popularité.
- **Lisible sans la voir** : chaque nom est un lien textuel, que lisent les lecteurs d'écran et
  les moteurs de recherche.
- **Indexée quand elle est riche** : une page est proposée aux moteurs de recherche au-delà d'un
  seuil de contenu ; en deçà, elle existe mais n'est pas listée. La page d'un artiste joué l'est
  toujours. Celle d'un artiste jamais joué l'est quand au moins 10 pages d'artistes joués y
  mènent, qu'elle a un élément Wikidata (le chemin vers son article Wikipédia) et au moins 3
  albums ou EP (`site/apps/backend/src/services/discoveredArtists.ts`). Mesuré le 2026-10-06 : les 398 pages jouées
  mènent à 8 126 artistes jamais joués, 522 depuis au moins 10 pages, environ 490 passent. La
  règle tient la page dans le graphe de la radio : Google traite comme abus les pages assemblées
  en masse depuis d'autres sites, et une masse de pages faibles pèse sur tout le site. Elles ont
  leur propre sitemap, `sitemap-artists-discovered.xml`, pour suivre leur sort dans la Search
  Console avant d'abaisser le seuil.

### 2.4 La page

Un ordre de départ, chaque section seulement quand elle a quelque chose à montrer :

1. **Qui** : le portrait, une ligne de faits au-dessus du nom, le nom, une ligne de genres dessous
   (les styles Discogs par époque, sinon les genres MusicBrainz), l'ouverture de Wikipédia ou, sans
   article, les faits dits en une phrase ; puis où l'écouter ailleurs (Deezer, Spotify, Bandcamp,
   site officiel…), un bouton par plateforme.
2. **Vos titres gardés**, pour un auditeur connecté qui en a gardé, chacun avec l'album d'où il
   vient : ce que la page a de plus personnel, juste sous le haut de page.
3. **Albums et EP**, avec pochette et année, du plus récent au plus ancien : ce que l'artiste a
   voulu sortir. Les albums (studio, bandes originales qu'il a composées, remix) et les EP ; pas
   les singles, compilations, lives, démos ni bootlegs, qui noient l'œuvre dans le catalogue. Une
   longue liste d'EP se replie. Ce qui définit précisément un disque gardé est une règle de
   musilogy (`musilogy/README.md`, `22_releases`), mesurée sur les artistes joués : elle s'ajuste
   quand un cas réel la contredit. Le 2026-10-05, Protomartyr, Bloc Party ou Can gardent leur
   discographie entière, les Beatles s'arrêtent en 1970.
4. **Où aller ensuite** : les proches (§2.3), les plus pertinents d'abord ; puis les groupes et projets en trois rubriques plutôt que
   les douze types de relation de MusicBrainz :
   - **Membres** d'un groupe, ou **Groupes** d'une personne, avec leurs années ;
   - **Projets des membres** : leurs autres groupes et projets solo, seulement ceux qui ont un
     disque, pour que chaque lien mène à de la musique, du plus ancien au plus récent, repliés
     au-delà d'une dizaine ;
   - **Autres noms**, sur une ligne : pseudonymes et changements de nom.

   Les relations qui parlent de la vie plutôt que de la musique (famille, professeur, musicien de
   tournée, groupe hommage) restent hors de la page.

**Le portrait**, puisqu'aucune source ne couvre tous les artistes : la photo Deezer (lien déclaré
dans MusicBrainz pour 96 % des artistes joués, 45 % des artistes à 500 auditeurs ou plus, 8 % de
tous), sinon la pochette du premier album, ou du premier EP (Cover Art Archive : 321 des 336
artistes joués, 199 sur 300 artistes à 500 auditeurs ou plus tirés au hasard, 2026-10-05), sinon le
visuel « onde » que le site génère. Chaque page a une image, toutes ne sont pas des photos. La
photo et les pochettes Deezer posent une question de licence (§2.5). L'image Wikidata/Commons attend :
chaque image a sa licence et son auteur à créditer à côté d'elle. Les identifiants Deezer peuvent
aussi venir des ISRC des enregistrements du dump, vérifiés comme ceux de l'antenne (§4.4).

### 2.5 Les licences

Revue du 2026-10-06, textes lus ce jour-là ; ce n'est pas un avis juridique.

| Source | Pour nous | Ce qui le dit |
|---|---|---|
| dumps MusicBrainz, Discogs, Wikidata | libres (CC0) | data.discogs.com : « made available under the CC0 No Rights Reserved license » |
| écoutes ListenBrainz : export des statistiques, écoutes complètes (notre co-écoute) | libre (CC0) | metabrainz.org/datasets/postgres-dumps : les données ListenBrainz sont publiées en CC0 ; elles remplacent le service des artistes similaires, dont la licence n'était pas affichée |
| Wikipédia (faits écrits, ouverture de l'article) | CC BY-SA | la page renvoie à l'article et les Mentions légales créditent la licence ; on n'en garde que des liens entre artistes, jamais le texte |
| MLHD+ (historiques Last.fm, 583 000 utilisateurs) | exclu | aucune licence affichée (wiki MusicBrainz, 2026-10-09) ; tiré de données Last.fm réservées au non-commercial |
| API Discogs | pas pour ce qui est publié | ses conditions imposent fraîcheur et mention de Discogs : tout ce que la page montre vient des dumps |
| API Deezer | usage privé seulement | developers.deezer.com/termsofuse §IV : « The use of the Content is limited to a strictly private use within a family scope », pas de « data » générée, pas d'association à une marque. Les extraits ne servent donc pas au son publié ; le portrait et les pochettes que le site affiche sont à régulariser par un accord écrit (§IX) ou à remplacer par des images sous licence connue |
| Spotify, Apple, YouTube, SoundCloud | exclus | analyse ou copie du contenu interdites par leurs conditions |
| modèle Discogs-EffNet (pipeline) | non commercial | essentia.upf.edu : CC BY-NC-SA ou BY-NC-ND selon la page ; tient tant qu'AubeSonore n'a aucun revenu |

## 3. Principes communs

1. **Le flux d'abord.** Rien (tâche lourde, déploiement, sauvegarde) ne doit couper l'antenne ;
   AzuraCast est prioritaire sur le CPU, chaque conteneur a un plafond de mémoire.
2. **Rien n'est affirmé sans source.** Une valeur dérivée voyage avec sa provenance, une absence
   reste une absence (`null`, jamais zéro), et le texte du site ne promet rien que le système ne
   fasse.
3. **Identifier, ne pas deviner.** Un titre et un artiste se reconnaissent par un identifiant
   standard (ISRC, MBID, identifiant Deezer) ; le nom ne sert qu'en dernier recours, lié à un
   titre joué (§4.4).
4. **Une donnée, un propriétaire ; un fait, une source** (§4.1, §4.5).
5. **Ne pas réinventer.** Un outil existant, maintenu, vérifié le jour du choix ; le code maison est
   la colle.
6. **Chaque information sert la découverte.** Ce qu'une page montre répond à une question
   d'auditeur et mène à de la musique ; ce qui n'aide pas (rééditions, vie privée, fiches de base
   de données) reste dans les sources, rechargeable. Une fonction qui ne prouve pas son utilité est
   retirée.
7. **Les données déclarées d'abord, les heuristiques assumées.** Une règle sur un fait (une date,
   un type, une appartenance) s'appuie de préférence sur ce que des humains ont déclaré (types et
   statuts MusicBrainz, natures Wikidata). Un proche, lui, ne se déclare pas : il entre sur une
   preuve mesurée (§2.2). Une
   heuristique est permise quand elle est mesurée, documentée et dite comme telle : la popularité
   classe la recherche et borne les relevés, un seuil choisit qui est relevé. Le profil par défaut
   de Lidarr fait les mêmes choix sur MusicBrainz (albums sans type secondaire, statut officiel).
8. **Mesurer avant de décider, et revenir sur une décision quand la mesure change.** Une règle se
   mesure sur les artistes joués, avec des exemples gardés et écartés ; la mesure s'écrit là où la
   décision est prise.
9. **Un seul style**, sobre et doux, en français et en anglais ; aucune interface expliquée par une
   légende.

## 4. Architecture

### 4.1 Les pièces et ce qu'elles possèdent

| Pièce | Rôle | Possède (seule à écrire) | Lit |
|---|---|---|---|
| `azuracast/` | diffuser | l'antenne : médias et leurs métadonnées, playlists, historique de diffusion | — |
| `pipeline/` | choisir ce qui passe | le goût (modèle, votes, candidats) et la bibliothèque d'antenne, qu'il publie par l'API d'AzuraCast avec l'ISRC de chaque titre | Plex (lecture seule), Deezer, Last.fm, Hype Machine, Soulseek |
| `site/` | l'expérience de l'auditeur | comptes, titres gardés, identité des artistes joués, ce que les sources en direct disent d'un artiste (portrait, ouverture de Wikipédia), journal de diffusion | AzuraCast (lecture seule), Deezer, Wikipédia, le schéma `musilogy` |
| `musilogy/` | ce qui se sait d'un artiste, hors ligne | ses tables, produites depuis des sources épinglées et datées, et le schéma `musilogy` de la base du site, qu'il remplace en bloc à chaque `musilogy load` | dumps MusicBrainz et Discogs, relevés MusicBrainz, ListenBrainz et Wikidata |

### 4.2 Les flux

```
 Plex ──lecture──► pipeline ──API : fichier + ISRC──► AzuraCast ──flux MP3──► auditeur
                       ▲                                   │
         votes de Victor (page privée)       now-playing (ISRC compris), historique
                                                           ▼
 dumps et relevés                                        site ◄──── auditeur
 MusicBrainz, Discogs,      ──► musilogy ──musilogy load──► schéma `musilogy` (base du site)
 ListenBrainz, Wikidata
```

### 4.3 Les contrats

| Entre | Contrat | Où il est écrit |
|---|---|---|
| pipeline → AzuraCast | API AzuraCast, dossier `antenne/` ; l'ISRC de chaque titre écrit dans le fichier (trame ID3 `TSRC`), qu'AzuraCast range dans le champ `isrc` du média ; jamais de `PUT /file/{id}`, qui réécrit et supprime les balises | `pipeline/docs/vision.md` §6 et §7.2 |
| site ← AzuraCast | now-playing et historique en lecture, dont `song.isrc` | `site/CLAUDE.md` |
| site ← musilogy | les fonctions SQL de `musilogy/src/musilogy/pg/90_*.sql` : le site n'appelle qu'elles, jamais les tables | `musilogy/docs/conception.md` §4 |
| site ← Deezer, Wikipédia | chacun isolé, autorisé à tomber seul, son dernier résultat gardé en base (§4.6) ; MusicBrainz n'est appelé en direct que pour identifier un titre joué (§4.4) | `site/CLAUDE.md` |

**Couplages interdits** :

- **pipeline ↔ site** : l'antenne ne dépend pas du site, le site ne pilote pas l'antenne ; tout
  passe par AzuraCast, ISRC compris.
- **site → musilogy à l'exécution** : le site lit une copie chargée, jamais le pipeline de
  données ; musilogy peut être en panne, en travaux ou absent sans que le site tombe. Sans copie
  chargée, la page d'un artiste joué garde ce que l'antenne et les sources en direct en savent ;
  celle d'un artiste jamais joué répond qu'elle n'est pas disponible.

### 4.4 L'identité d'un titre et d'un artiste

Le titre se reconnaît par son **ISRC**, l'artiste par son **MBID** (le pivot vers musilogy) et par
son **identifiant Deezer** (portrait, liens d'écoute). Le pipeline connaît l'identifiant Deezer de
chaque titre qu'il publie ; il en tire l'ISRC et l'écrit dans le fichier, où AzuraCast le lit. Le
site résout ensuite, dans cet ordre :

1. **ISRC → MusicBrainz** (`/ws/2/isrc/{isrc}?inc=artist-credits`) : l'artiste crédité qui porte le
   nom joué, sur un enregistrement du titre joué. 32 des 40 titres de l'antenne tirés au hasard y
   sont reconnus (2026-10-04).
2. **ISRC → Deezer** : l'artiste Deezer du titre portant cet ISRC, sous les mêmes conditions.
3. **Le lien Deezer déclaré dans MusicBrainz**, pour compléter l'une des deux identités par l'autre.
4. **Le nom, en dernier recours**, seulement lié à un titre joué et sans homonyme exact.
5. **Rien d'autre.** Un artiste non identifié a sa page avec ce que l'antenne en sait ; l'absence se
   corrige à la source (MusicBrainz), pas par une devinette.

**Un ISRC ne suffit pas seul** : un code peut être déposé sur un autre enregistrement ou crédité à
un autre artiste (en production, le 2026-10-04 : Paul McCartney crédité à Wings, Daniel Avery
déposé sur un titre d'ANNA). Une réponse ISRC n'est retenue que si le titre et l'un des noms
crédités sont ceux joués, une fois normalisés.

Un titre gardé enregistre son ISRC et l'artiste qu'il désigne : c'est ce qui permet à la page de
montrer « vos titres gardés ». Un featuring crédite plusieurs artistes : la page est celle de
l'artiste principal, chaque crédité est relié.

### 4.5 Un fait, une source

| Fait | Source | Pourquoi |
|---|---|---|
| ce que l'antenne a joué | `radio_play` (site) | aucune source externe ne le sait |
| ce que l'auditeur a gardé | `liked_tracks` (site) | idem |
| portrait | Deezer, puis une pochette, puis l'onde (§2.4) | l'image de l'artiste exact quand une source l'a |
| faits (type, lieu, années), liens d'écoute, albums et EP | le dump MusicBrainz, via musilogy | une seule source pour toute page, reproductible |
| ouverture de l'article | Wikipédia (CC BY-SA), via l'identifiant Wikidata du dump | — |
| proches (même public et même courant, faits écrits, courants parents), groupes et projets | musilogy, datés de leurs dumps et relevés | reproductibles, avec leur provenance |

Un artiste plus récent que le dump épinglé n'a pas de faits jusqu'au suivant (§7, étape 3).

### 4.6 Une page artiste qui répond toujours

- **Chaque source tombe seule** : une panne de Deezer ou de Wikipédia vide sa section, jamais la
  page.
- **Le dernier état connu est gardé en base**, pas en mémoire : un redémarrage ou un déploiement ne
  fait pas tout réinterroger, et la page sert le profil connu pendant qu'il se rafraîchit.
- **Jamais de page vide** : l'ouverture de Wikipédia quand l'article existe (FR ou EN : 136 des 149
  artistes joués identifiés, 2026-10-04) ; sinon les faits en une phrase ; sinon le nom et ce que
  l'antenne en a joué.

### 4.7 L'exécution

Une seule machine, partagée avec d'autres services (victorserv, 16 Go). Faute de budget, c'est un
choix assumé, et il impose :

- **des plafonds de mémoire** sur chaque conteneur, `systemd-oomd` sur les tâches de l'utilisateur,
  un chien de garde matériel ;
- **les tâches lourdes plafonnées** (`systemd-run --scope`, `musilogy/CLAUDE.md`) ;
- **le déploiement par fusion sur `master`**, tiré par un timer, jamais pendant la passe
  hebdomadaire ;
- **des sauvegardes sur un disque distinct**, dont les médias de l'antenne (restic, quotidien) ;
- **une surveillance par Gatus**, chaque tâche planifiée envoyant son battement de cœur.

Risques acceptés tant que leur déclencheur ne s'est pas produit :

| Risque | Déclencheur de révision |
|---|---|
| le flux passe par Cloudflare Tunnel, contre ses conditions CDN (audio « disproportionné ») | un avis de Cloudflare, ou le palier P1 de `site/docs/scaling-roadmap.md` |
| aucune copie hors de la maison | dès qu'un stockage gratuit (B2 ou R2, 10 Go) est ouvert |
| une seule machine : si elle tombe, la radio se tait | un budget d'hébergement (≈ 12 € HT/mois au 2026-10-03) |

## 5. Les surfaces

| Surface | Route | Indexée | Geste |
|---|---|---|---|
| Accueil | `/`, `/en` | oui, pré-rendue | Écouter |
| Page artiste | `/artiste/:slug` (`/en/artist/:slug`) ; `/artiste/:mbid` tant que l'artiste n'a pas de slug ; un slug par artiste, jamais réattribué | au-delà d'un seuil de contenu (§2.3), décidé par le serveur | Savoir, Découvrir |
| Musilogy | `/musilogy` (recherche) ; `/musilogy/:mbid/…` renvoie en 301 à la page artiste | non | Découvrir |
| Connexion | `/connexion`, `/en/sign-in` | non | Garder |
| Bibliothèque, compte | panneau et menu de l'en-tête | non | Garder |

## 6. Écarts actuels

1. **Les proches en ligne viennent encore du service ListenBrainz** : 54 % de bons, 80 % de voisins
   plus connus que l'artiste, enfermés dans son époque. « Même son » (81 %) est publié mais pas
   encore lu par le site (#458).
2. **Les petits et les récents ont peu de proches** (§2.2) : des écoutes tronquées, une couleur
   comparée décennie par décennie, une co-écoute lue dans un seul sens.
3. **Statut officiel incomplet** : la page écarte les disques que MusicBrainz ne montre pas
   comme l'œuvre de l'artiste (476 des 4 980 disques des artistes joués, 2026-10-06) ; seuls les
   artistes d'au moins 500 auditeurs sont interrogés.
4. **Les pages d'artistes jamais joués qui passent le seuil restent à leur MBID** :
   `/artiste/<mbid>`, sans slug.
5. **Identité incomplète** : 52 des 397 artistes joués n'ont pas de MBID (2026-10-06) ; la plupart
   n'ont aucun lien vers Deezer dans MusicBrainz, ce qui se corrige à la source. 22 des 91 titres
   gardés ne retrouvent ni leur passage ni leur titre exact chez Deezer.
6. **Les featurings ne relient que l'artiste principal** (§4.4).
7. **Licences à régulariser** : le portrait et les pochettes Deezer (§2.5).
8. **Aucune copie hors de la maison** (§4.7).

## 7. Feuille de route

Dans cet ordre, en PR courtes fusionnées une à une, chacune avec sa mesure. Le site n'a pas
encore de public : chaque PR remplace pour de bon et retire ce qu'elle rend inutile. Les étapes
faites (la vision, l'identité par ISRC, la page artiste, musilogy refondu, la population
complète, Discogs, notre co-écoute, « Même son ») sont dans l'historique git.

1. **« Même son » sur la page** (écart 1) : le site lit `artist_same_sound` (#458), puis le relevé
   du service ListenBrainz et `artist_neighbours` partent (#459).
2. **Les proches de toutes les époques** (écart 2) : la co-écoute dans les deux sens, la couleur
   sans noyau de décennie, le classement par pertinence ; mesurés sur le jeu d'évaluation.
3. **Les données à jour et complètes** : les écoutes complètes de ListenBrainz, lues en flux sur
   le serveur (l'archive de 236 Go n'y tient pas ; seule sa projection est gardée, épinglée par
   son empreinte), et la co-écoute recalculée dessus ; un dump MusicBrainz plus récent, le dump
   Discogs mensuel et les relevés rapides refaits par un timer. La couverture se mesure ensuite
   par décennie et par tranche d'auditeurs (§2.2).
4. **Les faits écrits** : les liens entre artistes que Wikipédia établit, avec leur article,
   mesurés.
5. **Les courants parents** : un relevé daté des liens entre genres (Wikidata, MusicBrainz,
   Wikipédia), épinglé, mesuré source par source.
6. **La liste des proches sur la page** (§2.3), et la ligne de genres (§2.4), essayées dans le
   navigateur sur ordinateur et sur téléphone.
7. **Ce qui reste sans proche**, décidé sur la mesure de l'étape 3.
8. **Un slug pour chaque page qui passe le seuil d'indexation** (écart 4).
9. **À décider sur mesure** : relier plus d'artistes à Discogs par les sorties que MusicBrainz y
   relie (adopté seulement à 99 % de justesse mesurée) ; les liens d'œuvre (featurings, remixes,
   producteurs) ; l'audio pour les artistes de la bibliothèque.

En parallèle : la copie hors site dès qu'un compte de stockage existe.
