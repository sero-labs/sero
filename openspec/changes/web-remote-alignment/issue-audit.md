# Web-remote alignment: issue audit and grooming

Scope: all open issues with the `web-remote` label (#253–#262, 10 issues; #241 is closed as duplicate of #255).
Goal: modernise `apps/web-remote` so it matches the desktop renderer in look, layout and design tokens, and deliver the labelled features on that base.

## Baseline (what exists today)

| Area | web-remote today | Desktop reference | Gap |
| --- | --- | --- | --- |
| Theme | `<html class="dark">` hard-coded; logo uses `invert`; `prose prose-invert` classes with no typography plugin | `stores/theme.ts`: `light \| dark \| system`, `.dark` on `documentElement`, mode cycle button in StatusBar | No light mode, unstyled markdown |
| Tokens | Tailwind palette colours (`text-emerald-500`, `text-green-500`, `text-yellow-500`, `text-blue-500`) | `text-status-success`, `text-status-warning`, `bg-[var(--bg-surface)]`, `text-[var(--text-muted)]` | Off-token colours |
| Shell | header `h-11`, sidebar `w-56`, status bar `h-7`, right panel via header icon buttons | `TitleBar h-10`, sidebar `ResizablePanel` 20% / min 200px, `StatusBar h-6 text-xs`, Explorer `ActivityBar w-10` rail | Sizes and switching pattern differ |
| Chat header | none | `ChatPanel` header `h-9`: Bot icon, `AGENT` label, session chip, `SessionBadge` (context % · cost) | Missing |
| Sidebar | `Select` for workspace, flat session buttons | `WorkspaceTree` → `WorkspaceNode` (chevron, Folder, status dot, `Plus` new session) → `SessionNode` (active rail, brand icon, title, `relative time · N msgs`), `Search sessions...` field `h-7` | Different pattern |
| Messages | `react-markdown` + `rehype-highlight`, custom bubbles + avatars | `ai-elements/message`: `Message`, `MessageContent`, `MessageResponse` (Streamdown) | Different renderer and layout |
| Thinking | custom `ThinkingBlock` | `ThinkingBlock` card, auto-expands while streaming; `ai-elements/reasoning` exists unused | Different |
| Tool calls | `ToolCallDisplay` left-border list | `ToolCallGroup` bordered rounded group with summary row and list/rail toggle (see prototype `tool-call-group-expanded.html`) | Different |
| Composer | raw `textarea` + Send/Stop/Paperclip buttons | `ChatComposer` = `PromptInput` shell: header (attachments), body (textarea), footer (`PromptInputTools` + `PromptInputSubmit` `bg-status-success`), voice control in tools | Different |
| ai-elements used | `conversation` only | `conversation`, `message`, `prompt-input`, `prompt-input-context`, `prompt-input-elements`, `attachments` | 5 subpaths unused |
| Build | single inlined chunk to `apps/desktop/electron/features/gateway/web-dist` | n/a | Constrains service worker output (#261) |

Global decisions (apply to every issue):

- D-G1 The shared package is `@sero-ai/ui` (the brief says `@sero-ui/ai`; no such package exists). Import primitives from `@sero-ai/ui` and AI elements from `@sero-ai/ui/ai-elements/*`.
- D-G2 Match the desktop renderer first, the prototypes second. `agent-node-aligned` and `tool-call-group-expanded` confirm the desktop conventions (sidebar tree rows, chat header, composer footer, tool group shell). Prototypes use Inter; the desktop does not bundle Inter, so web-remote keeps the `--font-sans` system stack from `globals.css`.
- D-G3 No new shared abstractions in this epic. Where the desktop hand-rolls a surface (session rows, tool group shell, board card), web-remote copies the markup and classes. Extraction into `@sero-ai/ui` is a separate decision for the user.
- D-G4 Every new gateway request or push event is added on both sides in one change: `server/protocol.ts` or `server/protocol-events.ts`, `server/extended-handlers.ts`, `apps/web-remote/src/lib/gateway-client.ts`, the store `handleMessage`, and `gateway-client.test.ts`.
- D-G5 Scoped tokens: every new request calls `hasWorkspaceAccess`; every new push event with a `workspaceId` goes through `broadcastDevServerChange`-style workspace filtering, not `broadcastGatewayEvent` (which only filters by `sessionId`).
- D-G6 Persist renderer state in IndexedDB using the `lib/token-storage.ts` pattern. No `localStorage`.
- D-G7 Security docs: `docs/security/gateway.md` (named in #262) does not exist. Document gateway behaviour in `apps/docs-site/docs/guide/remote-control.md` and `apps/docs-site/docs/reference/security-privacy.md`.

## New foundation issues (not yet filed)

The `web-remote` issues assume a UI that matches the desktop. That base does not exist. Three issues must be filed and land before feature work.

### NEW-A `web-remote: theme and token parity foundation`

Decisions:
- D-A1 Add `stores/theme.ts` mirroring the desktop store: `light | dark | system`, `.dark` toggled on `documentElement`, `matchMedia` listener, default `dark`. Persist mode in IndexedDB (D-G6).
- D-A2 Theme presets (`applyThemePreset`) are out of scope. The gateway exposes no preset request. Default tokens from `globals.css` are the target.
- D-A3 Remove `prose` classes and `react-markdown` + `rehype-highlight`. Markdown renders through `MessageResponse` (Streamdown). Import `streamdown/styles.css` in `index.css` as the desktop does.
- D-A4 Replace all Tailwind palette colours with status tokens.
- D-A5 Ship a `web-remote-aligned` prototype (desktop 1100×760 and mobile 390×844) in `apps/styleguide/public/prototypes/` for UX review before Phase 2, per the repository reference.

Checklist:
- [ ] Add `stores/theme.ts` with mode cycle action and system listener; wire the cycle button into StatusBar (Sun/Moon/Monitor).
- [ ] Remove `class="dark"` from `index.html`; apply from the store at boot.
- [ ] Replace the `invert` logo hack with a theme-aware asset or `dark:` variant.
- [ ] Add `streamdown` and `@streamdown/{cjk,code,math,mermaid}` from the catalog; import `streamdown/styles.css`.
- [ ] Remove `react-markdown` and `rehype-highlight` dependencies.
- [ ] Grep and replace `emerald|green|yellow|blue|red-\d{3}` classes with `status-*` tokens across `apps/web-remote/src`.
- [ ] Verify the built bundle size before and after (Streamdown + shiki + mermaid inline into one chunk); record the numbers in the PR.
- [ ] Add prototype `apps/styleguide/public/prototypes/web-remote-aligned/` and link it in `PrototypeArchive.tsx`.

### NEW-B `web-remote: shell and sidebar parity`

Decisions:
- D-B1 Shell: `TitleBar h-10` (logo, sidebar toggle, breadcrumb `Workspace › Session`, right cluster for bell #259 and chat/panel toggles), `StatusBar h-6 text-xs` (connection dot, workspace, scope, theme cycle, version).
- D-B2 Sidebar: `ResizablePanel` at 20% default, min 200px, collapsible. Content order matches desktop `MainSidebar`: `APPS` section (rows for Board #260, Dashboard #255), `Separator`, `SearchInput` `h-7` "Search sessions..." (#257), `WORKSPACES` tree.
- D-B3 Workspace rows copy `WorkspaceNode`: chevron, `Folder`, name, hover `Plus` that creates and selects a session immediately (no dialog). Session rows copy `SessionNode`: `absolute inset-y-1 left-0 w-0.5 bg-[var(--accent-primary)]` rail, `MessageSquare` / `Loader2` icon, title, `relative time · N msgs` subtitle. Multi-select, rename and delete are not exposed (no gateway request).
- D-B4 Right panels: on desktop widths replace the header icon buttons with a `w-10` activity rail (Files, Artifacts, Preview, Changes #256) using the desktop `ActivityBar` active style (brand icon + 2px left rail). On mobile keep `Sheet` overlays.
- D-B5 Persist sidebar and panel sizes in IndexedDB (D-G6).
- D-B6 Views: a `view` field in `stores/workspace.ts` (`board | chat | dashboard`). Chat stays the view for an active session.

Checklist:
- [ ] Rebuild `Layout.tsx` as `TitleBar` + `ResizablePanelGroup(sidebar, main, right)` + `StatusBar`; split files to stay under 500 LOC.
- [ ] Add `components/sidebar/WorkspaceTree.tsx`, `WorkspaceRow.tsx`, `SessionRow.tsx` copying desktop classes.
- [ ] Add `components/ActivityRail.tsx` for right-panel switching on ≥768px.
- [ ] Add `list_sessions` fields `updatedAt` and `messageCount` to the gateway response (`gateway-ops.ts`) for the session subtitle; mirror the type in `gateway-client.ts`.
- [ ] Add `APPS` rows with `activeApp` styling (`bg-[var(--bg-elevated)]`, brand icon).
- [ ] Persist panel sizes and sidebar collapsed state in IndexedDB.
- [ ] Update `remote-control.md` screenshots after the shell lands.

### NEW-C `web-remote: conversation and composer parity`

Decisions:
- D-C1 Messages: `Message from="user|assistant"`, `MessageContent`, `MessageResponse`. Drop avatars and coloured bubbles; user messages render as the desktop `ChatMessageItem` does.
- D-C2 Thinking: `Reasoning` + `ReasoningTrigger` + `ReasoningContent` with `isStreaming` bound to the message streaming flag (matches the desktop auto-expand behaviour).
- D-C3 Tool calls: group shell copies `ToolCallGroup` (rounded border, summary row `Wrench` + "N tools", chevron; live group uses `status-info` border). Items use `ai-elements/tool` (`Tool`, `ToolHeader`, `ToolContent`, `ToolOutput`). State map: `streaming→input-streaming`, `running→input-available`, `done→output-available`, `error→output-error`, `cancelled→output-denied`. Rail/split mode is not ported (list mode only).
- D-C4 Streaming file writes keep the current tail preview inside `ToolContent`.
- D-C5 Composer: `PromptInput` → `PromptInputHeader` (`Attachments` for pending images) → `PromptInputBody` + `PromptInputTextarea` → `PromptInputFooter` (`PromptInputTools`: `PromptInputActionMenu` with `PromptInputActionAddAttachments`, `VoiceTranscriptionControl`; `PromptInputSubmit` with `bg-status-success`; Stop button while streaming). No model selector: the gateway has no model request, and a disabled control is not shown.
- D-C6 Chat header `h-9`: `Bot` icon, `AGENT`, session chip, slot for `SessionBadge` (#258).
- D-C7 Empty state uses `ConversationEmptyState` (already available).

Checklist:
- [ ] Replace `ChatMessage.tsx` body with `Message`/`MessageContent`/`MessageResponse`; keep `ImageLightbox`.
- [ ] Replace the custom thinking block with `Reasoning`.
- [ ] Replace `ToolCallDisplay.tsx` with `ToolCallGroup.tsx` (shell) + `ToolCallItem.tsx` (`ai-elements/tool`).
- [ ] Rebuild the composer on `PromptInput`; move `readFileAsBase64` and pending image state behind `usePromptInputAttachments`.
- [ ] Keep `composerPrefill` support (preview element grab).
- [ ] Add the `h-9` chat header with `Bot` + `AGENT` + session chip.
- [ ] Extend `stores/chat.test.ts` for the tool state mapping.

## Issue-by-issue audit

### #253 Forward turn-completion and awaiting-input session state

Current scope: protocol foundation. `agent-bridge.ts` drops `message_start`/`message_end`; `emitTurnComplete` never reaches the gateway; `broadcastGatewayEvent` filters only by `sessionId`.

Missing decisions and resolution:
- D-253-1 Event shape: `session_state { workspaceId, sessionId, state: 'running' | 'idle' | 'awaiting_input', ts }` and `turn_complete { workspaceId, sessionId, ts, snippet? }`. Snippet is capped at 140 chars.
- D-253-2 Broadcast: add `broadcastWorkspaceEvent` in `event-broadcast.ts` that filters with `hasWorkspaceAccess` (same shape as `broadcastDevServerChange`). Audit `agent_start`/`agent_end` and switch them to it (they carry `sessionId` only; add `workspaceId`).
- D-253-3 `awaiting_input` is emitted by #254 when a choice is pending. #253 emits only `running`/`idle`.
- D-253-4 UI in this issue is the status dot on the session row (NEW-B `SessionRow`): `Loader2` spinning = running, `size-1.5 rounded-full bg-status-warning animate-pulse` = awaiting input, none = idle.

Issue action: **Keep, edit.** Add the event shapes and the broadcast helper decision to the body. Add "blocked by NEW-B for the UI checkbox".

Implementation plan:
- [ ] Add `GatewaySessionStateEvent` and `GatewayTurnCompleteEvent` to `server/protocol-events.ts`.
- [ ] Add `workspaceId` to `agent_start` and `agent_end`.
- [ ] Add `broadcastWorkspaceEvent` in `server/event-broadcast.ts` with `hasWorkspaceAccess` filtering; route the new events and `agent_start`/`agent_end` through it.
- [ ] Emit `running` on `agent_start`, `idle` + `turn_complete` from `emitTurnComplete` (`ipc/agent/core/agent-subscription.ts`) via `forwardEventToGateway`.
- [ ] Mirror types in `gateway-client.ts`; add `sessionStates` map to `stores/workspace.ts`; dispatch in `handleMessage`.
- [ ] Render the state dot in `SessionRow`.
- [ ] Tests: `gateway-client.test.ts` for the new events; a broadcast test proving a scoped token never receives out-of-scope `session_state`.

### #254 Answer interactive choice prompts from the phone

Current scope: fan `requestChoice` out over the gateway; `answer_choice` request; race handling.

Missing decisions and resolution:
- D-254-1 UI placement: the card renders above the composer, in the same slot as the desktop `PendingQuestionCard`, with the same warning-token frame (`rounded-lg border border-status-warning-border bg-status-warning-muted`, `ShieldAlert`, pulsing dot, `text-xs font-semibold`).
- D-254-2 Primitives: `Button` variants for options; `ai-elements/confirmation` is not used (it is accept/reject only).
- D-254-3 Free-text answers (user-feedback interview tool) are supported only when the question payload declares `allowFreeText`; otherwise options only.
- D-254-4 Global questions with no `workspaceId` go to owner tokens only.

Issue action: **Keep, edit.** Add D-254-1 and D-254-4 to the body.

Implementation plan:
- [ ] Add `choice_request` and `choice_resolved` push events to `protocol-events.ts`; `answer_choice` request to `protocol.ts` and `extended-handlers.ts`.
- [ ] Bridge `platform/desktop/request-choice.ts` to the gateway via the user-feedback bus; resolve on `answer_choice` exactly as the desktop does.
- [ ] Emit `session_state: awaiting_input` while pending and `idle`/`running` after resolution (#253).
- [ ] Add `stores/choices.ts` (pending map keyed by id; drop on `choice_resolved`).
- [ ] Add `components/ChoicePromptCard.tsx` above the composer using the desktop `PendingQuestionCard` classes.
- [ ] Typed errors: `choice_already_answered`, `choice_timed_out`, `choice_forbidden`; map in `gateway-errors.ts`.
- [ ] Tests: dispatch of `choice_request`/`choice_resolved`; scoped-token rejection.

### #255 Plugin dashboard widgets via module federation

Current scope: two phases in one issue. Phase 1 (asset route, `list_remote_widgets`, loader, read-only `window.sero` shim, dashboard view). Phase 2 (`app_state_set`, `promptAgent`, docs).

Missing decisions and resolution:
- D-255-1 Split. Phase 2 becomes its own issue blocked by phase 1.
- D-255-2 Dashboard view is the `Dashboard` APPS row (NEW-B). Layout: vertical stack on mobile; CSS grid `grid-cols-[repeat(auto-fill,minmax(280px,1fr))]` on desktop. No `react-grid-layout`.
- D-255-3 Widget tiles reuse the `glass-tile` surface from `@sero-ai/ui/styles/glass-board.css` (the desktop dashboard board) so widgets render identically.
- D-255-4 Federation runtime: copy the minimal `registerRemotes`/`loadRemote` usage from `federation-registry.ts` into `apps/web-remote/src/lib/federation.ts`. No shared package extraction in this epic (D-G3).
- D-255-5 Build: `inlineDynamicImports` conflicts with module federation shared singletons. Web-remote build must switch to normal chunking for this issue; `server/static-files.ts` must serve hashed assets. This is a prerequisite task, also required by #261.

Issue action: **Split.** #255 keeps phase 1. File `#255-b web-remote: interactive plugin widgets (app_state_set, promptAgent)` for phase 2. Add D-255-5 as the first checkbox.

Implementation plan (phase 1):
- [ ] Change `vite.config.ts` to hashed multi-chunk output; update `static-files.ts` to serve `assets/*` with long cache and `index.html` without cache.
- [ ] Add `GET /ext/<app-id>/<file>` to `server/http-app.ts` mirroring `ext-protocol.ts` guards and `publicPath` rewrite; require token.
- [ ] Add `remote: true` to `widget-manifest.ts` + `parseWidgets`; add `list_remote_widgets` request.
- [ ] Add `lib/federation.ts` and `lib/sero-bridge-shim.ts` (`appState.read` + subscribe over `app_state_get`/`app_state_changed`).
- [ ] Add `components/DashboardView.tsx` mounting widgets with `AppProvider` inside `glass-canvas`/`glass-tile`.
- [ ] Mark `CronWidget` `remote: true` as the acceptance fixture.
- [ ] Tests: asset route traversal and auth rejection; `list_remote_widgets` excludes non-remote widgets.

### #256 Git status and diff review view

Current scope: `git_status`, `git_diff` read-only; "Changes" right panel.

Missing decisions and resolution:
- D-256-1 Diff renderer: `@pierre/diffs` lives only in `sero-git-plugin` and needs old/new file contents. Use `ai-elements/code-block` with language `diff` on the unified text from `git_diff`. No new dependency.
- D-256-2 Changed-file list uses `ai-elements/commit`: `CommitFiles`, `CommitFile`, `CommitFileInfo`, `CommitFileStatus`, `CommitFileIcon`, `CommitFilePath`, `CommitFileChanges`.
- D-256-3 Panel is the `Changes` item on the activity rail (NEW-B); header row `h-7` uppercase like `ExplorerSidebar`.
- D-256-4 Truncation cap 200 KB per diff with a `truncated: true` flag and a `Badge` in the header.
- D-256-5 Remote commit stays out; the follow-up question in the issue is a product decision for the user.

Issue action: **Keep, edit.** Replace step 4 with D-256-1/2.

Implementation plan:
- [ ] Add `git_status` and `git_diff` to `protocol.ts` + `extended-handlers.ts`; implement in `gateway-ops.ts` on the git plugin's main-process layer.
- [ ] Mirror types and client methods in `gateway-client.ts`; add `stores/git.ts`.
- [ ] Add `components/ChangesPanel.tsx` (file list) and `DiffView.tsx` (`CodeBlock language="diff"`).
- [ ] Refetch on `turn_complete` (#253) and manual refresh.
- [ ] Tests: scoped-token rejection; truncation flag on a large diff.

### #257 Cross-session search

Current scope: `search_sessions` tiered scan; search input above the session list.

Missing decisions and resolution:
- D-257-1 Input is the sidebar `SearchInput` `h-7` "Search sessions..." (NEW-B), same position as the desktop `SearchBar`.
- D-257-2 Tier 1 runs client-side on the loaded session list (desktop `searchQuery` behaviour, instant). Tier 2 (`search_sessions`) fires after 300 ms debounce via `createDebouncedFn` and only when the query has ≥ 3 characters.
- D-257-3 Results replace the tree while the query is non-empty; each result reuses `SessionRow` with the snippet as subtitle and workspace name as a chip.
- D-257-4 Bound: 200 sessions scanned per request, 2 MB read per session, 20 results.

Issue action: **Keep, edit.** Add D-257-2 and D-257-4.

Implementation plan:
- [ ] Add `search_sessions` request and `gateway-ops.ts` implementation with bounds.
- [ ] Add `searchQuery` and `searchResults` to `stores/workspace.ts`; client-side tier 1 filter.
- [ ] Render results in `WorkspaceTree` using `SessionRow`.
- [ ] Tests: bound enforcement; scoped-token filtering; debounce behaviour in the store.

### #258 Usage and cost stats view

Current scope: `get_usage` from `CostTracker`; small stats view.

Missing decisions and resolution:
- D-258-1 `CostTracker` is in-memory: per-session totals and a daily total that resets at UTC midnight and on restart. Scope this issue to "since desktop start" and say so in the UI. No persistence work.
- D-258-2 UI copies the desktop `SessionBadge`: `Gauge` + `Coins` trigger in the chat header, `Popover` with Token Usage (requests, total, input, output, cost) and a "Today (since app start)" total. Context-window % is not available over the gateway and is omitted.
- D-258-3 Reuse `fmtTokens`/`fmtCost` formatting rules (K/M, `$0.00`, 4 dp under a cent).

Issue action: **Keep, edit.** Resolve the (a)/(b) question to (a).

Implementation plan:
- [ ] Add `getSessionUsage`/`getDailyUsage` readers to `cost-tracker.ts` and a `get_usage` request in `extended-handlers.ts` with workspace scoping.
- [ ] Mirror types; add `stores/usage.ts`; refetch on `turn_complete`.
- [ ] Add `components/SessionBadge.tsx` in the chat header slot (NEW-C).
- [ ] Tests: scoped token sees only its workspaces' sessions.

### #259 Notification center: persisted feed in the host, surfaced in web-remote

Current scope: host `NotificationFeed` service replacing every `showNotification` caller, gateway events/requests, web-remote bell + feed, desktop IPC surface.

Missing decisions and resolution:
- D-259-1 Split. The host service and gateway protocol are main-process work touching five origin paths; the web UI is independent once the protocol exists.
- D-259-2 Feed UI: `Bell` + unread `Badge` in the TitleBar right cluster; `Popover` on desktop, `Sheet` on mobile. Rows use the dashboard `ActivityList` component from `@sero-ai/ui`; empty state uses `EmptyState`.
- D-259-3 Global notifications (no `workspaceId`) go to owner tokens only.
- D-259-4 Log: JSONL under `SERO_HOME/agent/notifications.jsonl`, capped at 500.

Issue action: **Split.** #259 keeps the host service + protocol (`#259`). File `#259-b web-remote: notification bell and feed` for the UI, blocked by #259 and NEW-B.

Implementation plan (#259 host):
- [ ] Add `features/notifications/feed.ts` (`notify`, `list`, `markRead`, subscribers, JSONL persistence).
- [ ] Route the five origin paths through the feed; keep `showNotification` as the feed's only caller.
- [ ] Add `notification` push event (workspace-filtered) and `list_notifications`/`mark_notifications_read` requests.
- [ ] Emit feed entries on `turn_complete` (#253).
- [ ] Expose a renderer IPC surface (`window.sero.notifications`) for a later desktop feed.
- [ ] Tests: cap and restart survival; scoped-token filtering.

Implementation plan (#259-b web-remote):
- [ ] Add `stores/notifications.ts` with backfill on reconnect (`since` = last seen ts, persisted in IndexedDB).
- [ ] Add `components/NotificationBell.tsx` and `NotificationFeed.tsx` (`ActivityList`, `EmptyState`).
- [ ] Mark-read on open; sync across clients via the push event.

### #260 Mission-control session board as the landing view

Current scope: board data, store, UI, default landing.

Missing decisions and resolution:
- D-260-1 Making the board the default landing view changes the current experience. This is a product decision. Recommendation: board is the landing view when the token has more than one workspace or session; otherwise open chat directly.
- D-260-2 Cards copy the desktop `BoardCard`: `rounded-lg border bg-[var(--bg-surface)]`, 3px left status rail, `text-base font-medium` title, `text-xs tabular-nums` time, footer chips. Group by workspace under an uppercase `tracking-[0.18em]` heading.
- D-260-3 Unread markers: `lastViewedAt` per session in IndexedDB.
- D-260-4 Data comes from the `list_sessions` fields added in NEW-B (`updatedAt`, `messageCount`) plus a new `snippet`.

Issue action: **Keep, edit.** Add the landing-view rule as a question for the user; add D-260-2.

Implementation plan:
- [ ] Add `snippet` to `list_sessions` (`gateway-ops.ts`), capped at 140 chars.
- [ ] Add `stores/board.ts` (per-session state from #253 events, unread markers).
- [ ] Add `components/board/BoardView.tsx` and `BoardCard.tsx`; wire the `Board` APPS row and landing rule.
- [ ] Awaiting-input cards deep-link to the chat with the pending prompt visible (#254).
- [ ] Tests: unread marker persistence; card state update on `turn_complete`.

### #261 Installable PWA with Web Push notifications

Current scope: manifest + SW, VAPID keys, subscriptions per token, push on feed events.

Missing decisions and resolution:
- D-261-1 SW is hand-written `public/sw.js` (app-shell cache + `push` + `notificationclick`). No `vite-plugin-pwa`. Requires the hashed-asset build from D-255-5 so the shell cache list is stable.
- D-261-2 Manifest includes `share_target` (POST to `/share`) so #262 can route uploads from the share sheet.
- D-261-3 Push payload: `{ title, kind, sessionId, workspaceId }` only.
- D-261-4 Dev flow: document `vite preview --host localhost` for SW registration.

Issue action: **Keep, edit.** Add D-261-1 and the dependency on D-255-5.

Implementation plan:
- [ ] Add `public/manifest.webmanifest`, icons and `public/sw.js`; serve from `static-files.ts` at root scope.
- [ ] Generate and store VAPID keys next to `gateway-token` (`security/auth.ts` pattern).
- [ ] Persist subscriptions in `gateway-web-tokens.json` style; `push_subscribe`/`push_unsubscribe` requests; prune on revoke and `410 Gone`.
- [ ] Send via `web-push` on feed events (#259) for tokens with no connected client, always for `awaiting_input`/`turn_complete`.
- [ ] Settings entry in the StatusBar or TitleBar menu to enable push.
- [ ] Docs note in `remote-control.md`.

### #262 Upload files into the workspace

Current scope: `upload_file` request, Files panel upload + drag-drop, composer mention, share target.

Missing decisions and resolution:
- D-262-1 Owner-token only in the first iteration. Scoped tokens get `forbidden`.
- D-262-2 Default target `uploads/` under the workspace root; auto-suffix on collision (`name (2).ext`). Cap 20 MB.
- D-262-3 UI: `Upload` icon button in the Files panel `h-7` header (NEW-B), `Progress` bar while in flight, drag-drop over the tree on desktop widths, toast via `sonner` (`@sero-ai/ui`) on success with a "Mention in prompt" action that sets `composerPrefill`.
- D-262-4 Share target handling (`/share` route) lives in this issue but is blocked by #261.

Issue action: **Keep, edit.** Add D-262-1..3.

Implementation plan:
- [ ] Add `upload_file` request with traversal guard, size cap, `uploads/` default and collision suffix in `gateway-ops.ts`.
- [ ] Mirror types; add `uploadFile` to `stores/files.ts` with progress state.
- [ ] Add the upload button, drag-drop and `Progress` to `FileBrowser.tsx`; refresh the tree on success.
- [ ] Add the "Mention in prompt" toast action.
- [ ] Add the `/share` route handler after #261.
- [ ] Tests: traversal and oversize rejection; scoped-token rejection; suffix on collision.
- [ ] Document scoping in `security-privacy.md`.
