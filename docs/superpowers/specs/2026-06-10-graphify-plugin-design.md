# Design: sero-graphify-plugin — profile-wide knowledge graphs

**Date:** 2026-06-10
**Status:** Approved
**Reference implementation:** `~/Documents/Dev/projects/sero/repos/pi-github-repos/pi-graphify` (cloned/adapted, not a dependency)
**Upstream:** [Graphify](https://github.com/safishamsi/graphify) — Python CLI, PyPI package `graphifyy`

## Goal

A built-in Sero plugin that uses Graphify to build knowledge graphs of every
workspace in the active profile, merges them into a profile-wide graph, and
exposes intelligent graph search plus automatic context injection to agent
sessions — working identically for host-mode and container-isolated
workspaces.

## Key decisions

| Decision | Choice |
|---|---|
| Where graphify (Python) runs | Host only, inside the plugin's single global background runtime |
| How queries execute | TypeScript graph engine over `graph.json` in the Pi extension (no Python at query time) |
| LLM extraction backend | Sero's own provider credentials exported to the graphify process env; backend/model configurable |
| Indexing policy | Opt-in per workspace (or "index all"), then automatic incremental refresh (debounced watch + on-open) |
| v1 surfaces | Agent tools + auto-context injection + management UI panel |
| Graphify provisioning | Add `uv` to the Sero managed toolchain; `uv tool install graphifyy@<pinned>` with uv-managed CPython |

## Why isolation is a non-problem

- Workspace files always live on the host filesystem; containers bind-mount
  them (`apps/desktop/electron/features/workspace/access-roots.ts`,
  `WorkspaceAccessRoot.hostPath`). A host-side indexer can read every
  workspace regardless of runtime backend (`host` / `docker` /
  `apple-container`).
- A `scope: "global"` plugin with a background runtime gets exactly one
  runtime instance bound to the `global` workspace, running in the Electron
  main process (`apps/desktop/electron/features/apps/runtime/manager.ts`
  `buildTargets()`).
- The heavy, environment-sensitive part (Python, LLM extraction) therefore
  never enters a container. Sessions only need read access to the generated
  `graph.json` artifacts.

## Architecture

```
                         host (Electron main)
  ┌────────────────────────────────────────────────────────┐
  │  global background runtime = indexer orchestrator       │
  │  uv → graphifyy CLI → builds per-workspace graphs       │
  │  merge-graphs → profile graph                            │
  └───────────────┬────────────────────────────────────────┘
                  ▼ writes
  SERO_HOME/apps/graphify/
  ├── state.json                      (status, config, stats)
  ├── graphs/<workspaceId>/graphify-out/{graph.json, GRAPH_REPORT.md}
  └── profile/graph.json              (merged, profile-wide)
                  ▲ reads (read-only sufficient)
  ┌───────────────┴────────────────────────────────────────┐
  │  Pi extension (per session, host OR container)          │
  │  TS query engine + auto-context  │  UI panel via tools  │
  └────────────────────────────────────────────────────────┘
```

Per-profile separation is inherent: each profile has its own SERO_HOME
(`~/.sero-ui/profiles.json` registry, per-profile `path`), so
`apps/graphify/` and the workspace registry the runtime enumerates are
naturally scoped to the active profile.

## Components

### Plugin: `plugins/sero-graphify-plugin` (`@sero-ai/plugin-graphify`, app id `graphify`, `scope: "global"`)

**`shared/`**
- `types.ts` — plugin state: per-workspace index config (enabled, backend,
  exclusions), status (idle/building/updating/error, freshness timestamp,
  node/edge/community counts, token stats), build queue entries, settings,
  pending index requests. JSON-serialisable, `DEFAULT_STATE` export.
- `query-engine/` — TypeScript port of graphify's query semantics over
  `graph.json`: BFS (broad context) and DFS (path tracing) traversal,
  shortest path between concepts, node explanation (neighbourhood summary),
  token-budgeted output formatting. Ported by reading upstream graphify's
  Python query implementation; upstream behaviour is the spec. Pure,
  Pi-CLI-safe, no Sero imports.

**`runtime/`** (host-side indexer, single global instance)
- Bounded exec adapter cloned from pi-graphify (`src/tools/exec-adapter.ts`,
  `src/lib/runner.ts`): 1 MiB stdout/stderr caps (2 MiB for JSON),
  signal-death reported as failure, LRU-bounded caches. These fixed real OOM
  crashes upstream and are retained.
- Provisioner: ensures `uv` (managed toolchain) and `graphifyy@<pinned>`
  (`uv tool install`, `UV_TOOL_DIR` / `UV_PYTHON_INSTALL_DIR` under the
  toolchains root) are installed before first build; surfaces install status
  via state.
- Indexer orchestrator: enumerates profile workspaces
  (`host.workspace.list()`, new API), single-flight build queue (one
  workspace at a time), full builds via `graphify extract`, incremental via
  `graphify update`, debounced file-watch on enabled workspace roots,
  refresh on workspace open. After any per-workspace change, re-runs
  `graphify merge-graphs` into `profile/graph.json`.
- Runs graphify with `cwd = SERO_HOME/apps/graphify/graphs/<workspaceId>/`
  and the workspace **host path** as input, so artifacts land outside the
  workspace (no repo pollution, nothing to gitignore).
- Exports the user's provider credentials (e.g. `ANTHROPIC_API_KEY`) into
  the graphify child-process env according to the configured backend.
- Writes all progress/status/stats into `state.json` (atomic writes) — the
  UI and extension observe via the existing state bus.

**`extension/`** (Pi-safe, tools CLI-bridged per AD-020)
- `graphify_search` — profile-wide query over the merged graph.
- `graphify_query` — current-workspace query (BFS/DFS, budget).
- `graphify_path` — shortest path between two concepts.
- `graphify_explain` — plain-language node neighbourhood.
- `graphify_status` — index status per workspace + profile.
- `graphify_index` — enable/disable/rebuild; written as a request into
  plugin state, fulfilled by the host runtime.
- Auto-context layer (cloned from pi-graphify `src/auto-context/`):
  session-start orientation from the workspace's `GRAPH_REPORT.md` +
  profile-graph summary; intent classification of tool results with
  graph-query hints; optional bounded auto-query (off by default); hard
  per-session budgets (max augments, max chars); dedup caches; fully idle
  when no graph exists. All file reads use sero-managed graph paths resolved
  from `SERO_HOME` / `PI_CODING_AGENT_DIR`.

**`ui/`** (management panel)
- Workspace list with index status, freshness, node/edge counts, toggle
  enable/disable, rebuild button, "index all".
- Build progress and token-cost stats from state.
- Profile-wide search box invoking `graphify_search` via `useAppTools`
  (the UI never reads the filesystem directly).
- `requiredHostCapabilities`: `appAgent.invokeTool`, `tool.cli`,
  `appRuntime.background`.

### Sero core changes

1. **Toolchain: `uv`** — new `ToolName` + per-platform `ArtifactSpec`
   (url + sha256, single static binary, `installPolicy: 'on-demand'`) in
   `apps/desktop/electron/features/workspace/runtime/toolchains/`. Host
   platforms only; uv is never provisioned into containers.
2. **`host.workspace.list()`** — new method on `AppRuntimeWorkspaceApi`
   (`packages/common/src/app-runtime-background.ts`) returning workspace
   metadata (id, name, path, open) for the active profile; implemented in
   `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`
   via `workspaceManager.list()`. Same spirit as the access-roots commit
   (0bcb25007).
3. **Credentials seam** — a narrow host-side mechanism for the runtime to
   obtain the provider API key matching the configured backend. Exact shape
   (host capability vs. direct settings-store read in the host process)
   decided during planning once the credentials storage is inspected. The
   key is only ever placed in the graphify child-process env, never written
   to state or disk.

## Data flow

1. User enables indexing for a workspace in the UI → UI calls the bridged
   `graphify_index` tool → request lands in `state.json`.
2. Host runtime observes state change → queues build → provisions
   uv/graphifyy if needed → runs `graphify extract <hostPath>` with cwd in
   the sero-managed graph dir → parses stats → updates state →
   re-merges profile graph.
3. File changes in an enabled workspace → debounced → `graphify update` →
   merge → state.
4. Agent asks a question / auto-context triggers → extension loads the
   relevant `graph.json` (size-bounded) → TS query engine answers within
   token budget.

## Error handling

- All graphify invocations through the bounded exec adapter; output-limit
  breaches and signal deaths are failures with diagnostics, never silent.
- Build failures recorded per workspace in state (message + timestamp);
  UI shows error state with retry; queue continues with other workspaces.
- Provisioning failures (uv download, graphifyy install) surface as a
  plugin-level status; all tools degrade gracefully ("not indexed yet" /
  "indexing unavailable") rather than throwing.
- Extension tolerates missing/partial/oversized `graph.json` (corrupt JSON,
  mid-write reads) by treating the graph as absent.
- Auto-context never errors a session: failures degrade to no injection.

## Testing

- **Query engine:** unit tests ported from upstream graphify's query test
  expectations (BFS/DFS, path, explain, budget truncation) against fixture
  `graph.json` files.
- **Runtime orchestrator:** unit tests with a mocked exec fn (pi-graphify's
  pattern) covering queue single-flight, incremental-vs-full decisions,
  merge triggering, stat parsing, failure paths.
- **Exec adapter:** clone pi-graphify's adapter tests (output caps,
  signal death).
- **State/auto-context:** budget enforcement, dedup, idle-when-no-graph.
- **Manual E2E:** one host-mode and one container workspace in a profile;
  enable both, verify graphs build, profile search answers cross-workspace
  questions from both session types, auto-context appears, UI reflects
  progress.

## Spike items (resolve first during implementation)

1. **`graphify-out` location when cwd ≠ input path** — upstream docs say
   output is cwd-relative; verify with a real install. Fallbacks: graphify's
   own `global` registry mechanism, or in-workspace output + gitignore.
2. **Container access to `SERO_HOME/apps/graphify/`** — verify the graphs
   dir is readable from container sessions (read-only suffices for queries)
   and that `graphify_index` state-writes work from containers; if writes
   fail, index management falls back to UI-only.
3. **Credentials storage** — locate how Sero stores provider keys and pick
   the narrowest seam for the runtime to read them.

## Cost & safety controls

- Opt-in per workspace; first build is the only large cost, then
  incremental updates.
- Settings: backend/model, per-build token budget, exclusion patterns
  (defaults exclude `node_modules`, build output, lockfiles, binaries via
  graphify `--exclude`).
- Token usage per build parsed from CLI output and shown in the UI.
- Single-flight queue prevents concurrent extraction storms.

## Out of scope for v1

Graph visualization surface, dashboard widget, `graphify add <url>` corpus
building, git-hook rebuilds, watch-mode daemon from upstream, Obsidian /
Neo4j / SVG / GraphML exports, per-workspace backend overrides.
