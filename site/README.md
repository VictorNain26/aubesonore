# AubeSonore

Le site de la webradio AubeSonore : l'écoute du direct, les titres gardés, une page par artiste et Musilogy (`docs/vision.md` à la racine). Monorepo pnpm + Turbo (backend Bun/Elysia, frontend Vite/React).

## Architecture

```
aubesonore/
├── apps/
│   ├── backend/          # API Bun + Elysia + Drizzle + PostgreSQL
│   └── frontend/         # Vite + React 19 + Tailwind 4 (PWA)
├── packages/
│   └── shared-types/     # Types partagés backend ↔ frontend
├── compose.yaml          # La pile : production, et poste de dev (profil dev)
└── scripts/              # Déploiement, sauvegardes, certificats de Postgres
```

## Fonctionnalités

- **Écouter** : le flux AzuraCast, le titre en cours, ce qui est passé depuis l'aube et les titres les plus gardés.
- **Garder** : un auditeur connecté garde un titre ; ses liens d'écoute viennent des API d'iTunes et de Deezer (par ISRC). Chaque titre gardé est relié à sa diffusion et à son artiste.
- **Mes titres** (`/mes-titres`, `/en/my-tracks`) : les titres gardés, par date d'ajout ou par artiste (`?sort=artist`), le nom de l'artiste menant à sa page, chacun à écouter sur YouTube (son Art Track vérifiée quand l'API YouTube en trouve une, sinon une recherche) ; retirer un titre s'annule pendant 5 secondes.
- **Page artiste** (tout artiste que l'antenne a joué ou que Musilogy connaît, à son slug ; son MBID y renvoie en 301) : portrait sous licence connue (photo Wikimedia Commons créditée, sinon pochette du premier disque, sinon l'aube de l'artiste), faits MusicBrainz, ouverture de l'article Wikipédia ou, sans article, les faits dits en une phrase ; vos titres gardés de l'artiste ; où l'écouter ; les sections de Musilogy qui ont du contenu. L'artiste est identifié par l'ISRC du titre joué, vérifié contre le titre et le nom.
- **Musilogy** : sur chaque page artiste, les artistes du même son en frise, ses groupes et projets, ses albums et EP ; la recherche par nom (`/musilogy`).
- **Pochettes** : celles de l'antenne, redimensionnées par nginx (`/covers/…`), et, pour un titre gardé, la pochette iTunes vérifiée (artiste) quand elle existe, sinon celle de l'antenne copiée par le backend (`/api/covers/:sha256`), qui garde ainsi la sienne après son départ de l'antenne ; celles des disques, du Cover Art Archive, gardées en cache par nginx (`/caa/…`) ; à défaut, un visuel « onde » déterministe dessiné côté client.
- **Diffusion** : AirPlay dans Safari ; Chromecast dans Chrome, vers le récepteur AubeSonore (`cast/receiver.html`), qui suit lui-même le titre en cours.
- **PWA** installable.

## Stack

| Couche    | Technologies                                                |
| --------- | ----------------------------------------------------------- |
| Backend   | Bun, Elysia, Drizzle ORM + PostgreSQL, Better Auth, Valibot |
| Frontend  | React 19, Vite 8, Tailwind CSS 4, Zustand                   |
| Outillage | pnpm 10, Turbo, ESLint 9 (flat), Vitest + bun test          |

Auth : Better Auth (email vérifié + OAuth Google). Liens d'écoute : API iTunes et Deezer (Songlink/Odesli a fermé son API le 2026-07-31).

## Démarrage

### Prérequis

- Docker avec Compose v2.22 ou plus (profils, `develop.watch`), OpenSSL
- Node.js ≥ 22 et pnpm ≥ 10 pour les commandes du dépôt (tests, lint)

### La pile locale, en une commande

```bash
./scripts/make-certs.sh   # une fois : certificats TLS de Postgres (certs/, non versionné)
cp .env.example .env      # une fois : valeurs de dev prêtes à l'emploi
pnpm stack                # Postgres, backend, front, sur http://localhost:5173
pnpm musilogy:sample      # la petite Musilogy (exige uv)
pnpm data:pull            # les données publiques de la production (exige l'accès SSH à victorserv)
```

`pnpm stack` lance le même `compose.yaml` que la production, avec le profil `dev` :

- **dev-init** crée le schéma de la base vide (`db:push`) puis un auditeur de test vérifié avec quelques titres gardés (`apps/backend/src/scripts/seed-dev.ts`) : `dev@aubesonore.test`, mot de passe `dev-listener-password` (`.env.example`, valeurs de test, jamais un vrai compte) ;
- **frontend-dev** sert la SPA avec Vite et son rechargement à chaud ; le backend redémarre à chaque sauvegarde de `apps/backend/src` (Compose Watch) ;
- **`pnpm musilogy:sample`** (`scripts/musilogy-sample.sh`) charge dans le schéma `musilogy` le pipeline de musilogy passé sur ses fixtures versionnées (`musilogy load --sample`) : le même schéma et le même chemin de code que la production, quelques centaines d'artistes au lieu de millions ;
- **`pnpm data:pull`** (`scripts/pull-public-data.sh`) copie de la production, en lecture seule, ses tables publiques (artistes joués, slugs, profils, passages de l'antenne) ; jamais une donnée d'auditeur, ni les données YouTube, à durée de vie limitée. L'auditeur de test garde ses titres, et leur lien aux artistes copiés.

La base locale a donc le moteur, la version et le schéma de la production, et un échantillon cohérent de ses données : elle suffit pour un changement du backend ou des données. Les sections de Musilogy n'y existent que pour les artistes de l'échantillon (dont ceux de l'auditeur de test), et « même son » y est vide (l'échantillon ne porte aucune écoute).

`PUBLIC_API_PROXY_TARGET` (vide par défaut) relaie au besoin les lectures publiques vers l'API de production, en lecture seule ; la session et les titres gardés restent locaux. Un `.env` copié d'un exemple plus ancien le fixe encore : le vider pour lire la base locale.

`docker compose down` arrête la pile ; `docker compose down -v` efface aussi la base locale.

## Commandes

```bash
pnpm dev                       # tous les apps (turbo dev)
pnpm dev:backend / dev:frontend
pnpm build                     # build tous les apps
pnpm lint                      # eslint .
pnpm typecheck                 # turbo typecheck
pnpm format:check              # prettier --check

pnpm --filter @aubesonore/frontend test          # Vitest
pnpm --filter @aubesonore/backend test           # bun test
```

Détails par app : [backend](apps/backend/README.md) · [frontend](apps/frontend/README.md).

## Dépendances

Renovate ouvre les PR de dépendances (pnpm, uv, GitHub Actions, images Docker), le lundi avant 6 h, et les liste dans l'issue _Dependency Dashboard_. Il fusionne seul, une fois la CI verte, les mises à jour sûres : épinglages, devDependencies mineures et correctifs, correctifs des dépendances stables, Actions mineures. Les majeures et les images Docker passent en revue manuelle. La politique est dans [`renovate.json`](../renovate.json) à la racine. Dependabot ne sert plus qu'aux alertes de sécurité.

## Déploiement

Toute la stack est auto-hébergée sur le même serveur et exposée via Cloudflare Tunnel ; le flux radio passe par `radio.aubesonore.fr`.

- **Frontend** : SPA statique buildée par `apps/frontend/Dockerfile`, servie par nginx (`aubesonore.fr`), publiée sur la loopback en `127.0.0.1:3002`.
- **Backend** : Bun/Elysia (`api.aubesonore.fr`), publié en `127.0.0.1:3001`.
- **Rendu serveur** : `renderer`, qui dessine les pages artistes pour le backend.
- **Base de données** : PostgreSQL.

Le déploiement est automatique et _pull-based_ : merger sur `master` suffit. Sur le serveur, le timer systemd utilisateur `aubesonore-deploy.timer` lance toutes les 2 minutes [`scripts/deploy.sh`](scripts/deploy.sh), qui compare le checkout à `origin/master` (`git ls-remote`) et, quand `master` a bougé, sur un checkout propre et hors de la passe hebdomadaire de la radio : avance le checkout (`git merge --ff-only`), aligne `pipeline/.venv` sur `uv.lock` quand `pipeline/` a changé, reconstruit les conteneurs seulement si `site/` a changé, attend leurs healthchecks (300 s), redémarre la page de vote quand `pipeline/` a changé, puis nettoie les vieilles images. Un échec revient au commit précédent (voir `scripts/deploy.sh`).

Aucun runner self-hosted ni webhook entrant : le dépôt est public, et le polling ne demande ni credential ni port ouvert. Le backend applique au démarrage les nouvelles migrations `apps/backend/drizzle/*.sql` (`src/db/migrate.ts`, SQL idempotent) : un changement de `site/apps/backend/src/db/schema.ts` livré avec sa migration (dans le même commit de `master`) se déploie seul ; que la migration corresponde au schéma relève de la revue de PR. Sans migration, il bloque le déploiement : l'appliquer à la main, l'acquitter avec `git -C ~/aubesonore config aubesonore.appliedSchema <blob>` (le script affiche la commande exacte), puis relancer `systemctl --user start aubesonore-deploy`.

Installation, une fois, sur le serveur (unités et script supposent le dépôt AubeSonore cloné dans `~/aubesonore`, le site dans `~/aubesonore/site` ; ailleurs, ajuster `ExecStart` et définir `REPO_DIR`) :

```bash
cd ~/aubesonore/site
./scripts/make-certs.sh            # TLS de Postgres, si certs/ n'existe pas déjà
cp .env.example .env               # puis les vraies valeurs : chaque ligne dit celle de la production
ln -s ~/aubesonore/site/scripts/systemd/* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now aubesonore-deploy.timer aubesonore-backup.timer
loginctl enable-linger <utilisateur>   # les timers tournent sans session ouverte
journalctl --user -u aubesonore-deploy # logs
```

`aubesonore-backup.timer` lance chaque nuit (03:30) [`scripts/backup-db.sh`](scripts/backup-db.sh) : un `pg_dump -Fc` vers un disque physiquement séparé de celui du volume Docker, vérifié par `pg_restore --list` et conservé 14 jours.

Les variables `VITE_*` sont inlinées **au build** (ce ne sont pas des secrets) : changer l'URL de l'API impose un `--build`, pas un simple restart.

`master` est protégée : une PR ne merge que si les 5 checks CI requis passent (Quality, Backend tests et Build all pour le site, plus les checks de `pipeline/` et `musilogy/`, lancés sur toute PR). Voir [`.claude/rules/site.md`](../.claude/rules/site.md) pour les conventions et le workflow.

## Licence

MIT
