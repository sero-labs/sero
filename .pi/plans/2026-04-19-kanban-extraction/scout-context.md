# Context for: Kanban self-containment migration plan

## Architecture Map
- **Plugin-owned surface**: `plugins/sero-kanban-plugin/` already owns the board app, widget, extension tool, prompts, shared state contract, and settings descriptor.
- **Host-owned runtime**: `apps/desktop/electron/features/kanban/` owns the actual workflow engine: workspace watching, phase orchestration, planning/implementation/review subagents, worktree/PR lifecycle, preview/dev-server management, cleanup, and retry/recovery.
- **Generic host seams**: `appStateManager`, `shared-infra`, `workspaceManager`, `containerManager`, and the generic `appAgent.invokeTool` bridge are the reusable platform layers Kanban should sit on top of, not replace.
- **Current split**: the plugin owns the board/UI contract, while the host still owns the behavior that makes the board “real”. The migration target is to push Kanban-specific board behavior toward the plugin and leave only generic app/runtime primitives in the shell.

## Relevant Files
- `plugins/sero-kanban-plugin/extension/index.ts` — current plugin tool entrypoint; board CRUD, settings, review actions, error reporting, retrospective.
- `plugins/sero-kanban-plugin/ui/KanbanApp.tsx` — federated board UI; mutates local board state and uses `useAppState()`.
- `plugins/sero-kanban-plugin/ui/widgets/KanbanWidget.tsx` — dashboard widget owned by plugin.
- `plugins/sero-kanban-plugin/shared/types.ts` and `shared/settings-descriptor.ts` — canonical shared board/settings contract.
- `apps/desktop/electron/features/kanban/core/orchestrator.ts` — host watchdog/orchestrator entrypoint for state-file transitions.
- `apps/desktop/electron/features/kanban/core/orchestrator-phase-runners.ts` — planning/implementation/review/done phase execution and recovery logic.
- `apps/desktop/electron/features/kanban/review/actions/review-action-effects.ts` — host side effects for UI-triggered review actions (`request-revisions`, `cancel-pr`).
- `apps/desktop/electron/ipc/apps/app-state.ts` — host bridge that watches Kanban state files and notifies the orchestrator.
- `apps/desktop/electron/shared/infra/shared-infra.ts` — generic singleton wiring that injects Kanban orchestrator dependencies.
- `apps/desktop/electron/features/kanban/workspace/workspace-watch.ts` — host file watcher glue for Kanban state files.
- `apps/desktop/electron/features/kanban/worktree/*` — git/worktree/PR lifecycle helpers.
- `apps/desktop/electron/features/kanban/review/workflow/*`, `planning/*`, `implementation/*`, `quality/*` — phase-specific host execution helpers and prompts.
- `docs/deslopify/plugins/sero-google-plugin/plan.md` — reference migration pattern: add generic core capability first, then move domain runtime, then delete shell glue.
- `docs/deslopify/apps/desktop/electron/features/kanban/plan.md` and `facts.md` — current host-side Kanban refactor status.

## Exact Ownership Map

### Host (`apps/desktop/`)
Keep here only what is genuinely platform/runtime-specific:
- `apps/desktop/electron/ipc/apps/app-state.ts` — generic state-file watch/read/write IPC plus Kanban notification hook.
- `apps/desktop/electron/shared/infra/shared-infra.ts` — generic singleton wiring; should not grow Kanban-specific business logic.
- `apps/desktop/electron/features/apps/state/manager.ts` and `appStateManager` — generic persisted app-state transport.
- `apps/desktop/electron/features/container/*`, `workspaceManager`, `subagentManager`, `containerManager` — generic execution/runtime primitives.

Keep here only if the board must remain host-owned for technical reasons:
- `apps/desktop/electron/features/kanban/core/orchestrator.ts` and `orchestrator-phase-runners.ts` — currently the only place that knows how to drive Kanban phases from disk state into subagents/worktrees.
- `apps/desktop/electron/features/kanban/review/actions/review-action-effects.ts` — host-applied side effects for UI changes.
- `apps/desktop/electron/features/kanban/worktree/*`, `review/workflow/*`, `planning/*`, `implementation/*`, `quality/*` — host workflows that depend on git, gh, subagents, and workspace refresh.

### Plugin (`plugins/sero-kanban-plugin/`)
Already owns:
- board UI (`ui/KanbanApp.tsx`, `ui/components/*`, `ui/widgets/KanbanWidget.tsx`)
- board tool and slash command (`extension/index.ts`)
- shared state types/validation (`shared/*`)
- settings truth surface (`shared/settings-descriptor.ts`, `extension/workflow-actions.ts` / `SettingsPanel.tsx`)
- prompts/templates (`prompts/*`)

Likely to own next, if moved:
- any remaining Kanban-specific board mutation rules that are still duplicated in the UI or host shell
- any action contract or state-shaping logic that is still duplicated between the plugin UI and extension
- any UI-triggered review action semantics that can be expressed as plugin tools instead of host watchers

### Shared / Neutral
Should remain in shared/common/core seams, not in either Kanban package specifically:
- `@sero-ai/common` Kanban state, card, settings, and transition validation types/helpers
- generic app-tool invocation bridge (`appAgent.invokeTool`, `useAppTools()`)
- generic persisted state APIs (`appStateManager`)
- generic filesystem, workspace, container, subagent, and CLI bridge infrastructure

## Concrete Kanban-Specific Shell Surfaces Still Present Today
These are the shell-owned pieces that still make Kanban host-owned rather than plugin-owned:
- `apps/desktop/electron/features/kanban/core/orchestrator.ts` — watches Kanban files and dispatches phase transitions.
- `apps/desktop/electron/features/kanban/core/orchestrator-phase-runners.ts` — phase runners and recovery logic.
- `apps/desktop/electron/features/kanban/review/actions/review-action-effects.ts` — applies revision-request / cancel-PR side effects after UI state transitions.
- `apps/desktop/electron/features/kanban/worktree/worktree-manager.ts`, `worktree-git.ts`, `worktree-pr.ts`, `worktree-sync.ts`, `worktree-maintenance.ts` — git/worktree/PR lifecycle.
- `apps/desktop/electron/features/kanban/review/workflow/*` — review orchestration, branch sync, PR lifecycle, preview, completion.
- `apps/desktop/electron/features/kanban/planning/*` and `implementation/*` — subagent-driven planning and implementation execution.
- `apps/desktop/electron/features/kanban/quality/*` — verification and auto-merge monitoring.
- `apps/desktop/electron/features/kanban/workspace/*` — workspace watchers and container path helpers.
- `apps/desktop/electron/ipc/apps/app-state.ts` — the Kanban state-file notification hook embedded in the otherwise generic app-state IPC.
- `apps/desktop/electron/shared/infra/shared-infra.ts` — Kanban orchestrator wiring inside the generic singleton bootstrap.

## Likely Migration Phases and Prerequisites

### Prerequisites
1. **Decide the end-state boundary**: is the goal full plugin ownership of Kanban runtime, or only moving the UI/tool surfaces while host orchestration remains?
2. **Identify which host behaviors are truly generic** vs. Kanban-specific (state watch, phase orchestration, review side effects, cleanup, subagent execution).
3. **Preserve the shared file contract**: `.sero/apps/kanban/state.json`, `.sero/apps/kanban/errors.json`, review caches, and worktree conventions must stay stable or get a migration layer.
4. **Keep the generic app-tool bridge as the invocation mechanism** if any UI action moves out of host shell glue.

### Probable phases
1. **Contract audit / boundary lock**
   - Freeze which Kanban actions remain host-side effects and which become plugin-side tool actions.
   - Confirm the shared state contract and settings semantics are final enough to anchor migration.

2. **Move any remaining UI-local workflow mutations into canonical plugin actions**
   - Delete duplicate UI reducers/helper paths where the extension already owns the authoritative behavior.
   - Prefer tool calls or plugin-owned helper modules over ad hoc UI state mutation.

3. **Extract a plugin-owned Kanban runtime seam if feasible**
   - If the board can own more than just rendering, create a plugin-local action/runtime layer that the host invokes through generic app-tool execution.
   - Keep git/worktree/subagent/container primitives in host, but move the Kanban-specific policy and command shaping into the plugin.

4. **Reduce host watchers to a thin adapter**
   - Leave `appStateManager` / `shared-infra` / IPC plumbing in the shell.
   - Shrink the host Kanban orchestrator to a generic file-change adapter that delegates into plugin-owned behavior where possible.

5. **Delete obsolete shell glue**
   - Remove any Kanban-specific host glue that becomes redundant once the plugin owns the behavior.
   - Keep only the generic seams required by the desktop platform.

## Risks / Behavioral Contracts That Must Survive
- **State-file truthfulness**: malformed or partially-written Kanban JSON must not be silently reset to defaults.
- **Review action side effects**: `request-revisions` and `cancel-pr` currently do more than update cards; those GitHub/worktree/cache/error-log effects must survive or be intentionally replaced.
- **Autostart/recovery semantics**: cards stuck in `agent-working` are auto-recovered at startup; moving ownership must not strand work.
- **Cleanup visibility**: review-cache and worktree cleanup failures are best-effort but must remain visible.
- **Profile/workspace isolation**: Kanban state and workspace paths remain workspace-bound; any plugin migration must not leak across workspaces or profiles.
- **CLI/UI parity**: the UI, plugin tool, and host runtime must continue to describe the same board/settings semantics.

## Compare / Reference Pattern from Google Migration
The Google migration followed a clearer extraction pattern than Kanban currently has:
1. add a **generic core capability first** (`appAgent.invokeTool` / `useAppTools()`),
2. move the domain runtime into the plugin,
3. unify state shaping in shared plugin code,
4. rebase the UI onto the generic bridge,
5. delete shell-specific glue only after parity was proven,
6. keep host code only for generic runtime infrastructure.

For Kanban, the analogous pattern would be:
- first decide whether a generic “Kanban action bridge” is even needed beyond current `appStateManager` + plugin tools,
- then move any duplicated or UI-owned Kanban behavior into plugin-owned canonical modules,
- only after parity is clear, reduce host watchers/orchestrators to thin adapters.

Unlike Google, Kanban already has most of its UI and tool surface in the plugin; the big remaining question is whether the host workflow engine can be reduced without losing the automation semantics that make the feature useful.

## Open Questions for the Spec Agent to Ask the User
1. Do you want **full Kanban runtime self-containment** in the plugin, or only the remaining UI/tool surface cleanup while the host workflow engine stays in place?
2. Should the plugin eventually own the **state-change policy** for card transitions, or is host orchestration intentionally the long-term owner because it needs git/subagent/container access?
3. Which of the host Kanban behaviors are mandatory to preserve exactly: auto-start, recovery, review cleanup, PR cancellation, auto-merge, or all of them?
4. Is the goal to remove **all** Kanban-specific code from `apps/desktop/`, or just to eliminate duplicated / shell-owned UI surfaces and keep the runtime engine in host?
5. Should review actions (`request-revisions`, `cancel-pr`) remain host-applied side effects, or should they become plugin tool actions that the host merely invokes?
6. Is the shared `.sero/apps/kanban/*` file contract considered stable, or is a migration path acceptable if ownership moves?

## Most Relevant Files
- `plugins/sero-kanban-plugin/extension/index.ts`
- `plugins/sero-kanban-plugin/shared/types.ts`
- `plugins/sero-kanban-plugin/shared/settings-descriptor.ts`
- `plugins/sero-kanban-plugin/ui/KanbanApp.tsx`
- `plugins/sero-kanban-plugin/ui/widgets/KanbanWidget.tsx`
- `apps/desktop/electron/features/kanban/core/orchestrator.ts`
- `apps/desktop/electron/features/kanban/core/orchestrator-phase-runners.ts`
- `apps/desktop/electron/features/kanban/review/actions/review-action-effects.ts`
- `apps/desktop/electron/ipc/apps/app-state.ts`
- `apps/desktop/electron/shared/infra/shared-infra.ts`
- `docs/deslopify/plugins/sero-google-plugin/plan.md`
- `docs/deslopify/apps/desktop/electron/features/kanban/plan.md`
