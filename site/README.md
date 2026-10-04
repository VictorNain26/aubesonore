# AubeSonore

Le site de la webradio AubeSonore : l'écoute du direct, les titres gardés, une page par artiste joué et Musilogy (`docs/vision.md` à la racine). Monorepo pnpm + Turbo (backend Bun/Elysia, frontend Vite/React).

## Architecture

```
aubesonore/
├── apps/
│   ├── backend/          # API Bun + Elysia + Drizzle + PostgreSQL
│   └── frontend/         # Vite + React 19 + Tailwind 4 (PWA)
├── packages/
│   ├── core/             # Logique agnostique de plateforme (partagée entre apps)
│   └── shared-types/     # Types partagés backend ↔ clients
├── docker-compose.yml        # Stack de production
└── docker-compose.dev.yml    # PostgreSQL local (dev)
```

## Fonctionnalités

- **Écouter** : le flux AzuraCast, le titre en cours, ce qui est passé depuis l'aube et les titres les plus gardés.
- **Garder** : un auditeur connecté garde un titre ; ses liens d'écoute viennent des API d'iTunes, de Deezer et de Spotify (par ISRC). Chaque titre gardé est relié à sa diffusion et à son artiste.
- **Page artiste** (artistes joués seulement) : portrait Deezer, faits MusicBrainz, ouverture de l'article Wikipédia ou, sans article, les faits dits en une phrase ; vos titres gardés de l'artiste, sinon ce que l'antenne en a joué ; où l'écouter. L'artiste est identifié par l'ISRC du titre joué, vérifié contre le titre et le nom.
- **Musilogy** : pour tout artiste de MusicBrainz, qui faisait cette musique avant lui, en même temps, après lui (proximité ListenBrainz rangée par les dates), ses influences déclarées (Wikidata) et ses groupes (MusicBrainz), en carte et en listes ; recherche par nom.
- **Alertes** (Web Push / VAPID) quand un artiste gardé repasse à l'antenne.
- **Pochettes** : à l'enrichissement, la pochette iTunes est retenue quand l'artiste correspond ; à défaut, un visuel « onde » déterministe est généré côté client.
- **PWA** installable.

## Stack

| Couche    | Technologies                                                |
| --------- | ----------------------------------------------------------- |
| Backend   | Bun, Elysia, Drizzle ORM + PostgreSQL, Better Auth, Valibot |
| Frontend  | React 19, Vite 8, Tailwind CSS 4, Zustand                   |
| Outillage | pnpm 10, Turbo, ESLint 9 (flat), Vitest + bun test          |

Auth : Better Auth (email vérifié + OAuth Google/Spotify). Liens d'écoute : API iTunes, Deezer et Spotify (Songlink/Odesli a fermé son API le 2026-07-31). Pochettes : iTunes vérifiée (artiste) ou visuel « onde » généré côté client.

## Démarrage

### Prérequis

- Node.js ≥ 20, pnpm ≥ 10, Bun (backend)
- Docker (optionnel, pour PostgreSQL local)

### Installation

```bash
pnpm install

# Environnements (voir les .env.example pour la liste complète)
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env

# PostgreSQL local (option Docker), sur 127.0.0.1:5432
# Port déjà pris : POSTGRES_DEV_PORT=5433 docker compose -f docker-compose.dev.yml up -d,
# et le même port dans DATABASE_URL (apps/backend/.env)
docker compose -f docker-compose.dev.yml up -d

# Appliquer le schéma
cd apps/backend && bun run db:push && cd -

# Tout démarrer (Turbo)
pnpm dev
```

- Frontend : http://localhost:5173
- Backend : http://localhost:3000

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

Les PR de dépendances viennent des **mises à jour de sécurité Dependabot** (alertes et correctifs automatiques activés dans les réglages du dépôt, sans `.github/dependabot.yml`, donc sans mises à jour de version planifiées). Elles passent la CI et sont mergées **à la main** : aucune n'est auto-mergée. Les autres montées de version se font manuellement.

`renovate.json` décrit une policy Renovate (auto-merge des updates sûres, revue manuelle des majors), mais Renovate n'a jamais ouvert de PR ni de _Dependency Dashboard_ sur ce dépôt : cette configuration n'est pas active.

## Déploiement

Toute la stack est auto-hébergée sur le même serveur et exposée via Cloudflare Tunnel ; le flux radio passe par `radio.aubesonore.fr`.

- **Frontend** : SPA statique buildée par `apps/frontend/Dockerfile`, servie par nginx (`aubesonore.fr`), publiée sur la loopback en `127.0.0.1:3002`.
- **Backend** : Bun/Elysia (`api.aubesonore.fr`), publié en `127.0.0.1:3001`.
- **Base de données** : PostgreSQL.

Le déploiement est automatique et _pull-based_ : merger sur `master` suffit. Sur le serveur, le timer systemd utilisateur `aubesonore-deploy.timer` lance toutes les 2 minutes [`scripts/deploy.sh`](scripts/deploy.sh), qui compare le checkout à `origin/master` (`git ls-remote`) et, quand `master` a bougé :

1. `git merge --ff-only` vers la nouvelle révision ;
2. `docker compose up -d --build --remove-orphans` ;
3. attend que tous les healthchecks soient verts (échec au-delà de 300 s) ;
4. supprime les images de plus de 72 h.

Aucun runner self-hosted ni webhook entrant : le dépôt est public, et le polling ne demande ni credential ni port ouvert. Le backend applique au démarrage les nouvelles migrations `apps/backend/drizzle/*.sql` (`src/db/migrate.ts`, SQL idempotent) : un changement de `site/apps/backend/src/db/schema.ts` livré avec sa migration (dans le même commit de `master`) se déploie seul ; que la migration corresponde au schéma relève de la revue de PR. Sans migration, il bloque le déploiement : l'appliquer à la main, l'acquitter avec `git -C ~/aubesonore config aubesonore.appliedSchema <blob>` (le script affiche la commande exacte), puis relancer `systemctl --user start aubesonore-deploy`.

Installation, une fois, sur le serveur (unités et script supposent le dépôt AubeSonore cloné dans `~/aubesonore`, le site dans `~/aubesonore/site` ; ailleurs, ajuster `ExecStart` et définir `REPO_DIR`) :

```bash
ln -s ~/aubesonore/site/scripts/systemd/* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now aubesonore-deploy.timer aubesonore-backup.timer
loginctl enable-linger <utilisateur>   # les timers tournent sans session ouverte
journalctl --user -u aubesonore-deploy # logs
```

`aubesonore-backup.timer` lance chaque nuit (03:30) [`scripts/backup-db.sh`](scripts/backup-db.sh) : un `pg_dump -Fc` vers un disque physiquement séparé de celui du volume Docker, vérifié par `pg_restore --list` et conservé 14 jours.

Les variables `VITE_*` sont inlinées **au build** (ce ne sont pas des secrets) : changer l'URL de l'API impose un `--build`, pas un simple restart.

`master` est protégée : une PR ne merge que si les 3 checks CI passent (Quality, Backend tests, Build all). Voir [`CLAUDE.md`](CLAUDE.md) pour les conventions et le workflow.

## Licence

MIT
