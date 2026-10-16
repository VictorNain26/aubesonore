# Frontend AubeSonore

Application React/Vite de la webradio **AubeSonore** : écoute du flux AzuraCast, morceaux gardés et liens vers les plateformes.

## Fonctionnalités

- Le direct d'AzuraCast, le titre en cours, ce qui est passé depuis l'aube et les plus gardés
- Les pages artistes et Musilogy, dessinées par le serveur puis hydratées (data mode de React Router)
- Mes titres : les titres gardés, à écouter sur YouTube
- Authentification (inscription, connexion, réinitialisation) via `better-auth`
- Diffusion vers AirPlay et Chromecast ; application installable (PWA)

## Design system

Un seul style, sans thème sombre : papier clair, encre, une lumière abricot. Tokens Tailwind v4 dans `src/design/tokens.css`, seule source des couleurs, tailles et polices (Bricolage Grotesque via Fontsource, auto-hébergée). Contraste AA vérifié en CI (`scripts/check-contrast.mjs`). Conventions dans [`.claude/rules/site-frontend.md`](../../../.claude/rules/site-frontend.md).

## Installation

```bash
pnpm install
cp .env.example .env
```

Variables (`.env.example`) :

- `VITE_API_URL` — URL de l'API backend
- `VITE_AZURACAST_BASE_URL` — serveur AzuraCast
- `VITE_STATION_SHORTCODE` — shortcode de la station

## Développement

```bash
pnpm dev          # Vite sur http://localhost:5173
pnpm build        # build de production dans dist/
pnpm preview      # prévisualisation du build
pnpm test         # Vitest
pnpm typecheck    # tsc --noEmit
pnpm check:contrast   # contraste des tokens (wired en CI)
```

## Déploiement

Auto-hébergé : le `Dockerfile` construit la SPA et la sert via nginx, dans le `compose.yaml` de la racine. Merger sur `master` suffit — un timer systemd sur le serveur déploie dans les deux minutes (voir la section « Déploiement » du [README du site](../../README.md)).

## Licence

MIT
