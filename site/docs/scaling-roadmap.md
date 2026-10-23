# Feuille de route de la montée en charge

Cinq paliers, chacun déclenché par un nombre d'auditeurs concret. Les actions d'un palier attendent que le déclencheur du palier précédent se soit produit : pas de sur-ingénierie.

| Palier             | Pic d'auditeurs | Débit du flux  | Action                                                                                                                                                                                                                                                                                                   | Déclencheur                                                           |
| ------------------ | --------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **P0 Aujourd'hui** | < 10            | < 2 Mbit/s     | Rien. Le polling d'un JSON statique et nginx en statique suffisent largement. Site, API **et flux** passent tous par le Cloudflare Tunnel : les conditions CDN de Cloudflare limitent une part disproportionnée d'audio hors offre Enterprise, un risque accepté à cette taille (`docs/vision.md` §4.7). | —                                                                     |
| **P1 Croissance**  | 50–200          | 6–25 Mbit/s    | Surveiller le processeur, la mémoire et le disque de la machine ; `/health` et la sauvegarde nocturne de la base tournent déjà.                                                                                                                                                                          | Pic > 100 tenu une semaine                                            |
| **P2 Décollage**   | 200–1 000       | 25–128 Mbit/s  | Sortir le flux de Cloudflare : un Tunnel relaie un nom d'hôte entier, aucune règle ne peut donc en exclure `/listen/*` ; le servir depuis un nom d'hôte à lui, en DNS seul, ou par un relais (relais distants d'AzuraCast). Passer sur une machine hébergée si la machine de la maison ne tient plus.    | Pic > 500 tenu un mois, ou un avis de Cloudflare, au premier des deux |
| **P3 Installée**   | 1 000–5 000     | 128–640 Mbit/s | CDN audio dédié (Bunny Stream / relais Icecast). Migrer les caches en mémoire vers Redis (ci-dessous).                                                                                                                                                                                                   | Pic > 2 000 tenu un mois                                              |
| **P4 Succès**      | 5 000+          | > 640 Mbit/s   | Plusieurs régions, réplique de lecture de la base, mise à l'échelle automatique.                                                                                                                                                                                                                         | Pic > 10 000                                                          |

## Quand migrer vers Redis (l'état en mémoire y part)

Dès que **l'un** de ces cas se produit, tout ce qui suit migre dans une seule PR :

- le backend tourne en 2 réplicas ou plus (mise à l'échelle horizontale) ;
- le processeur dépasse durablement 70 % sur l'unique réplica ;
- le taux de succès du cache, mesuré, reste sous 50 % plus de 24 h (les redémarrages sont trop fréquents).

**L'état à migrer** (chacun implémente déjà `CacheStore<V>` de `lib/cache/ttlCache.ts`) :

- chaque `TtlCache` : les appels à `startSweep()` dans `index.ts` les listent ;
- `circuitOpenUntil` (`services/deezerService.ts`) et `nextSlotAt`, la cadence de MusicBrainz (`services/musicbrainzService.ts`) ;
- les compteurs de limitation de débit (`lib/rateLimit.ts`).

L'interface `CacheStore<V>` n'expose que `get/set/delete` synchrones, pour ne rien changer aux appels. L'implémentation Redis se tiendra derrière une façade synchrone adossée à un miroir en mémoire : les écritures vers Redis se font en arrière-plan. Documenter la fenêtre de perte de données (en général < 1 s) lors de la migration.

## Ce qui reste en mémoire pour toujours

- L'état dérivé de chaque requête (`auth.api.getSession()` est déjà mis en cache par le `cookieCache` de Better Auth).
