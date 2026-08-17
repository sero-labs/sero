# Orchestrator reference

Orchestrator is the built-in app with two independent execution modes:

| Mode | Runtime unit | Use |
| --- | --- | --- |
| [Workflows](/reference/workflows) | a saved plan with steps and runs | repeatable, scheduled, and event-driven work |
| [Rooms](/reference/rooms) | a temporary team with member sessions | collaborative work that can change direction |

The Orchestrator app id is `orchestrator`.

## Compatibility terms

The user interface calls the planned mode **Workflows**. Its existing command
API and files still use `loop`, `loopId`, and `loops/`. These names refer to a
Workflow. They remain unchanged so existing saved data, plugins, and commands
continue to work.

Rooms use `room`, `roomId`, and `rooms/` in both the interface and runtime.

## Permission boundary

Orchestrator manages plans, schedules, member sessions, limits, recovery, and
stored state. The Sero host remains responsible for tool access and approval.
Orchestrator cannot grant a tool or permission that the host refuses.

See [Security and Privacy](/reference/security-privacy) for the wider Sero
security model.

## Related pages

- [Orchestrator guide](/guide/orchestrator)
- [Workflows guide](/guide/workflows)
- [Rooms guide](/guide/rooms)
- [Workflows reference](/reference/workflows)
- [Rooms reference](/reference/rooms)
