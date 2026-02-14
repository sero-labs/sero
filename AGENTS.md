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

## Documentation

- [docs/apps-tutorial.md](docs/apps-tutorial.md) — step-by-step guide to building new Sero apps
- [apps/desktop/docs/sero-apps.md](apps/desktop/docs/sero-apps.md) — apps architecture design doc
- [apps/desktop/docs/architecture.md](apps/desktop/docs/architecture.md) — shell layout, component hierarchy
- [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) — desktop app conventions and dev guide

## Creating a Sero App (IMPORTANT)

**When asked to create a new Sero app, you MUST read
[docs/apps-tutorial.md](docs/apps-tutorial.md) first.** It covers the full
process: package structure, shared state types, Pi extension, web UI, module
federation setup, host-side wiring, Pi settings registration, and dev workflow.
Do not improvise — follow the tutorial step by step.

## File Size Rules (CRITICAL)

See `apps/desktop/AGENTS.md` for full conventions. TL;DR: **no file over 500 LOC**.
