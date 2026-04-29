# Plugin Catalog

This catalog is the public index for Sero plugin coverage. It separates **built-in** plugins from **external/local** plugins so readers do not mistake example or local development packages for bundled Sero features.

## How to read the catalog

| Field | Meaning |
| --- | --- |
| Status | `Built-in` ships in the Sero source tree; `External/local` must be installed or activated separately. |
| Docs | `Docs` links to a dedicated page; `Guide` links to an existing guide; `Catalog` means this row is the lightweight coverage. |

Built-in plugins may appear in app discovery or favorites, but they are not third-party packages that users remove through Plugin Manager. External/local plugins are trusted source code and do not ship with Sero unless you install or activate them.

## Built-in plugins

| Plugin | Package | Docs | Notes |
| --- | --- | --- | --- |
| Admin | `@sero-ai/plugin-admin` | [Guide](/guide/settings-models-admin) | Config editor, logs, sessions, agents/skills/prompts; global state file declared by manifest. |
| Alibaba Coding Plan | `@sero-ai/plugin-alibaba` | [Models guide](/guide/models-and-providers#plugin-defined-providers) | Provider-only package; API key env var `ALIBABA_CODING_PLAN_KEY`; no app UI. |
| Scheduler | `@sero-ai/plugin-cron` | [Guide](/guide/scheduler-reminders) | Reminders and recurring jobs; dashboard widget manifest. |
| Git | `@sero-ai/plugin-git` | [Guide](/guide/git-integration) | Visual Git workspace manager. |
| MCP | `@sero-ai/plugin-mcp` | [Guide](/guide/mcp) | MCP manager app; manifest bridges selected `mcp` tool behavior. |
| Memory | `@sero-ai/plugin-memory` | [Guide](/guide/memory) | Persistent memory, identity/profile facts, and daily logs. |
| User Feedback | `@sero-ai/plugin-user-feedback` | [Guide](/plugins/user-feedback) | Pending questions/questionnaires; `bridgeTools: false`. |
| Web | `@sero-ai/plugin-web` | [Guide](/guide/web) | Web search/content fetching/video-related surfaces within manifest scope. |

## External/local plugins with full pages

| Plugin | Package | Docs | Notes |
| --- | --- | --- | --- |
| Google | `@sero-ai/plugin-google` | [Docs](/plugins/google) | Gmail/Calendar via `gogcli`; OAuth credentials required. |
| Kanban | `@sero-ai/plugin-kanban` | [Docs](/plugins/kanban) | Dev board; git-backed workflow caveats. |
| Notes | `@sero-ai/plugin-notes` | [Docs](/plugins/notes) | Global note-taking app/tool. |
| Todo | `@sero-ai/todo-plugin` | [Docs](/plugins/todo) | Optional task app and Pi extension. |
| Research | `@sero-ai/plugin-research` | [Docs](/plugins/research) | Multi-agent research orchestration. |
| Plan Mode | `@sero-ai/plugin-plan-mode` | [Docs](/plugins/plan-mode) | Read-only planning and execution tracking. |
| Spotify | `@sero-ai/plugin-spotify` | [Docs](/plugins/spotify) | Spotify OAuth/PKCE plus Web Playback SDK caveats. |
| ImageGen | `@sero-ai/plugin-imagegen` | [Docs](/plugins/imagegen) | Gemini-powered image generation; verify storage before sharing outputs. |
| Starling Bank | `@sero-ai/plugin-starling` | [Docs](/plugins/starling) | Banking data; use fake/demo examples in support. |
| Weight | `@sero-ai/plugin-weight-tracker` | [Docs](/plugins/weight-tracker) | Personal health data; use fake/demo examples. |

## External/local catalog-only plugins

These smaller or demo plugins are covered here to avoid sidebar bloat. They are still external/local packages and require trust review before use.

| Plugin | Package | Try first | Limitations / caveat |
| --- | --- | --- | --- |
| Calculator | `@sero-ai/plugin-calc` | Ask Sero to calculate a harmless expression, or open the Calculator app if activated. | Utility/demo plugin; state is global app state per manifest. |
| Daily Quote | `@sero-ai/plugin-daily-quote` | Open Daily Quote or ask for a demo quote. | Good author example; global state. See [App Runtime](/reference/app-runtime). |
| Humanizer | `@sero-ai/plugin-humanizer` | Transform a short fake paragraph, then compare output in the side-by-side UI. | Do not market output as undetectable; verify claims manually. |
| SlopZilla | `@sero-ai/plugin-slopzilla` | Generate a clearly fictional idea and save it if useful. | Novelty/idea-generator plugin; avoid presenting joke output as production advice. |
| Tetris | `@sero-ai/plugin-tetris` | Open Tetris and use keyboard controls. | UI-only game plugin; no agent tools documented by README. |

## Install and enable notes

- Installed plugins are profile-scoped source packages managed from App Store/Admin flows.
- Local plugin development is separate from installed plugins; use **Admin → Plugins → Local Plugin Development** for a checkout you are editing.
- Attached folders only make source visible to the workspace/agent; they do not activate a plugin.
- Do not use private email, banking, health, or account data in screenshots or public issue reports.

Related docs: [Plugins and Apps](/guide/plugins-and-apps), [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites), [Plugins Reference](/reference/plugins), [App Runtime](/reference/app-runtime).
