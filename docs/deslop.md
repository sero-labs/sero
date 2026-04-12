# Deslop Log

Changes made during code quality passes. Most recent first.

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
