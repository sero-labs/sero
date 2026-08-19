# Manual documentation capture queue

Use this queue with the detailed files in `capture-briefs/`. Keep every current asset until its replacement is approved.

## Capture rules

- Use one disposable profile named `Documentation` and one synthetic workspace.
- Use an application content size of 1440 by 900 CSS pixels at 100% zoom.
- Resize the native Electron window. Do not apply a CDP viewport inside a larger window.
- The Sero UI must reach every window edge. Do not publish black margins, desktop chrome, or partial window borders.
- Show a useful task, result, comparison, or decision. Do not capture an empty shell or an empty plugin screen.
- Use synthetic repositories, sessions, prompts, models, accounts, and records.
- Do not show a user name, home path, token, private repository, LAN address, real account, or real session.
- Capture at Retina resolution when useful, then export at the target CSS size.
- Check every visible label against the current UI before approval.

## Page map

Use these pages to judge the surrounding text, crop, and image position before
you capture each scene.

| Capture | Pages |
| --- | --- |
| A. Active workspace overview | [Workspace and Chat](docs/guide/workspace-and-chat.md) and [Architecture](docs/reference/architecture.md) |
| B. Explorer work state | [Explorer Workspace](docs/guide/explorer-workspace.md) |
| C. Git review state | [Git](docs/guide/git-integration.md) |
| D. Runtime choice | [Containers and Host Mode](docs/reference/containers-host-mode.md) |
| E. Model Manager | [Models and Providers](docs/guide/models-and-providers.md) |
| F. Theme selection and editor | [Themes](docs/guide/themes.md) |
| G. Admin sections | [Settings and Admin](docs/guide/settings-models-admin.md) |
| H. Local Plugin Development | [Plugins and Apps](docs/guide/plugins-and-apps.md) and [Plugins reference](docs/reference/plugins.md) |
| I. Design Library | [Design Library](docs/plugins/design-library.md) |
| J. Graphify | [Graphify](docs/plugins/graphify.md) |
| K. User Feedback | [User Feedback](docs/plugins/user-feedback.md) |
| L. Web search result | [Web](docs/guide/web.md) |
| M. MCP configuration | [MCP](docs/guide/mcp.md) |
| N. Connect Device | [Security / Privacy](docs/reference/security-privacy.md) |
| O. Sero Remote | [Remote Control](docs/guide/remote-control.md) |
| P. Profile and state roots | [State and Folders](docs/reference/state-and-folders.md) |

The Design Library, Graphify, and User Feedback images will be added to their
plugin pages after approval. The other captures replace images already shown on
the listed pages.

## 1. Core workspace set

### A. Active workspace overview

Show Explorer with:

- a small source tree;
- a useful source file or rendered README;
- terminal output from a successful deterministic test;
- an active synthetic agent session with a short task and result;
- the workspace and app sidebars;
- no open menu or dialog.

Produce page-specific crops from this state:

- `docs/assets/images/explorer-view.jpg`
- `docs/assets/generated/img1.jpg`

### B. Explorer work state

Show a selected source file, a terminal with test output, and visible Git status for one staged and one unstaged change. Keep the task understandable without reading private paths.

Produce:

- `docs/assets/generated/img15.jpg`
- `docs/assets/images/explorer.jpg`

### C. Git review state

Open **Git**. Use three synthetic commits, one staged file, one unstaged file, a selected diff, and a concise draft commit message. Keep the branch rail, work tree, diff, and history visible.

Produce:

- `docs/assets/images/git-app.jpg`

### D. Runtime choice

Open the runtime menu for the synthetic workspace. Show **Host**, **Apple Container**, and **Docker / Podman**. Keep enough workspace context to show that the choice applies to one workspace.

Produce:

- `docs/assets/generated/img5.jpg`

## 2. Models and themes

### E. Model Manager

Open **Model Manager** on **All Models**. Show one healthy hosted provider, one LM Studio provider, one favourite model, one hidden model, and expanded provider groups. Keep **Favourites**, **Hidden**, **Local**, and search visible.

Produce:

- `docs/assets/generated/img13.jpg`

### F. Theme selection and editor

Use one synthetic custom preset. Make it active before editing because of issue #379.

Produce:

- `docs/assets/images/theme-select.jpg` — preset grid and mode control.
- `docs/assets/images/theme-editor.jpg` — **Colours**, Light mode, top of token list.
- `docs/assets/images/theme-editor-2.jpg` — **Typography**, Dark mode, top controls.
- `docs/assets/images/theme-editor-3.jpg` — **Layout**, Dark mode, lower radius controls.

## 3. Administration and plugin development

### G. Admin sections

Use one synthetic agent, skill, prompt, session, and placeholder model configuration. Keep the current **Resources**, **Config**, and **System** navigation visible.

Produce:

- `docs/assets/images/admin-settings.jpg`
- `docs/assets/images/admin-agents.jpg`
- `docs/assets/images/admin-skills.jpg`
- `docs/assets/images/prompt-management.jpg`
- `docs/assets/images/admin-sessions.jpg`

### H. Local Plugin Development

Open **Admin > Plugins > Local Plugin Development**. Show a renamed copy of the maintained external Kanban starter in **Active** state with its managed UI development server ready. Hide the absolute source path.

Produce:

- `docs/assets/images/local-plugin-preview.jpg`

## 4. Built-in plugin results

### I. Design Library

Show a completed design with one named variant, useful generated content, the desktop width control, and the **Files** tab. Use the synthetic references `Transit dashboard` and `Field notes`.

Produce:

- `docs/assets/images/design-library-first-design.png`

### J. Graphify

Show the synthetic `sample-storefront` workspace in the **indexed** state with non-zero graph counts. Show the result for `What calls the authentication module?` with synthetic paths.

Produce:

- `docs/assets/images/graphify.jpg`

### K. User Feedback

Show the **Review** step of a three-question questionnaire. Use `Audience`, `Format`, and `Deadline`; show two answers and one skipped answer. Keep the neutral skipped step, amber skipped review card, and amber incomplete **Review** state accurate.

Produce:

- `docs/assets/images/user-feedback-questionnaire.png`

## 5. Web, MCP, and Remote Control

### L. Web search result

Open **Web** with a completed search for public Rspress documentation. Show provider status, citations, history, and a selected result.

Produce:

- `docs/assets/images/research.jpg`

### M. MCP configuration

Use one disabled local sample server with a harmless command and one remote sample server with placeholder environment-variable authentication.

Produce:

- `docs/assets/images/mcp.jpg` — server list.
- `docs/assets/images/mcp-server.jpg` — local server editor.
- `docs/assets/images/mcp-manager.jpg` — manager and status view.

### N. Connect Device

Open **Connect Device** for the disposable profile. Keep **Profile access**, **Access expires**, **Copy Login URL**, and **Generate New Code** visible. Replace the QR and login URL with clear `REDACTED` blocks. Generate a new code after capture.

Produce:

- `docs/assets/images/remote-web-connect.png`

### O. Sero Remote

Pair a second trusted test device in the same test tailnet. Use one synthetic workspace, one useful session, and synthetic files.

Produce:

- `docs/assets/images/remote-web-1.jpg` — workspace selection and active chat.
- `docs/assets/images/remote-web-2.jpg` — Files panel with useful synthetic files.

## 6. Static diagram

### P. Profile and state roots

Create a diagram, not an application screenshot. Show:

- `~/.sero-ui/profiles.json` as the fixed registry;
- `~/.sero-ui/` as the default profile root;
- `~/.sero-ui/agent/` as the default agent directory;
- `<custom-profile>/` and `<custom-profile>/agent/` as a separate custom root;
- `agent/`, `apps/`, `workspaces/`, `themes/`, and `debug/` under each profile.

Export at 1680 by 945 pixels with readable labels and at least 48 pixels of outer padding.

Produce:

- `docs/assets/generated/img8.jpg`

## Not required now

- V6 and V10 need no replacement media.
- Do not add the optional Starling or Weight Tracker images now. Their pages do not reference them.
- Keep the existing Loom and protected Orchestrator media in its current order.
