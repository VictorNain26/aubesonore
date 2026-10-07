# Audit performance, architecture et conventions — 2026-10-07

Quatre audits en lecture seule, menés en parallèle sur le dépôt et sur la machine de production
(victorserv) : front du site, backend et base, pipeline et musilogy, infrastructure et
conventions. Rien n'a été modifié pendant l'audit. Les chiffres sont mesurés ; quand une mesure
manque, c'est dit.

**Ce qui va bien.** Toutes les unités systemd et les sauvegardes de la nuit ont réussi ; la passe
hebdomadaire va au bout (11 étapes sur 11). Les routes JSON répondent en 1 à 6 ms à chaud, le
backend tient dans 127 Mo sur 1 Go, la base dans 436 Mo sur 1 Go ; tous les appels externes ont
un timeout. Le cache HTTP du site est propre (assets `immutable`, HTML `no-cache`), le CLS reste
sous 0,06. mypy strict, knip, lint, contraste et tests tournent en CI. Les pièces restent
découplées (aucun lien pipeline ↔ musilogy ↔ site hors AzuraCast et les fonctions SQL).

## P0 — Fiabilité et sécurité (petits correctifs, à faire d'abord)

| # | Constat (mesure) | Correctif | Effort | Qui |
|---|---|---|---|---|
| 1 | **La garde de `deploy.sh` ne protège pas la passe hebdomadaire.** `is-active` répond non pour une unité oneshot en cours (`activating`). Le 2026-10-04, la passe a tourné de 03:00 à 06:38 ; trois déploiements ont eu lieu pendant (05:09, 05:28, 05:43), dont un qui modifiait `pipeline/radio/antenna`. « deferring » : 0 fois en 14 jours. | Lire `ActiveState` et différer sur `activating`/`active`/`deactivating`, avec un test. | S | moi |
| 2 | **Ports AzuraCast publiés sur 0.0.0.0** : 8080 (admin), 8443, 2022 (SFTP), 8000–8036. Docker contourne ufw (docs.docker.com/engine/network/packet-filtering-firewalls). cloudflared n'a besoin que de 127.0.0.1. | Ports en loopback via un `docker-compose.override.yml` (point 13). Redémarre l'antenne quelques secondes : à faire à une heure creuse. | S | moi, créneau à choisir |
| 3 | **Collision du dimanche matin** : `update-stack.sh` (05:17, hors dépôt) recrée `azuracast web` et le Postgres du site sans regarder `radio-weekly` ; le snap Docker se met à jour le dimanche 06:00–06:45 et redémarre tous les conteneurs (c'est arrivé le 19-09 à 04:16). | Même garde que `deploy.sh` dans `update-stack.sh` ; déplacer ou geler la fenêtre de mise à jour du snap (sudo). | S | moi + **toi (sudo)** |
| 4 | **Aucun plafond mémoire sur les unités systemd** : `radio-weekly` a culminé à 2,9 Go (`MemoryMax=infinity`), sur une machine dont le swap est à 3 Go sur 4. | `MemoryHigh`/`MemoryMax` et `Nice` sur chaque unité, comme `mem_limit` sur les conteneurs. | S | moi |
| 5 | **Le battement de cœur Gatus fait échouer des unités réussies** : `radio-grille` « Failed » le 02-10 (status 22) parce que le `curl` de `ExecStopPost` a reçu un 404, la grille étant écrite. `radio-remind` n'a pas de battement. | Préfixer `ExecStopPost` de `-`. | S | moi |
| 6 | **Les pannes du site passent inaperçues** : ni `aubesonore-deploy` ni `aubesonore-backup` n'envoient de battement ; Gatus ne surveille ni `aubesonore.fr` ni `/health` ; le déploiement a échoué 9 fois de suite le 02-10 sans alerte. | Battement pour chaque oneshot, endpoint Gatus pour chaque service public. | S | moi |
| 7 | **Les journaux du backend disparaissent à chaque déploiement** (driver `json-file`, conteneur recréé ; 84 déploiements en 72 h). Une 404 est journalisée 200 ; les 400 et 500 ne sont pas journalisés (`index.ts:114-121`). Postgres n'a ni `pg_stat_statements` ni journal des requêtes lentes. | Driver `journald` ; `onAfterResponse` avec `context.route` (Elysia 1.4.30) pour le vrai statut et le motif de route. | S | moi |
| 8 | **Secrets AzuraCast lisibles par tous** : `azuracast/.env` et `azuracast.env` (dont `MYSQL_PASSWORD`) en 664 ; ailleurs 600. `azuracast-backup` lit `pipeline/.env` pour `GATUS_TOKEN`. | `chmod 600` ; un `GATUS_TOKEN` par pièce. | S | moi |
| 9 | **Aucune copie hors machine** : les 4 sauvegardes sont sur le même boîtier ; le mot de passe restic n'existe que sur le NVMe. | `restic copy` vers un stockage distant, mot de passe dans un gestionnaire. | M | **toi** (compte externe) |
| 10 | `site/.env.example` sans `SMTP_*` ni `YOUTUBE_API_KEY` (le backend refuse de démarrer en production sans SMTP) ; variables mortes dans les `.env` de production (`VAPID_*`, `CLOUDFLARE_TUNNEL_TOKEN`, 13 noms de l'ancien pipeline). | Compléter l'exemple, retirer les variables mortes. | S | moi |

## P1 — Performance

**Front** (Lighthouse 13.5 en labo sur la production ; aucune donnée terrain : PageSpeed a refusé
faute de quota, et `web-vitals` n'est branché qu'en dev).

| Page | Mobile : perf / LCP / TBT | Bureau : perf / LCP |
|---|---|---|
| Accueil | 0,37–0,47 / 6,0–7,6 s / 1,4–4,3 s | 0,71 / 1,6 s |
| Page artiste | 0,65–0,70 / 3,5 s / 0,6–0,8 s | 0,95 / 0,8 s |
| Musilogy | 0,64 / 4,6 s / 0,5 s | 0,97 / 1,2 s |

| # | Constat | Correctif | Effort |
|---|---|---|---|
| 11 | Le LCP de l'accueil est la pochette du direct en pleine taille (137 Ko, 1 000 px) : `NowPlaying.tsx:97` ne passe pas `sizes`, donc aucun `srcset` ; nginx sert la même en 384 px à 19 Ko. Estimé −650 ms de LCP. | `sizes` + une largeur 768 dans nginx (écrans DPR 2) ; précharger le now-playing statique. | S |
| 12 | Le découpage lazy est annulé : `App.tsx:4` importe `ArtistPageView` en statique (page d'erreur), ce qui tire Musilogy dans `main` ; Mes titres et le Toaster (32 Ko) chargés d'emblée. 113–119 Kio de JS inutilisé par page. | Un `PageError` à part, `lazy()` sur Mes titres et le Toaster. | S |
| 13 | Les chunks diffèrent entre local et production : le Dockerfile ne copie pas `.npmrc` (`node-linker=hoisted`), la règle `manualChunks` attrape alors Base UI, sonner et react-router dans `react-vendor` (157 Ko gzip en production contre 67 en local) : toute mise à jour de ces bibliothèques invalide tout le vendor. | `COPY .npmrc`, règle exacte sur `react`/`react-dom`. | S |
| 14 | L'hydratation bloque le thread principal : une tâche de 222 ms sans bridage, ≈ 1,4 s de TBT en mobile simulé. | Frontières `<Suspense>` autour de « Depuis l'aube », « Les plus gardés » et du lecteur (hydratation sélective de React 19), à re-mesurer. | M |
| 15 | Compression gzip seule à l'origine ; Cloudflare relaie le gzip même quand le navigateur accepte brotli. Brotli 11 : −15 % (−34 Ko) sur les deux gros chunks. | Précompresser aussi en brotli. | S–M |
| 16 | Pages artistes lentes à froid : p50 373 ms, p95 906 ms, max 1,9 s (à chaud 40–140 ms). Wikidata (≈ 250 ms) puis Wikipedia en série, et la même requête Wikidata envoyée deux fois (fr et en). 620 des 623 visites relevées viennent d'un robot (AhrefsBot), toutes à froid. | Cache des titres par QID avec single-flight ; lecture Musilogy en parallèle des sources. | S |
| 17 | Pool Postgres à 10 alors qu'un artiste à froid lance 8 requêtes simultanées : deux pages froides saturent le pool. | Pool à 20 (Postgres a 100 connexions, 6 utilisées). | S |
| 18 | `radioService` et `trendsService` sans single-flight (contrairement à ce que dit `site/CLAUDE.md`) ; `TtlCache` sans taille maximale (le robot ajoute ≈ 600 artistes à l'heure). | Single-flight ; plafond d'entrées après une journée de mesure. | S |
| 19 | Postgres réglé par défaut : `shared_buffers` 128 Mo pour 3,3 Go de base (taux de hit 32–52 % sur musilogy) ; les fonctions restent rapides (0,2 à 17 ms, toutes indexées). | `shared_buffers` 256 Mo, `random_page_cost` 1,1, `pg_stat_statements` : un redémarrage de la base, à grouper. | M |
| 20 | Cache de build Docker : 26,7 Go, dont 21,4 récupérables ; `deploy.sh` ne le purge pas. | `docker builder prune --filter until=72h`. | S |
| 21 | Passe hebdomadaire de 3 h 38 : `signals` 65 min, `acquire` 67 min (dont 39 min d'attente imposée par Soulseek), `mesures` 68,5 min — 17,7 s par titre, car `features.py` décode chaque fichier deux fois (16 kHz puis 11 kHz). | Profiler un titre, un seul décodage puis rééchantillonnage en mémoire. | M |

## P2 — Uniformité et refactorisation

| # | Constat | Proposition | Effort |
|---|---|---|---|
| 22 | AzuraCast : `docker-compose.yml` modifié en place, contre la doc officielle (« create docker-compose.override.yml… Updates will not replace this file »). | Fichier d'origine intact, nos réglages (ports, montages, CPU, mémoire, healthcheck) dans l'override. | M |
| 23 | Trois mécanismes de mise à jour des images se chevauchent (Renovate épingle, `update-stack` suit des tags flottants, diun surveille) ; PR Renovate #325 rouge depuis le 04-10. | Un seul mécanisme par image ; `ignorePaths` pour `docker-compose.sample.yml`. | M |
| 24 | Une convention par service permanent : healthcheck dans le compose, `mem_limit`, `pids_limit`, journaux explicites, ports en loopback. Gatus et AzuraCast s'en écartent. | Appliquer partout. | S |
| 25 | Outillage Python divergent : ruff 0.14.14 (musilogy) contre 0.16.9 (pipeline) — la PR Renovate de musilogy échouera sur 6 règles ; 16 familles de règles contre 8 ; `requires-python` différent. | Un `ruff.toml` racine repris par `extend`, une version. | M |
| 26 | Sous-processus sans timeout dans le pipeline (`acquire/audio.py:38`, `sockseek.py:58`) : un ffmpeg bloqué gèle la passe jusqu'à 12 h. | `timeout=`, compté comme motif nommé. | S |
| 27 | CLI qui portent l'orchestration : `pipeline/radio/cli.py` 1 078 lignes, `musilogy/cli.py` 654. | Logique dans les modules métier, comme `discover/run.py`. | M |
| 28 | Journaux : 736 des 822 lignes d'une passe sont la sortie brute de Sockseek ; double horodatage ; pipeline en français/typer/logging, musilogy en anglais/argparse/print. | Résumé seulement dans le journal, `asctime` retiré ; une convention commune. | S |
| 29 | Front : sept `fetch` écrits à la main, trois sans validation à la frontière (`useTrends`, `artistProfile`, `musilogy`), trois formes d'erreur. | Un helper `getJson(url, schema)`. | M |
| 30 | Front : le cadre de page est dupliqué dans 6–7 pages (header, pied de page, titre de document, état du lecteur). `MusilogyView.tsx` mêle recherche et sections (502 lignes). | Une route de layout ; `<title>` natif de React 19 ; découper `MusilogyView`. | M |
| 31 | Backend : `console.*` hors du logger JSON, bloc 429 recopié 8 fois, timer de 6 s jamais nettoyé, 3 caches oubliés à l'arrêt. | Petites corrections. | S |
| 32 | CI : actions par tag dans `site.yml`, par SHA ailleurs ; installation et build dupliqués dans les 3 jobs du site ; pas de hook pre-commit côté Python. | Aligner. | S |
| 33 | Dérives : liens systemd vers l'ancien `~/radio` (7 unités), RUNBOOK sans le renderer, commentaire « ~20x » faux sur Postgres (2,3x mesuré), conteneur `musilogy-pg-test` orphelin, tests musilogy lents (fixture par module, 111 s), code mort (`slot_sequence`, `valence_*`). | Nettoyage. | S |
| 34 | Aucune mesure terrain des Web Vitals. | Beacon `web-vitals` en production, ou le rapport Search Console. | S |

## Ordre proposé

1. **P0 en petites PR** (points 1, 4–8, 10), puis les ports et l'override d'AzuraCast (2, 22) à une
   heure creuse convenue, puis ce qui demande ta main (3, 9).
2. **Performance du front** (11–13, 15), mesurée avant et après avec Lighthouse ; puis 14.
3. **Performance du backend et de la base** (16–18, 20), puis le redémarrage de la base (7 côté
   Postgres, 19) groupé.
4. Les 4 corrections mobiles de l'audit téléphone (albums en rangée, Mes titres avec l'album,
   lignes de recherche, boutons « Garder » à 44 px).
5. **Pipeline** (21, 26, 28) et **conventions Python** (25).
6. **Refactorisations** (27, 29–33) et mesure terrain (34).
