# Sero Monorepo

Turborepo + pnpm workspaces monorepo for the Sero desktop app and its packages.

## Structure

```
sero/
├── apps/
│   └── desktop/          # Electron + React app (see apps/desktop/AGENTS.md)
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

## File Size Rules (CRITICAL)

See `apps/desktop/AGENTS.md` for full conventions. TL;DR: **no file over 500 LOC**.
