# Agent Rooms runtime gate report

Date: 2026-08-14

## Result

The completed runtime passed its pre-release gate behind `SERO_ROOMS`. The
runtime tests use temporary repositories and direct runtime APIs. They do not
depend on the Room UI.

The test suite covers:

- temporary Git repositories, separate member worktrees, path claims, and
  preservation of uncommitted work;
- approval ownership and authority checks;
- invoking-chat and external delivery, including duplicate-delivery guards;
- path-derived Room and member usage grouping without an Orchestrator store
  lookup;
- restart reconciliation, concurrent session limits, waiting, wake events,
  deadlock handling, compaction, cancellation, and completion.

The live evaluation then ran four complete Rooms on one flagged build. All four
completed without intervention. They ran for 2.6 to 14.1 minutes and used
different rosters and models. See [evaluation.md](./evaluation.md) for the
scenarios, measurements, and defects found during the runs.

## Scope

This is the bounded runtime gate for Phase 6. It is not the long-running
production soak required by Phase 9. Phase 9 still covers repeated wait, wake,
dispose, reopen, and compaction over long runs, plus resource-growth checks and
failure injection.

