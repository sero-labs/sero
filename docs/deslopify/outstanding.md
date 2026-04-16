# Deslopify Outstanding Work — Final Closeout Triage

_Last updated: 2026-04-16_

This file is no longer a raw aggregation of every lingering deslopify note.
It is the **final closeout triage** for finishing the current refactor process
without dragging low-value cleanup on indefinitely.

Validation against the live codebase confirmed that several previously tracked
items were already complete, and that the remaining work is mostly
**Medium/Low backlog** rather than true release-blocking cleanup.

## Decision

To finish the deslopify effort:

- Keep only a **small must-fix closeout scope** active.
- Mark completed/stale work as **closed**.
- Move structural cleanup and low-priority polish to the **backlog**.

## Must-fix before declaring the refactor complete

This is the only remaining item that should stay in the active queue.
It is not "nice to have" cleanup; it still represents real runtime or
behavior risk.

### 1. Tighten plugin metadata validation in app discovery
Source: `docs/deslopify/apps/desktop/electron/features/apps/plan.md`

- **Priority:** Closeout
- **Files:**
  - `apps/desktop/electron/features/apps/discovery/index.ts`
- **Issue:** Malformed `sero.plugin` metadata is still loosely validated and
  can be silently misclassified.
- **Why it stays active:** This is the last notable correctness gap in plugin
  discovery behavior.

## Closed now

These items should be treated as complete, stale, or not worth keeping this
multi-day refactor open.

### Already completed in live code
- Plugin discovery taxonomy drift (`sero-ai-plugin` vs `sero-agent-plugin`)
- Plugin-manager malformed `settings.json` safety
- Deterministic local/git source plugin build prep (`package-build.ts` now always reinstalls before source builds, even if `node_modules` already exists)
- Uninstall symmetry for plugin discovery path registration (`2d15e329`)
- All Group 1 hardening work already marked complete in individual plans
- Web plugin host-bridge typing cleanup
- Every item already marked executed in the individual `docs/deslopify/**/plan.md`
  files

### Close without further work
These are real but too small to keep the deslopify closeout open:
- `apps/desktop/electron/features/subagent/runtime/loader.ts`
  - loader comment mismatch
- `apps/desktop/electron/features/vcs/core/vcs-manager.ts`
  - locale-dependent checkpoint description formatting

## Move to backlog

The following work remains valid, but it should be treated as normal backlog
instead of active deslopify closeout.

### Structural / cap-pressure backlog
- `apps/desktop/electron/features/plugins/manager.ts`
  - split into focused lifecycle modules
- `apps/desktop/electron/features/apps/extensions/create-sero-extension.ts`
  - split into focused registrar modules
- `apps/desktop/electron/features/workspace/manager.ts`
  - extract lifecycle/registry submodules
- `apps/desktop/electron/features/container/`
  - split near-cap files before they exceed the limit
- `apps/desktop/electron/features/container/`
  - de-duplicate host/container coding tool logic
- `plugins/sero-memory-plugin/extension/memory-tool.ts`
  - split by action family before it becomes the next hub

### Architecture / ownership backlog
- `apps/desktop/electron/features/apps/git-app/manager.ts`
  - decouple remaining host/plugin boundary from plugin internals
- `apps/desktop/electron/features/apps/state/manager.ts`
  - add unsubscribe path for `onFileChange()` listeners

### Diagnostics / low-priority polish backlog
- `apps/desktop/electron/features/plugins/bridge-policy.ts`
  - add scoped diagnostics for silent bridge-policy parse/read failures
- `apps/desktop/electron/features/profile/`
  - tighten copy/setup diagnostics and remove dead helper surface
- `apps/desktop/electron/features/kanban/`
  - remove or formally land dead specialized-review scaffolding
- `plugins/sero-context-plugin/`
  - surface snapshot-write failures more explicitly
- `plugins/sero-cron-plugin/ui/widgets/CronWidget.tsx`
  - tighten truthfulness/copy around next-fire behavior
- `plugins/sero-git-plugin/`
  - clear remaining helper duplication seams
- `plugins/sero-user-feedback-plugin/ui/UserFeedbackApp.tsx`
  - make bridge/preload failures visible instead of flattening to empty queue
- `plugins/sero-web-plugin/`
  - deduplicate remaining config-loader seams across provider modules

## Exit criteria

The deslopify refactor process should be considered complete when the one
closeout item above is finished:

1. tighter plugin metadata validation and tests

After those land:
- mark the refactor process complete
- stop treating the backlog above as part of this cleanup wave
- track backlog items through normal planning instead of deslopify closeout

## Summary

### Active closeout items
- **1**

### Closed now
- completed/stale items from the old aggregation
- small non-blocking cleanup items that should not hold the refactor open

### Backlog only
- all remaining structural, ownership, and polish follow-ups

This file is now the source of truth for ending the current deslopify wave
cleanly and avoiding more duplicated effort.
