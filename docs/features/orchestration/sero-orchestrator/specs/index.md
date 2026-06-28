# Sero Orchestrator — technical spec

Sero Orchestrator is a workspace-scoped built-in plugin that runs durable
autonomous loops.

The core flow is:

```text
user prompt
  -> LLM creates expected steps
  -> Orchestrator starts runnable steps
  -> steps report outcomes
  -> failures go back to the LLM for recovery or revision
  -> a planned step emits an explicit completion signal
```

The step list can contain one step or many steps. Steps can be sequential,
parallel, or a mix of both. Orchestrator does not need to know what the steps
mean. A step can implement code work, support triage, inbox review, competitor
research, experiment tuning, or any other work the LLM defines from the user's
prompt.

Orchestrator provides durable management:

- persist the prompt, generated step plan, run state, history, and artifacts;
- schedule and resume loops;
- start steps when their dependencies are satisfied;
- allow independent steps to run in parallel;
- apply the user's workspace isolation setting, defaulting to managed worktrees;
- protect dirty workspace roots before workspace-root workflow work starts;
- record step attempts and observations;
- ask the LLM how to recover from step failure;
- record explicit completion or blocked signals emitted by planned steps;
- enforce loop management limits such as max attempts, max concurrent steps,
  max wall-clock time, max tokens, and max cost;
- apply run and artifact retention through log policy.

Orchestrator does not add a second execution policy. Step work runs through
standard Sero agent/session/model execution and uses the normal Sero runtime
restrictions.

## Documents

| Doc | Contents |
| --- | --- |
| [00-architecture.md](00-architecture.md) | Principles, component map, loop planning, step execution, LLM recovery and completion |
| [01-data-model.md](01-data-model.md) | Full TypeScript state model: loop, user workspace settings, plan, steps, dependencies, attempts, limits, revisions |
| [02-integration-seams.md](02-integration-seams.md) | Host APIs reused for persistence, background agents, model decisions, scheduling, and active sessions |
| [03-execution-and-scheduling.md](03-execution-and-scheduling.md) | Prompt-to-plan flow, step scheduling, parallel execution, failure recovery, completion signals |
| [04-implementation-plan.md](04-implementation-plan.md) | Phased tasklist with acceptance criteria and FR traceability matrix |
| [05-branching.md](05-branching.md) | LLM-judged conditional branching: judge step, routing variables, guards, skip cascade, validation, branch-tree UI |
| [06-reflection.md](06-reflection.md) | On-demand loop reflection: durable run digests, history-driven improvement suggestions, per-loop + workspace Reflect, approve/reject inbox |

## Non-Goals

- A generic cross-plugin task queue. Orchestrator stores loop runtime data only.
- A new Orchestrator permission, approval, or tool policy system. Standard Sero
  agent/session/tool restrictions remain the execution authority.
- A workflow engine with built-in business process semantics. Orchestrator does
  not define concepts such as "issue", "ticket", "incident", "review", "test",
  or "fix".
- LLM-selected workspace isolation. Worktree use is a user-level loop setting,
  not part of the generated step plan.
- Heuristic completion. A loop completes only when a planned step emits an
  explicit completion signal.
- Replacing cron. Cron remains the scheduled-reminder system. Orchestrator owns
  its own triggers and does not execute through cron's transient session runner.
