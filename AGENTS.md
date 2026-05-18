# Sero Monorepo

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
- **`@sero-ai/ui`** - shared ui components 

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

Logs: `/tmp/sero-vite.log`, `/tmp/sero-remote-<app-id>.log`, `/tmp/sero-electron.log`

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
- Save new documentation/plans in `@docs/` or typed subfolders
- Never commit local Pi scratch/planning files under `.pi/` (especially `.pi/plans/`); the directory is gitignored and should remain local-only.
- Use Conventional Commit messages
- Ensure good type safety in source files when conducting PR reviews
- Don't push to remote git branch automatically unless asked specifically or asked to create a PR
- Avoid duplicating types that already exist in Pi SDK libraries. Import the canonical Pi types instead so upstream changes fail at typecheck time rather than becoming runtime mismatches.
- Do not delete relevant comments
- Prefer `useDebouncedCallback` / `createDebouncedFn` from `src/hooks/useDebouncedCallback.ts` over hand-rolled `setTimeout` debounce patterns
- Keep code as simple and idiomatic as possible. Never use try-catch for file existence or normal flow control. Refactor any bureaucratic/over-defensive code to the minimal readable solution.
- Always use top-level imports (no inline `import('...')` type expressions)
- When creating UI components, try to make them self-explanatorys and avoid duplicating descriptive text in multiple places

## File Size Rules (CRITICAL)

**Never exceed 500 LOC in any source file** (docs excluded). If a file grows beyond 500 lines, **refactor immediately** — split into smaller modules, extract helpers to `utils/` or `lib/`, break components into sub-components, or move types to dedicated `types.ts` files. Always check line count of every touched file before marking a task complete.
