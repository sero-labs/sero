# Sero Monorepo

Turborepo + pnpm workspaces monorepo for the Sero desktop app and its packages.

## Structure

```
sero/
├── apps/
│   └── desktop/          # Electron + React app
├── packages/
│   ├── app-runtime/      # @sero/app-runtime — hooks for federated app modules
│   └── pi-todo-extension/# Pi extension + federated UI (todo app)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json          # Root — workspace scripts
```

## Quick Start

```bash
cd apps/desktop
bash scripts/dev.sh                # Start everything (remote + host + Electron)
pkill -f "vite"; pkill -f "electron"  # Kill
```

## Monorepo Commands

```bash
pnpm install               # Install all workspace deps
pnpm dev                   # Dev the desktop app (alias)
pnpm build                 # Build all (turbo)
pnpm typecheck             # Typecheck all (turbo)
```

## Packages

- **`@sero/app-runtime`** — React hooks (`useAppState`, `useAppInfo`, `useAgentPrompt`) + `AppProvider` context for federated app modules
- **`pi-todo-extension`** — Pi CLI extension (tool + command) + federated React UI, both backed by the same `state.json` file

## Documentation

- [docs/sero.md](docs/sero.md) — vision, platform constraints, Pi SDK philosophy
- [docs/architecture.md](docs/architecture.md) — shell layout, component hierarchy
- [docs/decisions.md](docs/decisions.md) — numbered architecture decisions with rationale
- [docs/apps-tutorial.md](docs/apps-tutorial.md) — step-by-step guide to building new Sero apps

## File Size Rules (CRITICAL)

1. **NEVER let a file exceed 500 lines of code.** If a file you are creating or editing grows beyond 500 LOC, you **MUST** refactor it immediately — split the code into smaller modules grouped by related functionality.
2. **Before finishing any task**, check the line count of every file you touched. If any exceed 500 LOC, refactor before marking the task complete.
3. **Preferred split strategies:** extract helper functions into `utils/` or `lib/` files, break large components into sub-components, move types/interfaces into dedicated `types.ts` files, and separate business logic from UI rendering.

---

## Desktop App (`apps/desktop/`)

macOS Electron desktop app — an agent-first workspace where coding, chat, and
tools live in one window. React 19 + Tailwind 4 + shadcn/ui + Zustand.

### Build & Run

```bash
cd apps/desktop                    # All commands run from here
node scripts/build-electron.mjs   # Build Electron main + preload
bash scripts/dev.sh                # Start remote + host + Electron
pkill -f "vite"; pkill -f "electron"  # Kill
```

Logs: `/tmp/sero-vite.log`, `/tmp/sero-remote-todo.log`, `/tmp/sero-electron.log`

### Typecheck

```bash
cd apps/desktop && npx tsc --noEmit
```

### Development Approach

Build incrementally. New components start as **named placeholders with a label**
— get the layout and data flow right first, then fill in real functionality one
piece at a time.

### Key Architecture

Shell + mountable apps. See [docs/architecture.md](docs/architecture.md) for
layout diagrams, component hierarchy, and state management.

```
┌─────────────────────────────────────────────────────────────┐
│  TitleBar (⊞ sidebar toggle … app name … ⌘K … ⊟ chat)     │
├──────────┬──────────────────────────────┬─┬─────────────────┤
│  Main    │                              │║│                 │
│  Sidebar │     Active App               │║│  Chat Panel     │
│  (apps   │     (CodingWorkspace / etc.) │║│  (global agent) │
│  + chats)│                              │║│                 │
├──────────┴──────────────────────────────┴─┴─────────────────┤
│  StatusBar                                                   │
└─────────────────────────────────────────────────────────────┘
```

- **MainSidebar** (left, collapsible) — app list + chat sessions
- **ChatPanel** (right, collapsible + resizable) — global agent, persists across apps
- **Active App** — currently CodingWorkspace; others are placeholders

### Key Conventions

- `src/components/layout/` — shell-level (TitleBar, MainSidebar, ChatPanel, StatusBar)
- `src/components/apps/<name>/` — self-contained app components
- `src/components/ui/` — shadcn/ui primitives
- `src/components/ai-elements/` — Vercel ai-elements chat components (source, not node_modules)

### Creating a Sero App (IMPORTANT)

**When asked to create a new Sero app, you MUST read
[docs/apps-tutorial.md](docs/apps-tutorial.md) first.** It covers the full
process: package structure, shared state types, Pi extension, web UI, module
federation setup, host-side wiring, Pi settings registration, and dev workflow.
Do not improvise — follow the tutorial step by step.

### IPC Data Flow (IMPORTANT)

All data between the UI and the agent passes through **four layers**. When adding
or changing any feature that crosses the process boundary, **every layer must be
updated together** or data will silently drop:

```
React component → Zustand store → preload (IPC bridge) → main-process handler → Pi SDK
src/components/    src/stores/      electron/preload.ts  electron/ipc/          session.*()
```

Each layer has its own types and may need to transform data (e.g. the main
process converts renderer-friendly `ChatAttachment` objects into Pi SDK
`ImageContent` objects). If you add a parameter at one layer but forget another,
the feature appears to work in the UI but silently fails at the agent.

**Key rules:**

- **Types live in `src/types/ipc.ts`** — shared by renderer and main process.
  The renderer-side window API is typed in `src/types/electron.d.ts`. Keep both
  in sync.
- **User messages are optimistic.** The store appends them immediately on send;
  the `message_start` event handler skips incoming user messages to prevent
  duplicates.
- **Renderer vs Electron rebuild.** Vite HMR only covers renderer code
  (`src/`). Changes to `electron/preload.ts` or `electron/ipc/` require
  `node scripts/build-electron.mjs` **and** an Electron restart to take effect.

### State Management Rules

- **Do NOT use `localStorage` for app state** unless explicitly instructed. All
  shared state lives in Zustand stores (`src/stores/`). Cross-boundary state
  (e.g. for federated modules in `@sero/app-runtime`) is passed via context
  providers or the `window.sero` IPC bridge — never via `localStorage`.
