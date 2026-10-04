# Last.fm `getSimilar` : garder `autocorrect=1`

Date : 2026-10-04
Méthode : pour chacun des 790 artistes de la bibliothèque rapprochés de Deezer, `artist.getSimilar`
(limite 100) avec `autocorrect=1` puis `autocorrect=0`, croisé avec Deezer `related` comme le fait
`radio discover` (voisins = intersection sur le nom normalisé, moins la bibliothèque). Lecture
seule, clé Last.fm jamais affichée.

## Question

Le client envoie `autocorrect=1`. La documentation le décrit ainsi : « Transform misspelled artist
names into correct artist names, returning the correct version instead »
(https://www.last.fm/api/show/artist.getSimilar). Les noms viennent de Plex et sont en principe
bien écrits. Or l'autocorrection envoie « Émilie Simon » vers « Emilie Simon », une page sans
artiste similaire (0, contre 5 sans autocorrection). Faut-il la couper ?

## Mesure

| | `autocorrect=1` | `autocorrect=0` |
|---|---|---|
| Voisins, toutes graines possibles | 5 646 | 5 553 |
| Artistes sans aucun voisin | 148 | 156 |
| Artistes qui ont plus de voisins | 10 | 2 |

- L'autocorrection redirige 84 noms : 75 ne changent que la casse, les accents ou « & » (EELS →
  Eels, DEVO → Devo) ; 9 vont vers une autre graphie ou l'artiste principal d'un crédit (CSS →
  Cansei de Ser Sexy, Buggles → The Buggles, « Dr. Dre feat. Hittman » → Dr. Dre).
- Elle gagne pour 10 artistes, dont Diana Ross & The Supremes (18 voisins contre 0),
  « Dr. Dre feat. Hittman » (17 contre 0), Tony Ann (16 contre 0), CSS (13 contre 0).
- Elle perd pour 2 : Émilie Simon (0 contre 12) et Gelli Haha (0 contre 5).

## Décision

Garder `autocorrect=1`. Redemander sans autocorrection quand la page corrigée est vide
récupérerait 2 artistes sur 790 (17 voisins, 0,3 %) au prix d'un second appel et d'un mécanisme
de plus : il ne prouve pas son utilité (`docs/vision.md` §2).
