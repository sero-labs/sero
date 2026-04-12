# Refactoring Plan — apps/desktop/electron/features/apps

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/features/apps` is functionally important and mostly within size limits, but it carries concentrated boundary debt: watcher lifecycle races in shared state infrastructure, multiple `any` escape hatches in extension helpers, and direct host imports from plugin internals. The plan focuses on hardening reliability and contracts first, then reducing coupling so this layer can evolve without breaking app/plugin boundaries.

## Issues Found (prioritized)
- **High** — Watcher bootstrap race can miscount refs and leak state watchers — `apps/desktop/electron/features/apps/state/manager.ts:128-153` starts async setup before a map entry exists, while `unwatch` assumes a registered entry (`state/manager.ts:159-168`). Concurrent watch/unwatch calls can leave orphan watchers or incorrect ref counts in a module used by IPC/kanban/git state flows. Effort: **M**.

- **High** — Type-safety escape hatches in extension paths — `apps/desktop/electron/features/apps/extensions/git-checkpoints.ts:19-20,26` uses `any` for message content parsing, and `apps/desktop/electron/features/apps/extensions/ui-context.ts:51,63` uses `undefined as never` plus `theme: any`. These bypass strict contracts on agent-extension boundaries. Effort: **S**.

- **Medium** — Host code is coupled to plugin-internal modules — `apps/desktop/electron/features/apps/extensions/skill-visibility.ts:2` imports admin-plugin shared helper, and `apps/desktop/electron/features/apps/git-app/manager.ts:4-6` imports git-plugin extension internals. This makes core host behavior depend on plugin package structure and fights AD-001 ownership boundaries. Effort: **M**.

- **Medium** — Discovery contract drift around plugin metadata classification — `apps/desktop/electron/features/apps/discovery/index.ts:97-123` casts category strings instead of validating the union, and `discovery/index.ts:181` sets `isPlugin` from parsed meta truthiness rather than explicit `sero.plugin` presence. Malformed manifests can silently degrade plugin behavior/visibility. Effort: **S**.

- **Medium** — `createSeroExtensionFactory` is an integration hotspot with mixed responsibilities — `apps/desktop/electron/features/apps/extensions/create-sero-extension.ts:52-241` combines prompt wiring, provider logging, notifications, workspace commands, git checkpoint features, and subagent tool registration. This is still under the LOC cap but already hard to reason about and extend safely. Effort: **M**.

- **Low** — File-change listener API has no unsubscribe path — `apps/desktop/electron/features/apps/state/manager.ts:45-47` only appends listeners, so repeated handler registration in tests/dev reload scenarios can accumulate callbacks. Effort: **S**.

## Proposed Refactoring
1. **Make app-state watch registration deterministic and race-safe.**
   - Insert a placeholder watch entry before async filesystem prep starts.
   - Track init state (`initializing`, `cancelled`) so `unwatch` can cancel pending setup.
   - Ensure concurrent `watch(filePath)` calls coalesce into one setup path with correct ref counting.
   - Aligns with reliability expectations for shared infra used by IPC + orchestration layers.

2. **Remove `any`/unsafe casts from extension helper surfaces.**
   - Introduce narrow type guards for assistant message content blocks in `git-checkpoints.ts`.
   - Replace `theme: any` and `undefined as never` in `ui-context.ts` with explicit typed stubs matching `ExtensionUIContext`.
   - Keep fallback/no-op behavior unchanged while restoring compile-time checks.

3. **Decouple host features from plugin package internals.**
   - Move shared skill-visibility helpers to a neutral shared module (`packages/common` or `electron/shared/**`) and import from there in both host + admin plugin.
   - Define a host-owned git app service boundary so `git-app/manager.ts` consumes a stable API rather than plugin extension file paths.
   - Aligns with AD-001 boundary intent and plugin technical docs that treat plugins as independently evolvable.

4. **Harden app-discovery manifest parsing.**
   - Validate `plugin.category` against canonical `PluginCategory` values instead of force-casting.
   - Distinguish “plugin declared” from “plugin metadata valid”: preserve `isPlugin` based on manifest key presence, while surfacing invalid metadata diagnostics.
   - Add focused tests for malformed `sero.plugin` manifests.

5. **Split extension factory wiring into focused registrars.**
   - Extract modules such as `registerPromptHooks`, `registerWorkspaceCommands`, `registerNotificationBridge`, and `registerAgentManagementTools`.
   - Keep `createSeroExtensionFactory` as a thin composition root.
   - Reduces change risk as AD-020/AD-021 behaviors continue to evolve.

## Benefits & Trade-offs
- Benefits: safer watcher lifecycle behavior, better type guarantees in agent-extension paths, lower host/plugin coupling, and clearer ownership in extension wiring.
- Trade-offs: moderate churn across host + plugin shared contracts, plus some test updates for discovery and watcher behavior.

## Dependencies & Risks
- Host/plugin decoupling requires coordinated updates in `plugins/sero-admin-plugin` and `plugins/sero-git-plugin` to avoid temporary import breakage.
- Watcher lifecycle changes touch kanban/git/settings reload paths; regression testing should cover rapid watch/unwatch and atomic write rename events.
- Discovery classification tweaks may change plugin-manager visibility for malformed packages; include migration notes in release PR if behavior changes.

## Next Steps
1. Fix High items first: watcher bootstrap/refcount race and all `any` escape hatches.
2. Extract plugin-shared helpers to neutral contracts and update imports in host/plugin packages.
3. Tighten discovery plugin metadata validation and add malformed-manifest tests.
4. Split `createSeroExtensionFactory` into registrar modules before adding new extension hooks.
5. Continue Wave A: `deslopify apps/desktop/electron/features/plugins`.
