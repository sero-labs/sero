# @sero-ai/plugin-kanban

Kanban workflow plugin for Sero: a standard Pi extension, a federated React UI,
and a plugin-owned background runtime that watches each open workspace and
advances board state from `.sero/apps/kanban/state.json`.

## Manifest + host contract

This package now declares its background runtime in `package.json`:

- `sero.app.runtime: ./runtime/index.ts` in source form
- packaged/plugin-export builds rewrite that entry to `./runtime/index.js`
- `sero.plugin.requiredHostCapabilities` declares the seams this plugin needs:
  - `appRuntime.background` — start the plugin runtime for each eligible workspace
  - `appAgent.invokeTool` — the UI uses `useAppTools()` / app-agent tool calls
  - `tool.cli` — the `kanban` tool is expected to remain bridged through `sero-cli`

## Runtime expectations

The plugin-owned runtime is the owner for workspace watching and state-driven
workflow orchestration.

Expected environment:

- workspace-scoped state at `<workspace>/.sero/apps/kanban/state.json`
- a normal git-backed workspace for branch/worktree flows
- `gh` authenticated if review/PR actions are used
- the usual Sero workspace runtime services available for command execution,
  dev-server checks, verification, and git helpers

At startup the runtime should:

1. watch the workspace board state file
2. recover stuck cards for the current workspace
3. react to subsequent state changes by running the Kanban orchestrator

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @sero-ai/plugin-kanban typecheck
pnpm --filter @sero-ai/plugin-kanban test
```

Run the desktop app with the Kanban plugin in dev mode:

```bash
cd apps/desktop
SERO_DEV_PLUGINS=kanban bash scripts/dev.sh
```

## Validation checklist

Manifest / package validation:

```bash
node -e "const pkg=require('./plugins/sero-kanban-plugin/package.json'); console.log(pkg.sero.app.runtime, pkg.sero.plugin.requiredHostCapabilities)"
```

Runtime smoke test:

1. Start Sero with `SERO_DEV_PLUGINS=kanban`.
2. Open a workspace and the Kanban app.
3. Create or move a card into a runtime-driven state (for example Planning).
4. Confirm `/tmp/sero-electron.log` shows `[kanban-runtime]` startup / transition logs.
5. Confirm the board file under `.sero/apps/kanban/state.json` updates and the UI stays in sync.

If you publish/export this plugin externally, also verify the built bundle ships
`dist/ui/remoteEntry.js` and a rewritten JS runtime entry in the built
`package.json`.
