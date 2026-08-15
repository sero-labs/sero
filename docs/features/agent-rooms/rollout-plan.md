# Agent Rooms rollout and rollback plan

## Entry gates

Before cohort release:

- the full typecheck and Room test suite pass;
- no open critical security or data-loss finding exists;
- a backup and rollback exercise succeeds;
- operators can find Room IDs, failures, costs, and wake latency in local logs;
- reliability and cost owners approve the cohort limits.

## Stages

1. Enable `SERO_ROOMS` for the Room development team.
2. Run delivery, adversarial, parallel-work, and chat-origin Rooms.
3. Expand to a small internal cohort. Review failures, intervention rate, p95
   wake latency, recovery time, cost, disk growth, and worktree cleanup weekly.
4. Expand only when no data is lost, authority checks hold, resource growth is
   bounded, and reliability and cost targets are approved.
5. Remove the flag only after explicit general-availability approval.

## Stop conditions

Stop expansion for data loss, authority expansion, repeated duplicate delivery,
unbounded resource growth, or costs outside the approved envelope. Disable the
flag for severe failures.

## Rollback

1. Remove `SERO_ROOMS` and restart Sero.
2. Keep the `rooms/` store and member Pi session files unchanged.
3. Export or back up Room data if the installed build cannot read it.
4. Restore the last compatible build.
5. Re-enable only after recovery tests pass on a copy of the affected data.

Rollback does not change Workflow records. It does not route work back to the
removed collaboration or debate engines.

