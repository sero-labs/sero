# Electron source layout

The Electron code is organized around a few top-level concerns:

```text
electron/
├── main.ts        # Electron main-process entrypoint
├── preload.ts     # Thin renderer bridge entrypoint
├── platform/      # Electron/runtime/bootstrap/security/protocol concerns
├── features/      # Product domains (workspace, apps, container, gateway, kanban, etc.)
├── shared/        # Cross-feature helpers and infra singletons
├── ipc/           # Main-process IPC adapters grouped by domain
├── preload/       # Preload bridge modules grouped by domain
├── cli/           # CLI bridge, registry, helpers, and grouped commands
└── __tests__/     # Tests grouped by agent/cli/features
```

## Folder rules

- `platform/` owns Electron-specific runtime concerns such as env setup,
  protocol registration, notifications, and security helpers.
- `features/` owns product behavior. If you are working on workspace,
  apps, plugins, subagents, container, gateway, kanban, or VCS logic,
  start there first.
- `shared/` is only for code used by multiple features that does not have
  a clear single owner.
- `ipc/`, `preload/`, and `cli/` are adapter layers. They should expose
  feature behavior, not become the home for feature logic.
- When an adapter or feature area grows, split it by responsibility with
  obvious child folders (for example `cli/core`, `cli/bridges`,
  `ipc/platform/{auth,system,ui}`, or `features/apps/runtime/{capabilities,tests}`).
- `preload.ts` should stay thin — put bridge composition in `preload/`.
- `__tests__/` should mirror the source layout as closely as practical so
  feature tests are easy to find.

## Current migration direction

This tree is being flattened out of the old root-level layout. New code
should follow the structure above, and moved code should stay with its
feature rather than adding new root-level files.
