---
name: musilogy-run
description: Run `musilogy run` or a heavy query on victorserv's full data, inside a memory-capped scope. Use before any Musilogy computation on the server.
---

# Heavy jobs on victorserv

`musilogy run` starts in a capped scope: `build.connect()` bounds DuckDB, but not the disk cache nor
Python, and the machine's services already take a good share. An unbounded query has frozen it before.

From the workstation, a command reaches victorserv through `victorserv claude '<command>'` (restricted
account, no prompt; it cannot read `/home/victormoi`) or `victorserv admin '<command>'` (victormoi, root
through sudo, asks every time). A direct `ssh` to victorserv is denied.

```bash
systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=3584M -p MemorySwapMax=0 \
  nice -n 10 uv --directory musilogy run musilogy run
```

- Co-listening over all listens needs more: `musilogy run` then starts in a scope aiming at 5.5 GB with
  6 GB at most, while the radio's weekly pass is not running.
- A target cap (`MemoryHigh`) sits above the measured peak, never on it: otherwise the kernel throttles
  the computation for hours. After the start, the unit's `memory.pressure` tells.
- `data/tmp/`, where DuckDB spills at tens of MB/s, points to the external SSD
  (`/media/plex/.musilogy-tmp`), never to the internal NVMe: that one holds the system, Docker, Postgres
  and the radio, and the spill once saturated it enough to slow the whole machine. Neither
  `IOSchedulingClass=idle` (NVMe on the `none` scheduler) nor `io.max` (not delegated to user units)
  throttled it.
- On the external SSD, the job starts as soon as it is ready, without waiting for the night. A unit that
  takes too much is frozen (`systemctl --user freeze`) and resumes where it was (`thaw`).
