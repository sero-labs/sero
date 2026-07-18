# Sero Monorepo

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /Users/danielcarter/Documents/Dev/projects/sero/sero/node_modules/.pnpm/@earendil-works+pi-coding-agent@0.78.0_@modelcontextprotocol+sdk@1.29.0_@cfworker+json-_6cb89bf1e2efe7bfe3a0efa204ed2203/node_modules/@earendil-works/pi-coding-agent/README.md
- Additional docs: /Users/danielcarter/Documents/Dev/projects/sero/sero/node_modules/.pnpm/@earendil-works+pi-coding-agent@0.78.0_@modelcontextprotocol+sdk@1.29.0_@cfworker+json-_6cb89bf1e2efe7bfe3a0efa204ed2203/node_modules/@earendil-works/pi-coding-agent/docs
- Examples: /Users/danielcarter/Documents/Dev/projects/sero/sero/node_modules/.pnpm/@earendil-works+pi-coding-agent@0.78.0_@modelcontextprotocol+sdk@1.29.0_@cfworker+json-_6cb89bf1e2efe7bfe3a0efa204ed2203/node_modules/@earendil-works/pi-coding-agent/examples (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)



## Structure

```
sero/
├── apps/
│   ├── desktop/          # Electron + React shell
│   ├── docs-site/        # Astro docs
│   ├── homepage/         # Sero Landing Page
│   └── web-remote/       # Web app served via Tailscale
├── packages/
│   ├── app-runtime/      # @sero-ai/app-runtime — shared hooks/context
│   ├── common/           # Shared types and utilities
│   ├── templates/        # Skills/themes/agents/user profile for new profiles
│   └── ui/               # Shared UI components, AI elements, and design tokens
├── plugins/
│   ├── sero-cron-plugin/     # Built-in plugin + background jobs
│   ├── sero-admin-plugin/    # Built-in admin/config tooling
│   └── other built-in Sero plugins...
├── turbo.json
├── pnpm-workspace.yaml
└── package.json          # Root — workspace scripts
```

## Quick Start & Commands

**Monorepo (root):**
```bash
pnpm install
pnpm build
pnpm dev
pnpm typecheck
pnpm test
pkill -f "vite"; pkill -f "electron"
```

**Typecheck (CRITICAL)**: Run `pnpm typecheck` from the monorepo root **before every commit**. All packages (renderer + electron main process via `tsconfig.electron.json`) must pass with zero errors. Never commit with `@ts-ignore`, `@ts-expect-error`, or `any` casts unless unavoidable (leave explanatory comment).

## Shared Packages & Plugins

- **`@sero-ai/app-runtime`** — React hooks (`useAppState`, `useAppInfo`, `useAgentPrompt`) + `AppProvider` for federated plugin modules
- **`@sero-ai/common`** — shared renderer-safe types/utilities. Prefer moving neutral cross-package code here (no Electron/Node-only dependencies).
- **`@sero-ai/extension-runtime`** — shared Node/runtime helpers for isolated background agent work (e.g. `runIsolatedCompletion`), used by both plugin **extensions** and the desktop **host** (e.g. adhoc PR-draft generation). Runs completions in a session with no extensions/skills/context/`APPEND_SYSTEM.md`, so background jobs can't be contaminated by a project's prompt files or trigger session-lifecycle hooks. The bundler (plugins and electron) inlines it and keeps the Pi SDK peers external. Use this (not `@sero-ai/common`) for code that needs the Pi coding-agent runtime.
- **`@sero-ai/ui`** - shared ui components 

**Tool installs are machine-shared, NEVER per-profile.** When a plugin or
feature provisions a heavyweight dependency (a Python environment, a CLI
binary, model files, …), it must install it once per machine in the shared
artifacts area — background runtimes get this via
`host.toolchains.sharedToolsDir('<app-id>')` (`SERO_HOST_ARTIFACTS_ROOT/app-tools/<app-id>`);
managed binaries themselves go through the toolchain manifest
(`docs/features/host-toolchain.md`). Never install tools under the profile's
`SERO_HOME` (e.g. `apps/<id>/`): profiles hold *data* (state, artifacts,
settings), and per-profile tool copies duplicate hundreds of MB per profile.
Resolution must follow the standard order: verified system tool first, shared
managed install second, download on first use last — with zero manual install
steps for the user.

Built-in plugins live in `plugins/sero-*-plugin/`. Most complete in-repo examples:
- `sero-git-plugin` — app + tool integration with a substantial UI
- `sero-cron-plugin` — background jobs & reminders
- `sero-admin-plugin` — config editor, log viewer, session browser
- `sero-memory-plugin` — persistent memory system & daily logs

External plugin examples live alongside this repo under `../plugins/`, notably
`sero-google-plugin` and `sero-kanban-plugin`.

## Documentation

- [docs/sero.md](docs/sero.md) — vision, platform constraints, Pi SDK philosophy
- [docs/architecture.md](docs/architecture.md) — shell layout, component hierarchy
- [docs/decisions.md](docs/decisions.md) — numbered architecture decisions (see AD-018, AD-020)
- [docs/features/memory.md](docs/features/memory.md) — memory system, tools, context injection
- [docs/reference/state-and-folders.md](docs/reference/state-and-folders.md) — config/state locations
- [docs/node-pty-setup.md](docs/node-pty-setup.md) — node-pty rebuild guide (MUST READ if terminals fail)
- [docs/themes/README.md](docs/themes/README.md) — theming & style guide
- [docs/plugins/guide.md](docs/plugins/guide.md) — creating, distributing, installing plugins
- [docs/plugins/technical.md](docs/plugins/technical.md) — plugin system internals

Logs: source-dev logs live in `~/.sero-ui/logs/` (or `$SERO_LOG_DIR`) with compatibility symlinks at `/tmp/sero-*.log`. Inside container workspaces, start at `/workspace/.sero/logs/README.md`; useful files include `dev/sero-electron.log`, `dev/sero-vite.log`, and `dev/sero-remote-<app-id>.log`.

**Selective Dev**: `SERO_DEV_PLUGINS=admin,git bash scripts/dev.sh` (rebuild skipped plugins first with `pnpm build`).

**Agent Directory (IMPORTANT)**  
Sero uses **`~/.sero-ui/agent/`** (set via `PI_CODING_AGENT_DIR` in `electron/env.ts`). Never use `~/.pi/agent/`. Single source of truth: `electron/env.ts` exports `SERO_HOME` and `SERO_AGENT_DIR`.

**Creating a Sero Plugin (IMPORTANT)**  
Follow the `sero-plugin` skill process exactly (package structure, shared types, Pi extension, web UI, module federation, dev workflow). Registration is automatic for any `plugins/sero-*-plugin/` containing `sero.app` in its `package.json`. Built-in plugins do not appear in Plugin Manager.

**IPC Data Flow (IMPORTANT)**  
All cross-process data must update **four layers together**:
React component → Zustand store → preload (IPC) → main-process handler → Pi SDK
Types live in `src/types/ipc.ts`. Keep renderer and main-process types in sync.

**State Management Rules (CRITICAL)**
- **Never use** `localStorage` or `sessionStorage`. Persistent renderer state goes through `~/.sero-ui/layout.json` via `persistLayout()` (`src/lib/persist-layout.ts`) and `window.sero.layout` IPC. Add new keys to `LayoutState` in `src/types/layout.ts`.
- All shared state lives in Zustand stores (`src/stores/`). Cross-plugin state uses `@sero-ai/app-runtime` context or `window.sero` bridge.
- **Avoid `useEffect`**. Prefer Zustand actions, derived state, or `subscribe()`. Use `useEffect` only for external side effects (DOM events, IPC listeners, timers, third-party imperative libs).

**Container Image (CRITICAL)**
If you change `apps/desktop/images/Dockerfile.sero-node` or container-installed tools, rebuild `sero-node:latest` and recreate affected workspace containers. New workspaces do **not** automatically pick up Dockerfile changes.

**General**
- When asked to explain something, explain in clear, unambigous terms without jargon. Assume the user doesn't have the full context of the feature/problem.
- Save new documentation/plans in `@docs/` or typed subfolders
- Never commit local Pi scratch/planning files under `.pi/` (especially `.pi/plans/`); the directory is gitignored and should remain local-only.
- Use Conventional Commit messages
- Ensure good type safety in source files when conducting PR reviews
- Avoid duplicating types that already exist in Pi SDK libraries. Import the canonical Pi types instead so upstream changes fail at typecheck time rather than becoming runtime mismatches.
- Do not delete relevant comments
- Prefer `useDebouncedCallback` / `createDebouncedFn` from `src/hooks/useDebouncedCallback.ts` over hand-rolled `setTimeout` debounce patterns
- Keep code as simple and idiomatic as possible. Never use try-catch for file existence or normal flow control. Refactor any bureaucratic/over-defensive code to the minimal readable solution.
- Always use top-level imports (no inline `import('...')` type expressions)
- When creating UI components, try to make them self-explanatorys and avoid duplicating descriptive text in multiple places
- Before creating a PR check and update the `@apps/docs-site` documentation and update as required
- When writing text/copy for Sero codebase or end-user documentation keep it simple, without convoluted long blocks of text
- Do not add sub-labels descriptions on UI components unneccesarily - components should be self-explanatory
- Unless we are doing explanatory work - or you were asked specifically - DO NOT create heuristic solutions to solve things that should be done via the AI/LLM layer
- NEVER add unnecessary clutter to UI components
- When giving instructions to manually review changes do so in simple unambiguous terms - no jargon or expectation of recent familiarity with the subject
- After making changes to `packages/*` remind that the packages may need to be republished to npm

## Styling
 - Don't use specific tailwind font-sizes, use utilities like `text-sm`,`text-base`, etc.

## File Size Rules (CRITICAL)

**Never exceed 500 LOC in any source file** (docs/css excluded). If a file grows beyond 500 lines, **refactor immediately** — split into smaller modules, extract helpers to `utils/` or `lib/`, break components into sub-components, or move types to dedicated `types.ts` files. Always check line count of every touched file before marking a task complete.
