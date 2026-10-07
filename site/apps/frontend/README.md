# Frontend AubeSonore

Application React/Vite de la webradio **AubeSonore** : écoute du flux AzuraCast, morceaux gardés et liens vers les plateformes.

## Fonctionnalités

- Lecture du flux AzuraCast avec « en train de jouer » en temps réel
- Authentification (inscription, connexion, réinitialisation) via `better-auth`
- Morceaux aimés avec liens multi-plateformes et pochettes durables
- Application installable (PWA)

## Design system

Un seul style, sans thème sombre : papier clair, encre, une lumière abricot. Tokens Tailwind v4 dans `src/design/tokens.css`, seule source des couleurs, tailles et polices (Bricolage Grotesque via Fontsource, auto-hébergée). Contraste AA vérifié en CI (`scripts/check-contrast.mjs`). Conventions dans [`CLAUDE.md`](CLAUDE.md).

## Installation

```bash
pnpm install
cp .env.example .env
```

Variables (`.env.example`) :

- `VITE_API_URL` — URL de l'API backend
- `VITE_AZURACAST_BASE_URL` — serveur AzuraCast
- `VITE_STATION_SHORTCODE` — shortcode de la station
- `VITE_SITE_BASE_URL` — URL publique du site

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

Auto-hébergé : le `Dockerfile` construit la SPA et la sert via nginx, dans le `compose.yaml` de la racine. Merger sur `master` suffit — un timer systemd sur le serveur déploie dans les deux minutes (voir la section _Deployment_ du `CLAUDE.md` racine).

## Licence

MIT
