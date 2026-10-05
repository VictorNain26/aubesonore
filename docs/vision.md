# AubeSonore — vision produit et architecture

Refonte du 2026-10-04, révisée le 2026-10-05 (un artiste, une page : §1, §2.4, §4.5, §5, §7 ; le
fil de la refonte : §3, principes 8 à 10 ; affiliations : §2.2, §2.4), à valider par Victor. Elle remplace la version du 2026-10-03, dont le
geste « Explorer » (frise des genres, filiation tirée de MusicBrainz, contemporains par lieu de
début) ne répondait pas à la question posée et reposait sur des données qui ne la remplissaient
pas. Validé, ce document fait autorité sur ce qui traverse les pièces : les produits, qui possède
quoi, comment les pièces se parlent. Chaque pièce garde sa conception propre —
`pipeline/docs/vision.md` (l'antenne), `site/CLAUDE.md` (le site), `azuracast/RUNBOOK.md` (la
diffusion), `musilogy/` (à réécrire, §8) — et ne doit pas le contredire. Quand le système réel le
contredit, le système a raison et ce document se corrige.

## 1. Une radio, une page par artiste

**AubeSonore** est une webradio de découverte dans la couleur de Victor : des titres qu'on ne
connaît pas, qu'il aurait pu choisir. Son goût (Plex) et ses votes (page privée) décident de ce
qui passe ; les auditeurs écoutent, gardent, apprennent qui joue.

**La page artiste** dit, pour n'importe quel artiste qui a un MBID, qui il est, où l'écouter, ce
qu'il a sorti, et d'où vient sa musique : ce qui l'a précédé dans la même veine, ce qui jouait à
côté de lui, ce qui l'a suivi, ce qui sonne comme lui, les liens de ses membres. **Musilogy** est
cette dernière couche (§2) et sa porte d'entrée, la recherche ; ce n'est plus un second type de
page. La radio et les pages se nourrissent : une page amène des auditeurs à l'antenne, l'antenne
amène à ses pages.

**L'objectif du moment est d'attirer des auditeurs.** Au 2026-10-04, la radio n'a pas
d'auditeur régulier : 3 comptes, un seul qui garde des titres (89). Tout doit donc fonctionner
sans compte ; le compte personnalise, il ne débloque rien.

### 1.1 Le parcours

| Geste | Question | Surface | Ce qui y répond |
|---|---|---|---|
| **Écouter** | « Qu'est-ce qui passe ? » | accueil | le direct, ce qui vient de passer, les plus gardés |
| **Garder** | « Je ne veux pas le perdre » | bibliothèque, compte | aimer, retrouver, être prévenu quand l'artiste repasse |
| **Savoir** | « Qui est-ce ? » | page artiste | portrait, ouverture de Wikipédia ou portrait factuel, où l'écouter, albums et EP, vos titres gardés de l'artiste |
| **Comprendre** | « D'où vient cette musique ? » | la même page artiste ; la recherche Musilogy pour y entrer par un nom | la carte : avant, pendant, après, ce qui sonne pareil, influences déclarées, liens de groupe |

Les gestes se bouclent : le titre en cours mène à sa page artiste, et chaque artiste cité sur
une page mène à la sienne. **Un artiste, une page** : une seule page, la même pour un artiste que
l'antenne a joué et pour un autre (2026-10-05) ; avoir été joué y ajoute des sections (vos titres
gardés), pas une autre page. Chaque section n'apparaît que si elle a quelque chose à montrer
(§2.4), et chaque page garde le lecteur du direct.

### 1.2 Ce que les produits ne sont pas

- **Pas un service à la demande.** On écoute le direct ; pour un titre précis, le site mène à
  une plateforme par un lien réel, jamais par une recherche déguisée.
- **Pas une affirmation sans preuve.** Une proximité calculée n'est jamais présentée comme une
  influence (§2.2), une absence reste une absence.
- **Pas de technique à l'écran.** Les pages parlent à des auditeurs : aucune source de données,
  licence ni outil n'y est nommé ou lié (ni ListenBrainz, ni MusicBrainz, ni Wikidata), aucun
  jargon. La distinction entre une proximité et une influence se dit avec des mots d'auditeur.
  Les sources et leurs licences sont créditées dans les Mentions légales, la provenance reste dans
  les données. Seule exception, exigée par sa licence : un extrait de Wikipédia renvoie à son
  article (« Lire la suite sur Wikipédia »).
- **Pas une boucle de goût.** Ce que les auditeurs gardent ne nourrit pas l'antenne : la radio
  est dans la couleur de Victor, pas dans celle de son audience.
- **Pas une page pour n'importe quel nom.** Une page existe pour un artiste qui a un MBID, ou pour
  un artiste que l'antenne a joué ; jamais pour un nom tapé dans une adresse ou une API.

## 2. Musilogy

### 2.1 La promesse

Ouvrir un artiste et voir sa place dans l'histoire : qui faisait déjà cette musique avant lui,
qui la faisait en même temps, qui l'a reprise après ; qui il a cité comme influence ; dans quels
groupes ses membres ont joué. Chaque lien se suit, et la carte se recentre : on apprend en
marchant d'un artiste à l'autre.

### 2.2 Quatre couches, quatre niveaux de preuve

| Couche | Source | Couverture mesurée | Ce que le site en dit |
|---|---|---|---|
| **Proximité × temps** | artistes proches selon ListenBrainz (co-écoute), rangés par leurs dates MusicBrainz | 15 des 16 artistes joués échantillonnés ont 100 voisins, des plus confidentiels (1 045 auditeurs) aux plus connus (2026-10-04) | « avant lui, en même temps, après lui, dans la même veine » — jamais « influencé par » |
| **Influences déclarées** | Wikidata (P737) seulement : une déclaration, jamais une déduction (l'extraction de citations de Wikipédia, qui supposerait un modèle de langage, est retirée le 2026-10-05) | 61 des 288 artistes joués via Wikidata (2026-10-04) | « a cité X comme influence » ; la déclaration reste en base, sans lien à l'écran (§1.2) |
| **Groupes et projets** | appartenances déclarées dans MusicBrainz (membre, fondateur, collaboration), pseudonymes et changements de nom ; rien d'autre (§2.4) | 178 des 329 artistes joués ont au moins un projet de leurs membres qui a un disque, médiane 3, 44 au plus (2026-10-05) ; 74 % des appartenances que Wikidata déclare sont aussi dans MusicBrainz, aucune inversée | « membres », « groupes », « projets des membres », « aussi connu comme » |
| **Couleur du son** | empreinte Discogs-EffNet de quelques extraits Deezer de 30 s par artiste, comme le pipeline le fait déjà pour l'antenne ; voisins les plus proches, styles Discogs | bornée par les artistes dont l'identifiant Deezer est connu : 45 % des 111 402 artistes à 500 auditeurs ou plus par le lien que MusicBrainz déclare (2026-10-05, §2.4) | « sonne comme », jamais « influencé par » ni « dans la même veine » |

La proximité seule ne dit pas qui a inspiré qui ; le temps lui donne un sens (avant, pendant,
après), et l'influence déclarée, quand elle existe, prime sur elle et se voit. La couleur du son
répond à une autre question, « qu'est-ce qui sonne pareil ? » : elle rapproche des artistes que
personne n'écoute ensemble et qu'aucun lien ne relie. Le classement
d'une couche est un calcul nommé, documenté, jamais un jugement.

### 2.3 La carte et le texte

- **La carte** : le temps de gauche à droite, l'artiste au centre sur ses années d'activité ; les
  artistes proches posés à leur année de début, d'autant plus près de l'axe qu'ils sont proches ;
  les influences déclarées et les liens de groupe dessinés par-dessus. Un clic recentre. La
  disposition est fixée par les dates, pas par une simulation de forces : elle reste lisible.
- **Le texte** : sous la carte, la même chose en phrases et en listes (les sources sont créditées
  dans les Mentions légales, §1.2). C'est ce
  que lisent les lecteurs d'écran et les moteurs de recherche.
- **Indexée quand elle est riche** : une page artiste est proposée aux moteurs de recherche
  au-delà d'un seuil de contenu à mesurer ; en deçà, elle existe mais n'est pas listée.

### 2.4 La page

Dans cet ordre, chaque section seulement quand elle a quelque chose à montrer :

1. **Qui** : le portrait, le nom, une ligne de faits, l'ouverture de Wikipédia ou, sans article,
   les faits dits en une phrase.
2. **Écouter ailleurs** : les liens que MusicBrainz déclare (Deezer, Spotify, Bandcamp, site
   officiel…).
3. **Albums et EP**, chacun avec sa pochette et son année : l'œuvre que l'artiste a voulue, dans
   l'ordre où il l'a publiée. Les albums studio, les bandes originales qu'il a composées, les
   albums et EP de remix, et les EP sortis à partir du premier album (un artiste sans album
   encore montre ses EP). Ni single, ni best-of, compilation, live ou démo (types secondaires de
   MusicBrainz), ni bootleg (statut officiel, relevé à venir) ; pour un groupe dont la fin est
   déclarée, rien après elle, sauf ce que Wikidata classe comme album studio ou EP : un posthume
   inédit, pas une archive. Un disque sans date n'est montré que si Wikidata le classe ainsi : chez
   les artistes connus, ce sont des bootlegs. Mesuré le 2026-10-05 sur les 335 artistes joués : Protomartyr, Bloc
   Party ou Can gardent leur discographie entière, les Beatles s'arrêtent en 1970.
4. **Vos titres gardés**, pour un auditeur connecté qui en a gardé.
5. **D'où vient cette musique** : la carte, puis en texte les proches dans le temps, ce qui sonne
   pareil, les influences, et les groupes et projets en trois rubriques au lieu des douze types de
   MusicBrainz :
   - **Membres** d'un groupe, ou **Groupes** d'une personne, avec leurs années (membre, fondateur et
     collaboration sont une seule relation : en faire partie) ;
   - **Projets des membres** : les autres groupes et projets solo des membres, à deux pas, seulement
     ceux qui ont un disque (§2.4 point 3) pour que chaque lien mène à de la musique, du plus ancien
     au plus récent, repliés au-delà d'une dizaine. C'est le chemin de découverte : de Stereolab à
     McCarthy, Monade, Cavern of Anti-Matter ; de The Notwist à Lali Puna, 13 & God ;
   - **Autres noms**, sur une ligne : pseudonymes et changements de nom.

   Ni groupe « issu de » (les membres partagés le disent), ni musicien de tournée, professeur,
   famille, groupe hommage ou relation anecdotique : ils parlent de la vie, pas de l'œuvre.

On entre dans une page par un artiste que l'antenne a joué ou qu'un auditeur a gardé, ou par
n'importe quel artiste choisi dans la recherche ; chaque nom cité mène à la page suivante.

**Le portrait, en cascade**, puisqu'aucune source ne couvre tous les artistes (mesuré le
2026-10-05 sur le dump du 2026-09-09 et Wikidata) :

| Source | Artistes joués (322) | 500 auditeurs ou plus (111 402) | Tous (2,98 M) |
|---|---|---|---|
| lien Deezer déclaré dans MusicBrainz | 96 % | 45 % | 8 % |
| image Wikidata (P18) | 70 % | 32 % | ~4 % |
| pochette d'un album (Cover Art Archive) | à mesurer | à mesurer | à mesurer |

Le portrait Deezer d'abord, l'image Wikidata ensuite (sa licence, propre à chaque image, est à
lire avant de l'afficher), la pochette d'un album enfin, et sinon le visuel « onde » que le site
génère déjà : chaque page a une image, toutes ne sont pas des photos. L'union des sources n'est
pas encore mesurée. Les identifiants Deezer peuvent aussi venir des ISRC des enregistrements du
dump, vérifiés comme ceux de l'antenne (§4.4), au lieu du seul lien déclaré : c'est ce qui élargit
le portrait et la couleur du son au-delà de 45 %.

### 2.5 Conditions préalables

- **Licence de la similarité ListenBrainz** : le service (`labs.api.listenbrainz.org`) ne la
  publie pas sur sa page ; MetaBrainz publie ses jeux de données en CC0. À confirmer avant de
  publier quoi que ce soit qui en dérive.
- **Service expérimental** : musilogy en fait des relevés datés, stockés chez nous comme la
  popularité ; le site ne l'appelle jamais à chaud.

## 3. Principes communs

1. **Le flux d'abord.** Rien — tâche lourde, déploiement, sauvegarde — ne doit couper l'antenne ;
   AzuraCast est prioritaire sur le CPU (`cpu_shares`), et chaque conteneur a un plafond de
   mémoire.
2. **Rien n'est affirmé sans source.** Une valeur dérivée voyage avec sa provenance, une absence
   reste une absence (`null`, jamais zéro), et le texte du site ne promet rien que le système ne
   fasse.
3. **Identifier, ne pas deviner.** Un titre et un artiste se reconnaissent par un identifiant
   standard (ISRC, MBID, identifiant Deezer), jamais par la seule ressemblance d'un nom (§4.4).
4. **Une donnée, un propriétaire ; un fait, une source** (§4.1 et §4.5).
5. **Rien d'inventé.** Un outil existant, maintenu, vérifié le jour du choix ; le code maison est
   la colle. Un mécanisme qui ne prouve pas son utilité est retiré.
6. **Mesurer avant de décider**, et écrire la mesure là où la décision est prise.
7. **Un seul style**, sobre et doux, en français et en anglais ; aucune interface expliquée par
   une légende.
8. **Montrer l'œuvre, pas le catalogue.** Une page dit ce qui aide à comprendre et à découvrir la
   musique d'un artiste, rien de superflu : sa discographie voulue (§2.4), ses projets, où
   l'écouter ; pas les rééditions, la vie privée ni les fiches de bases de données.
9. **Des données déclarées, pas des heuristiques.** Une règle repose sur ce que des humains ont
   déclaré (types et statuts de MusicBrainz, natures de Wikidata), dont on dit la fiabilité ;
   l'algorithme d'un autre projet ou un classement par popularité ne décident pas pour nous. Une
   mesure (la co-écoute, la couleur du son) se présente comme telle, jamais comme un fait déclaré.
   Le profil par défaut de Lidarr fait le même choix sur MusicBrainz (albums sans type secondaire,
   statut officiel).
10. **Garder ce que la page utilise.** musilogy publie ce que les pages montrent ; le reste demeure
    dans les sources, rechargeable. Chaque règle est mesurée sur les artistes joués, avec des
    exemples gardés et écartés, avant d'être figée.

## 4. Architecture

### 4.1 Les pièces et ce qu'elles possèdent

| Pièce | Rôle | Possède (seule à écrire) | Lit |
|---|---|---|---|
| `azuracast/` | diffuser | l'antenne : médias et leurs métadonnées, playlists, historique de diffusion | — |
| `pipeline/` | choisir ce qui passe | le goût (modèle, votes, candidats) et la bibliothèque d'antenne, qu'il publie par l'API d'AzuraCast avec l'ISRC de chaque titre | Plex (lecture seule), Deezer, Last.fm, Hype Machine, Soulseek |
| `site/` | l'expérience de l'auditeur | comptes, titres gardés, identité des artistes joués, ce que les sources en direct disent d'un artiste (portrait, ouverture de Wikipédia), rangé par MBID, journal de diffusion | AzuraCast (lecture seule), Deezer, Wikidata, Wikipédia, le schéma `musilogy` |
| `musilogy/` | ce qui se sait d'un artiste hors ligne | ses tables, produites hors ligne depuis des sources épinglées et datées (faits, liens, albums et EP, proximités, influences, groupes, couleur du son), et le schéma `musilogy` de la base du site, qu'il remplace en bloc à chaque `musilogy load` | dumps MusicBrainz, relevés ListenBrainz (popularité, proximité), Wikidata, extraits Deezer (couleur du son) |

### 4.2 Les flux

```
 Plex ──lecture──► pipeline ──API : fichier + ISRC──► AzuraCast ──flux MP3──► auditeur
                       ▲                                   │
         votes de Victor (page privée)       now-playing (ISRC compris), historique
                                                           ▼
 dumps MusicBrainz,                                      site ◄──── auditeur
 relevés ListenBrainz, ──► musilogy ──musilogy load──► schéma `musilogy` (base du site)
 Wikidata
```

### 4.3 Les contrats

| Entre | Contrat | Où il est écrit |
|---|---|---|
| pipeline → AzuraCast | API AzuraCast, dossier `antenne/` ; l'ISRC de chaque titre écrit dans le fichier en trame ID3 `TSRC`, qu'AzuraCast range dans le champ `isrc` du média ; jamais de `PUT /file/{id}`, qui réécrit et supprime les balises | `pipeline/docs/vision.md` §6 et §7.2 |
| site ← AzuraCast | now-playing et historique en lecture, dont `song.isrc` | `site/CLAUDE.md` |
| site ← musilogy | les fonctions SQL de `musilogy/src/musilogy/pg/90_*.sql` : le site n'appelle qu'elles, jamais les tables ; s'y ajoutent les liens d'un artiste, ses albums et EP, ses voisins par le son | conception de musilogy |
| site ← Deezer, Wikidata, Wikipédia | chacun isolé, autorisé à tomber seul, son dernier résultat gardé en base (§4.6) ; MusicBrainz n'est plus appelé en direct que pour identifier un titre joué (§4.4) | `site/CLAUDE.md` |

**Couplages interdits**, et pourquoi :

- **pipeline ↔ site** : l'antenne ne dépend pas du site, le site ne pilote pas l'antenne ; tout
  passe par AzuraCast, ISRC compris.
- **site → musilogy à l'exécution** : le site lit une copie chargée, jamais le pipeline de
  données ; musilogy peut être en panne, en travaux ou absent sans que le site tombe. Sans copie
  chargée, la page d'un artiste joué garde ce que l'antenne et les sources en direct en savent ;
  celle d'un artiste jamais joué répond qu'elle n'est pas disponible.

### 4.4 L'identité d'un titre et d'un artiste

Le titre se reconnaît par son **ISRC**, l'artiste par son **MBID** (le pivot vers Musilogy) et
par son **identifiant Deezer** (portrait, liens d'écoute). Le pipeline connaît l'identifiant
Deezer de chaque titre qu'il publie ; il en tire l'ISRC et l'écrit dans le fichier, où
AzuraCast le lit. Le site résout
ensuite, dans cet ordre :

1. **ISRC → MusicBrainz** (`/ws/2/isrc/{isrc}?inc=artist-credits`) : l'artiste crédité qui porte
   le nom joué, sur un enregistrement du titre joué. 32 des 40 titres de l'antenne tirés au
   hasard y sont reconnus (2026-10-04).
2. **ISRC → Deezer** : l'artiste Deezer du titre portant cet ISRC, sous les mêmes conditions.
3. **Lien Deezer déclaré dans MusicBrainz**, pour compléter l'une des deux identités par l'autre.
4. **Le nom, en dernier recours**, seulement lié à un titre joué (la recherche Deezer garde
   l'artiste du titre joué dont le nom est le même une fois normalisé, et seulement s'il n'a
   pas d'homonyme exact), puis le lien Deezer que MusicBrainz déclare.
5. **Rien d'autre.** Un artiste non identifié a sa page avec ce que l'antenne en sait, sans faits
   ni Musilogy ; l'absence se corrige à la source (MusicBrainz), pas par une devinette.

**Un ISRC ne suffit pas seul** : un code peut être déposé sur un autre enregistrement ou crédité
à un autre artiste. Mesuré en production le 2026-10-04, avant cette vérification : le titre de
Paul McCartney crédité à Wings, celui de Daniel Avery déposé sur un titre d'ANNA, celui des
Pirouettes rendu par un autre titre Deezer. Une réponse ISRC n'est donc retenue que si le titre
et l'un des noms crédités sont ceux joués, une fois normalisés.

Un titre gardé enregistre son ISRC et l'artiste qu'il désigne, au moment où il est gardé : c'est
ce qui permet à la page artiste de montrer « vos titres gardés ». Un featuring crédite plusieurs
artistes : la page est celle de l'artiste principal, chaque crédité est relié.

### 4.5 Un fait, une source

| Fait | Source | Pourquoi |
|---|---|---|
| ce que l'antenne a joué | `radio_play` (site) | aucune source externe ne le sait |
| ce que l'auditeur a gardé | `liked_tracks` (site) | idem |
| portrait | Deezer, puis Wikidata, puis une pochette (§2.4) | l'image de l'artiste exact, quand une source l'a |
| faits (type, lieu, années), liens d'écoute, albums et EP | le dump MusicBrainz, via musilogy | une seule source pour toute page, reproductible ; un dump plus récent se fait épingler |
| ouverture de l'article | Wikipédia (CC BY-SA), via l'identifiant Wikidata du dump | — |
| proximités, influences, liens de groupe, couleur du son | musilogy, datés de leurs relevés | reproductibles, avec leur provenance |

Jusqu'au 2026-10-05, les faits d'un artiste joué venaient de MusicBrainz en direct et ceux de
Musilogy du dump : deux années pouvaient se contredire sur une même page. Le dump devient la seule
source ; un artiste plus récent que le dump épinglé n'a pas de faits jusqu'au suivant.

### 4.6 Une page artiste qui répond toujours

- **Chaque source tombe seule** : une panne de Deezer, de MusicBrainz ou de Wikipédia vide sa
  section, jamais la page.
- **Le dernier état connu est gardé en base**, pas en mémoire : un redémarrage ou un déploiement
  ne fait pas tout réinterroger, et la page sert le profil connu pendant qu'il se rafraîchit.
- **Jamais de page vide** : l'ouverture de Wikipédia quand l'article existe (FR ou EN : 136 des
  149 artistes joués identifiés, 2026-10-04) ; sinon un portrait factuel en phrases tiré de
  MusicBrainz ; sinon le nom et ce que l'antenne en a joué.

### 4.7 L'exécution

Une seule machine, partagée avec d'autres services (victorserv, 16 Go). Faute de budget, c'est
un choix assumé, pas une étape provisoire, et il impose :

- **des plafonds de mémoire** sur chaque conteneur, `systemd-oomd` sur les tâches de
  l'utilisateur, un chien de garde matériel ;
- **les tâches lourdes plafonnées** (`systemd-run --scope`, `musilogy/CLAUDE.md`) ;
- **le déploiement par fusion sur `master`**, tiré par un timer, jamais pendant la passe
  hebdomadaire ;
- **des sauvegardes sur un disque distinct**, dont les médias de l'antenne (restic, quotidien) ;
- **une surveillance par Gatus**, chaque tâche planifiée envoyant son battement de cœur.

Risques connus, acceptés tant que leur déclencheur ne s'est pas produit :

| Risque | Déclencheur de révision |
|---|---|
| le flux passe par Cloudflare Tunnel, contre ses conditions CDN (audio « disproportionné », conditions du 2026-09-28) | un avis de Cloudflare, ou le palier P1 de `site/docs/scaling-roadmap.md` |
| aucune copie hors de la maison | dès qu'un stockage gratuit (B2 ou R2, 10 Go) est ouvert |
| une seule machine : si elle tombe, la radio se tait | un budget d'hébergement (CX33 + Storage Box ≈ 12 € HT/mois au 2026-10-03) |

## 5. Les surfaces

| Surface | Route | Indexée | Geste |
|---|---|---|---|
| Accueil | `/`, `/en` | oui, pré-rendue | Écouter |
| Page artiste | `/artiste/:slug` (`/en/artist/:slug`) ; `/artiste/:mbid` tant que l'artiste n'a pas de slug ; un slug par artiste, jamais réattribué, donné aux artistes joués et aux pages qui passent le seuil | au-delà d'un seuil de contenu (§2.3), décidé par le serveur | Savoir, Comprendre |
| Musilogy | `/musilogy` (recherche) ; `/musilogy/:mbid/…` renvoie en 301 à la page artiste | non | Comprendre |
| Connexion | `/connexion`, `/en/sign-in` | non | Garder |
| Bibliothèque, compte | panneau et menu de l'en-tête | non | Garder |

`/frieze` disparaît.

## 6. Écarts actuels

Ce qui ne s'emboîte pas encore, mesuré le 2026-10-04 au soir (les écarts du 2026-10-03 sur la
frise, l'identité devinée, les titres gardés non reliés, les caches de la page artiste et les
alertes « artiste aimé » sont résolus par les étapes 2 à 4, dans l'historique git) :

1. **Les proximités ne sont pas encore en ligne** : le relevé ListenBrainz (111 402 artistes)
   avance à ~0,55 artiste par seconde, pannes du service comprises ; tant qu'il n'est pas
   épinglé et chargé, Musilogy dit « pas encore relevées » et la carte ne s'affiche pas.
2. **Licence de la similarité ListenBrainz** : le service n'en publie pas ; les données dont il
   dérive sont en CC0. Le site crédite ListenBrainz sans licence, dans les Mentions légales (§1.2).
3. **Identité incomplète** : 39 des 332 artistes joués n'ont pas de MBID (MusicBrainz ne les
   connaît pas, ou sans lien vérifiable) ; 22 des 91 titres gardés, gardés avant que les
   passages soient enregistrés, ne retrouvent ni leur passage ni leur titre exact chez Deezer.
4. **Les featurings ne relient que l'artiste principal** (§4.4 promet chaque crédité).
5. **Musilogy n'est pas indexé** : pages rendues côté client, `noindex` tant que le seuil de
   richesse n'est pas mesuré (§2.3) ; l'objectif d'attirer des auditeurs n'est donc pas encore
   servi. Le serveur répond 200 et le titre de l'accueil pour toute page Musilogy, même d'un MBID
   inconnu.
6. **Aucune copie hors de la maison** (§4.7).
7. **Deux pages pour un artiste** : la page artiste (artistes joués) et la page Musilogy (les
   autres) ; un artiste jamais joué n'a ni portrait, ni ouverture de Wikipédia, ni liens d'écoute.
8. **Deux sources pour les mêmes faits** : MusicBrainz en direct pour la page artiste, le dump pour
   Musilogy (§4.5).
9. **Ni albums ni EP sur la page** : musilogy les publie selon la règle du §2.4 (#338, en
   production le 2026-10-05), la page ne les montre pas encore (étape 7.2).

## 7. Feuille de route

Dans cet ordre ; chaque étape est une ou plusieurs PR courtes, fusionnées avant la suivante.

1. **Cette vision** — fait (#267).
2. **Retraits** — fait (#268).
3. **Identité exacte** — fait : ISRC écrit par le pipeline (#269, 532 titres rattrapés), résolution
   par ISRC (#270) vérifiée contre le titre et le nom joués (#288, 6 identités réparées), titres
   gardés reliés (#272).
4. **Page artiste** — fait (#275) : profil gardé en base, portrait factuel, titres gardés.
5. **musilogy refondu** — fait pour les retraits (#280), les influences Wikidata et la recherche
   (#286) ; reste la proximité, dont la PR attend la fin du relevé (écart 1).
6. **Musilogy, le produit** — page texte (#281, #289) et carte (#285) en ligne, URL des pages
   artiste par slug (#332).
7. **Un artiste, une page** (écarts 5, 7, 8, 9), en cascade :
   1. musilogy extrait du dump les liens d'un artiste et ses albums et EP — fait (#337), réduit à
      ce que la page utilise et à la règle du §2.4 (#338), chargé en production le 2026-10-05 ;
      reste le relevé du statut officiel MusicBrainz (bootlegs, ~37 h, reprenable, comme la
      proximité), et les affiliations du §2.4 point 5 : `links` réduite aux appartenances, aux
      pseudonymes et aux changements de nom, les deux pas calculés par une fonction SQL ;
   2. le site range le profil par MBID, lit faits et liens dans musilogy (fin des appels
      MusicBrainz en direct pour le profil) et compose le portrait en cascade (§2.4) ;
   3. une seule page, `/artiste/…`, sections dans l'ordre du §2.4 ; `/musilogy/:mbid` en 301 ;
   4. le serveur écrit le titre, la description et le canonique de chaque page, répond 404 pour un
      MBID inconnu et décide du `noindex` (Google peut ne pas rendre une page marquée `noindex`,
      un `noindex` levé par JavaScript ne compte pas) ;
   5. après la proximité : le seuil d'indexation mesuré, un slug pour chaque page qui le passe,
      le `noindex` levé pour elles. Les autres gardent leur adresse par MBID : un registre de
      2,28 M de noms ne servirait qu'à des pages que personne ne trouve par un moteur.

   Le rendu React complet côté serveur n'en fait pas partie : Google rend le JavaScript, et ce
   rendu supposerait que le backend importe le bundle du front. Il se décide sur une mesure (pages
   indexées sans leur contenu, inspection d'URL de la Search Console).
8. **La couleur du son** : un relevé musilogy des empreintes Discogs-EffNet des extraits Deezer
   des artistes à 500 auditeurs ou plus, daté et épinglé comme la proximité ; les identifiants
   Deezer complétés par les ISRC du dump des enregistrements. Plusieurs jours de calcul en tâche
   plafonnée.
9. **Liens d'œuvre** : featurings (écart 4), remixes, producteurs, tirés du dump MusicBrainz.
10. **Les données à jour** : un nouveau dump MusicBrainz deux fois par semaine (MetaBrainz n'en
    garde que deux). La référence reste figée pour les tests ; la production se rafraîchit chaque
    semaine par un timer (dump, relevés rapides, invariants, publication, chargement), et les
    relevés longs (proximité, statut officiel) avancent en incrémental, sur les nouveaux artistes.

En parallèle : la copie hors site dès qu'un compte de stockage existe, le test du disque de
sauvegarde sur un port USB natif.

## 8. Ce qui est remplacé

- La spec de la frise et de la filiation abandonnées (`musilogy/docs/superpowers/specs/`,
  2026-10-02) est remplacée par `musilogy/docs/conception.md` (étape 5) ; son texte reste dans
  l'historique git.
- La version du 2026-10-03 de ce document reste dans l'historique git.
