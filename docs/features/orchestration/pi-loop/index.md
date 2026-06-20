# Clean-room analysis: pi-loop, pi-tasks, and pi-subagents

This directory contains a clean-room-oriented explanation of three related Pi extensions:

- `pi-loop`: cron/event re-wake loops, background process monitors, and a native fallback task system.
- `pi-tasks`: Claude Code-style task tracking, dependency management, reminders, auto-clear, process tracking, and subagent execution.
- `pi-subagents`: autonomous subagent execution with custom agent types, concurrency management, notifications, schedules, memories, skills, and worktree isolation.

The documents describe behavior, architecture, data models, runtime flows, and integration contracts. They intentionally avoid copying source code. Field names, tool names, event names, file names, and behavior descriptions are included because they are necessary interface facts for interoperability and clean-room reimplementation.

> Note: writing to absolute `/sero` failed because the root filesystem is read-only in this environment. These files were written to `./sero/` in the current repository instead.

## Documents

1. [pi-loop clean-room guide](./pi-loop.md)
2. [pi-tasks clean-room guide](./pi-tasks.md)
3. [pi-subagents clean-room guide](./pi-subagents.md)
4. [Cross-extension integration contracts](./integration-contracts.md)
5. [Replication blueprint](./replication-blueprint.md)

## Source repositories analyzed

- `/Users/danielcarter/Documents/Dev/projects/sero/repos/pi-github-repos/pi-loop`
- `/Users/danielcarter/Documents/Dev/projects/sero/repos/pi-github-repos/pi-tasks`
- `/Users/danielcarter/Documents/Dev/projects/sero/repos/pi-github-repos/pi-subagents`

## High-level system relationship

These extensions form a layered automation stack:

1. `pi-subagents` provides isolated worker agents. Other extensions can spawn or stop those agents through Pi's event bus.
2. `pi-tasks` provides a persistent work queue. It can execute tasks by delegating them to `pi-subagents` and can cascade along dependency edges.
3. `pi-loop` provides scheduled or event-driven re-wakes plus background shell monitors. It can create tasks in `pi-tasks`, or expose a smaller native task fallback when `pi-tasks` is absent.

Together, they support long-running coding workflows: create a task backlog, run background processes, wake the main agent on events or elapsed time, and delegate work to subagents when appropriate.

## Clean-room notes

For a clean-room implementation, treat this documentation as a specification of externally visible behavior and abstract architecture. Do not reuse source text, comments, internal naming beyond necessary interface names, or implementation structure line-for-line. A new implementation can preserve compatibility by matching the tools, event channels, storage semantics, and lifecycle flows described here while using independently written code.
