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

- Sequential, at half the backend's pace (`shareRateWithBackend`).
- Idempotent: rerun it as is after a run with many `could not be checked`.
- `reidentifyArtists` identifies every known artist again, leaves an MBID found again as it was, replaces or
  clears another (`writeIdentity`; the row and its slug stay, never a slug deleted) and logs the counts.

Report the counts it logs.
