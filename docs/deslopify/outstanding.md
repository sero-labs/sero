# Deslopify Outstanding Work — Final Closeout Triage

_Last updated: 2026-04-16_

This file is no longer an active must-fix queue for the current deslopify
wave. The final closeout item has been completed, so the refactor wave should
now be considered **done**.

## Closeout status

### Active closeout items
- **0**

### Final item cleared in this pass
- `apps/desktop/electron/features/apps/discovery/index.ts`
  - Tightened `sero.plugin` metadata validation so malformed plugin metadata is
    warned and not silently declassified.
  - Preserved valid manifest behavior.
  - Added malformed-manifest regressions in
    `apps/desktop/electron/__tests__/features/apps/app-discovery.test.ts`.
  - Landed in `7330d6ee` (`fix(apps): validate malformed plugin metadata in discovery`).

## Decision

The deslopify refactor wave is complete.

From this point forward:
- there are **no active closeout items**
- no remaining Medium/Low cleanup should keep this wave open
- all remaining work below is **backlog only**

## Backlog only

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
- `plugins/sero-cron-plugin/ui/widgets/CronWidget.tsx`
  - tighten truthfulness/copy around next-fire behavior
- `plugins/sero-git-plugin/`
  - clear remaining helper duplication seams
- `plugins/sero-user-feedback-plugin/ui/UserFeedbackApp.tsx`
  - make bridge/preload failures visible instead of flattening to empty queue
- `plugins/sero-web-plugin/`
  - deduplicate remaining config-loader seams across provider modules

## Exit criteria

The previous exit criteria are now fully met:

1. tighter plugin metadata validation and tests ✅

## Summary

- **Refactor wave:** complete
- **Active closeout items:** 0
- **All remaining items:** backlog only
