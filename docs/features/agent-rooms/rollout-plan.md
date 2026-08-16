# Agent Rooms rollout and rollback plan

Sero has one developer. There is no separate internal cohort and no
reliability/cost owner other than the developer. This plan is the solo
version: enable the flag, use Rooms for real work, log the same measures a
cohort review would have checked, and confirm they sit within reasonable
boundaries.

## Entry gates

Before enabling for daily use:

- the full typecheck and Room test suite pass;
- no open critical security or data-loss finding exists;
- a backup and rollback exercise succeeds;
- Room IDs, failures, costs, and wake latency are all findable in local logs.

## Stages

1. Enable `SERO_ROOMS` and use Rooms for real work (not only the four scripted
   evaluation scenarios).
2. Log failures, intervention rate, p95 wake latency, recovery time, cost, disk
   growth, and worktree cleanup as they show up during that use.
3. Once the log shows no data loss, no authority-check failure, and resource
   growth stays bounded, record that in this document as complete.
4. Keep `SERO_ROOMS` as a permanent kill switch. Remove it only if it becomes
   genuinely unnecessary to keep — not on a fixed schedule.

## Stop conditions

Disable the flag for data loss, authority expansion, repeated duplicate
delivery, unbounded resource growth, or costs clearly outside what the four
evaluation runs already showed.

## Rollback

1. Remove `SERO_ROOMS` and restart Sero.
2. Keep the `rooms/` store and member Pi session files unchanged.
3. Export or back up Room data if the installed build cannot read it.
4. Restore the last compatible build.
5. Re-enable only after recovery tests pass on a copy of the affected data.

Rollback does not change Workflow records. It does not route work back to the
removed collaboration or debate engines.

