# Sero Feature Inventory Scout

_Last updated: 2026-04-26_

## Summary
Scanned the desktop shell (`apps/desktop/`), web remote client (`apps/web-remote/`), shared packages (`packages/`), built-in plugins (`plugins/sero-*-plugin/`), and external/local plugins under `/Users/danielcarter/Documents/Dev/projects/sero/plugins/*`. Reviewed package manifests, app/plugin entrypoints, shell/sidebar layout, IPC/shared types, and plugin README files to identify end-user-visible features.

The codebase is an agent-first workspace with a docked shell, built-in Dashboard/Explorer, a global chat panel, workspace/session navigation, plugin-discovered apps, containerized workspace/runtime support, and multiple built-in productivity/integration plugins. Several plugins are rich and production-oriented; a few are clearly placeholder or experimental.

## High-Impact Features
- Persistent desktop workspace with collapsible sidebar, active app surface, and global chat panel.
- Agent/chat workflow with session history, slash commands, model state, attachments, and prompt/steer/abort controls.
- Workspace Explorer with files, sessions, terminal/container behavior, and VCS integration.
- Built-in plugins for Git, memory, cron/reminders, admin/config, web access, user feedback, and MCP control.
- Discoverable plugin/app system with sidebar apps, app store, dashboard widgets, and federated UI modules.
- Container-aware developer workflow with per-workspace containers, dev servers, language servers, and Git worktree support.
- Web remote client for authenticated browser-based access to workspaces.

## Feature Inventory

### Core Workspace
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Desktop shell layout | `apps/desktop/src/App.tsx` | Main window with left sidebar, central active app, right chat panel, title bar, status bar, and resizable/collapsible panels. | High | General user | High |
| Built-in Dashboard and Explorer apps | `apps/desktop/src/stores/app/shared.ts`, `apps/desktop/src/components/apps/ActiveAppPanel.tsx` | Fixed built-in apps for Dashboard and Explorer, with other apps loaded dynamically. | High | General user | High |
| Plugin/app switching from sidebar | `apps/desktop/src/components/layout/shell/MainSidebar.tsx` | Sidebar lists built-in apps plus favorited discovered apps and launches them. | High | General user | High |
| App store / favorites | `MainSidebar.tsx`, `apps/desktop/src/stores/app/shared.ts` | Users can browse discovered apps and favorite/unfavorite them for sidebar pinning. | Medium | General user | High |
| First-run profile setup and onboarding | `apps/desktop/src/App.tsx` | Shows profile setup when no active profile exists, plus onboarding wizard on startup. | High | General user | High |
| Theme and layout persistence | `apps/desktop/src/App.tsx`, `apps/desktop/src/lib/persist-layout.ts` | Shell restores panel sizes, visibility, and theme-related state from persisted layout. | Medium | General user | High |

### Agent & Chat
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Global chat panel | `apps/desktop/src/App.tsx`, `ChatPanel` usage | Dedicated right-side agent chat that persists across apps and can be collapsed. | High | General user | High |
| Session-based agent lifecycle | `apps/desktop/src/stores/agent.ts` | Opens, closes, and focuses sessions; restores history and model state from the host. | High | Power user | High |
| Prompt / steer / abort actions | `stores/agent.ts` | User can send prompts, steer the agent, and abort running work. | High | General user | High |
| Slash commands and model state | `stores/agent.ts`, `src/types/ipc.ts` | Session command listing and model state are surfaced in the UI. | Medium | Power user | High |
| Attachments in prompts | `stores/agent.ts` | Prompts can include attachments, not just plain text. | Medium | Power user | High |
| Collaboration state | `stores/agent.ts` and collaboration helpers | Multi-agent / collaboration state is tracked in the agent store. | Medium | Power user | Medium |
| Command menu | `apps/desktop/src/App.tsx` | Global command palette/menu for fast app and action access. | Medium | Power user | High |

### Memory & Context
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Persistent memory system | `plugins/sero-memory-plugin/extension/index.ts`, package description | Long-term memory for facts, identity, user profile, scratchpad, and daily logs. | High | General user | High |
| Automatic context injection | `memory-plugin/extension/index.ts` | Relevant memory is injected before agent turns when needed. | High | General user | High |
| Semantic/keyword/hybrid memory search | `memory-plugin/extension/index.ts` | QMD-backed memory search across memory files. | High | Power user | High |
| Memory consolidation / auto-logging | `memory-plugin/extension/index.ts` | Background consolidation of logs into durable memory, with cadence controls. | Medium | Power user | High |
| Session transcript recall | `memory-plugin/extension/index.ts` | Searchable session transcript exports and automatic backfill. | Medium | Power user | High |
| Memory scratchpad tool | `memory-plugin/extension/index.ts` | Separate scratchpad surface for ephemeral working notes. | Medium | Power user | High |

### Files & Projects
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Workspace registry | `src/types/ipc.ts`, `electron/main.ts` | Workspaces are registered and restored from Sero state files. | High | General user | High |
| Multi-root workspace support | `src/types/ipc.ts` | Workspaces can include extra roots and linked plugin roots. | Medium | Power user | High |
| Workspace references and mounts | `src/types/ipc.ts` | Workspaces may mount other workspaces or arbitrary host folders. | High | Power user | High |
| File tree subscription | `apps/desktop/src/hooks/workspace-filetree-subscription.ts` | Renderer watches workspace file tree updates from the host. | Medium | General user | High |
| Searchable workspace session tree | `MainSidebar.tsx`, `WorkspaceTree` | Sidebar groups workspaces and sessions with search. | Medium | Power user | High |
| Context editor / presets | `src/types/ipc.ts` | Session context can be edited with saved presets for prompts, tools, and skills. | Medium | Power user | High |

### Terminal & Containers
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Per-workspace container runtime | `apps/desktop/electron/main.ts`, `src/types/ipc.ts` | Workspace containers are bootstrapped and managed on app startup. | High | Power user | High |
| Container HTTP proxy | `electron/main.ts` | Host proxy tunnels container internet access. | High | Power user | High |
| Orphaned container cleanup | `electron/main.ts` | Stops/removes stale `sero-*` containers after crashes. | Medium | Power user | High |
| Terminal cleanup on shutdown | `electron/main.ts` | Terminal sessions are disposed during graceful shutdown. | Medium | Power user | High |
| Container fallback / availability detection | `electron/main.ts`, `src/types/ipc.ts` | Host detects degraded container availability and can fall back to host runtime. | Medium | Power user | High |
| App runtime command execution | `packages/common/src/app-runtime-background.ts` | Plugins can run workspace commands, refresh sync, and resolve runtime. | High | Developer | High |

### Plugins & Apps
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Federated plugin apps | `apps/desktop/src/lib/federation-registry.ts`, plugin manifests | Apps load dynamically from `sero.app` manifests and remote entries. | High | Plugin user | High |
| Dashboard widgets | `plugins/sero-cron-plugin/package.json`, `plugins/sero-web-plugin/package.json`, app-runtime docs | Plugins can expose compact widgets on the dashboard. | Medium | General user | High |
| Runtime widgets | `packages/app-runtime/src/use-widget-registration.ts` | Apps can register widgets dynamically at runtime. | Medium | Plugin user | High |
| App state bridge | `packages/app-runtime/README.md` | Federated apps persist state through `useAppState` rather than browser storage. | High | Plugin user | High |
| App tools bridge | `packages/app-runtime/src/use-app-tools.ts` | Apps can call plugin tools from UI via host bridge. | High | Plugin user | High |

### Automations & Background Jobs
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Cron scheduler | `plugins/sero-cron-plugin/extension/index.ts` | Background scheduled jobs for recurring prompts and reminders. | High | General user | High |
| Reminder tools | `sero-cron-plugin/extension/index.ts` | Create and manage reminders from agent/tool flows. | High | General user | High |
| Session lifecycle automation | `memory-plugin/extension/index.ts`, `cron-plugin` | Automations react to session start/switch/shutdown and agent turns. | Medium | Power user | High |
| Background plugin runtime support | `packages/common/src/app-runtime-background.ts` | Plugins can declare background runtimes and workspace services. | High | Developer | High |

### Notifications & Reminders
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Desktop notification bridge | `AGENTS.md`, `packages/common/src/app-runtime-background.ts` | Plugins and runtime code can notify the user from the host. | Medium | General user | High |
| Reminder scheduling | `sero-cron-plugin/extension/index.ts` | Reminder creation is surfaced as a first-class feature. | High | General user | High |
| Memory intro / status notifications | `memory-plugin/extension/index.ts` | Memory bootstrap and consolidation states trigger user notices. | Medium | General user | High |

### Git & Developer Workflows
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Git workspace manager | `plugins/sero-git-plugin/package.json`, `extension/index.ts` | Visual Git workflow with status, log, branches, diff, staging, commits, stash, fetch/pull/push. | High | Power user | High |
| Worktree management | `plugins/sero-git-plugin/extension/index.ts`, `packages/common/src/app-runtime-background.ts` | Create/remove/sync worktrees and workspace roots from Git flows. | High | Power user | High |
| Dev server management | `src/types/ipc.ts`, `packages/common/src/app-runtime-background.ts` | Host tracks dev servers, status, restart, and automatic startup. | High | Developer | High |
| Plan mode | `plugins/sero-plan-mode-plugin/README.md` | Read-only exploration mode with stepwise plan execution. | High | Developer | High |
| Research orchestration | `plugins/sero-research-plugin/README.md` | Multi-agent research, progress tracking, and synthesis. | High | Power user | High |
| Kanban dev board | `plugins/sero-kanban-plugin/README.md` | AI-assisted development board with backlog→done workflow. | High | Developer | High |

### Admin & Configuration
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Admin app | `plugins/sero-admin-plugin/package.json`, `extension/index.ts` | Central config/log/session browser surface. | High | Admin | High |
| Settings / model / memory config bootstrap | `electron/main.ts` | First-run settings include built-in packages, model fallback, and memory logging. | Medium | Admin | High |
| Plugin manager / discovery | `apps/desktop/src/components/layout/MainSidebar.tsx`, `packages/common/src/plugins.ts` | Installed and discovered plugins can be browsed, filtered, and managed. | High | Power user | High |
| Context presets / skill visibility | `src/types/ipc.ts`, `packages/common/src/skill-visibility.ts` | Admin surfaces session context configuration and skill/tool filtering. | Medium | Admin | High |

### Remote Access
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Web remote client | `apps/web-remote/src/App.tsx`, `package.json` | Browser client with auth screen, reconnect logic, and workspace fetching. | High | General user | High |
| Gateway / WebSocket bridge | `apps/desktop/electron/main.ts` | Optional gateway can proxy prompts and session actions. | Medium | Power user | High |
| Remote plugin entry loading | `apps/desktop/src/lib/federation-registry.ts` | Apps can load from dev servers or packaged remote entries. | High | Plugin user | High |

### Integrations
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Web browsing / extraction | `plugins/sero-web-plugin/package.json`, `extension/index.ts` | Search, fetch, extract, bookmark, and code search web content. | High | General user | High |
| Gemini / Exa / Perplexity provider selection | `sero-web-plugin/extension/index.ts` | Web tools can use multiple providers based on availability. | Medium | Power user | High |
| GitHub URL helpers and GitHub auth | `packages/common/src/github-url.ts`, `apps/desktop/src/components/layout/auth/github/GitHubAuthDialog` | GitHub-specific support for URLs and auth flows. | Medium | Power user | High |
| Google Workspace integration | `plugins/sero-google-plugin/README.md` | Gmail and Calendar access via gogcli. | High | General user | High |
| Spotify integration | `plugins/sero-spotify-plugin/README.md` | In-app Spotify playback, playlist browsing, recommendations, and OAuth PKCE. | High | General user | High |
| Starling Bank dashboard | `plugins/sero-starling-plugin/README.md` | View balances, transactions, savings goals, and spending insights. | High | General user | High |
| Image generation | `plugins/sero-imagegen-plugin/package.json` | Gemini-powered image generation and gallery management. | High | General user | High |
| Daily quote / inspiration | `plugins/sero-daily-quote-plugin/package.json` | Daily inspirational quote surface. | Low | General user | High |
| Humanizer / rewrite assistance | `plugins/sero-humanizer-plugin/package.json` | Transform text into more natural or stylized writing. | High | General user | High |

### UI / Layout / Theming
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Resizable shell panels | `apps/desktop/src/App.tsx` | Sidebar and chat panel widths persist and can be dragged. | High | General user | High |
| Theme bootstrap / system theme sync | `apps/desktop/src/App.tsx`, `public/theme-bootstrap.js` | Desktop theme is synced and initialized before render. | Medium | General user | High |
| App-specific error boundaries | `apps/desktop/src/App.tsx` | Sidebar, plugin, and chat regions fail independently. | Medium | General user | High |
| Dashboard widgets and card sizing | `plugins/sero-cron-plugin/package.json`, `plugins/sero-web-plugin/package.json` | Widget definitions include sizing constraints for dashboard layout. | Medium | General user | High |

### Plugin Development / Extensibility
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Sero plugin manifest discovery | `packages/templates/skills/sero-plugin/SKILL.md`, `apps/desktop/electron/main.ts` | Auto-discovers `plugins/sero-*-plugin/` packages with `sero.app` manifests. | High | Developer | High |
| Shared app runtime hooks | `packages/app-runtime/README.md` | Standard hooks for state, model prompt, AI, theme, app info, and tools. | High | Developer | High |
| Host capability contracts | `packages/common/src/plugins.ts`, `packages/common/src/app-runtime-background.ts` | Plugins declare required host capabilities and runtime needs. | Medium | Developer | High |
| Bridged tools and commands | `plugins/*/extension/index.ts` | Plugins register tools and slash commands through Pi. | High | Developer | High |
| Module Federation UI loading | `apps/desktop/src/lib/federation-registry.ts` | Remote UI modules load dynamically and are cached/LRU-evicted. | High | Developer | High |

### Data Persistence & Sync
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| File-backed layout state | `apps/desktop/src/lib/persist-layout.ts`, AGENTS.md | Shell layout is persisted outside browser storage. | High | General user | High |
| Plugin/app state files | `packages/app-runtime/README.md`, plugin manifests | App state is stored per app in state files under `.sero/apps/...`. | High | Plugin user | High |
| Session transcript / memory sync | `memory-plugin/extension/index.ts` | Memories and transcripts are mirrored into durable state. | Medium | Power user | High |
| Web search state sync | `sero-web-plugin/extension/index.ts` | Search/fetch history is synced into the plugin state file and session. | Medium | Power user | High |
| Git state file sync | `plugins/sero-git-plugin/extension/index.ts` | Git workspace state is tracked in `.sero/apps/git/state.json`. | Medium | Power user | High |

### Security / Permissions
| Feature | Source | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Profile-scoped Chromium isolation | `apps/desktop/electron/main.ts` | Separate Electron userData per profile. | Medium | Admin | High |
| Strict renderer isolation | `apps/desktop/electron/main.ts` | Context isolation, no node integration, security setup, CSP. | Medium | General user | High |
| Admin surface safety guard | `plugins/sero-admin-plugin/extension/index.ts` | Admin is UI-only and intentionally not exposed as a tool. | Medium | Admin | High |
| Web plugin permission gating | `plugins/sero-user-feedback-plugin/extension/permission-gate.ts` | Some actions require explicit user confirmation / permission handling. | Medium | General user | Medium |

## Plugin-by-Plugin Inventory

### `sero-admin-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Config editor | Inspect and edit Sero configuration from the admin UI. | High | Admin | High |
| Log viewer | Browse host/plugin logs from one place. | High | Admin | High |
| Session browser | Inspect sessions and startup state. | Medium | Admin | High |
| UI-only safety | Not bridged into agent tools for security reasons. | Medium | Admin | High |

### `sero-cron-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Recurring job scheduler | Schedule recurring agent prompts and background tasks. | High | General user | High |
| Reminders | Create reminder flows that fire later. | High | General user | High |
| Current time tool | Exposes current time for agent workflows. | Low | Power user | High |
| Dashboard widget | Shows scheduler status, upcoming jobs, and reminders. | Medium | General user | High |

### `sero-git-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|
| Visual Git manager | Status, logs, branches, diffs, staging, commits, checkout, stash, fetch/pull/push. | High | Developer | High |
| Branch/worktree ops | Create/delete branches, remove worktrees, merge, cherry-pick, show commits. | High | Developer | High |
| Agent-friendly CLI/tool bridge | A `git_manager` tool and `/git` command drive the workflow. | High | Developer | High |

### `sero-mcp-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| MCP control center | Manage MCP servers and runtime state inside Sero. | High | Developer | High |
| MCP proxy tool | Agent-facing tool for normal MCP interactions. | High | Developer | High |
| MCP manager tool | Administrative tool for server connections and auth. | High | Developer | High |
| Prompt augmentation | Adds MCP context into the agent system prompt. | Medium | Developer | High |

### `sero-memory-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Long-term memory | Stores durable facts, identity, and user profile. | High | General user | High |
| Daily logs | Maintains ongoing daily memory logs. | Medium | General user | High |
| Search and scratchpad | Read/write/search memory plus scratchpad support. | High | Power user | High |
| Context injection | Pulls relevant memories into active prompts automatically. | High | General user | High |
| Auto consolidation | Background consolidation of logs into durable memory. | Medium | Power user | High |

### `sero-user-feedback-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Single-question prompts | Ask the user a question with choices or custom input. | High | General user | High |
| Multi-question questionnaires | Collect structured feedback in a step-based flow. | High | General user | High |
| Interviews | Open-ended iterative interviews for deeper discovery/spec gathering. | Medium | Power user | High |
| Permission gate | Explicit approval flow before sensitive actions. | Medium | General user | High |

### `sero-web-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Web search | Search the web from Sero and store results. | High | General user | High |
| Content fetching | Retrieve and summarize page content asynchronously. | High | General user | High |
| Code search | Search code-oriented web sources. | Medium | Developer | High |
| Bookmarks | Save web results/bookmarks into plugin state. | Medium | Power user | High |
| Gemini / Exa / Perplexity provider routing | Chooses among available search/extract providers. | Medium | Power user | High |
| Google account check | Reports the active Google account for Gemini Web. | Low | Power user | High |
| Web activity widget | Recent searches and fetches displayed on dashboard. | Medium | General user | High |

## External Plugin Inventory

### `sero-calc-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|
| Calculator app | Standard calculator with a web UI. | Medium | General user | High |

### `sero-daily-quote-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Daily quote app | Shows a daily inspirational quote / AI-generated wisdom. | Low | General user | High |

### `sero-google-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Gmail access | Read and search email in Sero. | High | General user | High |
| Google Calendar access | View upcoming events and schedule. | High | General user | High |
| Agent email/schedule assistance | Let the agent work with inbox and calendar. | High | Power user | High |

### `sero-humanizer-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Humanize text | Rewrite text into more natural or creative styles. | High | General user | High |
| Reduce AI patterns | Attempts to remove AI-generated style markers. | Medium | General user | High |
| Writing-style skill | Includes a Pi skill grounded in AI-writing heuristics. | Medium | Power user | High |

### `sero-imagegen-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Image generation | Generate images with Gemini-powered tooling. | High | General user | High |
| Image gallery management | View and manage generated images in workspace. | Medium | General user | High |

### `sero-kanban-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| AI-assisted Kanban board | Track work on a project board inside Sero. | High | Developer | High |
| Workflow coordination | Moves work through planning, implementation, and review. | High | Developer | High |
| Workspace sync | Keeps card, PR, and review state aligned with the repo. | High | Developer | High |

### `sero-notes-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Notes app | Note-taking inside Sero with optional web UI. | High | General user | High |
| Extensible app pattern | Standard example of stateful Pi app + UI. | Low | Developer | High |

### `sero-plan-mode-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Read-only plan mode | Restricts tools to safe exploration and planning. | High | Developer | High |
| Progress-tracked execution | Steps a plan through execution with status tracking. | High | Developer | High |

### `sero-research-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Multi-agent research orchestration | Splits questions into parallel workstreams. | High | Power user | High |
| Live progress monitoring | Shows agent activity, tool calls, and line counts. | High | Power user | High |
| Stuck-agent detection | Flags workstreams that stop progressing. | Medium | Power user | High |
| Auto-synthesis | Produces a unified research document at the end. | High | Power user | High |

### `sero-slopzilla-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Idea generator | Generates intentionally over-the-top app ideas. | Medium | General user | High |
| Complexity/stack selection | Lets users choose complexity and stack before generation. | Medium | General user | High |
| Bookmark and launch ideas | Save favored ideas and launch them into a workspace. | Medium | Power user | High |

### `sero-spotify-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Spotify playback | In-app playback via Spotify Web Playback SDK. | High | General user | High |
| Playlist browsing | Browse playlists and tracks. | High | General user | High |
| Agent-assisted music tooling | Agent can create playlists, search tracks, and recommend mixes. | High | Power user | High |
| OAuth PKCE auth | Client-side Spotify sign-in flow. | Medium | General user | High |

### `sero-starling-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Banking dashboard | View balances, transactions, savings goals, and spending insights. | High | General user | High |

### `sero-tetris-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Tetris game | Classic arcade Tetris inside Sero. | Low | General user | High |
| HD particle effects | Polished visual effects and animations. | Low | General user | High |

### `sero-todo-plugin-main`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Todo app | Task list / to-do manager with optional web UI. | High | General user | High |

### `sero-weight-tracker-plugin`
| Feature | Description | Impact | Audience | Confidence |
|---|---|---|---|---|---|
| Weight tracking | Track weight over time. | High | General user | High |
| Trend visualisation | Charts/trends for progress monitoring. | High | General user | High |
| Motivation messaging | Gentle encouragement / habit support. | Low | General user | High |

## Possible / Unclear Features
- `apps/desktop/src/components/layout/CommandMenu` is present, but the exact command catalog was not reviewed in full.
- `apps/desktop/src/components/apps/explorer/ExplorerWorkspace` likely contains terminal, file tree, VCS, and workspace management features; only the shell entrypoint and E2E selectors were reviewed here.
- `apps/web-remote` appears to be a remote browser client for Sero workspaces, but the specific feature surface beyond auth/reconnect/workspace fetch was not fully inspected.
- `sero-alibaba-plugin` exists with only a package manifest visible here; it appears to provide Alibaba/Qwen/GLM/Kimi/MiniMax provider support, but the exact user-facing surface was not inspected.
- `sero-mcp-plugin` may expose more detailed runtime-auth and resource/proxy UI than summarized here.
- `sero-user-feedback-plugin` may have more nuanced UI modes and TUI fallbacks than summarized here.
- The repo contains many docs/template references that suggest additional plugin patterns, but these were not counted as end-user features unless backed by plugin/app code or README text.

## Recommended Next Documentation Targets
1. **Git workspace manager** — high-value for developers; broad feature set and strong product impact.
2. **Memory system** — central to Sero’s agent experience; durable context is a major differentiator.
3. **Web access plugin** — search/fetch/bookmark workflows are broadly useful and visibly rich.
4. **Cron/reminders** — straightforward end-user value with dashboard visibility.
5. **Research orchestrator** — strong differentiated workflow for power users.
6. **Google / Spotify / Starling integrations** — high user appeal and clear marketing value.
7. **Kanban / Plan mode / Todo** — developer workflow suite worth separate documentation.
8. **Admin plugin** — important for configuration, logs, and support, especially for power users/admins.
