# Feature Claim Verification Log Skeleton

**Plan:** `.pi/plans/2026-04-26-feature-inventory/plan.md`  
**Raw scout input:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md`  
**Inventory:** `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`

This artifact records claim-by-claim review notes for unclear, low-confidence, external/local, placeholder, experimental, security-sensitive, or potentially overclaimed features. The scout is raw evidence, not publishable truth.

Do not treat template/example entries as completed verification. Add real entries only after checking the cited source paths and updating the corresponding inventory row.

## Status Legend

Use the same values as `verified-inventory.md`:

- `verified`
- `partially verified`
- `needs verification`
- `blocked`
- `exclude from public copy`

## Reusable Claim-Review Template

```md
## Claim: <short claim name>

- **Inventory row:** <Category> / <Feature>
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` <optional section/table>
- **Checked:** <source paths, READMEs, manifests, docs, commands, or runtime checks reviewed>
- **Finding:** <what the evidence supports; include exact caveats and scope limits>
- **Status:** <verified | partially verified | needs verification | blocked | exclude from public copy>
- **Confidence:** <high | medium | low>
- **Public-copy decision:** <safe wording, unsafe claim, or not safe until a specific gap is closed>
- **Follow-up:** <next check, owner decision, source path, test, screenshot/demo need, or TBD>
```

## Completed FI-005 Core Claim Reviews

## Claim: Desktop shell layout and app switching

- **Inventory row:** Core Workspace / Persistent desktop shell; Built-in Dashboard and Explorer apps; Sidebar app switching
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` Core Workspace
- **Checked:** `apps/desktop/src/App.tsx`; `apps/desktop/src/components/layout/shell/MainSidebar.tsx`; `apps/desktop/src/components/apps/ActiveAppPanel.tsx`; `README.md`
- **Finding:** `App.tsx` renders the title bar, left sidebar, central `ActiveAppPanel`, right `ChatPanel`, command menu, onboarding, and status bar in collapsible/resizable panels. `ActiveAppPanel` switches between Dashboard, Explorer, federated app mounts, and placeholders. `MainSidebar` lists sidebar apps and calls `openApp(app.id)`.
- **Status:** verified
- **Confidence:** high
- **Public-copy decision:** safe to describe the current desktop shell and app switching, with README alpha caveats: macOS Apple Silicon, source-only alpha, no public binaries, evolving APIs.
- **Follow-up:** capture fresh screenshots before writing polished docs or website sections.

## Claim: Explorer exact public scope

- **Inventory row:** Core Workspace / Built-in Dashboard and Explorer apps; Files & Projects / Live file tree updates; Terminal & Containers / Dev server management
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` Possible / Unclear Features
- **Checked:** `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx`; `apps/desktop/src/components/apps/explorer/ExplorerSidebar.tsx`; `apps/desktop/src/hooks/workspace-filetree-subscription.ts`; `apps/desktop/src/components/layout/DevServerPanel.tsx`
- **Finding:** Explorer source confirms an activity bar, sidebar, editor/diff/browser panel paths, and a bottom terminal panel with terminal tabs. File-tree watch helpers call `window.sero.filetree.watch/unwatch`. Dev server panel confirms visible status/URL controls to open, stop, restart, or unregister registered servers. Runtime behavior and automatic dev-server startup were not tested.
- **Status:** partially verified
- **Confidence:** medium
- **Public-copy decision:** safe to mention Explorer as a workspace app with file/editor, browser/diff, and terminal surfaces. Do not claim full IDE parity, automatic dev-server startup, or exact file-watch semantics until runtime-tested.
- **Follow-up:** run the desktop app with a sample workspace and verify file-tree refresh, terminal creation, browser panel, and dev-server registration flow.

## Claim: Global chat panel and session lifecycle

- **Inventory row:** Agent & Chat / Global chat panel; Session-based agent lifecycle; Prompt, steer, and abort controls; Slash commands and model state; Prompt attachments
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` Agent & Chat
- **Checked:** `apps/desktop/src/App.tsx`; `apps/desktop/src/stores/agent.ts`; `apps/desktop/src/stores/sessions.ts`; `apps/desktop/src/types/ipc.ts`; `apps/desktop/src/components/layout/workspace/SessionNode.tsx`
- **Finding:** `App.tsx` keeps agent event listeners alive even when chat is hidden and mounts `ChatPanel` independently of active app. Agent store opens sessions through host IPC, fetches history, slash commands, and model state, supports prompt/steer/abort, closes/focuses sessions, and tracks collaboration state. Session store and nodes support create/delete/rename/select/search grouped by workspace.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to say Sero has a global chat panel backed by Pi sessions and session history. Do not publish exact attachment types, slash command catalog, or collaboration UX until the renderer controls are inspected/runtime-tested.
- **Follow-up:** inspect `ChatPromptArea`, `SlashCommandMenu`, model selector, and a live session for screenshot/demo needs.

## Claim: Workspace registry and session tree

- **Inventory row:** Files & Projects / Workspace registry; Searchable session tree grouped by workspace; Multi-root workspaces; Workspace references and mounts
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` Files & Projects
- **Checked:** `apps/desktop/src/types/ipc.ts`; `apps/desktop/src/stores/workspace.ts`; `apps/desktop/src/stores/sessions.ts`; `apps/desktop/src/components/layout/workspace/WorkspaceTree.tsx`; `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx`; `apps/desktop/electron/features/workspace/manager.ts`
- **Finding:** Workspace registry is profile-scoped under `SERO_AGENT_DIR/workspaces.json`, loaded into the renderer and shown in the sidebar. Workspace nodes expose session creation, container toggles, mounts/references menus, remote-origin actions, close, and bulk session delete. Search filters sessions by name or first message; it does not search workspace names.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to mention registered workspaces and searchable sessions grouped by workspace. Do not call the whole workspace tree searchable, and do not write setup instructions for roots/mounts until UX and safety boundaries are verified.
- **Follow-up:** verify add-root/link-plugin flows and mount behavior with container vs host mode.

## Claim: Command menu catalog

- **Inventory row:** Agent & Chat / Command menu
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` Possible / Unclear Features
- **Checked:** `apps/desktop/src/App.tsx`; `apps/desktop/src/components/layout/shell/CommandMenu.tsx`
- **Finding:** Command menu is opened by ⌘K/Ctrl+K. Current catalog groups registered apps, Remote / Connect Device, and Theme / Browse Themes, Edit Current Theme, Toggle Light / Dark / System.
- **Status:** verified
- **Confidence:** high
- **Public-copy decision:** safe to mention a command palette for app switching, device connection, and theme actions. Do not imply arbitrary agent commands, slash commands, or every UI action appears in the palette.
- **Follow-up:** revisit if new command registration sources are added.

## Claim: Web remote client exact scope

- **Inventory row:** Remote Access / Web remote client; Gateway and WebSocket bridge
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` Remote Access and Possible / Unclear Features
- **Checked:** `apps/web-remote/src/App.tsx`; `apps/web-remote/src/components/Layout.tsx`; `apps/web-remote/src/components/WorkspacePicker.tsx`; `apps/web-remote/src/components/ChatPanel.tsx`; `apps/web-remote/src/components/FileBrowser.tsx`; `apps/web-remote/src/stores/connection.ts`; `apps/web-remote/src/stores/workspace.ts`; `apps/web-remote/src/stores/chat.ts`; `apps/web-remote/src/stores/files.ts`; `apps/web-remote/src/stores/artifacts.ts`; `apps/web-remote/src/lib/gateway-client.ts`; `apps/desktop/electron/features/gateway/server/protocol.ts`; `apps/desktop/electron/features/gateway/security/auth.ts`; `apps/desktop/electron/main.ts`
- **Finding:** Web remote source includes token auth, URL/stored-token bootstrap, reconnect handling, workspace/session selection and creation, prompt/abort, session history, streamed text/thinking/tool events, image attachments, file listing/reading, artifacts, and request-error banners. Desktop gateway protocol supports those requests plus web-token management. `main.ts` starts the gateway only when `SERO_GATEWAY=1`; auth accepts master or scoped web tokens.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to describe as an optional authenticated browser client for chat, workspace/session selection, file browsing, and artifacts when the gateway is enabled. Not safe to imply remote access is always on, credential-free, mobile-polished, or publicly hosted.
- **Follow-up:** runtime-test a paired device/browser session, document token lifecycle, and confirm deployment/HTTPS/Tailscale recommendations before public docs.

## Claim: Profile, layout, and security persistence

- **Inventory row:** Core Workspace / Theme and layout restore; Data Persistence & Sync / File-backed layout state; Security / Permissions / Profile-scoped Chromium isolation; Strict renderer isolation
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` Data Persistence & Sync and Security / Permissions
- **Checked:** `apps/desktop/src/lib/persist-layout.ts`; `apps/desktop/src/types/layout.ts`; `apps/desktop/electron/ipc/workspace/layout.ts`; `apps/desktop/electron/main.ts`; `apps/desktop/electron/platform/env/index.ts`; `apps/desktop/electron/features/profile/types.ts`; `apps/desktop/electron/features/profile/manager.ts`; `apps/desktop/electron/platform/security/window-security.ts`; `apps/desktop/electron/platform/security/csp.ts`; `README.md`
- **Finding:** Layout writes through `window.sero.layout.save` to `<active profile>/agent/layout.json` and includes shell, theme, active workspace/app/session, model visibility, dashboard, and browser tab/bookmark state. Profiles resolve to independent `SERO_HOME` roots with `agent/` directories, and Electron `userData` is set under a profile-specific directory before app readiness. BrowserWindow uses context isolation and disabled node integration; security helpers add CSP, navigation/window-open controls, hardened webviews, and a narrow permission allowlist.
- **Status:** verified
- **Confidence:** high
- **Public-copy decision:** safe to mention file-backed profile-scoped layout and renderer security safeguards. Do not claim browser storage is never used anywhere in the broader product, do not say profiles are a hard security boundary, and do not guarantee complete protection against malicious content.
- **Follow-up:** update any later support docs to use `<active profile>/agent/layout.json`; the older `~/.sero-ui/layout.json` phrasing is stale for profile-aware builds.

## Claim: Container runtime and host fallback

- **Inventory row:** Terminal & Containers / Per-workspace container runtime; Container HTTP proxy; Orphaned container cleanup; Terminal cleanup on shutdown; Container fallback and availability detection
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` Terminal & Containers
- **Checked:** `apps/desktop/electron/main.ts`; `apps/desktop/src/types/ipc.ts`; `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx`; `apps/desktop/src/components/layout/workspace/WorkspaceReferencesMenu.tsx`; `README.md`
- **Finding:** Main process checks container availability, ensures the container system and image, starts a host HTTP/HTTPS proxy unless disabled, cleans orphaned containers, and disposes terminals on graceful shutdown. Sidebar nodes show/toggle per-workspace container mode and status. README explicitly states containers are preferred and host mode has reduced capabilities.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to say Sero prefers container-backed workspaces and supports reduced host mode. Do not claim all container features work without Apple containers, and do not document exact fallback triggers without runtime validation.
- **Follow-up:** verify current onboarding/preflight UI, container error messages, and host-mode behavior in a no-container environment.

## Completed FI-006 Plugin and Integration Claim Reviews

## Claim: Memory system and context injection

- **Inventory row:** Memory & Context / Persistent memory files; Automatic memory context injection; Memory search and scratchpad tools; Memory consolidation and transcript recall
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` built-in plugin sections
- **Checked:** `docs/features/memory.md`; `plugins/sero-memory-plugin/package.json`; `plugins/sero-memory-plugin/extension/index.ts`
- **Finding:** Existing memory docs and extension source support persistent markdown memory files, bootstrap, `memory`, `memory_search`, and `scratchpad` tools, `/memory`-related commands, automatic context injection, QMD-backed retrieval with graceful degradation, transcript backfill, and consolidation hooks. Runtime recall quality, exact generated summaries, and retention behavior are not proven by source review alone.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to position Memory as a built-in plugin feature with selective persistent context and user tools. Do not claim perfect recall, exhaustive context injection, or always-available semantic search.
- **Follow-up:** runtime-test memory-context visibility, bootstrap questionnaire, and QMD unavailable/available behavior before screenshot-driven docs.

## Claim: Git manager app and agent bridge

- **Inventory row:** Git & Developer Workflows / Visual Git manager; Agent-assisted Git command bridge; Branch and worktree operations
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` built-in plugin sections
- **Checked:** `plugins/sero-git-plugin/package.json`; `plugins/sero-git-plugin/extension/index.ts`; `plugins/sero-git-plugin/ui/GitApp.tsx`; `plugins/sero-git-plugin/extension/state-io.ts`; `packages/common/src/app-runtime-background.ts`
- **Finding:** Manifest confirms a built-in Git app. Extension source registers `/git` and `git_manager` with status, log, branch, diff, staging, commit, stash, fetch/pull/push, merge, cherry-pick, show-commit, and worktree-related actions, and syncs state into `.sero/apps/git/state.json`. UI source exists, but every operation was not traced to a visible control or runtime-tested.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to describe a built-in Git manager and agent-assisted Git actions. Do not claim every listed operation has a polished visual affordance, and include repository mutation/safety caveats in docs.
- **Follow-up:** runtime-test common Git flows in a disposable repository and capture UI screenshots before user guide copy.

## Claim: Web access/search/fetch/bookmarks

- **Inventory row:** Web & Research / Web search; Web content fetching and extraction; Code-oriented web search; Web bookmarks and activity widget; Data Persistence & Sync / Web search state sync
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` built-in plugin sections
- **Checked:** `plugins/sero-web-plugin/package.json`; `plugins/sero-web-plugin/extension/index.ts`; `plugins/sero-web-plugin/extension/tools-search.ts`; `plugins/sero-web-plugin/extension/tools-fetch.ts`; `plugins/sero-web-plugin/extension/tools-code-search.ts`; `plugins/sero-web-plugin/extension/tools-bookmark.ts`; `plugins/sero-web-plugin/extension/state-sync.ts`
- **Finding:** Source supports built-in web search, fetch/extraction, code search, bookmarking, session/app-state sync, and a Web Activity widget. Provider paths include Exa, Perplexity, Gemini API, and Gemini Web/account checks; extraction includes broad paths such as HTML, PDFs, GitHub content, YouTube/video, and local video helpers. Availability depends on credentials, browser/profile state, third-party services, and runtime dependencies.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to say Sero has built-in web access tools with provider-dependent search/fetch/bookmark workflows. Unsafe to imply all providers work by default, that credentials are bundled, or that every media/extraction path is reliable without runtime tests.
- **Follow-up:** test each provider configuration path and a representative fetch matrix before writing setup docs.

## Claim: Cron scheduler and reminders

- **Inventory row:** Automations & Background Jobs / Recurring agent scheduler; Reminders; Current time helper
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` built-in plugin sections
- **Checked:** `plugins/sero-cron-plugin/package.json`; `plugins/sero-cron-plugin/extension/index.ts`; `plugins/sero-cron-plugin/extension/tools.ts`; `plugins/sero-cron-plugin/extension/scheduler.ts`; `plugins/sero-cron-plugin/extension/notifier.ts`; `plugins/sero-cron-plugin/extension/recovery.ts`
- **Finding:** Manifest confirms Scheduler app/widget. Extension registers scheduler runtime, `/cron`, `current_time`, `cron`, and `reminder`; tool schemas/actions cover list/add/update/remove/enable/disable/run for jobs and create/update/snooze/complete/enable/disable/list for one-off or recurring reminders. Source supports notification delivery and missed-run/recovery code paths, but desktop notification permission and live scheduling behavior were not runtime-tested.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to describe built-in scheduling/reminder tools and Scheduler app. Do not promise notification delivery, exact missed-run semantics, or background reliability until runtime-tested.
- **Follow-up:** create disposable jobs/reminders in the desktop app and verify notifications, app/widget state, missed-run recovery, and cancellation behavior.

## Claim: Plugin ecosystem and app runtime

- **Inventory row:** Plugin Ecosystem / Federated app runtime hooks; Data Persistence & Sync / Plugin/app state files; Remote Access / Remote plugin entry loading; Core Workspace / App store and favorites
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` plugin ecosystem sections
- **Checked:** `docs/plugins/guide.md`; `packages/app-runtime/README.md`; `packages/app-runtime/src/context.ts`; `packages/app-runtime/src/use-app-state.ts`; `packages/app-runtime/src/use-agent-prompt.ts`; `packages/app-runtime/src/use-ai.ts`; `packages/app-runtime/src/use-theme.ts`; `packages/app-runtime/src/use-widget-registration.ts`; `apps/desktop/src/lib/federation-registry.ts`
- **Finding:** Plugin guide distinguishes built-in monorepo apps from externally installed plugins and documents npm/git/local install flows, storage under `~/.sero-ui/agent/plugins/<id>/`, hot sidebar appearance, trust caveats, and host/container capability caveats. App runtime source confirms hooks/context for file-backed state, active-agent prompts, app-scoped AI calls, theme context, available models, app tools, and widgets. Federation registry supports dev/packaged remote entry loading.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe for developer/plugin-author docs. Public website copy should not imply a stable marketplace, stable API, or bundled status for external/local plugins.
- **Follow-up:** inspect App Store install/uninstall UI and capability gating before end-user plugin-management docs.

## Claim: External/local Research, Plan Mode, and Kanban workflows

- **Inventory row:** Web & Research / Research external orchestrator; Git & Developer Workflows / Plan Mode external plugin; Kanban external development board
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` external/local plugin sections
- **Checked:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-research-plugin/README.md`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-research-plugin/package.json`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-research-plugin/extension/index.ts`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-plan-mode-plugin/README.md`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-plan-mode-plugin/package.json`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-plan-mode-plugin/extension/index.ts`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-kanban-plugin/README.md`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-kanban-plugin/package.json`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-kanban-plugin/extension/index.ts`
- **Finding:** These are external/local plugins, not bundled features. Research README/source confirm Research app, `research` tool, `/research` and `/analyze`, workstream planning/status/cancel, and subagent launch/synthesis instructions. Plan Mode README/source confirm app, `plan_todos`, `/plan`, `/plan-execute`, `/plan-todos`, `--plan`, and a bash tool-call filter during plan mode. Kanban README/source confirm app/widget, `kanban` tool, `/kanban`, board-driven workflow, state sync, and optional `gh` dependency for PR flows.
- **Status:** partially verified
- **Confidence:** medium
- **Public-copy decision:** safe only as external/local plugin examples or later integration docs. Do not include them in bundled-feature lists, and do not overstate read-only safety, PR automation, or multi-agent reliability without runtime testing.
- **Follow-up:** decide official support status; runtime-test each workflow in disposable workspaces before promoting beyond examples.

## Claim: External/local Google, Spotify, and Starling integrations

- **Inventory row:** Integrations / Google Workspace external plugin; Spotify external plugin; Starling Bank external dashboard
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` external/local plugin sections
- **Checked:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-google-plugin/README.md`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-google-plugin/package.json`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-google-plugin/extension/index.ts`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-spotify-plugin/README.md`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-spotify-plugin/package.json`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-spotify-plugin/extension/index.ts`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-starling-plugin/README.md`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-starling-plugin/package.json`; `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-starling-plugin/extension/index.ts`
- **Finding:** Google plugin README/source confirm Gmail/Calendar app and widgets, gogcli dependency, OAuth client credential setup, `gmail`/`gcal` tools and commands. Spotify README/source confirm Web Playback SDK, OAuth PKCE, playlist browsing, mini-player widget, `spotify` tool, and `/spotify`; README explicitly requires Widevine/VMP signing for playback. Starling README/source confirm dashboard tabs, Personal Access Token scopes, safeStorage/PIN security model wording, `starling` tool, and `/starling`. None of these are in-repo built-ins.
- **Status:** partially verified
- **Confidence:** medium
- **Public-copy decision:** safe only as external/local integration examples with setup prerequisites and credential caveats. Unsafe to imply bundled support, available credentials, official provider partnership, working auth in every environment, or financial/security guarantees.
- **Follow-up:** product decision on support/website inclusion; runtime auth tests with throwaway/test accounts where possible.

## Claim: MCP and user feedback/permission flows

- **Inventory row:** MCP & Tooling / MCP control center; Single bridged MCP agent tool; UI-only MCP management and auth; MCP resource and tool inspection; User Feedback & Permissions / Agent question prompts; Structured questionnaires; Interview workflow; Security / Permissions / Permission gate for sensitive actions
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` built-in plugin sections
- **Checked:** `plugins/sero-mcp-plugin/package.json`; `plugins/sero-mcp-plugin/README.md`; `plugins/sero-mcp-plugin/extension/index.ts`; `plugins/sero-user-feedback-plugin/package.json`; `plugins/sero-user-feedback-plugin/extension/index.ts`; `plugins/sero-user-feedback-plugin/extension/permission-gate.ts`; `plugins/sero-user-feedback-plugin/extension/interview-tool.ts`; `plugins/sero-user-feedback-plugin/extension/ipc-bridge.ts`
- **Finding:** MCP README/manifest/source support a built-in MCP app, one bridged `mcp` tool, UI-oriented management/auth, OAuth/config/diagnostics/resource/tool inspection claims, and `mcp_manager` registration for app use. User feedback source registers `question`, `questionnaire`, `interview`, and permission gating with Sero IPC or Pi TUI fallbacks. Permission gate scope is specific to `bash` tool calls matching dangerous patterns and approval timeout/reject handling; it is not a universal permission system.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** safe to describe as built-in developer/admin tooling and user-input flows with scoped permission gating. Do not claim every MCP server/provider auth works, do not say all server tools are directly exposed, and do not market universal permissions for every tool/action.
- **Follow-up:** runtime-test an MCP stdio server, an OAuth-capable server if available, permission prompt UI, TUI fallback, and interview output paths.

## Claim: Unresolved external/local support status and provider credential questions

- **Inventory row:** All `external/local` integration rows; Web & Research provider rows; Model Providers / Alibaba Coding Plan provider
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md` external/local and provider sections
- **Checked:** `docs/plugins/guide.md`; external/local plugin READMEs/manifests listed above; `plugins/sero-web-plugin/extension/index.ts`; `plugins/sero-alibaba-plugin/extension/index.ts`
- **Finding:** Plugin guide says plugins are installed separately and do not ship with Sero. External integrations have explicit install/setup prerequisites and local paths, while web/model provider features depend on API keys, OAuth, browser sign-in, provider accounts, or environment variables. Current evidence does not establish official support status, bundled credentials, provider partnerships, or auth success in a fresh install.
- **Status:** partially verified
- **Confidence:** high
- **Public-copy decision:** keep external/local integrations labeled external/local and route them to later/plugin-example/integration-doc targets until product decides support posture. Provider copy must say `with configured credentials/account` or equivalent.
- **Follow-up:** product owner decision on which external/local plugins, if any, should appear in public website/onboarding; support matrix for provider setup and failure modes.
