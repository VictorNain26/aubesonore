---
description: Runtime AzuraCast — chargé en ouvrant un fichier de azuracast/
paths:
  - "azuracast/**"
---

# azuracast

Les chemins ci-dessous sont relatifs à `azuracast/`.

- **La config de station appartient à l'UI.** Tout sous `stations/*/config/` (Liquidsoap,
  Icecast, nginx) est réécrit par AzuraCast : une modification à la main y est perdue au prochain
  changement fait depuis l'interface. Passer par l'UI, et traiter les `*.backup.json` comme des
  instantanés, jamais comme des entrées.
- Un changement de `docker-compose.yml` se teste avec `docker compose config` avant `up -d`, et
  se commite avec sa raison.
- Un `git status` propre ne veut pas dire que la station est sauvegardée : `RUNBOOK.md`.
