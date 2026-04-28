# Plugin docs drafting notes for DSC-014 through DSC-019

## Scope checked
Source inventory was read for built-in plugins under `plugins/sero-*-plugin/`, external/local plugins under `../plugins/*`, plus `packages/app-runtime` and local plugin development docs.

## Built-in plugins

### `plugins/sero-admin-plugin`
- **Package:** `@sero-ai/plugin-admin`
- **Status:** built-in
- **Manifest:** `sero.app` present (`id: admin`, `name: Admin`, `scope: global`, `stateFile: .sero/apps/admin/state.json`, `ui`, `component: AdminApp`, `devPort: 5193`)
- **Plugin metadata:** `category: developer-tools`, tags: admin/settings/sessions/logs/agents/skills/prompts, `minSeroVersion: 0.1.0`, `preBuilt: false`
- **Docs signal:** package only; no README inspected
- **Likely coverage:** full page or substantial section inside Admin/settings docs; should mention config editor, log viewer, session browser
- **Caveat:** state file path is app-owned global state, not browser storage

### `plugins/sero-alibaba-plugin`
- **Package:** `@sero-ai/plugin-alibaba`
- **Status:** built-in
- **Manifest:** `sero.providers` present only; no `sero.app`
  - provider id `alibaba-coding-plan`
  - auth `apiKey` via `ALIBABA_CODING_PLAN_KEY`
  - defaults LOW/MED/HIGH: `qwen3-coder-plus`, `qwen3-coder-plus`, `qwen3.5-plus`
- **Plugin metadata:** none beyond provider entry
- **Docs signal:** provider metadata should be documented in models/providers, likely not a full plugin page unless needed as a reference subsection
- **Caveat:** this is a provider manifest, not an app surface

### `plugins/sero-cron-plugin`
- **Package:** `@sero-ai/plugin-cron`
- **Status:** built-in
- **Manifest:** `sero.app` present (`id: cron`, `name: Scheduler`, `scope: global`, `stateFile: .sero/apps/cron/state.json`, `component: CronApp`, `devPort: 5188`)
- **Widgets:** `scheduler-status` (`Scheduler`) with fixed-ish 2x2 default/min, max 3x3
- **Plugin metadata:** `category: productivity`, tags: scheduler/reminders/jobs, `minSeroVersion: 0.1.0`, `preBuilt: false`
- **README facts:** reminders, snooze, notification sounds, job completion notifications, run output history, `current_time` / `reminder` / `cron` tools, JSON state, scheduler off by default, isolated transient agent sessions, max 2 concurrent jobs
- **Docs signal:** likely full built-in guide page; strong source text exists
- **Caveat:** Pi extension standalone in Pi CLI; UI is Sero-only

### `plugins/sero-git-plugin`
- **Package:** `@sero-ai/plugin-git`
- **Status:** built-in
- **Manifest:** `sero.app` present (`id: git`, `name: Git`, `stateFile: .sero/apps/git/state.json`, `component: GitApp`, `devPort: 5194`)
- **Plugin metadata:** `category: developer-tools`, tags: git/branches/diff, `minSeroVersion: 0.1.0`, `preBuilt: false`
- **Docs signal:** package only; likely major built-in page via Git integration docs
- **Caveat:** no explicit widget/runtime/provider metadata in manifest excerpt

### `plugins/sero-mcp-plugin`
- **Package:** `@sero-ai/plugin-mcp`
- **Status:** built-in
- **Manifest:** `sero.app` present (`id: mcp`, `name: MCP`, `scope: global`, `stateFile: .sero/apps/mcp/state.json`, `component: McpApp`, `devPort: 5196`)
- **Plugin metadata:** `category: developer-tools`, tags: mcp/servers/oauth/resources, `requiredHostCapabilities: [appAgent.invokeTool, tool.cli]`, `bridgeTools: [mcp]`, `preBuilt: false`
- **README facts:** first-run setup wizard, stdio + HTTP/SSE servers, CRUD/enable/disable/connect/reconnect, lazy/eager/keep-alive lifecycle, cached snapshots, search workbench, embedded OAuth, resource previews, loopback viewer, tool runner, exactly one bridged tool `mcp`, UI-only `mcp_manager`
- **Docs signal:** full page or large dedicated section warranted
- **Caveat:** agent surface intentionally small

### `plugins/sero-memory-plugin`
- **Package:** `@sero-ai/plugin-memory`
- **Status:** built-in
- **Manifest:** plugin-only; no `sero.app`
- **Plugin metadata:** `category: utilities`, tags: memory/identity/logs, `minSeroVersion: 0.1.0`, `preBuilt: false`
- **Docs signal:** likely docs section in memory guide; package alone suggests a tool/extension with persistent memory, identity, user profile, daily logs
- **Caveat:** no UI/app surface exposed in manifest excerpt

### `plugins/sero-user-feedback-plugin`
- **Package:** `@sero-ai/plugin-user-feedback`
- **Status:** built-in
- **Manifest:** `sero.app` present (`id: userfeedback`, `name: User Feedback`, `scope: global`, `stateFile: .sero/apps/userfeedback/state.json`, `component: UserFeedbackApp`, `devPort: 5182`)
- **Plugin metadata:** `category: utilities`, tags: questions/questionnaire/feedback, `minSeroVersion: 0.1.0`, `preBuilt: false`, `bridgeTools: false`
- **Docs signal:** built-in app/panel with pending questions/questionnaire flow; full page or substantial section likely needed
- **Caveat:** `bridgeTools: false` means no agent/CLI tool bridge

### `plugins/sero-web-plugin`
- **Package:** `@sero-ai/plugin-web`
- **Status:** built-in
- **Manifest:** `sero.app` present (`id: web`, `name: Web`, `scope: global`, `stateFile: .sero/apps/web/state.json`, `component: WebApp`, `devPort: 5195`)
- **Widgets:** `activity` (`Web Activity`) with 2x2 default/min, max 4x3
- **Plugin metadata:** `category: productivity`, tags: web/search/fetch/youtube/github, `minSeroVersion: 0.1.0`, `preBuilt: false`
- **Docs signal:** likely full built-in guide page or expanded section in web docs
- **Caveat:** package manifest says search/content fetching/video understanding; docs should stay within that scope

## External/local plugins (`../plugins`)

### `../plugins/sero-calc-plugin`
- **Package:** `@sero-ai/plugin-calc`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: calc`, `name: Calculator`, `scope: global`, `stateFile: .sero/apps/calc/state.json`, `component: CalcApp`, `devPort: 5175`)
- **Plugin metadata:** `category: utilities`, tags: calculator/math, `preBuilt: false`
- **README facts:** install via git URL in Sero Admin → Plugins or `pi install`; tools `evaluate/history/clear`; `/calc` command; UI mirrors state between agent and app
- **Docs signal:** lightweight page or catalog-only entry is enough

### `../plugins/sero-daily-quote-plugin`
- **Package:** `@sero-ai/plugin-daily-quote`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: daily-quote`, `name: Daily Quote`, `scope: global`, `stateFile: .sero/apps/daily-quote/state.json`, `component: DailyQuote`, `devPort: 5177`)
- **Plugin metadata:** `category: utilities`, tags: quotes/inspiration/daily, `preBuilt: false`
- **README facts:** install instructions, `daily_quote` tool (`get`, `set`), `/quote` command, UI state sync, global-scoped app
- **Docs signal:** lightweight page or catalog-expanded section

### `../plugins/sero-google-plugin`
- **Package:** `@sero-ai/plugin-google`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: google`, `name: Google`, `scope: global`, `stateFile: .sero/apps/google/state.json`, `component: GoogleApp`, `runtime: ./runtime/index.ts`, `devPort: 5186`)
- **Widgets:** `mail-indicator`, `mini-calendar`
- **Plugin metadata:** `category: integrations`, tags: google/gmail/calendar/workspace, `requiredHostCapabilities: [appAgent.invokeTool, tool.cli, appRuntime.background]`, `bridgeTools: [google, gmail, gcal]`, `preBuilt: false`
- **README facts:** Gmail + Calendar, relies on `gogcli`, requires Google OAuth credentials, install via `brew install steipete/tap/gogcli`
- **Docs signal:** full page (priority external)
- **Caveat:** runtime/background capability required

### `../plugins/sero-humanizer-plugin`
- **Package:** `@sero-ai/plugin-humanizer`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: humanizer`, `name: Humanizer`, `scope: global`, `stateFile: .sero/apps/humanizer/state.json`, `component: HumanizerApp`, `devPort: 5192`)
- **Plugin metadata:** `category: creative`, tags: humanizer/writing/ai-detection, `preBuilt: false`
- **README facts:** `humanize` tool, `/humanize` command, includes `skills/humanizer/SKILL.md`, side-by-side editor and history panel
- **Docs signal:** lightweight page or catalog-expanded section

### `../plugins/sero-imagegen-plugin`
- **Package:** `@sero-ai/plugin-imagegen`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: imagegen`, `name: ImageGen`, `stateFile: .sero/apps/imagegen/state.json`, `component: ImageGenApp`, `devPort: 5181`)
- **Widgets:** `gallery`
- **Plugin metadata:** `category: creative`, tags: image-generation/ai-art/gemini, `preBuilt: false`
- **README facts:** Gemini-powered image generation, gallery, montage, `ImageViewer`, attach generated images to chat context
- **Docs signal:** full page (priority external)
- **Caveat:** image storage/location details should be source-checked further if page is written

### `../plugins/sero-kanban-plugin`
- **Package:** `@sero-ai/plugin-kanban`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: kanban`, `name: Kanban`, `stateFile: .sero/apps/kanban/state.json`, `component: KanbanApp`, `runtime: ./runtime/index.ts`, `devPort: 5189`)
- **Widgets:** `board-overview`
- **Plugin metadata:** `category: productivity`, tags: kanban/planning/workflow, `requiredHostCapabilities: [appAgent.invokeTool, tool.cli, appRuntime.background]`, `bridgeTools: [kanban]`, `preBuilt: false`
- **README facts:** dev board, agent-assisted planning/implementation/review, git-backed workspace required, `gh` recommended for PR flows
- **Docs signal:** full page (priority external)

### `../plugins/sero-notes-plugin`
- **Package:** `@sero-ai/plugin-notes`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: notes`, `name: Notes`, `scope: global`, `stateFile: .sero/apps/notes/state.json`, `component: NotesApp`, `devPort: 5178`)
- **Widgets:** `pinboard`
- **Plugin metadata:** `category: productivity`, tags: notes/writing/notebook, `preBuilt: false`
- **README facts:** `notes` tool (`list/add/edit/remove/pin/unpin/show`), `/notes` command, global-scoped state, UI sync
- **Docs signal:** full page (priority external)

### `../plugins/sero-plan-mode-plugin`
- **Package:** `@sero-ai/plugin-plan-mode`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: planmode`, `name: Plan Mode`, `stateFile: .sero/apps/planmode/state.json`, `component: PlanMode`, `devPort: 5180`)
- **Plugin metadata:** `category: developer-tools`, tags: plan-mode/planning/execution, `preBuilt: false`
- **README facts:** read-only exploration mode, `/plan`, `/plan-execute`, `/plan-todos`, three modes, plan-exit-review skill
- **Docs signal:** full page (priority external)
- **Caveat:** install URL in README appears to reference a different repo slug (`sero-plan-mode-tracker.git`)

### `../plugins/sero-research-plugin`
- **Package:** `@sero-ai/plugin-research`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: research`, `name: Research`, `stateFile: .sero/apps/research/state.json`, `component: ResearchApp`, `devPort: 5191`)
- **Plugin metadata:** `category: productivity`, tags: research/multi-agent/orchestrator, `preBuilt: false`
- **README facts:** `/research` and `/analyze`, 2-4 parallel workstreams, live progress tracking, stuck-agent detection, auto-synthesis, `research` tool (`plan/approve/status/cancel/analyze`)
- **Docs signal:** full page (priority external)

### `../plugins/sero-slopzilla-plugin`
- **Package:** `@sero-ai/plugin-slopzilla`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: slopzilla`, `name: SlopZilla`, `scope: global`, `stateFile: .sero/apps/slopzilla/state.json`, `component: SlopZilla`, `devPort: 5183`)
- **Plugin metadata:** `category: creative`, tags: slopzilla/ai-slop/idea-generator, `preBuilt: false`
- **README facts:** `slopzilla` tool, `/slopzilla`, history/saved ideas
- **Docs signal:** lightweight page or catalog-expanded section

### `../plugins/sero-spotify-plugin`
- **Package:** `@sero-ai/plugin-spotify`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: spotify`, `name: Spotify`, `scope: global`, `stateFile: .sero/apps/spotify/state.json`, `component: SpotifyApp`, `devPort: 5185`)
- **Widgets:** `mini-player`
- **Plugin metadata:** `category: entertainment`, tags: spotify/music/playback/streaming, `preBuilt: false`
- **README facts:** Spotify Web Playback SDK, playlist browsing, `spotify` tool, OAuth PKCE, Widevine/castlabs + VMP signing requirement
- **Docs signal:** second-tier full page because of auth/DRM caveats

### `../plugins/sero-starling-plugin`
- **Package:** `@sero-ai/plugin-starling`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: starling`, `name: Starling Bank`, `scope: global`, `stateFile: .sero/apps/starling/state.json`, `component: StarlingApp`, `devPort: 5184`)
- **Plugin metadata:** `category: finance`, tags: starling/banking/finance/transactions, `preBuilt: false`
- **README facts:** PAT + PIN flow, `starling` tool (`status`, `clear`), global state, token encrypted with Electron safeStorage, PIN is UX-level only
- **Docs signal:** second-tier full page because of privacy/security caveats

### `../plugins/sero-tetris-plugin`
- **Package:** `@sero-ai/plugin-tetris`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: tetris`, `name: Tetris`, `stateFile: .sero/apps/tetris/state.json`, `component: TetrisApp`, `devPort: 5179`)
- **Plugin metadata:** `category: entertainment`, tags: tetris/game/arcade, `preBuilt: false`
- **README facts:** UI-only app, no agent tools, browser-only gameplay, keyboard controls, development notes
- **Docs signal:** lightweight page or catalog-expanded section

### `../plugins/sero-weight-tracker-plugin`
- **Package:** `@sero-ai/plugin-weight-tracker`
- **Status:** external/local
- **Manifest:** `sero.app` present (`id: weight-tracker`, `name: Weight`, `scope: global`, `stateFile: .sero/apps/weight-tracker/state.json`, `component: WeightTracker`, `devPort: 5176`)
- **Plugin metadata:** `category: health`, tags: weight/tracker/health/fitness, `preBuilt: false`
- **README facts:** `weight` tool (`log/list/remove/goal/status/clear`), `/weight`, global-scoped state, trend chart/stats/goal tracking
- **Docs signal:** second-tier full page because of personal data/privacy caveats

## app-runtime API draft
Source paths checked:
- `packages/app-runtime/src/index.ts`
- `packages/app-runtime/src/use-app-info.ts`
- `packages/app-runtime/src/use-app-state.ts`
- `packages/app-runtime/src/use-agent-prompt.ts`
- `packages/app-runtime/src/use-ai.ts`
- `packages/app-runtime/src/use-app-tools.ts`
- `packages/app-runtime/src/use-available-models.ts`
- `packages/app-runtime/src/use-theme.ts`
- `packages/app-runtime/src/use-widget-registration.ts`
- `packages/app-runtime/src/widget-registry.ts`
- `packages/app-runtime/src/sero-bridge.ts`
- `packages/app-runtime/README.md`

Recommended compact table columns for DSC-019:
- Hook/API
- Use it for
- Requires app context?
- Bridge/host caveat
- Source path

High-confidence rows:
- `useAppInfo()` — read `appId`, `workspaceId`, `workspacePath`; requires `AppProvider`; source `use-app-info.ts`
- `useAppState(defaultState)` — reactive file-backed app state; requires `AppProvider`; persists via host app-state bridge; source `use-app-state.ts`
- `useAgentPrompt()` — send a prompt to the active agent session; no app session ID needed, but dropped if host bridge missing; source `use-agent-prompt.ts`
- `useAI()` — app-scoped prompt/promptStream against dedicated app agent session; requires app + workspace context; source `use-ai.ts`
- `useAppTools()` — invoke app/plugin tools via host bridge; throws if bridge unavailable; source `use-app-tools.ts`
- `useAvailableModels()` — list available model groups; session-independent; source `use-available-models.ts`
- `useTheme()` — read mode/preset; source `use-theme.ts`
- `registerWidget()` / `getRuntimeWidgets()` / `onWidgetRegistryChange()` — runtime widget registry; source `widget-registry.ts`
- `useWidgetRegistration()` — register runtime dashboard widgets for renderer session; source `use-widget-registration.ts`
- `getSeroApi()` — raw host bridge accessor; source `sero-bridge.ts`

## Local plugin development facts and caveats
Source checked:
- `docs/features/local-plugin-development.md`
- `docs/features/sero-apps.md`
- `apps/docs-site/docs/reference/plugins.md`
- `apps/docs-site/docs/reference/plugin-author-quick-path.md`
- `apps/docs-site/docs/guide/plugins-and-apps.md`

Key facts:
- Local plugin development is a distinct workflow from installed plugins and attached folders.
- It is profile-scoped and managed from **Admin → Plugins → Local Plugin Development**.
- A valid checkout needs at least `package.json` with `sero.app.id` and `sero.app.name`.
- Live UI dev server flow prefers `http://127.0.0.1:<devPort>/mf-manifest.json` when `scripts.dev` + `sero.app.devPort` exist.
- Built UI fallback uses `dist/ui/mf-manifest.json` when live UI is unavailable.
- Backend-only plugins can stay active without a UI surface.
- Session statuses: Starting, Active, Needs attention, Broken.
- `SERO_DEV_PLUGINS` is explicitly not the product workflow for plugin authors.
- Attached folders are workspace visibility/mount features only; they do not activate plugins.

## Suggested catalog row pattern
Use one row per plugin with at least:
- name / display name
- package name
- built-in vs external/local
- category/tags
- manifest source path
- app surface presence (`sero.app` / provider-only / plugin-only)
- full page vs catalog-only status
- key caveat (auth, privacy, runtime, UI-only, no tools, etc.)

## Full page vs catalog-only guidance
- **Full page likely warranted:** Cron/Scheduler, Git, MCP, Admin, Google, Kanban, Notes, Plan Mode, Research, Spotify, Starling, Weight Tracker, ImageGen, maybe Web if expanded beyond existing docs.
- **Catalog-only or short page acceptable:** Calculator, Daily Quote, Humanizer, SlopZilla, Tetris, and possibly Memory/User Feedback if their material stays inside existing built-in docs sections.
- **Provider-only entry:** Alibaba Coding Plan should likely live in provider docs or a model/provider section, not as an app-style plugin page.

## Caveats to preserve in docs
- Never imply built-in plugins are removable via Plugin Manager.
- Never describe `SERO_DEV_PLUGINS` as the normal user workflow.
- Avoid `~/.pi/agent/`; use `<SERO_HOME>/agent` / `~/.sero-ui/agent`.
- Distinguish app surfaces, tools/commands, runtime, widgets, auth, and storage separately.
- For sensitive plugins, keep example data fake/demo-only and call out encryption/privacy limits explicitly.
