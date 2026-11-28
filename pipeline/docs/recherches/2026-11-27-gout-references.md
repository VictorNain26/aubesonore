# Le modèle de goût face à des références simples — mesures du 2026-11-27

Question de la phase 5 de la remise à plat : la régression logistique sur l'empreinte fait-elle
mieux que des méthodes sans entraînement, et que coûte l'absence de votes depuis le 22 novembre ?

## Protocole

- **Données** : la sauvegarde du 2026-11-27 à 04:30 (base en version 18), copiée et ouverte en
  lecture seule sur le serveur. Script : `2026-11-27-gout-references.py`, lancé avec le `.venv` de
  production sous `systemd-run` (3 Go, 2 cœurs), et les réglages de `config/editorial.toml`
  (C = 0,1, négatifs faibles à 0,1).
- **Juge** : les 160 votes d'examen (89 « oui »), tirés uniformément dans les fournées et jamais
  appris, comme pour la promotion (`conception.md` §4). Toutes les méthodes sont notées sur les
  mêmes titres.
- **Incertitude** : intervalle à 95 % par bootstrap (2 000 tirages) ; pour les écarts, bootstrap
  apparié sur les votes d'examen.
- **Exemples d'entraînement** : 12 826 titres de la bibliothèque, 2 551 négatifs faibles, 198 votes
  de leçon (118 « oui », 80 « non »).

## Résultats

| Méthode | AUC d'examen | Écart à la méthode en service [IC 95 %] |
|---|---|---|
| **En service** : régression, bibliothèque + négatifs faibles + leçon | **0,773** [0,700 ; 0,841] | — |
| Régression sans aucun vote | 0,762 | −0,010 [−0,043 ; +0,023] |
| Régression sans négatifs faibles | 0,755 | −0,018 [−0,058 ; +0,016] |
| Régression sur les seuls votes de leçon | 0,750 | −0,023 [−0,070 ; +0,026] |
| Centre de la bibliothèque (cosinus, poids d'écoute) | 0,596 | −0,177 [−0,267 ; −0,087] |
| Centre de la bibliothèque moins centre des négatifs | 0,734 | −0,039 [−0,091 ; +0,012] |
| Plus proche voisin de la bibliothèque | 0,481 | −0,292 [−0,407 ; −0,167] |
| 10 et 50 plus proches voisins | 0,484 et 0,491 | −0,29 et −0,28 |

Par famille (examen de 45 à 59 votes : écarts non significatifs à cette taille) :

| Méthode | Découvertes (56) | Nouveautés (45) | Banc du 2026-09-24 (59) |
|---|---|---|---|
| En service | 0,790 | 0,721 | 0,805 |
| Sans aucun vote | 0,785 | 0,767 | 0,760 |
| Centre moins négatifs | 0,736 | 0,779 | 0,713 |
| Plus proche voisin | 0,374 | 0,557 | 0,524 |

**Apport des votes de leçon** (20 tirages par part) : 0 vote 0,762 ; 50 votes 0,768 ; 99 votes
0,771 ; 148 votes 0,773 ; 198 votes 0,773. La courbe est plate après une cinquantaine de votes.

**Régularisation** (lue sur l'examen, donc optimiste) : C = 0,01 : 0,764 ; 0,03 : 0,768 ;
0,1 : 0,773 ; 0,3 et 1 : 0,778. L'écart est sous le bruit.

**Examen par mois** (méthode en service) : septembre 0,808 (60 votes, le banc, tiré en strates sur
toute l'échelle des notes, donc plus facile) ; octobre 0,704 (60) ; novembre 0,722 (40).

**Favoris Hype Machine** (495) contre les découvertes non votées de la dernière fournée (645) :
0,604 pour la méthode en service, 0,51 à 0,57 pour les références. Le tout-venant contient des
titres que Victor aimerait : c'est une borne basse, pas une AUC d'examen.

## Ce qu'on en tire

1. **Le modèle en service vaut mieux que les références simples.** Le centre de la bibliothèque perd
   0,18, et les plus proches voisins sont au niveau du hasard, voire en dessous pour les
   découvertes (0,37). Ce résultat confirme la mesure de septembre (kNN 0,67 sur le banc, piste
   écartée). La découverte choisit des voisins d'artistes de la bibliothèque : ce qui ressemble le
   plus à un titre connu n'est pas ce que Victor préfère. Ce n'est qu'une hypothèse, que ces
   mesures ne testent pas.
2. **Les négatifs faibles et les votes de leçon apportent chacun 0,01 à 0,02, sans que ce soit
   significatif.** L'empreinte et la bibliothèque portent l'essentiel du signal. L'arrêt des votes
   depuis le 22 novembre ne dégrade donc presque pas le modèle : sans aucun vote, il perd 0,010.
3. **Les votes servent d'abord à juger.** Sur les 160 votes d'examen, l'intervalle de l'AUC est
   [0,70 ; 0,84], soit ±0,07 ; sur les 60 de la fenêtre de promotion, il est plus large encore
   (non mesuré ici, la largeur croît comme 1/√n, donc vers ±0,11). Un nouveau
   modèle est comparé à l'ancien sur les mêmes votes, ce qui resserre l'écart (±0,03 à ±0,05
   ci-dessus). Le jugement du modèle et des sources dépend donc de la régularité des votes
   d'examen, bien plus que l'entraînement ne dépend des leçons.
4. **Rien ne justifie de changer le modèle ni ses réglages.** Les variantes qui font mieux sur une
   famille (sans vote pour les nouveautés, C = 0,3) restent dans le bruit, et elles ont été lues
   sur le juge lui-même.

## Décision

Décision de Victor le 2026-11-28 :
- le modèle et ses réglages ne changent pas ;
- les 20 votes de la semaine passent de 10 d'examen et 10 de leçon à 15 et 5
  (`config/editorial.toml`, `[votes]`). L'examen juge plus vite le modèle et les sources, et la
  leçon garde un peu d'apprentissage près de la coupure.

À la prochaine étude, la fenêtre de promotion (`fenetre_examen`, 60 votes) couvrira 4 semaines au
lieu de 6.
