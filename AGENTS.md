# Sero Monorepo

## Structure

```
sero/
├── apps/
│   └── desktop/          # Electron + React shell
├── packages/
│   ├── app-runtime/      # @sero-ai/app-runtime — shared hooks/context
│   ├── common/           # Shared types and utilities
│   └── ui/               # Shared UI primitives
├── plugins/
│   ├── sero-kanban-plugin/   # Built-in plugin + federated UI
│   ├── sero-cron-plugin/     # Built-in plugin + background jobs
│   └── other Sero plugins...
├── turbo.json
├── pnpm-workspace.yaml
└── package.json          # Root — workspace scripts
```

## Quick Start & Commands

```bash
cd apps/desktop
bash scripts/dev.sh                # Start host + Electron (set SERO_DEV_PLUGINS for selective remote plugins)
pkill -f "vite"; pkill -f "electron"  # Kill
```

**Monorepo (root):**
```bash
pnpm install
pnpm dev                   # Desktop app
pnpm build                 # turbo build all
pnpm typecheck             # turbo typecheck all
```

**Typecheck (CRITICAL)**: Run `pnpm typecheck` from the monorepo root **before every commit**. All packages (renderer + electron main process via `tsconfig.electron.json`) must pass with zero errors. Never commit with `@ts-ignore`, `@ts-expect-error`, or `any` casts unless unavoidable (leave explanatory comment).

## Shared Packages & Plugins

- **`@sero-ai/app-runtime`** — React hooks (`useAppState`, `useAppInfo`, `useAgentPrompt`) + `AppProvider` for federated plugin modules
- **`@sero/common`** — shared renderer-safe types/utilities. Prefer moving neutral cross-package code here (no Electron/Node-only dependencies).

Plugins live in `plugins/sero-*-plugin/`. Most complete examples:
- `sero-kanban-plugin` — deep subagent integration
- `sero-cron-plugin` — background jobs & reminders
- `sero-admin-plugin` — config editor, log viewer, session browser
- `sero-memory-plugin` — persistent memory system & daily logs

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

## File Size Rules (CRITICAL)

**Never exceed 500 LOC in any source file** (docs excluded). If a file grows beyond 500 lines, **refactor immediately** — split into smaller modules, extract helpers to `utils/` or `lib/`, break components into sub-components, or move types to dedicated `types.ts` files. Always check line count of every touched file before marking a task complete.

## Desktop App (`apps/desktop/`)

macOS Electron app — React 19 + Tailwind 4 + shadcn/ui + Zustand. Agent-first workspace.

**Build & Run** (from `apps/desktop/`):
```bash
node scripts/build-electron.mjs
bash scripts/dev.sh
```

Logs: `/tmp/sero-vite.log`, `/tmp/sero-remote-<app-id>.log`, `/tmp/sero-electron.log`

**Selective Dev**: `SERO_DEV_PLUGINS=admin,kanban bash scripts/dev.sh` (rebuild skipped plugins first with `pnpm build`).

**Key Architecture**
```
┌─────────────────────────────────────────────────────────────┐
│  TitleBar (⊞ sidebar toggle … plugin name … ⌘K … ⊟ chat)   │
├──────────┬──────────────────────────────┬─┬─────────────────┤
│  Main    │                              │║│                 │
│  Sidebar │     Active Plugin            │║│  Chat Panel     │
│  (plugins│     (ExplorerWorkspace / etc.) │║│  (global agent) │
│  + chats)│                              │║│                 │
├──────────┴──────────────────────────────┴─┴─────────────────┤
│  StatusBar                                                   │
└─────────────────────────────────────────────────────────────┘
```

- **MainSidebar** (left, collapsible) — plugin list + chat sessions
- **ChatPanel** (right, collapsible + resizable) — global agent
- **Active Plugin** — currently ExplorerWorkspace (others are placeholders)

**Agent Directory (IMPORTANT)**  
Sero uses **`~/.sero-ui/agent/`** (set via `PI_CODING_AGENT_DIR` in `electron/env.ts`). Never use `~/.pi/agent/`. Single source of truth: `electron/env.ts` exports `SERO_HOME` and `SERO_AGENT_DIR`.

**Key Conventions**
- `src/components/layout/` — shell-level components
- `src/components/apps/<name>/` — self-contained app components
- `src/components/ui/` — shadcn/ui primitives
- `src/components/ai-elements/` — Vercel ai-elements chat components
- Always use top-level imports (no inline `import('...')` type expressions)

**Creating a Sero Plugin (IMPORTANT)**  
Follow the `sero-plugin` skill process exactly (package structure, shared types, Pi extension, web UI, module federation, dev workflow). Registration is automatic for any `plugins/sero-*-plugin/` containing `sero.app` in its `package.json`. Built-in plugins do not appear in Plugin Manager.

Production remotes must use relative `base: './'`. Tools are bridged via `pi.registerTool()` (see AD-020 in decisions.md).

**IPC Data Flow (IMPORTANT)**  
All cross-process data must update **four layers together**:
React component → Zustand store → preload (IPC) → main-process handler → Pi SDK

Types live in `src/types/ipc.ts`. Keep renderer and main-process types in sync.

**State Management Rules (CRITICAL)**
- **Never use** `localStorage` or `sessionStorage`. Persistent renderer state goes through `~/.sero-ui/layout.json` via `persistLayout()` (`src/lib/persist-layout.ts`) and `window.sero.layout` IPC. Add new keys to `LayoutState` in `src/types/layout.ts`.
- All shared state lives in Zustand stores (`src/stores/`). Cross-plugin state uses `@sero-ai/app-runtime` context or `window.sero` bridge.
- **Avoid `useEffect`**. Prefer Zustand actions, derived state, or `subscribe()`. Use `useEffect` only for external side effects (DOM events, IPC listeners, timers, third-party imperative libs).

**Desktop Notifications**
Extensions emit: `pi.events.emit('sero:notify', { message, type?, sound?, subtitle? })`

**Container Integration (AD-018)**
One macOS container per workspace (`sero-<workspaceId>`). Lazy-started on first prompt. Tools proxied via `container exec`. Code in `electron/container/`.

**Widevine / Castlabs Electron**
Uses castlabs fork for Spotify support. Await `components.whenReady()` in `main.ts`. Run `pnpm sign-vmp` (or `bash scripts/sign-vmp.sh`) after install.

**node-pty Native Module (CRITICAL)**
Rebuild if terminals fail:
```bash
npx node-gyp rebuild --directory=node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
```
See [docs/node-pty-setup.md](docs/node-pty-setup.md).

**General**
- Save new documentation/plans in `@docs/` or typed subfolders
- Use Conventional Commit messages
- Ensure good type safety in source files when conducting PR reviews
- Don't push to remote git branch automatically unless asked specifically or asked to create a PR
- Do not delete relevant comments
- Prefer `useDebouncedCallback` / `createDebouncedFn` from `src/hooks/useDebouncedCallback.ts` over hand-rolled `setTimeout` debounce patterns
- Preview `.html` files in the in-app editor (sandboxed iframe)
- Don't use the 'visual explainer' skill when reviewing a PR unless asked