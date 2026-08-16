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
- lifecycle races: a completion that read the Room before a cancel landed, a
  cancel or pause arriving after the Room finished, and two completions at
  once. A finished Room keeps the ending it reached, and only one caller
  delivers. A refused cancel stops before it aborts turns or checkpoints work;
- the Room stays `completing` until the result is delivered, work is preserved
  and the grant is revoked, so a crash during any of that is recoverable rather
  than looking like a clean finish;
- a pause that lands as the last turn ends still settles, instead of leaving
  the Room stuck in `pausing` until a restart;
- cleanup a restart interrupted. A finished Room that still holds a grant had
  its preservation and revocation cut short, so recovery finishes both;
- concurrent Start calls, cancellation during Start, and restart recovery for
  durable `starting` and `adjusting` claims;
- an adjustment that finishes after Start is refused and cannot replace the
  live Room record;
- capability removal suspends the member, closes its live handle, and commits
  the narrower configuration before the revision reports success;
- Room deletion preserves live work, revokes authority, and removes the host
  grant record and its transcript directory;
- restart lookup of an open question more than 500 messages behind the head;
- two members claiming the same path at once under the blocking policy, and one
  member's concurrent claims against its own cap;
- a member session that finishes building after its grant was revoked. The
  session is disposed instead of being registered under a dead grant;
- bounded message pages, timeline rotations, applied-command keys, live output,
  wake metrics, and session-pool size.

The four live evaluation Rooms add 24.9 minutes of mixed-model runtime coverage.
The longest run was 14.1 minutes. This report does not replace watching real
solo use once `SERO_ROOMS` is on for daily work.

## Security

The test suite verifies built-in-only persistent-session grants, canonical
paths, subject binding, resource filtering, model and permission limits,
Conductor-only commands, actor identity, authority-expansion approval, and
single-use delivery approval bindings. Peer text is message content only; it is
not parsed as approval or authority.

Permission-profile tests prove that read-only members receive no shell and
that unknown tools fail closed. Blueprint validation rejects command tools on
read-only members before approval.

Room commands use the AD-020 CLI bridge. Worktrees use the AD-024 unified Git
service. Models resolve through the AD-026 host ModelRuntime. Room code has no
second command tool set, Git implementation, credential store, or model
runtime.

## Performance and diagnostics

Wake telemetry records the time from a persisted wake signal to the resumed
turn start. It keeps only 1,000 local numeric samples and reports p95 without
prompt or message content. The final live validation recorded 61 wake samples
with a 927 ms p95; one 23.3-second outlier remains a watch item during real
solo use. A scheduler benchmark runs 10,000 passes across 21 ready members,
verifies oldest-first fairness, and has a one-second CI ceiling. Recovery
tests time out if reconciliation does not settle, and resource tests verify
the 1,000 wake-sample bound, session-pool cap, message-page retention,
timeline rotation, and worktree cleanup. Keep an eye on these measures once
Rooms are in daily use.
