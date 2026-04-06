# Deslop Log

Changes made during code quality passes. Most recent first.

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
