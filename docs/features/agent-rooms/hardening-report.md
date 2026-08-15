# Agent Rooms hardening report

Date: 2026-08-14

## Storage and recovery

Room split-file transactions use a redo journal. The journal contains only the
changed write and delete operations. Startup replays it before loading Room
state. Tests interrupt a transaction between member writes and verify that a
new store reads one complete version.

Storage tests also cover migration, concurrent writes, message-page retention,
archive, delete, command idempotency, and missing optional files. An injected
write failure represents low-disk and filesystem write failures.

## Runtime resilience

The deterministic runtime suite covers:

- repeated message delivery, wait, wake, cursor lease, and restart recovery;
- live-session limits, disposal, reopening, and stale-handle reconciliation;
- compaction at safe turn boundaries and checkpoint preservation;
- mixed member models and provider failures;
- retries, cancellation, hard budgets, revision races, delivery races, message
  storms, deadlocks, and worktree conflicts;
- bounded message pages, timeline rotations, applied-command keys, live output,
  wake metrics, and session-pool size.

The four live evaluation Rooms add 24.9 minutes of mixed-model runtime coverage.
The longest run was 14.1 minutes. This report does not replace internal-cohort
monitoring.

## Security

The test suite verifies built-in-only persistent-session grants, canonical
paths, subject binding, resource filtering, model and permission limits,
Conductor-only commands, actor identity, authority-expansion approval, and
single-use delivery approval bindings. Peer text is message content only; it is
not parsed as approval or authority.

Room commands use the AD-020 CLI bridge. Worktrees use the AD-024 unified Git
service. Models resolve through the AD-026 host ModelRuntime. Room code has no
second command tool set, Git implementation, credential store, or model
runtime.

## Performance and diagnostics

Wake telemetry records the time from a persisted wake signal to the resumed
turn start. It keeps only 1,000 local numeric samples and reports p95 without
prompt or message content. Production cohort data is still required to approve
the two-second target. A scheduler benchmark runs 10,000 passes across 21 ready
members, verifies oldest-first fairness, and has a one-second CI ceiling.
Recovery tests time out if reconciliation does not settle, and resource tests
verify the 1,000 wake-sample bound, session-pool cap, message-page retention,
timeline rotation, and worktree cleanup. Operators must still watch these
measures during cohort rollout.
