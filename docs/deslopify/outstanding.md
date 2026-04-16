# Deslopify Outstanding Work

_Last aggregated: 2026-04-16_

This is a standalone aggregation of **existing** deslopify backlog only.
It does **not** introduce new tasks; every item below comes from:

- `docs/deslopify/index.md`
- the corresponding `docs/deslopify/**/plan.md` file

## Group tracking

- [x] **Group 1 — Core desktop boundary hardening**
- [ ] **Group 2 — Host app/plugin lifecycle and manager ownership**
- [ ] **Group 3 — Runtime orchestration and tool-surface cleanup**
- [ ] **Group 4 — Remaining plugin follow-ups and review-only plugin backlog**

## Group 1 — Core desktop boundary hardening *(completed 2026-04-16)*

### apps/desktop/electron/shared/
Source: `docs/deslopify/apps/desktop/electron/shared/plan.md`

- **High** — Make settings parse failures non-destructive instead of silently returning `{}`.
- **Medium** — Split `shared-infra.ts` into focused registrar modules while preserving its exported singleton API.
- **Low** — Remove the dead provider-manifest helper and move provider-manifest caching toward mutation-driven invalidation.
- **Low** — Deduplicate the user-feedback bus singleton key/factory across host and plugin code.

### apps/desktop/electron/preload/
Source: `docs/deslopify/apps/desktop/electron/preload/plan.md`

- **High** — Add a compile-time conformance check between `seroPreloadApi` and the declared preload API contract.
- **Medium** — Replace remaining weak `any`/`unknown` preload bridge signatures with canonical types.
- **Low** — Align the layout bridge with canonical `LayoutState` / `LoadedLayoutState` contracts.

### apps/desktop/electron/ipc/
Source: `docs/deslopify/apps/desktop/electron/ipc/plan.md`

- **High** — Remove/contain remaining `any` and `as any` escape hatches in critical IPC paths.
- **Medium** — Split the near-cap core agent IPC files (`agent.ts`, `agent-helpers.ts`) by responsibility.
- **Medium** — Migrate IPC handler `IpcChannels` imports off `@/types/ipc` onto `@/types/ipc-channels`.
- **Medium** — Replace sync filesystem calls in on-demand IPC handler paths with async equivalents where practical.
- **Medium** — Encapsulate private SDK-field access behind a single adapter with explicit guardrails.
- **Low** — Introduce a shared IPC event broadcaster helper for repeated `BrowserWindow` fanout boilerplate.

### apps/desktop/electron/platform/
Source: `docs/deslopify/apps/desktop/electron/platform/plan.md`

- **High** — Tighten production CSP (remove overly broad script/frame allowances where not required).
- **Medium** — Add uninstall symmetry to extension-asset protocol registration.
- **Medium** — Unify builtin package detection into one canonical helper shared by runtime and build tooling.
- **Low** — Refactor env bootstrap into explicit staged init while preserving pre-SDK ordering guarantees.

## Group 2 — Host app/plugin lifecycle and manager ownership

### apps/desktop/electron/features/plugins/
Source: `docs/deslopify/apps/desktop/electron/features/plugins/plan.md`

- **High** — Fix plugin discovery taxonomy drift (`sero-ai-plugin` vs `sero-agent-plugin`).
- **High** — Make plugin-manager settings mutation fail-safe on malformed `settings.json`.
- **Medium** — Split `features/plugins/manager.ts` into focused lifecycle modules.
- **Medium** — Make local source builds deterministic even when `node_modules` is already present.
- **Medium** — Add uninstall symmetry for discovery path registration (`unregisterAppPath`).
- **Low** — Add scoped diagnostics for silent bridge-policy parse/read failures.

### apps/desktop/electron/features/apps/
Source: `docs/deslopify/apps/desktop/electron/features/apps/plan.md`

- **Medium** — Decouple the remaining host/plugin boundary in `git-app/manager.ts` from plugin internals.
- **Medium** — Tighten discovery plugin metadata validation and add malformed-manifest tests.
- **Medium** — Split `createSeroExtensionFactory` into focused registrar modules.
- **Low** — Add an unsubscribe path for long-lived `onFileChange()` listeners.

### apps/desktop/electron/features/workspace/
Source: `docs/deslopify/apps/desktop/electron/features/workspace/plan.md`

- **Medium** — Extract lifecycle/registry submodules from `WorkspaceManager` to keep `manager.ts` comfortably below the cap.
- **Low** — Replace the watcher `any` catch path with typed error normalization.

### apps/desktop/electron/features/profile/
Source: `docs/deslopify/apps/desktop/electron/features/profile/plan.md`

- **Low** — Tighten copy/setup diagnostics and remove dead helper surface in profile setup/copy flows.

## Group 3 — Runtime orchestration and tool-surface cleanup

### apps/desktop/electron/features/container/
Source: `docs/deslopify/apps/desktop/electron/features/container/plan.md`

- **Medium** — De-duplicate host/container coding-tool logic between `tools/tools-coding.ts` and `tools/tools-host.ts`.
- **Medium** — Split the near-cap container files before they breach the 500-LOC rule.
- **Low** — Remove or wire the write-only `metricsByWorkspace` state in `tools/tools-browser-agent.ts`.

### apps/desktop/electron/features/kanban/
Source: `docs/deslopify/apps/desktop/electron/features/kanban/plan.md`

- **Low** — Remove or formally land the dead specialized-review scaffolding (`buildQualityReviewPrompt()`) and the currently test-only `core/wave-resolver.ts`.

### apps/desktop/electron/features/subagent/
Source: `docs/deslopify/apps/desktop/electron/features/subagent/plan.md`

- **Low** — Fix loader comments so they match the real reduced extension-factory behavior.

### apps/desktop/electron/features/vcs/
Source: `docs/deslopify/apps/desktop/electron/features/vcs/plan.md`

- **Low** — Replace locale-dependent checkpoint descriptions with deterministic formatting.

### apps/desktop/electron/cli/
Source: `docs/deslopify/apps/desktop/electron/cli/plan.md`

- **Low** — Decide whether CLI parsing remains long-flags-only or gains scoped short-flag support, then make shared parsing truthful so command-local workarounds disappear.

## Group 4 — Remaining plugin follow-ups and review-only plugin backlog

### Review-only backlog

#### plugins/sero-alibaba-plugin/
- Narrow provider-plugin review pending (`docs/deslopify/index.md` only; no `plan.md` is currently tracked)

### plugins/sero-context-plugin/
Source: `docs/deslopify/plugins/sero-context-plugin/plan.md`

- **Low** — Surface snapshot-write failures more explicitly instead of leaving the dashboard silently stale.

### plugins/sero-cron-plugin/
Source: `docs/deslopify/plugins/sero-cron-plugin/plan.md`

- **Low** — Tighten `ui/widgets/CronWidget.tsx` so the widget’s copy/labels do not imply more truthful next-fire behavior than it actually provides.

### plugins/sero-git-plugin/
Source: `docs/deslopify/plugins/sero-git-plugin/plan.md`

- **Low** — Clear the remaining duplication seams around `git-default-branch.ts`, branch-color ownership, and shared relative-date formatting.

### plugins/sero-memory-plugin/
Source: `docs/deslopify/plugins/sero-memory-plugin/plan.md`

- **Low** — Split `extension/memory-tool.ts` by action family before it becomes the next near-cap everything-hub.

### plugins/sero-user-feedback-plugin/
Source: `docs/deslopify/plugins/sero-user-feedback-plugin/plan.md`

- **Low** — Make bridge/preload failures visible in `ui/UserFeedbackApp.tsx` instead of silently flattening to an empty queue.

### plugins/sero-web-plugin/
Source: `docs/deslopify/plugins/sero-web-plugin/plan.md`

- **Low** — Deduplicate the remaining config-loader and host-bridge typing seams across the provider modules.

## Summary

Outstanding tracked work items: **27**

Breakdown:
- Review-only backlog: **1**
- High: **2**
- Medium: **9**
- Low: **15**

Grouped delivery breakdown:
- Group 1 — **0** tasks remaining *(completed 2026-04-16)*
- Group 2 — **13** tasks
- Group 3 — **7** tasks
- Group 4 — **7** items

If this file drifts, the source of truth remains the individual `docs/deslopify/**/plan.md` files plus `docs/deslopify/index.md`.
