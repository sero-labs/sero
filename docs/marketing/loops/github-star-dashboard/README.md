# GitHub star dashboard (local draft loop)

An Orchestrator loop that tracks GitHub traction for `sero-labs/sero`. It is a
**local draft** for the Sero growth campaign — it lives here, not in the
official catalog, and installs as a draft the user reviews before it can run.

## What it does

Once a day it:

1. Reads repo metrics with read-only `gh api` GET calls: stars, forks,
   watchers, open issues, open PRs, per-release download counts, and the
   14-day traffic window (views, clones, referrers, paths).
2. Appends the raw snapshot to `docs/marketing/metrics/history.jsonl` and
   merges the per-day traffic buckets into
   `docs/marketing/metrics/traffic-days.json`. GitHub discards traffic data
   after 14 days, so every run captures it into these durable files.
3. Regenerates `docs/marketing/dashboard.md`: today's numbers, 7/30-day
   deltas, a 14-day daily traffic table, release downloads, top referrers and
   paths, and a coverage note for any missed days.
4. Appends the weekly row to `docs/marketing/metrics-log.md` when one is due
   (no data rows yet, or the newest row is 7+ days old). It covers every
   column of the manual weekly table, replacing the manual snapshot task, and
   never touches the Post-event deltas table.

## Trigger

Cron, daily at 07:30 UTC (`30 7 * * *` — the Orchestrator evaluates cron
schedules in UTC).

## Outputs

All outputs are files in the workspace:

- `docs/marketing/metrics/history.jsonl` — one JSON snapshot per day (append-only)
- `docs/marketing/metrics/traffic-days.json` — durable per-day traffic history
- `docs/marketing/dashboard.md` — regenerated trend dashboard
- `docs/marketing/metrics-log.md` — weekly snapshot row when due

## No external side effects

GitHub access is read-only (`gh api` GET only). The loop never posts,
comments, sends, commits, or pushes anything. Its only side effect is writing
the files above inside the workspace. Delivery destination is
`workspace-files` (internal), so no approval gate is required.

## Requirements

- `gh` CLI authenticated as a user with access to `sero-labs/sero`.
- Push access to the repo for the traffic endpoints (`traffic/views`,
  `traffic/clones`, `traffic/popular/*`). Without it the loop still runs and
  records `n/a` for traffic.

## Known limits

- Traffic data older than 14 days is gone forever — days the loop does not
  run cannot be backfilled.
- The newest traffic day is partial until GitHub finalises it; the loop
  overwrites recent days with the latest fetch on each run.
- Star/fork trends only reach back as far as the loop's own history, so
  deltas show `n/a` until snapshots accumulate.
