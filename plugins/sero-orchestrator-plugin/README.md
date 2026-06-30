# Sero Orchestrator

A workspace-scoped built-in plugin that runs durable autonomous **loops**.

A loop turns a user prompt into an LLM-authored step plan, then durably runs the
steps: starting ready steps (sequential or parallel), recording outcomes, asking
the LLM how to recover from failures, and completing only when a planned step
emits an explicit completion signal.

Orchestrator owns **management** (persistence, scheduling, locks, attempt and
token limits, workspace isolation, restart recovery). Sero performs the **work**
through standard background agents, active sessions, and model calls. Orchestrator
adds no second permission, approval, or tool-policy layer.

## Layout

```
shared/      data model + defaults shared by runtime, extension, and UI
runtime/     coordinator, planner, scheduler, executors (Electron main)
extension/   `orchestrator` tool + `/orchestrator` slash command (bridged)
ui/          loop list, plan view, step status, attempts, controls (renderer)
```

## Actions

`create`, `list`, `show`, `activate`, `pause`, `resume`, `stop`, `run_next`,
`revise`, `choose_recovery` — all routed through the single per-workspace
coordinator via `requestAction`. UI, tools, and the slash command request
actions; only the coordinator starts steps or mutates loop runtime state.

See `docs/features/orchestration/sero-orchestrator/specs/` for the full spec.
