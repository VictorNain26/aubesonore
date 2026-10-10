# Similarité et généalogie — dossier de recherche

**Date :** 2026-10-09
**Objet :** fonder sur la recherche et sur nos mesures les deux questions de Musilogy
(`docs/vision.md` §2) : qui sonne comme un artiste, et d'où vient son son, où il est allé, pour
tous les artistes, anciens comme récents, connus comme confidentiels.
**Statut :** dossier d'étude. Il nourrit la vision ; il n'est pas une règle en ligne. Les
fichiers de mesure sont sur le serveur, `~/musilogy-data/study/lineage/`.

Musilogy est une référence factuelle : ce qui y fait foi est ce que les sources (critiques,
encyclopédies, ouvrages, classements des styles) établissent, jamais le goût d'une personne. La
radio, elle, est dans la couleur de Victor ; les deux ne se mélangent pas.

## 1. La question

« Même son » (`same_sound`, #457) montre les voisins de notre co-écoute dont la couleur (styles
Discogs par décennie) atteint 0,35 : 81 % de bons parmi les 8 premiers, sans étranger, sur 61
références. Pour Can (1968), ses 7 proches sont tous de 1965-1973. Deux causes, mesurées :

- **le noyau de décennie** compare les styles décennie par décennie : la couleur de BEAK> (2009)
  vaut 0,20 avec lui et 0,77 sans, celle de Stereolab 0,15 et 0,49, celle de Silver Apples 0,21
  et 0,44 (`why_can.py`) ;
- **la co-écoute d'un artiste ancien et célèbre est son époque** : ses 50 premiers voisins sont
  le canon de 1965-1980, un seul est d'après 1995.

La question n'est donc pas seulement « qui sonne pareil » mais **d'où vient un son, qui le porte,
où il est allé** : sa filiation.

## 2. Comment les experts présentent une filiation

Pages lues le 2026-10-09 (AllMusic, Last.fm, Music-Map, Musicmap, WhoSampled, Wikipédia) ;
Rate Your Music est fermé aux robots (Cloudflare) et n'a pas été lu.

- **AllMusic sépare quatre relations**, rédigées par ses éditeurs (FAQ) : *Similar To* (« sound
  similar, were part of a particular scene, or share a similar style » : surtout des
  contemporains), *Influenced By*, *Followed By* (« research and interviews » ou « strong
  inference »), *Associated With* (membres, collaborations). Pour Can : 27 similaires, 12
  influences, environ 80 suiveurs, qui mêlent héritiers réels et simples clins d'œil (Eurythmics,
  The Cars). La raison de chaque nom est dans la biographie, pas dans la liste.
- **Last.fm et Spotify** montrent une proximité d'écoute sans temps ni raison : les dix premiers
  similaires de Can sur Last.fm sont tous des groupes allemands des années 1970. Glenn McDonald
  (Spotify) dit que la similarité y vient « après la popularité ».
- **Wikipédia** porte la filiation au niveau du genre (infobox : origines stylistiques, formes
  dérivées) et, pour un artiste, dans une section *Legacy* : 33 héritiers nommés pour Can, chacun
  avec un type de preuve (reprise, échantillon, morceau-hommage, déclaration, nom emprunté,
  personnel commun) ; quelques-uns sans preuve. La section *Style* sépare les influences citées
  des comparaisons de critiques.
- **Les livres de référence** (Stubbs, *Future Days* ; Cope, *Krautrocksampler* ; Reynolds,
  *Rip It Up and Start Again*) racontent précurseurs, scène, héritage. Une biographie cite 4 à 8
  héritiers ; les listes exhaustives (30 à 80 noms) ne se lisent pas comme une recommandation.
- **Ce qui justifie un nom chez les critiques**, du plus fort au plus faible : une trace audible
  (échantillon, reprise) ou une influence déclarée ; une filiation de personnes (élève, membre) ;
  une scène commune ; un trait sonore nommé ; une comparaison de critique.
- **Pandora** (Music Genome) justifie par le trait sonore, noté à la main par des analystes ;
  **Musicmap**, **Ishkur** et **Every Noise** sont des cartes de genres, pas d'artistes.

**Ce qu'un expert montrerait pour Can** : 8 à 10 noms, en trois temps — quelques précurseurs
(Velvet Underground, Stockhausen dont Czukay et Schmidt furent élèves, James Brown), quelques
contemporains (Neu!, Faust, Captain Beefheart), quelques héritiers répartis dans le temps (The
Fall, Talk Talk, Stereolab, Radiohead, un groupe récent) —, chacun avec une raison vérifiable.
C'est la structure de l'outil de Lévesque (Polytechnique Montréal, 2020 : inspirations,
collaborations, influences) et celle des livres.

## 3. Ce que dit la recherche

### 3.1 Vérité terrain et accord des juges

- **Ellis et al., ISMIR 2002** ; **Berenzweig et al., *Computer Music Journal* 2004** : contre une
  enquête auprès d'auditeurs, la co-occurrence dans les collections personnelles est « the most
  useful ground truth », devant les listes d'experts AllMusic, les playlists, le texte du web et
  l'audio. Mesuré sur environ 400 artistes populaires et contemporains : rien n'y dit la parenté
  entre époques.
- **Celma, thèse UPF 2008** : le graphe du filtrage collaboratif est assortatif par popularité
  (r = 0,397 ; 0,92 chez Celma et Cano 2008), celui des experts non (−0,002). Un nouveau titre
  est jugé moins bon qu'un titre connu, et « why is as important as what ».
- **Flexer, ISMIR 2014 ; Flexer et al., TISMIR 2021** : l'accord entre juges plafonne. À
  l'intérieur d'un seul genre, ρ = 0,26 entre juges et 0,38 d'un juge avec lui-même à deux
  semaines ; entre genres distincts, 0,73. Une consigne étroite par niveau resserre l'accord.
- **Flexer et al., ISMIR 2012** : les « hubs », artistes présents dans les listes de tous, sont
  jugés moins bons (corrélation −0,56) ; ils se mesurent sur tout le catalogue, sans juge.
- **Thomas et al., SIGIR 2024** : des juges automatiques à κ ≈ 0,5 classent les systèmes comme
  des juges humains (τ de Kendall 0,77 à 0,86), sans donner une précision absolue au point près.
- **Statistique** : rééchantillonner par référence, pas par paire ; comparer deux règles par un
  test de randomisation apparié (Smucker et al., CIKM 2007). 61 références départagent un écart
  de 10 points ; un écart de 5 points en demande 100 à 120.

### 3.2 Influence et filiation

- **Le jeu AllMusic du problème D de l'ICM 2021** (42 770 influences, 5 854 artistes), mesuré
  pour ce dossier avec ses caractéristiques audio : une influence déclarée sonne plus proche
  qu'une paire de même genre et de même décennie (AUC 0,65), et le reste au-delà de 40 ans d'écart
  (0,62). Mais la similarité absolue baisse avec l'écart : un seuil fixe garde 65 % des
  influences d'une même décennie et 37 % de celles à 40 ans et plus. **Un seuil absolu élimine
  mécaniquement le passé.** 98 % des influences vont dans le sens du temps. Ce jeu sert à
  mesurer, pas à publier (licence incertaine).
- **Shalit et al., ICML 2013** : la similarité plus l'antériorité ne prédisent presque rien
  (ρ = 0,07, non significatif) ; un modèle d'influence fait 0,15. Les artistes anciens sont plus
  « influents » parce qu'ils ont eu le temps d'avoir des suiveurs : une mesure de filiation se
  ventile par époque. Une date fausse fabrique une fausse influence.
- **Collins, ISMIR 2010** : AllMusic oublie des influences avouées (The Human League pour
  Depeche Mode) ; l'audio seul ne retrouve pas une filiation fine dans une scène.
- **Mauch et al. 2015** : les Beatles n'ont pas lancé la révolution de 1964, ils l'ont amplifiée.
  Être premier et célèbre ne prouve pas une filiation. **Klimek et al. 2019** (Discogs) : un
  nouveau style naît souvent en opposition au style dominant ; le « futur » d'un son n'est pas
  toujours sa continuation.
- **Burkholder, *Journal of Musicology* 2018** : un emprunt se prouve par trois familles
  d'indices, l'analyse (ce qui s'entend), l'histoire (accès, aveu), la fonction ; un aveu seul
  peut être démenti par l'analyse.
- **Échantillons** : MusicBrainz porte environ 32 000 relations « samples » (WhoSampled environ
  600 000 arêtes, sans API ni licence) : précis, rares, surtout hip-hop et électronique.
- **Influences déclarées dans Wikidata (P737)** : 2 426 entités musicales (requête SPARQL du
  2026-09-06) ; trop creux pour être une colonne.

### 3.3 Généalogie des genres

Mesuré le 2026-10-09 (API MusicBrainz, SPARQL Wikidata et DBpedia) :

| Source | Arêtes de filiation | Licence | Défauts |
|---|---|---|---|
| MusicBrainz, 2 212 genres | `subgenre`, `influenced by`, `fusion of` : 81 % des genres ont un parent (échantillon de 1 736) | CC0 | absente de l'API et du dump JSON, présente dans le dump PostgreSQL (7,6 Go) ; pauvre en filiation transversale |
| Wikidata, 6 375 genres | P279 sous-classe 8 014, P737 influencé par 362, P144 basé sur 111 ; P571 date de naissance pour 1 011 des genres MusicBrainz | CC0 | taxonomique : post-punk n'y a qu'un parent, « punk » |
| DBpedia (infobox Wikipédia) | origine stylistique 5 481, dérivé 1 253 | CC BY-SA 4.0 | inflationniste, réciproque à 10 % seulement, un an de retard |
| Musicmap, Ishkur, RYM, AllMusic | riches | tous droits réservés ou fermés | pour mesurer seulement |

- **Le pont existe** : Wikidata relie 754 des 756 styles Discogs (P9219, la quasi-totalité des
  disques) et 2 178 genres MusicBrainz (P8052). Nos styles peuvent donc s'inscrire dans une
  généalogie.
- **Aucune source ne suffit seule** : le lien krautrock → post-punk n'existe que dans DBpedia ;
  MusicBrainz et Wikidata se recoupent à 44 % (imports croisés probables) ; DBpedia et Wikidata à
  15 %.

## 4. Ce que disent nos données

Mesures du 2026-10-09, en local sur la publication `4ade758` (`gap.py`, `pool.py`).

**Sur les 1 572 paires déjà jugées** (« bon » = même son ou parenté, les « inconnu » écartés) :

| Écart des débuts | Toutes les paires | Co-écoute (dans un sens ou l'autre) et couleur sans époque ≥ 0,35 | Couleur sans époque ≥ 0,35, sans co-écoute exigée |
|---|---|---|---|
| 0 à 3 ans | 72 % (457) | 92 % (148), 0 étranger | 81 % (268) |
| 4 à 10 ans | 58 % (442) | 82 % (135), 0 étranger | 69 % (255) |
| 11 à 20 ans | 39 % (163) | 84 % (25), 0 étranger | 51 % (93) |
| 21 ans et plus | 34 % (194) | 70 % (10), 0 étranger | 52 % (99) |

- **Le noyau de décennie ne rend pas la règle plus juste** : quand co-écoute et couleur sans
  époque s'accordent, la justesse tient à travers les époques. Il ne fait qu'exclure les autres
  époques. Les écarts de plus de 20 ans restent peu jugés (10 paires) : à mesurer.
- **La couleur seule ne suffit pas d'une époque à l'autre** (environ 50 %) : l'accord avec la
  co-écoute reste nécessaire.
- **La co-écoute inverse** (les artistes dont le public écoute la référence) : les 18 paires
  jugées qui ne sont qu'inverses sont toutes bonnes sauf une. Sur Can, 631 artistes l'ont parmi
  leurs 50 voisins : Holger Czukay, Michael Rother, La Düsseldorf, Manuel Göttsching, BEAK>,
  Kosmischer Läufer (2013)…

**Sur les 61 références**, la co-écoute dans les deux sens avec la couleur sans époque fait
passer les proches de 530 à 1 304 (après : 127 → 399 ; avant : 143 → 326). **Sur les 354
artistes joués**, elle trouve au moins un précurseur pour 299, un contemporain pour 315, un
héritier pour 268 ; les artistes qui reviennent le plus sont des groupes indé de taille moyenne
(23 artistes joués sur 354 au plus) : pas de canon qui écrase.

**La limite : les petits et les récents.** Part des artistes qui ont au moins un proche « Même
son » aujourd'hui :

| Auditeurs ListenBrainz | Artistes | Avec un proche | Avec des styles Discogs (≥ 3 disques) |
|---|---|---|---|
| 1 000 et plus | 75 807 | 81 % | 86 % |
| 100 à 999 | 203 467 | 38 % | 54 % |
| 20 à 99 | 246 881 | 17 % | 35 % |
| 1 à 19 | 840 622 | 1,3 % | 19 % |
| aucun | 1 613 516 | 0 % | 5 % |

Des artistes apparus depuis 2015, 16 % ont un proche. La co-écoute exige des auditeurs ; les
styles seuls font 40 % de bons chez les artistes sans co-écoute (évaluation du 2026-10-08).

## 5. Ce qui en découle

1. **Deux questions, deux méthodes.** « Qui sonne comme lui ? » se répond par l'écoute filtrée
   par les styles (Berenzweig et al. ; Burke) ; « d'où vient son son, où est-il allé ? » par la
   généalogie des courants et les faits écrits (Musicmap, Wikipédia ; Burkholder). L'écoute dit le
   présent, assortative par popularité et par époque (Celma) : on ne lui demande pas la
   généalogie, et la généalogie ne remplace pas la similarité.
2. **Le temps place un lien, il ne le crée pas** (Shalit ; 98 % des influences vont dans le sens
   du temps). La couleur se compare sans noyau de décennie ; un seuil fixe sur une similarité qui
   baisse avec l'écart élimine le passé.
3. **Une filiation s'affirme quand un fait et une ressemblance s'accordent** (Burkholder) : un fait
   écrit (influence citée, reprise, échantillon, personnes) et des courants qui s'accordent.
4. **Les écoutes complètes, pas l'export** : mesuré le 2026-10-09 (§6), elles portent la
   couverture de la co-écoute de 371 623 à 899 265 artistes. Un artiste sans auditeur se situe
   par la généalogie de ses courants.
5. **Ce que la page montre** (décisions du 2026-10-09) : les artistes similaires les plus
   pertinents d'abord, sans regroupement par époque ni raison affichée, la preuve de chaque lien
   restant dans les données ; la généalogie à part.
6. **Rien n'est montré avant d'être mesuré** sur des sources, une fois, sur une méthode figée.

## 6. Les écoutes complètes (mesuré le 2026-10-09)

Le dump « Spark » de ListenBrainz du 2026-10-01 (226 Go, empreinte publiée vérifiée) porte toutes
les écoutes déjà rapprochées de MusicBrainz : 2 856 452 793 écoutes, 2 484 121 161 rapprochées
d'un artiste (87 %), 96 667 utilisateurs ; réduites à 119 637 055 lignes « utilisateur, artiste,
écoutes » (1,5 Go), contre 33 393 707 dans l'export des statistiques, qui ne garde que les 1 000
artistes les plus écoutés de chaque utilisateur (31 % l'atteignent). Artistes d'au moins 3
auditeurs, le seuil de la co-écoute :

| Auditeurs ListenBrainz | Export | Toutes les écoutes |
|---|---|---|
| 1 à 19 | 5,3 % | 47,6 % |
| 20 à 99 | 45,5 % | 90,1 % |
| 100 à 999 | 69,2 % | 98,3 % |
| 1 000 et plus | 96,9 % | 99,5 % |

Par décennie de début, de 42-58 % à 77-88 % (années 2020 : 41,9 % → 76,7 % ; années 1960 :
51,5 % → 88,4 %). Compter un auditeur à partir de 2 écoutes seulement ramène le total à 697 995
artistes. La co-écoute recalculée sur ces écoutes, même formule, prend 10 h (contre 12 min sur
l'export) : à accélérer avant d'aller en ligne. Sur les 61 références, ses 8 premiers voisins
confirmés par la couleur sans noyau sont bons à 90,5 % parmi les paires déjà jugées, sans
étranger, mais 160 sur 268 n'avaient jamais été jugés : la mesure reste à faire sur la méthode
figée.

Ce qui reste à mesurer : la similarité sur la méthode figée (§2.2 de la vision), la généalogie des
courants source par source, la filiation d'artistes contre les 28 filiations établies
(`documented/`).

## Sources

- Ellis, Whitman, Berenzweig, Lawrence, « The Quest for Ground Truth in Musical Artist
  Similarity », ISMIR 2002 : https://ismir2002.ismir.net/proceedings/02-FP05-4.pdf
- Berenzweig, Logan, Ellis, Whitman, « A Large-Scale Evaluation of Acoustic and Subjective
  Music-Similarity Measures », *Computer Music Journal* 28(2), 2004 :
  https://www.ee.columbia.edu/~dpwe/pubs/BerenLEW04-museval.pdf
- Celma, « Music Recommendation and Discovery in the Long Tail », thèse UPF 2008 :
  https://mtg.upf.edu/static/media/PhD_ocelma.pdf ; Celma et Cano, « From hits to niches? »,
  2008 : https://mtg.upf.edu/files/publications/Celma-ACM-Netflix-KDD2008.pdf
- Flexer, « On inter-rater agreement in audio music similarity », ISMIR 2014 :
  https://archives.ismir.net/ismir2014/paper/000256.pdf ; Flexer, Lallai, Rašl, TISMIR 4, 2021 :
  https://transactions.ismir.net/articles/107 ; Flexer, Schnitzer, Schlüter, ISMIR 2012 :
  https://archives.ismir.net/ismir2012/paper/000175.pdf
- Thomas et al., « Large Language Models can Accurately Predict Searcher Preferences », SIGIR
  2024 : https://arxiv.org/pdf/2309.10621 ; Smucker, Allan, Carterette, CIKM 2007 :
  https://ciir-publications.cs.umass.edu/getpdf.php?id=744
- Shalit, Weinshall, Chechik, « Modeling Musical Influence with Topic Models », ICML 2013 :
  http://proceedings.mlr.press/v28/shalit13.pdf
- Collins, « Computational Analysis of Musical Influence », ISMIR 2010 :
  https://zenodo.org/api/records/1416756/files/Collins10.pdf/content
- Mauch, MacCallum, Levy, Leroi, « The evolution of popular music: USA 1960–2010 », 2015 :
  https://arxiv.org/abs/1502.05417 ; Klimek, Kreuzbauer, Thurner, *J. R. Soc. Interface* 2019 :
  https://arxiv.org/abs/1901.03114
- Burkholder, « Musical Borrowing or Curious Coincidence? Testing the Evidence », *Journal of
  Musicology* 35(2), 2018
- Bryan et Wang, « Musical Influence Network Analysis and Rank of Sample-Based Music », ISMIR
  2011 : https://archives.ismir.net/ismir2011/paper/000017.pdf ; MusicBrainz, statistiques des
  relations : https://musicbrainz.org/statistics/relationships
- Figueiredo et Andrade, « Quantifying Disruptive Influence in the AllMusic Guide », ISMIR 2019
- Afchar et al., « Explainability in Music Recommender Systems », *AI Magazine* 2022 :
  https://arxiv.org/abs/2201.10528
- Lévesque, *Lignes du temps connectées…*, mémoire, Polytechnique Montréal, 2020 :
  https://publications.polymtl.ca/5333
- AllMusic, FAQ et pages Can, Joy Division, Vanishing Twin : https://www.allmusic.com/faq
- MusicBrainz, relations entre genres : https://musicbrainz.org/relationships/genre-genre ; API :
  https://musicbrainz.org/doc/MusicBrainz_API ; licences :
  https://wiki.musicbrainz.org/About/Data_License
- Wikidata, licence : https://www.wikidata.org/wiki/Wikidata:Licensing ; propriétés P279, P737,
  P144, P571, P8052, P9219
- DBpedia, Krautrock : https://dbpedia.org/page/Krautrock
- Musicmap : https://musicmap.info ; Every Noise at Once :
  https://en.wikipedia.org/wiki/Every_Noise_at_Once
- Wikipédia, Can et Krautrock : https://en.wikipedia.org/wiki/Can_(band),
  https://en.wikipedia.org/wiki/Krautrock
