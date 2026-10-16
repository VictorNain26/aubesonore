# Backend AubeSonore

API de la webradio, construite avec [Elysia](https://elysiajs.com/) sur [Bun](https://bun.sh/) : le direct et l'historique d'AzuraCast, les comptes ([Better Auth](https://www.better-auth.com/) : e-mail vérifié, Google), les titres gardés et leurs liens d'écoute (iTunes, Deezer, YouTube), les pages artistes (identité par ISRC et MusicBrainz, photo Wikimedia Commons, ouverture Wikipédia) et Musilogy, lue dans le schéma `musilogy` de la base. Les règles et leurs raisons sont dans [`.claude/rules/site.md`](../../../.claude/rules/site.md) ; l'installation et la pile locale dans le [README du site](../../README.md).

## Variables

Liste complète dans `site/.env.example`, que lit `pnpm stack`, et lue seulement par `src/config/env.ts` :

- `DATABASE_URL` — connexion PostgreSQL
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` — configuration Better Auth
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth Google
- `ALLOWED_ORIGINS`, `COOKIE_DOMAIN`, `FRONTEND_BASE_URL`
- `AZURACAST_BASE_URL`, `AZURACAST_API_KEY`, `AZURACAST_STATION_ID`
- `OUTBOUND_USER_AGENT` — User-Agent avec contact exigé par MusicBrainz et Wikimedia
- `YOUTUBE_API_KEY` — facultative : sans elle, chaque titre gardé ouvre une recherche YouTube

## Commandes

```bash
pnpm --filter=@aubesonore/backend test       # tests sur mocks
pnpm --filter=@aubesonore/backend test:db    # contre un Postgres jetable dont le nom finit par _test
pnpm --filter=@aubesonore/backend typecheck
```

Santé : `/health`.

## Base de données

Le schéma est `src/db/schema.ts`. Un changement de schéma part avec une migration écrite à la main, idempotente, dans `drizzle/`, que le backend applique au démarrage ; `db:push` ne sert qu'à une base de développement ou de test (`.claude/rules/site.md`, « Working with Drizzle »).

## Licence

MIT
