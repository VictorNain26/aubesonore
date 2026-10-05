# AubeSonore — vision produit et architecture

Révisée le 2026-10-05. Ce document fixe une direction pour ce qui traverse les pièces : les
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
| **Découvrir** | « Où aller ensuite ? » | la même page ; la recherche pour y entrer par un nom | ses proches, ses groupes et ceux de ses membres, ses influences |

Les gestes se bouclent : le titre en cours mène à sa page, et chaque artiste cité sur une page
mène à la sienne. Avoir été joué ajoute des sections à une page (vos titres gardés), pas une autre
page. Une section n'apparaît que si elle a quelque chose à montrer, et chaque page garde le lecteur
du direct.

### 1.2 Ce que les produits ne sont pas

- **Pas un service à la demande.** On écoute le direct ; pour un titre précis, le site mène à une
  plateforme par un lien réel, jamais par une recherche déguisée.
- **Pas une affirmation sans preuve.** Une proximité calculée ne se présente pas comme une
  influence ; une absence reste une absence.
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

### 2.1 La promesse

Partir d'un artiste qu'on connaît, ou qu'on vient d'entendre, et trouver d'autres artistes qu'on
aimera, en comprenant pourquoi ils sont là : ils sont écoutés par le même public, ils venaient
avant lui ou après lui, il les cite, ses membres y ont joué. Chaque nom se suit : on apprend en
marchant d'un artiste à l'autre.

### 2.2 Ce que chaque information apporte

Une information a sa place sur la page si elle répond à une question d'auditeur et si elle mène à
de la musique. Elle se dit avec le niveau de preuve qu'elle a : une mesure se présente comme une
mesure, une déclaration comme une déclaration.

| Information | Question de l'auditeur | Source | Ce qui lui donne du sens | État |
|---|---|---|---|---|
| **Les proches**, rangés dans le temps | « Qui écouter ensuite ? » | ListenBrainz : les artistes que les mêmes auditeurs écoutent (co-écoute) | le signal le plus direct de découverte : de vrais auditeurs, pas un algorithme de recommandation ; les dates MusicBrainz disent qui venait avant, en même temps, après. 15 des 16 artistes joués échantillonnés ont 100 voisins (2026-10-04) | relevé en cours |
| **Groupes et projets** | « Où sont allés ses membres ? » | MusicBrainz : appartenances, pseudonymes, changements de nom | des faits déclarés, et le chemin de découverte le plus sûr : de Stereolab à McCarthy, Monade, Cavern of Anti-Matter ; de The Notwist à Lali Puna, 13 & God. 129 des 161 groupes joués ont au moins un projet de membre qui a un disque, médiane 5 (2026-10-05) | à faire (§7) |
| **Influences** | « Qui l'a inspiré ? » | Wikidata (P737) : une déclaration, jamais une déduction | rare mais forte : 61 des 288 artistes joués en ont (2026-10-04) | en ligne |
| **Albums et EP** | « Qu'a-t-il sorti, par où commencer ? » | MusicBrainz | l'œuvre, dans l'ordre, sans le bruit du catalogue (§2.4) | publiés, pas encore sur la page |
| **Écouter ailleurs** | « Où l'écouter en entier ? » | les liens que MusicBrainz déclare | passer de la découverte à l'écoute | en ligne |
| **Ce qui sonne pareil** | « Qui a le même son, même inconnu ? » | empreinte sonore d'extraits Deezer | le seul signal qui atteint des artistes que personne n'écoute ensemble ; coûteux (plusieurs jours de calcul), et borné aux artistes dont l'identifiant Deezer est connu (45 % des artistes à 500 auditeurs ou plus) | à décider (§7) |

La co-écoute ne dit pas qui a inspiré qui : le temps lui donne un sens (avant, pendant, après), et
une influence déclarée, quand elle existe, prime sur elle et se voit. Un classement est un calcul
nommé et documenté, jamais un jugement.

**La popularité ne s'affiche pas.** Le nombre d'auditeurs ListenBrainz sert à deux choses
techniques : classer la recherche (« The Beatles » de Liverpool avant le groupe doo-wop de
Philadelphie) et borner les relevés longs, que les limites des API (une requête par seconde)
rendent impossibles sur les 2,98 millions d'artistes. Il ne choisit pas ce qu'une page montre.

### 2.3 La carte et le texte

- **La carte** : le temps de gauche à droite, l'artiste au centre sur ses années d'activité, ses
  proches posés à leur année de début, d'autant plus près qu'ils sont proches ; les influences et
  les liens de groupe par-dessus. Un clic recentre. Sa valeur se juge une fois les proches en
  ligne : si le texte suffit à découvrir, elle se simplifie.
- **Le texte** : la même chose en phrases et en listes. C'est ce que lisent les lecteurs d'écran
  et les moteurs de recherche, et ce qui doit suffire seul.
- **Indexée quand elle est riche** : une page est proposée aux moteurs de recherche au-delà d'un
  seuil de contenu à mesurer ; en deçà, elle existe mais n'est pas listée.

### 2.4 La page

Un ordre de départ, chaque section seulement quand elle a quelque chose à montrer :

1. **Qui** : le portrait, le nom, une ligne de faits, l'ouverture de Wikipédia ou, sans article,
   les faits dits en une phrase.
2. **Écouter ailleurs** : Deezer, Spotify, Bandcamp, site officiel…
3. **Albums et EP**, avec pochette et année, du plus ancien au plus récent : ce que l'artiste a
   voulu sortir. Les albums (studio, bandes originales qu'il a composées, remix) et les EP ; pas
   les singles, compilations, lives, démos ni bootlegs, qui noient l'œuvre dans le catalogue. Une
   longue liste d'EP se replie. Ce qui définit précisément un disque gardé est une règle de
   musilogy (`musilogy/README.md`, `22_releases`), mesurée sur les artistes joués : elle s'ajuste
   quand un cas réel la contredit. Le 2026-10-05, Protomartyr, Bloc Party ou Can gardent leur
   discographie entière, les Beatles s'arrêtent en 1970.
4. **Vos titres gardés**, pour un auditeur connecté qui en a gardé.
5. **Où aller ensuite** : la carte, puis en texte les proches dans le temps, les influences, et
   les groupes et projets en trois rubriques plutôt que les douze types de relation de
   MusicBrainz :
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
visuel « onde » que le site génère. Chaque page a une image, toutes ne sont pas des photos. L'image Wikidata/Commons attend :
chaque image a sa licence et son auteur à créditer à côté d'elle. Les identifiants Deezer peuvent
aussi venir des ISRC des enregistrements du dump, vérifiés comme ceux de l'antenne (§4.4).

### 2.5 Condition préalable

**Licence de la similarité ListenBrainz** : le service (`labs.api.listenbrainz.org`) ne la publie
pas ; MetaBrainz publie ses jeux de données en CC0. À confirmer avant de publier ce qui en dérive.
Le service étant expérimental, musilogy en fait des relevés datés, stockés chez nous ; le site ne
l'appelle jamais à chaud.

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
7. **Les données déclarées d'abord, les heuristiques assumées.** Une règle s'appuie de préférence
   sur ce que des humains ont déclaré (types et statuts MusicBrainz, natures Wikidata). Une
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
| `musilogy/` | ce qui se sait d'un artiste, hors ligne | ses tables, produites depuis des sources épinglées et datées, et le schéma `musilogy` de la base du site, qu'il remplace en bloc à chaque `musilogy load` | dumps MusicBrainz, relevés MusicBrainz, ListenBrainz et Wikidata |

### 4.2 Les flux

```
 Plex ──lecture──► pipeline ──API : fichier + ISRC──► AzuraCast ──flux MP3──► auditeur
                       ▲                                   │
         votes de Victor (page privée)       now-playing (ISRC compris), historique
                                                           ▼
 dumps et relevés                                        site ◄──── auditeur
 MusicBrainz, ListenBrainz, ──► musilogy ──musilogy load──► schéma `musilogy` (base du site)
 Wikidata
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
| proches, influences, groupes et projets | musilogy, datés de leurs relevés | reproductibles, avec leur provenance |

Un artiste plus récent que le dump épinglé n'a pas de faits jusqu'au suivant (§7, étape 9).

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

1. **Les bootlegs sont encore sur la page** : 409 des 4 526 disques des artistes joués
   (2026-10-05), en attendant la fin du relevé du statut officiel.
2. **Les proches ne sont pas encore en ligne** : la carte ne s'affiche pas tant que le relevé n'est
   pas chargé.
3. **Les pages d'artistes jamais joués ne sont pas indexées** : `/artiste/<mbid>`, `noindex`
   jusqu'au seuil d'indexation (étape 7.5).
4. **Identité incomplète** : 39 des 332 artistes joués n'ont pas de MBID ; 22 des 91 titres gardés
   ne retrouvent ni leur passage ni leur titre exact chez Deezer.
5. **Les featurings ne relient que l'artiste principal** (§4.4).
6. **Licence de la similarité ListenBrainz** non publiée (§2.5).
7. **Aucune copie hors de la maison** (§4.7).

## 7. Feuille de route

Dans cet ordre, en PR courtes fusionnées une à une. Les étapes 1 à 6 (vision, retraits, identité
par ISRC, page artiste, musilogy refondu, Musilogy en ligne) sont faites ; leur détail est dans
l'historique git.

7. **Un artiste, une page** (écarts 1 et 3) :
   1. musilogy : albums et EP et liens d'écoute — fait (#337, #338) ; le relevé du statut
      officiel MusicBrainz pour retirer les bootlegs (#340, en cours, environ 38 h), puis la règle
      qui s'en sert ; les groupes et projets du §2.4 : `links` réduite aux appartenances, aux
      pseudonymes et aux changements de nom, et une fonction SQL par rubrique ;
   2. le site lit faits et liens d'écoute dans musilogy (#344), le portrait en cascade (#346) —
      fait ;
   3. une seule page, `/artiste/…`, sections dans l'ordre du §2.4 (#347), le fil de découverte
      (#348), une page pour tout MBID et `/musilogy/:mbid` en 301 (#352) — fait ;
   4. le serveur écrit le titre, la description et le canonique de chaque page, répond 404 pour un
      MBID inconnu et `noindex` pour une page par MBID — fait (#352) ;
   5. une fois les proches en ligne : le seuil d'indexation mesuré, un slug pour chaque page qui
      le passe.

   Le rendu React complet côté serveur n'en fait pas partie : Google rend le JavaScript. Il se
   décide sur une mesure (pages indexées sans leur contenu, inspection d'URL de la Search Console).
8. **Les proches en ligne** (écart 2) : la PR de la proximité attend la fin de son relevé, puis la
   carte se juge à l'usage (§2.3).
9. **Les données à jour** : un dump MusicBrainz plus récent et les relevés rapides refaits
   régulièrement par un timer (dump, relevés, invariants, publication, chargement) ; les relevés
   longs avancent en incrémental, sur les nouveaux artistes. La référence des tests reste figée.
10. **À décider sur mesure**, une fois les proches en ligne :
    - **ce qui sonne pareil** : l'empreinte sonore d'extraits Deezer, plusieurs jours de calcul ;
      utile si les proches laissent sans voisins des artistes qu'on veut faire découvrir, à mesurer
      sur les artistes joués ;
    - **les liens d'œuvre** (écart 5) : featurings, remixes, producteurs, tirés du dump
      MusicBrainz.

En parallèle : la copie hors site dès qu'un compte de stockage existe.
