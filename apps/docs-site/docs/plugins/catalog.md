# Plugin Catalog

Use this catalog to identify who supplies a plugin and whether a current path is verified. A documentation page does not by itself mean that Sero supports the plugin.

## How to read the catalog

| Field | Meaning |
| --- | --- |
| Status | `Built-in` ships with Sero. `External` does not ship with Sero and is installed from another source. `Deprecated` remains documented but is not recommended for new use. `Unsupported` means that no current supported install or runtime path is verified. |
| Docs | `Docs` links to a dedicated page; `Guide` links to an existing guide; `Catalog` means this row is the lightweight coverage. |
| Source | `git:` installs from a Git repository. `npm:` installs a published npm package. A local development checkout uses **Admin → Plugins → Local Plugin Development** and is not an installed source. |

Built-in plugins can appear in app discovery or favorites. External plugins do not ship with Sero. Review their owner and source before installation.

## Built-in plugins

| Plugin | Package | Docs | Notes |
| --- | --- | --- | --- |
| Admin | `@sero-ai/plugin-admin` | [Guide](/guide/settings-models-admin) | Config editor, logs, sessions, agents/skills/prompts; global state file declared by manifest. |
| Scheduler | `@sero-ai/plugin-cron` | [Guide](/guide/scheduler-reminders) | Reminders and recurring jobs; dashboard widget manifest. |
| Design Library | `@sero-ai/plugin-design-library` | [Docs](/plugins/design-library) | Visual reference library with automatic design-language analysis; global state under the profile's Sero home. |
| Git | `@sero-ai/plugin-git` | [Guide](/guide/git-integration) | Visual Git workspace manager. |
| Graphify | `@sero-ai/plugin-graphify` | [Docs](/plugins/graphify) | Local workspace and profile knowledge graphs. |
| MCP | `@sero-ai/plugin-mcp` | [Guide](/guide/mcp) | MCP manager app; manifest bridges selected `mcp` tool behavior. |
| Memory | `@sero-ai/plugin-memory` | [Guide](/guide/memory) | Persistent memory, identity/profile facts, and daily logs. |
| Orchestrator | `@sero-ai/plugin-orchestrator` | [Guide](/guide/orchestrator) | Workflows and Rooms. |
| Usage | `@sero-ai/plugin-usage` | Catalog | Model usage and cost views. |
| User Feedback | `@sero-ai/plugin-user-feedback` | [Guide](/plugins/user-feedback) | Pending questions/questionnaires; `bridgeTools: false`. |
| Web | `@sero-ai/plugin-web` | [Guide](/guide/web) | Web search/content fetching/video-related surfaces within manifest scope. |

## External plugins with full pages

| Plugin | Package | Status | Source | Docs | Requirements and scope |
| --- | --- | --- | --- | --- | --- |
| Google | `@sero-ai/plugin-google` | External | `git:https://github.com/sero-labs/sero-google-plugin.git` | [Docs](/plugins/google) | Gmail and Calendar through `gogcli`; OAuth credentials required. |
| Kanban | `@sero-ai/plugin-kanban` | External | `git:https://github.com/sero-labs/sero-kanban-plugin.git` | [Docs](/plugins/kanban) | Development board with Git workflow actions. |
| Notes | `@sero-ai/plugin-notes` | External | `git:https://github.com/sero-labs/sero-notes-plugin.git` | [Docs](/plugins/notes) | Global note-taking app and tool. |
| Todo | `@sero-ai/todo-plugin` | External | `git:https://github.com/sero-labs/sero-todo-plugin.git` | [Docs](/plugins/todo) | Task app and Pi extension. |
| Research | `@sero-ai/plugin-research` | External | `git:https://github.com/sero-labs/sero-research-plugin.git` | [Docs](/plugins/research) | Multi-agent research orchestration. |
| Signal Desk | `@sero-ai/plugin-signal-desk` | External | `git:https://github.com/sero-labs/sero-signal-desk-plugin.git` | [Docs](/plugins/signal-desk) | Network access for feeds and sources. |
| Plan Mode | `@sero-ai/plugin-plan-mode` | External | Current source repository not verified. | [Docs](/plugins/plan-mode) | Planning and execution tracking. |
| Spotify | `@sero-ai/plugin-spotify` | Deprecated; current runtime path unsupported | None recommended | [Docs](/plugins/spotify) | The repository marks it deprecated. Current stock Electron does not provide its former DRM path. |
| ImageGen | `@sero-ai/plugin-imagegen` | External | `git:https://github.com/sero-labs/sero-imagegen-plugin.git` | [Docs](/plugins/imagegen) | Gemini credentials and network access. |
| Loom | `@sero-ai/plugin-loom` | External | `git:https://github.com/sero-labs/sero-loom-plugin.git` | [Docs](/plugins/loom) | GLSL art studio and wallpaper capture. |
| Starling Bank | `@sero-ai/plugin-starling` | External | `git:https://github.com/monobyte/sero-starling-plugin.git` | [Docs](/plugins/starling) | Sero 0.1.0+, runtime ABI 2, Sero desktop bridges, Starling token, and network access. |
| Weight | `@sero-ai/plugin-weight-tracker` | External | `git:https://github.com/monobyte/sero-weight-tracker.git` | [Docs](/plugins/weight-tracker) | Sero 0.1.0+ and runtime ABI 2; stores health data as plain JSON. |

## External catalog-only plugins

These smaller or demo plugins are external packages. Review their source before use.

| Plugin | Package | Try first | Limitations / caveat |
| --- | --- | --- | --- |
| Alibaba Coding Plan | `@sero-ai/plugin-alibaba` | [Models guide](/guide/models-and-providers#plugin-defined-providers) | Provider-only package; install from `git:https://github.com/sero-labs/sero-alibaba-plugin.git`; API key env var `ALIBABA_CODING_PLAN_KEY`; no sidebar UI. |
| Calculator | `@sero-ai/plugin-calc` | Ask Sero to calculate a harmless expression, or open the Calculator app if activated. | Utility/demo plugin; state is global app state per manifest. |
| Daily Quote | `@sero-ai/plugin-daily-quote` | Open Daily Quote or ask for a demo quote. | Good author example; global state. See [App Runtime](/reference/app-runtime). |
| Humanizer | `@sero-ai/plugin-humanizer` | Transform a short fake paragraph, then compare output in the side-by-side UI. | Do not market output as undetectable; verify claims manually. |
| SlopZilla | `@sero-ai/plugin-slopzilla` | Generate a clearly fictional idea and save it if useful. | Novelty/idea-generator plugin; avoid presenting joke output as production advice. |
| Tetris | `@sero-ai/plugin-tetris` | Open Tetris and use keyboard controls. | UI-only game plugin; no agent tools documented by README. |

## Install and enable notes

- Installed external plugins are profile-scoped source packages managed from App Store/Admin flows.
- Local plugin development is separate from installed plugins; use **Admin → Plugins → Local Plugin Development** for a checkout you are editing.
- Attached folders only make source visible to the workspace/agent; they do not activate a plugin.
- Do not use private email, banking, health, or account data in screenshots or public issue reports.

Related docs: [Plugins and Apps](/guide/plugins-and-apps), [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites), [Plugins Reference](/reference/plugins), [App Runtime](/reference/app-runtime).
