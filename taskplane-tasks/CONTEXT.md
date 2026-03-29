# General — Context

**Last Updated:** 2026-03-29
**Status:** Active
**Next Task ID:** TP-005

---

## Current State

This is the default task area for sero. Tasks that don't belong
to a specific domain area are created here.

Taskplane is configured and ready for task execution. Use `/task` for single
tasks or `/orch all` for parallel batch execution.

Active staged work is tracked in `taskplane-tasks/PROGRESS.md`.

---

## Key Files

| Category | Path |
|----------|------|
| Tasks | `taskplane-tasks/` |
| Progress | `taskplane-tasks/PROGRESS.md` |
| Config | `.pi/task-runner.yaml` |
| Config | `.pi/task-orchestrator.yaml` |

---

## Technical Debt / Future Work

_Items discovered during task execution are logged here by agents._

- 2026-03-29 — CLI bridge cancellation now aborts timed-out commands and suppresses late UI updates, but direct coverage still exercises synthetic in-memory commands rather than one of the real bridged extension tools end-to-end. Consider adding an integration-style test around `schema-bridge.ts` + a mocked `ToolDefinition` to guard the exact abort contract at the bridge boundary.
- 2026-03-29 — Built-in plugin packaging now stages plugin-local runtime dependencies into `dist/electron/builtin/.../node_modules`, but only the web plugin is covered by a focused regression test. Consider extracting the staging logic into a shared helper plus a generic artifact contract test for every built-in plugin with declared runtime dependencies, especially future native-module users.
