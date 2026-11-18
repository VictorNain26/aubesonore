# Backend AubeSonore

API de la webradio, construite avec [Elysia](https://elysiajs.com/) sur [Bun](https://bun.sh/) : le direct et l'historique d'AzuraCast, les comptes ([Better Auth](https://www.better-auth.com/) : e-mail vérifié, Google), les titres gardés et leurs liens d'écoute (iTunes, Deezer, YouTube), les pages artistes (identité par ISRC et MusicBrainz, photo Wikimedia Commons, ouverture Wikipédia) et Musilogy, lue dans le schéma `musilogy` de la base. Les règles et leurs raisons sont dans [`.claude/rules/site.md`](../../../.claude/rules/site.md) ; l'installation et la pile locale dans le [README du site](../../README.md).

## Variables

Lues seulement par `src/config/env.ts`, qui dit chacune et sa valeur par défaut. Celles que la pile Compose prend dans `site/.env` sont dans `compose.yaml` (`x-backend-environment`) ; `site/.env.example` les donne avec des valeurs de dev prêtes à l'emploi.

## Commandes

```bash
pnpm --filter=@aubesonore/backend test       # tests sur mocks
pnpm --filter=@aubesonore/backend test:db    # contre un Postgres jetable dont le nom finit par _test
pnpm --filter=@aubesonore/backend typecheck
```

Santé : `/health`.

## Base de données

Le schéma est `src/db/schema.ts`. Après l'avoir changé, `pnpm -C site --filter @aubesonore/backend exec drizzle-kit generate` écrit la migration dans `drizzle/` ; une migration de données s'écrit dans le fichier vide que crée `drizzle-kit generate --custom`. La CI échoue quand `schema.ts` change sans sa migration. Le backend applique les migrations au démarrage ; `bun run db:migrate` les applique à une base de développement ou de test.

## Licence

MIT
