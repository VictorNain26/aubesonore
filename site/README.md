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
- **Mes titres** (`/mes-titres`, `/en/my-tracks`) : les titres gardés, par date d'ajout ou par artiste (`?sort=artist`), le nom de l'artiste menant à sa page, chacun à écouter sur YouTube (son Art Track vérifiée quand l'API YouTube en trouve une, sinon une recherche) ; retirer un titre s'annule pendant 5 secondes.
- **Page artiste** (artistes joués seulement) : portrait Deezer, faits MusicBrainz, ouverture de l'article Wikipédia ou, sans article, les faits dits en une phrase ; vos titres gardés de l'artiste ; où l'écouter ; les sections de Musilogy qui ont du contenu. L'artiste est identifié par l'ISRC du titre joué, vérifié contre le titre et le nom.
- **Musilogy** : pour tout artiste de MusicBrainz, qui faisait cette musique avant lui, en même temps, après lui (proximité ListenBrainz rangée par les dates), ses influences déclarées (Wikidata) et ses groupes (MusicBrainz), en carte et en listes ; recherche par nom.
- **Pochettes** : à l'enrichissement, la pochette iTunes est retenue quand l'artiste correspond ; à défaut, un visuel « onde » déterministe est généré côté client.
- **Diffusion** : AirPlay dans Safari ; Chromecast dans Chrome, vers le récepteur AubeSonore (`cast/receiver.html`), qui suit lui-même le titre en cours.
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

Renovate ouvre les PR de dépendances (pnpm, uv, GitHub Actions, images Docker), le lundi avant 6 h, et les liste dans l'issue _Dependency Dashboard_. Il fusionne seul, une fois la CI verte, les mises à jour sûres : épinglages, devDependencies mineures et correctifs, correctifs des dépendances stables, Actions mineures. Les majeures et les images Docker passent en revue manuelle. La politique est dans [`renovate.json`](../renovate.json) à la racine. Dependabot ne sert plus qu'aux alertes de sécurité.

## Déploiement

Toute la stack est auto-hébergée sur le même serveur et exposée via Cloudflare Tunnel ; le flux radio passe par `radio.aubesonore.fr`.

- **Frontend** : SPA statique buildée par `apps/frontend/Dockerfile`, servie par nginx (`aubesonore.fr`), publiée sur la loopback en `127.0.0.1:3002`.
- **Backend** : Bun/Elysia (`api.aubesonore.fr`), publié en `127.0.0.1:3001`.
- **Base de données** : PostgreSQL.

Le déploiement est automatique et _pull-based_ : merger sur `master` suffit. Sur le serveur, le timer systemd utilisateur `aubesonore-deploy.timer` lance toutes les 2 minutes [`scripts/deploy.sh`](scripts/deploy.sh), qui compare le checkout à `origin/master` (`git ls-remote`) et, quand `master` a bougé :

1. `git merge --ff-only` vers la nouvelle révision, après avoir aligné `pipeline/.venv` sur `uv.lock` (`uv sync --locked`, à chaque passage, puis de nouveau quand `pipeline/` change) ;
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

`master` est protégée : une PR ne merge que si les 5 checks CI requis passent (Quality, Backend tests et Build all pour le site, plus les checks de `pipeline/` et `musilogy/`, lancés sur toute PR). Voir [`CLAUDE.md`](CLAUDE.md) pour les conventions et le workflow.

## Licence

MIT
