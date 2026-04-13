# Deslop Log

Changes made during code quality passes. Most recent first.

---

## 2026-04-13

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/components/apps/useAppRuntimeMount.ts` | New — shared app/widget mount helper for session bootstrap, context assembly, and workspace mount-state gating |
| `apps/desktop/src/components/apps/SeroAppMount.tsx` | Replaced duplicated mount orchestration with the shared runtime helper (170 → 68 lines) |
| `apps/desktop/src/components/apps/dashboard/WidgetMount.tsx` | Replaced duplicated widget mount orchestration with the shared runtime helper and aligned workspace-loading semantics (161 → 81 lines) |
| `apps/desktop/src/components/apps/dashboard/Dashboard.test.tsx` | New — covers empty dashboard, mounted grid rendering, and persist-on-interaction-stop behavior |
| `apps/desktop/src/components/apps/dashboard/WidgetMount.test.tsx` | New — covers hydration, missing-workspace, runtime fallback, and missing-remote fallback states |
| `packages/app-runtime/src/{context.ts,widget-registry.ts,sero-bridge.ts}` | Replaced boundary `any`/cast patterns with typed globals and runtime-guarded bridge access |
| `apps/desktop/electron/cli/core/bridge-context.ts` | New — typed live/fallback ExtensionContext builders for bridged tools and slash commands |
| `apps/desktop/electron/cli/core/schema-bridge.ts` | Replaced schema/command-context `any` walking with typed helpers and extracted bridge-context support (403 → 427 lines) |
| `apps/desktop/electron/cli/core/tool.ts` | Replaced the bridged tool-update cast with a typed adapter (474 → 494 lines) |
| `apps/desktop/electron/cli/lib/gog-runner.ts` | Replaced `execFile` failure `any` casts with typed ENOENT/exit-code helpers |
| `packages/common/src/kanban.ts` | New — canonical shared Kanban card/state/validation contract for host + plugin |
| `packages/common/src/index.ts` | Exported the canonical Kanban contract from `@sero/common` |
| `apps/desktop/electron/features/kanban/core/types.ts` | Replaced duplicated host Kanban model with a thin `@sero/common` barrel (129 → 21 lines) |
| `apps/desktop/electron/features/kanban/{core/contracts.ts,core/state-helpers.ts,implementation/implementation-executor.ts}` | Switched host Kanban runtime to canonical shared validation/default-state helpers |
| `plugins/sero-kanban-plugin/shared/{types.ts,validation.ts}` | Replaced duplicated shared contract files with thin `@sero/common` re-exports (217 → 67 lines; 139 → 16 lines) |
| `plugins/sero-kanban-plugin/extension/{index.ts,state-io.ts,workflow-actions.ts}` | Narrowed the Kanban settings surface to runtime-backed fields and switched fallback state reads to the canonical factory |
| `apps/desktop/electron/__tests__/features/kanban/{auto-merge-monitor,contracts,implementation-executor,light-review-workflow,light-review,review-executor}.test.ts` | Updated Kanban settings fixtures to the narrowed shared contract |
| `plugins/sero-kanban-plugin/extension/__tests__/{review-actions,workflow-actions}.test.ts` | Updated Kanban extension tests and added coverage for the narrowed settings surface |
| `plugins/sero-kanban-plugin/extension/{state-io.ts,error-log.ts,index.ts}` | Hardened board/error-log reads to fail closed on malformed JSON and return recovery-oriented tool errors; added persisted-state tests |
| `plugins/sero-cron-plugin/extension/{state-io.ts,index.ts,runtime-helpers.ts}` | Hardened scheduler state reads, surfaced unreadable-state errors to tools/commands, and kept `extension/index.ts` at the 500-LOC cap by extracting runtime helpers |
| `plugins/sero-cron-plugin/extension/__tests__/state-io.test.ts` | Updated state-I/O coverage to assert fail-closed malformed-state behavior |
| `plugins/sero-memory-plugin/extension/{automation-state.ts,memory-tool-admin.ts}` | Stopped auto-consolidation from rewriting malformed cron state and surfaced a recovery-oriented admin/tool error instead |
| `plugins/sero-git-plugin/extension/{state-io.ts,__tests__/state-io.test.ts}` | Hardened Git app state reads to fail closed on malformed snapshots and added direct state-I/O coverage |
| `plugins/sero-web-plugin/extension/state-sync.ts` | Hardened workspace web state reads to fail closed on malformed JSON while preserving missing-file bootstrap behavior |
| `packages/common/src/{git-app.ts,cron-contract.ts,admin-bridge.ts,index.ts}` | New — neutral shared owners for Git app contracts, cross-plugin cron persistence types, and admin/web host bridge subsets |
| `packages/app-runtime/src/sero-bridge.ts` | Switched app-runtime’s Git bridge contract to the new canonical `@sero/common` types |
| `apps/desktop/{src/types/electron-apps.d.ts,electron/preload/apps/app-domain.ts,electron/ipc/apps/git-app.ts,electron/features/apps/git-app/manager.ts}` | Repointed the Git app bridge to one canonical shared contract across renderer, preload, IPC, and host manager |
| `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts` | Replaced the plugin-local `window.sero` contract copy with a canonical `@sero/common` admin bridge subset (473 → 259 lines) |
| `plugins/sero-cron-plugin/shared/types.ts` | Rebased the cron plugin’s persisted state contract on the new neutral shared cron contract |
| `plugins/sero-memory-plugin/extension/cron-types.ts` | Replaced the mirrored cron persisted types with canonical `@sero/common` imports |
| `plugins/sero-git-plugin/{shared/types.ts,ui/GitApp.tsx}` | Switched Git UI/shared types to the canonical shared bridge contract and removed the UI-side result cast |
| `plugins/sero-web-plugin/ui/lib/host.ts` | Replaced the local host bridge subset with canonical shared host-bridge typing |
| `{packages/app-runtime/tsconfig.json,packages/tsconfig.extension.json,plugins/sero-{kanban,context,cron,git,user-feedback,web}-plugin/ui/tsconfig.json}` | Added `@sero/common` path mappings so packages that compile against workspace source keep the new shared contracts type-safe |
| `packages/common/src/{web-app.ts,index.ts,admin-bridge.ts}` | New/updated — canonical web app action contract plus shared host-bridge exposure for deterministic web UI mutations |
| `packages/app-runtime/src/sero-bridge.ts` | Extended the typed preload bridge with the optional `webApp` action surface |
| `apps/desktop/{src/types/electron-apps.d.ts,src/types/electron.d.ts,src/types/ipc-channels.ts,electron/preload/apps/app-domain.ts,electron/preload/api.ts,electron/ipc/index.ts,electron/ipc/apps/web-app.ts,electron/features/apps/web-app/manager.ts}` | Added the canonical `webApp` bridge so Web UI history/bookmark/download mutations route through one host-owned action layer |
| `apps/desktop/electron/__tests__/features/apps/web-app-manager.test.ts` | New — covers clear-history, download deletion, and workspace-boundary validation for the new Web action bridge |
| `plugins/sero-web-plugin/ui/{lib/web-actions.ts,components/SearchHistory.tsx,components/BookmarkList.tsx,components/DownloadsList.tsx}` | Replaced direct `useAppState()` mutations with explicit host-backed Web app actions |
| `plugins/sero-context-plugin/{README.md,extension/index.ts,ui/ContextApp.tsx,ui/components/ContextTimeline.tsx}` | Reworded Context refresh/tag/checkout affordances as prompt-routed agent requests and removed the stale “real time” claim |

---

## 2026-04-12

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/electron/features/editor/lsp/lsp-manager.ts` | Added in-flight startup deduping so repeated `startServer()` calls share one workspace/language boot |
| `apps/desktop/electron/features/editor/lsp/lsp-process.ts` | Replaced protocol-boundary `any` reads with explicit initialize/configuration/error helpers |
| `apps/desktop/src/lsp/use-lsp.ts` | Replaced inline Monaco type import with a top-level namespace type import |
| `apps/desktop/electron/features/profile/manager.ts` | Hardened `profiles.json` parsing — malformed registries now fail closed instead of looking like first run |
| `apps/desktop/electron/features/auth/github/auth-manager.ts` | Removed base64-only GitHub token persistence fallback; secure storage is now required |
| `apps/desktop/electron/features/vcs/core/git-runner.ts` | Replaced `any`-typed exec failure handling with a shared typed normalizer |
| `apps/desktop/electron/features/subagent/core/tracker.ts` | Added parent-session bulk-abort tracker updates |
| `apps/desktop/electron/features/subagent/index.ts` | `abortAll()` now updates tracker state before aborting pool controllers |
| `apps/desktop/electron/features/subagent/runtime/runner.ts` | Removed `createAgentSession()` cast and `session!` assertion from the subagent runtime |
| `apps/desktop/electron/types/pi-coding-agent.d.ts` | New — local Pi SDK module augmentation for typed `systemPromptSuffix` support |
| `apps/desktop/electron/features/gateway/server/access-control.ts` | New — shared workspace/session/artifact authorization helpers for gateway requests |
| `apps/desktop/electron/features/gateway/bridge/web-tokens.ts` | Web tokens now carry explicit workspace scopes and validate to token records instead of booleans |
| `apps/desktop/electron/features/gateway/security/auth.ts` | Gateway auth now returns scoped auth results for master vs web-token clients |
| `apps/desktop/electron/features/gateway/index.ts` | Enforced scoped client access in connection state and filtered session-scoped push/broadcast events |
| `apps/desktop/electron/features/gateway/server/request-handler.ts` | Added workspace/session authorization checks for core gateway routes |
| `apps/desktop/electron/features/gateway/server/extended-handlers.ts` | Added workspace/session/artifact authorization checks for file/history/web-token routes |
| `apps/desktop/electron/features/gateway/server/protocol.ts` | Extended `create_web_token` request shape with explicit `workspaceIds` |
| `apps/desktop/electron/ipc/gateway/gateway-ops.ts` | `openSession()` now rejects workspace/session mismatches instead of silently reopening cross-workspace sessions |
| `apps/desktop/electron/ipc/gateway/gateway.ts` | QR/web-token IPC now creates workspace-scoped tokens |
| `apps/desktop/electron/preload/platform/host-services.ts` | Updated gateway bridge to require a workspace ID for QR login generation |
| `apps/desktop/src/types/electron-services.d.ts` | Updated renderer gateway API contract for workspace-scoped QR login generation |
| `apps/desktop/src/components/layout/ConnectDeviceDialog.tsx` | QR pairing now scopes remote access to the active workspace and surfaces that in the dialog |
| `apps/desktop/electron/features/gateway/channels/discord.ts` | Fixed `/sero abort` so it actually aborts the active session and reports failures |
| `apps/desktop/electron/preload/api.ts` | Split aggregate preload bridge into a thin composer (485 → 88 lines) |
| `apps/desktop/electron/preload/api/core.ts` | New — extracted shell/profile/workspace/session/agent/context-preset preload bridges |
| `apps/desktop/electron/preload/api/workbench.ts` | New — extracted VCS/terminal/editor/filetree preload bridges |
| `apps/desktop/electron/preload/agent/{local-models,models,prompts,skills,subagent}.ts` | Switched `IpcChannels` imports to `@/types/ipc-channels` |
| `apps/desktop/electron/preload/{apps/app-domain.ts,collaboration/index.ts,editor/debug-lsp.ts,integrations/google-imagegen.ts,integrations/plugins.ts,onboarding.ts,platform/host-services.ts,platform/user-feedback.ts}` | Switched `IpcChannels` imports to `@/types/ipc-channels` |
| `apps/desktop/src/hooks/useSessionAgent.ts` | Reduced to a thin composition wrapper over focused session-agent hooks (140 → 23 lines) |
| `apps/desktop/src/hooks/session-agent/useActiveSessionSync.ts` | New — owns active-session open/focus + collaboration hydration |
| `apps/desktop/src/hooks/session-agent/useContainerEnsureOnSessionFocus.ts` | New — owns container ensure flow for focused container-backed workspaces |
| `apps/desktop/src/hooks/session-agent/useSessionListRefreshOnAgentIdle.ts` | New — debounces bursty idle-triggered session-list refreshes |
| `apps/desktop/src/hooks/useWorkspaceFiles.ts` | Added bounded workspace-file cache eviction and stale-entry clearing on load failure (169 → 214 lines) |
| `apps/desktop/src/stores/agent.ts` | Deduplicated optimistic user-message enqueue and wired explicit buffer cleanup into open/close failure paths (495 → 461 lines) |
| `apps/desktop/src/stores/agent-utils.ts` | Added shared `appendOptimisticUserMessage()` + `clearAgentSessionBuffers()` helpers for renderer agent session cleanup (277 → 378 lines) |
| `apps/desktop/src/types/profile.ts` | New — canonical shared `ProfileInfo` contract for renderer + main-process profile flows |
| `apps/desktop/src/types/widget-manifest.ts` | New — shared widget manifest contract used by dashboard + app manifests |
| `apps/desktop/src/types/ipc.ts` | Switched profile contract ownership to `src/types/profile.ts`; kept `ipc.ts` as a thinner compatibility barrel (485 → 466 lines) |
| `apps/desktop/src/types/plugins.ts` | Broke the `ipc.ts` ↔ `plugins.ts` type-only cycle by importing `SeroAppManifest` directly from `sero-apps.ts` |
| `apps/desktop/src/types/sero-apps.ts` | Reused shared widget manifest contract instead of duplicating `SeroWidgetManifest` |
| `apps/desktop/src/types/dashboard.ts` | Reused shared widget manifest contract instead of maintaining a parallel `WidgetManifest` copy |
| `apps/desktop/electron/features/profile/types.ts` | Re-exported canonical `ProfileInfo` instead of maintaining a duplicated `KEEP IN SYNC` contract |
| `apps/desktop/electron/features/profile/manager.ts` | Added duplicate/overlap validation for custom profile roots while preserving managed `~/.sero-ui/profiles/*` child profiles (317 → 366 lines) |
| `apps/desktop/electron/ipc/workspace/profiles.ts` | Switched profile IPC handlers to the canonical shared `ProfileInfo` contract |
| `apps/desktop/electron/__tests__/features/profile/manager.test.ts` | New — covers allowed managed child profiles plus duplicate/overlap path rejection |
| `apps/desktop/electron/shared/infra/shared-infra.ts` | Added `refreshInfraModelSelection()` so cached default model selection updates after auth/model refreshes |
| `apps/desktop/electron/ipc/platform/auth/auth.ts` | Auth mutation paths now refresh both the model registry and cached shared default model |
| `apps/desktop/electron/features/workspace/manager.ts` | Centralized editor-state cleanup and now warn on non-ENOENT remove/close cleanup failures instead of swallowing them |

---

## 2026-04-06

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/components/layout/ToolCallState.tsx` | New — pure state helpers extracted from ToolCallHelpers (mapToolState, deriveGroupStatus, groupStatusIcon, groupStatusLabel, toolStatusDot, extractToolSummary, getCollapsedToolSummary) |
| `apps/desktop/src/components/layout/ToolCallHelpers.tsx` | Removed state helpers (now in ToolCallState); re-exports them for backward compat; only imports ChevronRight from lucide-react (477 → 310 lines) |
| `apps/desktop/src/components/layout/CollaborationFeedItems.tsx` | New — sub-components extracted from CollaborationActivityPanel (TypingDots, TypingBubble, MessageBubble, DebateRoundBubble, PhaseBanner, ElapsedTimer, OnlineRoster, useAutoScroll) |
| `apps/desktop/src/components/layout/CollaborationActivityPanel.tsx` | Now imports sub-components from CollaborationFeedItems; reduced from 470 → 120 lines |
| `apps/desktop/src/stores/workspace.ts` | Replaced hand-rolled `expandedSaveTimer + setTimeout` with `createDebouncedFn` from `useDebouncedCallback` |
| `apps/desktop/src/App.tsx` | Replaced shared `persistTimerRef + setTimeout` in two resize handlers with `useDebouncedCallback` (`persistMainSidebarSize`, `persistChatPanelSize`) |

---

## 2026-04-05

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/lsp/lsp-conversions.ts` | Removed `undefined as unknown as string` casts — `convertDocumentation` return type now includes `\| undefined` |
| `apps/desktop/src/components/layout/WorkspaceTree.tsx` | `handleNewSession`, `handleToggleContainer`, `handleClose` accept `React.MouseEvent \| React.KeyboardEvent` — 3 `as unknown as React.MouseEvent` casts removed |
| `apps/desktop/src/components/layout/AuthLoginDialog.tsx` | Replaced 3 `setTimeout(() => focus(), 50)` timing hacks with a single `useEffect` watching `phase` |
| `apps/desktop/src/components/layout/SessionBadge.tsx` | Replaced `setTimeout(fetchAll, 300/500)` pseudo-polling with direct `void fetchAll()` calls |
| `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` | Extracted duplicated `requestAnimationFrame` panel-sync pattern into `usePanelOpenSync` hook (494 → 451 lines) |
| `apps/desktop/src/components/apps/explorer/usePanelOpenSync.ts` | New hook — syncs a resizable panel's open/collapse state with a boolean flag via rAF |
| `packages/ui/src/components/ai-elements/prompt-input.tsx` | Split 1,341-line file into focused modules (see below). Now 410 lines (core component + barrel re-exports) |
| `packages/ui/src/components/ai-elements/prompt-input-context.tsx` | New — contexts, hooks, `PromptInputProvider`, `PromptInputActionAddAttachments` (252 lines) |
| `packages/ui/src/components/ai-elements/prompt-input-textarea.tsx` | New — `PromptInputTextarea` (117 lines) |
| `packages/ui/src/components/ai-elements/prompt-input-elements.tsx` | New — all thin wrapper components: Body, Header, Footer, Tools, Button, ActionMenu, Submit, Select, HoverCard, Tabs, Command (371 lines) |
