# Backend AubeSonore

API de la webradio, construite avec [Elysia](https://elysiajs.com/) sur [Bun](https://bun.sh/). Elle sert le catalogue « now playing » depuis AzuraCast, gère l'authentification, les likes et leur enrichissement multi-plateformes.

## Ce que fait l'API

- **Radio** : proxy de l'historique et du « en train de jouer » AzuraCast.
- **Likes** : ajout / retrait / liste des morceaux aimés.
- **Enrichissement** : résolution des liens multi-plateformes (iTunes, Deezer, Spotify) en tâche de fond ; profil d'artiste par Deezer, MusicBrainz et Wikipédia.
- **Pochettes** : à l'enrichissement, une pochette iTunes est retenue si l'artiste correspond (une autre pochette du même artiste reste acceptable) ; sinon l'URL AzuraCast est conservée et le client affiche un visuel « onde » déterministe.
- **Auth** : [Better Auth](https://www.better-auth.com/) — email vérifié requis, OAuth Google et Spotify, cookies sécurisés, rate limiting.
- **Statistiques d'écoute**.
- **Sécurité** : garde SSRF (`assertSafeUrl`), en-têtes de sécurité, rate limiting par IP/utilisateur.

## Prérequis

- [Bun](https://bun.sh/) installé localement
- Une base **PostgreSQL** accessible

## Installation

```bash
bun install
cp .env.example .env   # renseigner les variables ci-dessous
```

Variables principales (liste complète dans `.env.example`) :

- `DATABASE_URL` — connexion PostgreSQL
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` — configuration Better Auth
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth Google
- `ALLOWED_ORIGINS`, `COOKIE_DOMAIN`, `FRONTEND_BASE_URL`, `BACKEND_BASE_URL`
- `AZURACAST_BASE_URL`, `AZURACAST_API_KEY`, `AZURACAST_STATION_ID`
- `OUTBOUND_USER_AGENT` — User-Agent avec contact exigé par MusicBrainz et Wikimedia

## Développement

```bash
bun run db:push   # synchronise le schéma Drizzle vers la base
bun run start     # démarre l'API
```

Santé : [http://localhost:3000/health](http://localhost:3000/health).

## Scripts utiles

- `bun run db:push` — pousse le schéma (dev + prod)
- `bun run db:generate` — génère une migration versionnée
- `bun run seed:admin` — crée un compte administrateur
- `bun run reset:all` — réinitialise la base
- `bun test` — tests (bun)
- `bun run lint` / `bun run typecheck`

## Base de données (Drizzle)

Le schéma (`src/db/schema.ts`) est la source de vérité ; les index sont déclarés inline. `db:push` synchronise directement (dev + prod). Les migrations appliquées sont suivies dans `__app_migrations` et rejouées au démarrage.

## Déploiement

Servie sur un VPS auto-hébergé, exposée via Cloudflare Tunnel. Docker : voir `docker-compose.yml` à la racine.

## Licence

MIT
