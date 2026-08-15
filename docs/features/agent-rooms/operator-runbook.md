# Agent Rooms operator runbook

## Enable or disable Room mode

Set `SERO_ROOMS=1` before Sero starts to enable Room mode. Remove the variable
or set it to `0` to disable it. When disabled, Sero creates no coordinator,
scheduler tick, or new Room state. Existing Room files stay on disk.

## Diagnose a Room

1. Record the Room ID and affected member ID.
2. Check the Sero logs for `room <id>` messages.
3. Check `room metric wake_latency_ms` lines for delayed resumed turns.
4. Inspect the Room timeline and current status in the UI.
5. Check model-provider availability, approvals, budget, active-turn capacity,
   and the member worktree.

Logs contain IDs, status, latency, and errors. They must not contain prompts,
message bodies, credentials, or approval content.

## Recover service

- **Interrupted state write:** restart Sero. The Room redo journal completes the
  accepted split-file transaction before Room state loads.
- **Provider or network failure:** restore the provider, then resume or retry.
  Failed turns do not grant new authority.
- **Stale member session:** pause and resume the Room. Sero reopens the standard
  Pi session from its bound session file.
- **Worktree conflict:** keep the member worktree. Resolve or collect its commit
  through the normal Git service. Do not delete uncommitted work.
- **Low disk:** stop new Rooms, restore disk space, and restart. Do not remove
  `rooms/transaction.json`; it is the recovery record.

## Roll back

Disable `SERO_ROOMS` and restart Sero. This stops Room execution without
changing Workflow behavior or deleting Room data. Export or back up the
profile's `rooms/` data and Room member session files before destructive
maintenance.

