---
name: artists-resolve
description: Re-identify every known artist in production after a deploy that changes identity (`artists:resolve` in the backend container).
disable-model-invocation: true
---

# Re-identify the artists in production

Run on victorserv, after a deploy that changes identity, once the backend's kept-cover pass has logged
`keptCoverFill.done` (no pacing is shared across processes):

```bash
docker exec aubesonore-backend bun run artists:resolve
```

What it does: the header of `site/apps/backend/src/scripts/resolve-played-artists.ts`. It is idempotent:
rerun it as is after a run with many `could not be checked`. Report the counts it logs.
