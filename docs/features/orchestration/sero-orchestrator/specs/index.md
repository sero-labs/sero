# Sero Orchestrator — technical spec

This is the formal technical spec and implementation plan for the Sero
Orchestrator: a workspace-scoped built-in plugin that runs durable workflow
loops over Sero's existing subagent, verification, VCS, and session primitives.

It turns the [analysis](../analysis/index.md) into buildable contracts. Every
host API, type, and seam referenced here was checked against the current
codebase; corrections to the analysis are called out inline.

## The loop

```text
goal -> plan -> change -> check -> learn -> fix -> stop
```

A loop holds a goal, a task plan, required checks, a stop rule, and an attempt
history. The coordinator advances one attempt at a time, runs checks against the
attempt's working directory, records what was learned, and either retries or
stops. Attempts run either as **background-worker** subagents or as **steers
into the user's active session**, both governed by the same loop state.

## Documents

| Doc | Contents |
| --- | --- |
| [00-architecture.md](00-architecture.md) | Principles, component map, execution ownership, coordinator lifecycle, resolved spec-gap decisions (D-01…D-16) |
| [01-data-model.md](01-data-model.md) | Full TypeScript state model: loop, attempt, workdir, checks, triggers, stop rule, worker instruction |
| [02-integration-seams.md](02-integration-seams.md) | Exact host APIs reused, the new session host seam, verified-facts table, corrections to the analysis |
| [03-execution-and-scheduling.md](03-execution-and-scheduling.md) | Coordinator state machine, the two execution adapters, scheduling/triggers/supervisor, runtime flows |
| [04-implementation-plan.md](04-implementation-plan.md) | Phased tasklist with acceptance criteria, progress dashboard, and FR traceability matrix |

## How to read this

- Start with [00-architecture.md](00-architecture.md) for the decisions that
  shape everything else.
- [02-integration-seams.md](02-integration-seams.md) is the source of truth for
  what already exists vs. what must be built. The implementation plan's task
  estimates depend on it.
- Track delivery in [04-implementation-plan.md](04-implementation-plan.md). The
  progress dashboard and per-task checkboxes are the live record — update them
  as work lands, alongside the loop ledger.

## Status

Phase 0 (this spec) is reviewed; the open product decisions are **confirmed**:

- **Scheduling:** catch-up-on-open — no always-on watcher (D-04).
- **Isolation:** live-chat steering stays on the main folder; isolated work is
  background-worker only (D-06).
- **Unsaved edits:** a dirty-root start gate offers auto-save / isolate / defer,
  auto-saving if you don't respond (D-07).

Phase 1 (plugin shell, state, control-plane tools/command, and UI) is built and
statically validated — see `plugins/sero-orchestrator-plugin/`. See the
[progress dashboard](04-implementation-plan.md#progress-dashboard) for the live
record.

## Non-goals

- A generic cross-plugin task queue (`pi-tasks` clone). Tasks stay loop-scoped
  until another product surface needs durable shared tasks — see
  [Phase 7](04-implementation-plan.md#phase-7--reusable-task-system-deferred).
- External (out-of-workspace) worktrees. Only Sero-managed in-workspace
  worktrees under `.sero/worktrees/` are supported until runtime path mapping is
  extended.
- Replacing cron. Cron remains the scheduled-reminder system; Orchestrator owns
  its own loop triggers and never executes attempts through cron's transient
  session runner.
