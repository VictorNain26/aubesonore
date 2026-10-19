# Scaling roadmap

Five tiers, each with concrete listener-count triggers. Each tier's actions are deferred until the previous tier's trigger fires — no over-engineering.

| Tier               | Listeners pic | Stream bandwidth | Action                                                                                                                                                                                                                                                                   | Trigger                                                                                    |
| ------------------ | ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **P0 Now**         | < 10          | < 2 Mbps         | Nothing. Static JSON polling + nginx static = trivially capable. Site, API **and stream** all go through the Cloudflare Tunnel: CF's CDN terms restrict a disproportionate share of audio on non-Enterprise plans, a risk accepted at this size (`docs/vision.md` §4.7). | —                                                                                          |
| **P1 Growth**      | 50–200        | 6–25 Mbps        | Watch the box's CPU, memory and disk; `/health` and the nightly database backup already run.                                                                                                                                                                             | Listener pic > 100 sustained one week                                                      |
| **P2 Takeoff**     | 200–1000      | 25–128 Mbps      | Take the stream off Cloudflare: a Tunnel proxies a whole hostname, so `/listen/*` cannot be bypassed by a rule — serve it from its own DNS-only hostname or a relay (AzuraCast remote relays). Move to a hosted machine if the home box no longer holds.                 | Listener pic > 500 sustained one month, or a notice from Cloudflare, whichever comes first |
| **P3 Established** | 1 000–5 000   | 128–640 Mbps     | Dedicated audio CDN (Bunny Stream / Icecast relay). Migrate in-memory caches to Redis (see below).                                                                                                                                                                       | Listener pic > 2 000 sustained one month                                                   |
| **P4 Hit**         | 5 000+        | > 640 Mbps       | Multi-region, DB read replica, auto-scaling.                                                                                                                                                                                                                             | Listener pic > 10 000                                                                      |

## Redis migration triggers (in-memory state goes here)

When **any** of these fires, migrate everything below in one PR:

- Backend deployed across 2+ replicas (horizontal scaling)
- Sustained CPU > 70% on the single replica
- Cache hit ratio measurable < 50% for > 24h (means restarts are too frequent)

**State to migrate** (each implements `CacheStore<V>` from `lib/cache/ttlCache.ts` already):

- Every `TtlCache`: the `startSweep()` calls in `index.ts` list them
- `circuitOpenUntil` (`services/deezerService.ts`) and the MusicBrainz throttle `nextSlotAt` (`services/musicbrainzService.ts`)
- Rate limit buckets (`lib/rateLimit.ts`)

The `CacheStore<V>` interface exposes only sync `get/set/delete` to keep call sites unchanged. The Redis impl will sit behind a sync facade backed by an in-memory mirror — async writes to Redis happen in the background. Document the data loss window (typically < 1s) when migrating.

## What stays in-memory forever

- Per-request derived state (`auth.api.getSession()` already cached via Better Auth `cookieCache`).
