# Sero

macOS Electron desktop app — an agent-first workspace where coding, chat, and
tools live in one window. React 19 + Tailwind 4 + shadcn/ui + Zustand.

## Build & Run

```bash
cd apps/desktop                    # All commands run from here
node scripts/build-electron.mjs   # Build Electron main + preload
bash scripts/dev.sh                # Start remote + host + Electron
pkill -f "vite"; pkill -f "electron"  # Kill
```

Logs: `/tmp/sero-vite.log`, `/tmp/sero-remote-todo.log`, `/tmp/sero-electron.log`

## Typecheck

```bash
npx tsc --noEmit
```

## Development Approach

Build incrementally. New components start as **named placeholders with a label**
— get the layout and data flow right first, then fill in real functionality one
piece at a time.

## Key Architecture

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

## Key Conventions

- `src/components/layout/` — shell-level (TitleBar, MainSidebar, ChatPanel, StatusBar)
- `src/components/apps/<name>/` — self-contained app components
- `src/components/ui/` — shadcn/ui primitives
- `src/components/ai-elements/` — Vercel ai-elements chat components (source, not node_modules)

## File Size Rules (CRITICAL)

1. **NEVER let a file exceed 500 lines of code.** If a file you are creating or editing grows beyond 500 LOC, you **MUST** refactor it immediately — split the code into smaller modules grouped by related functionality.
2. **Before finishing any task**, check the line count of every file you touched. If any exceed 500 LOC, refactor before marking the task complete.
3. **Preferred split strategies:** extract helper functions into `utils/` or `lib/` files, break large components into sub-components, move types/interfaces into dedicated `types.ts` files, and separate business logic from UI rendering.

## State Management Rules

- **Do NOT use `localStorage` for app state** unless explicitly instructed. All
  shared state lives in Zustand stores (`src/stores/`). Cross-boundary state
  (e.g. for federated modules in `@sero/app-runtime`) is passed via context
  providers or the `window.sero` IPC bridge — never via `localStorage`.

## Further Reading

- [docs/architecture.md](docs/architecture.md) — layout, state, component hierarchy
- [docs/decisions.md](docs/decisions.md) — numbered architecture decisions with rationale
- [docs/sero.md](docs/sero.md) — vision, platform constraints, Pi SDK philosophy
