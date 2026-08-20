# Graphify — profile-wide knowledge graphs

A global Sero plugin that builds [Graphify](https://github.com/safishamsi/graphify)
knowledge graphs of every opted-in workspace in the active profile, merges them
into one profile-wide graph, and gives agent sessions graph search tools plus
automatic context injection. Works identically for host-mode and
container-isolated workspaces: all Python/LLM extraction runs host-side in the
plugin's single global background runtime; sessions answer queries with a pure
TypeScript engine over `graph.json` (no Python at query time).

## Spend model

One rule drives the whole plugin:

> **Money is spent only by an explicit user action, with the model, the size and
> the estimated cost known first. A restart never spends.**

`graphify extract` and the optional `graphify label` job can cost money.
`update`, `merge-graphs`, `cluster-only --no-label` and every query are local.

Community naming is separate from extraction. The runtime prices it from the
community count produced by free clustering, confirms it, reserves the estimate
at the spawn boundary, and settles it from the token line in `GRAPH_REPORT.md`.

Before any paid job the runtime: refuses if paused or if no model is chosen;
scans the tree the build will read (files **and bytes** — graphify chunks by
tokens, so dense prose costs more than its file count suggests); checks the
per-build, per-day and file caps against a durable ledger; and asks the user.
A model with no known price always asks, because an unknown price cannot be
checked against a cap. An unanswered dialog is a no.

The debit is durable and taken at the **last boundary before the child process
spawns** — after the toolchain, the credentials and the output directory have
all succeeded — then settled against measured usage. Three rules follow: a
failure before that boundary is never charged; a failure after it keeps its
debit; and a build that reports no token usage keeps the estimate rather than
settling to zero, because a clean exit is not proof that usage was measured.

Nothing retries on its own. A failed or unbuilt workspace sits in
`needs-build`/`error` until someone presses a button.

## Indexing model

Indexing is **opt-in per workspace** (toggle in the panel, "Index all", or the
`graphify_index` tool). Updates are **push-based — no polling**:

- **Agent edits** — the extension watches `tool_execution_end`/`agent_end` SDK
  events and queues one incremental `refresh` (AST-only `graphify update`, no
  LLM) per agent run that mutated files, for enabled workspaces only.
- **Workspace discovery** — opening the Graphify panel (and any session
  starting in a workspace graphify has not seen) queues a `sync` request that
  re-reads the profile workspace list.
- **Boot catch-up** — at runtime start, an enabled workspace **that already has
  a graph** gets one free AST update. One without a graph is marked
  `needs-build` and waits. Nothing is rebuilt.

Requests are drained inside a single `updateState` callback behind a
`lastAppliedRequestId` watermark, and a request for a workspace already building
folds into the running job. The state-file watcher fires on both the rename and
the change of an atomic write, so without both guards one action could be
applied twice.

Only workspaces the **host registry** confirms are ever built, and the `global`
workspace (the memory store) is excluded where the money is spent, not only in
discovery.

The profile graph re-merges after every change. The toolchain (`uv` + pinned
`graphifyy`) provisions itself on first build.

## Agent tools

| Tool | What it does |
|---|---|
| `graphify_search` | Search the merged profile-wide graph (all indexed workspaces) |
| `graphify_query` | Query the current workspace's graph (BFS broad / DFS trace, token budget) |
| `graphify_path` | Shortest connection between two concepts |
| `graphify_explain` | Neighborhood explanation of a single node |
| `graphify_status` | Index status per workspace + profile graph |
| `graphify_index` | enable / disable / rebuild / name-communities / refresh / enable-all / sync / upgrade |

All tools are CLI-bridged (`sero graphify_search ...`).

The plugin also contributes a global-search panel to the shell
(`sero.app.search` → `GraphifySearch`), reachable from the main sidebar and
the ⌘K menu, so the profile graph can be searched without opening the app.

Auto-context (ported from pi-graphify) adds a one-time session orientation from
the workspace's `GRAPH_REPORT.md` + profile-graph stats, and appends bounded
graph-query hints to broad search results. Hard per-session budgets, dedup
caches, fully idle when no graph exists.

## Settings (`state.json` → `settings`)

| Setting | Default | Notes |
|---|---|---|
| `model` | `null` | `{ backend, modelId, chosenAt, price? }`. **null blocks every paid job.** There is no "backend default" — that is how a build could run with nobody able to say what it cost |
| `caps.maxCostPerBuildUsd` | `2` | A paid job estimated above this is refused |
| `caps.maxCostPerDayUsd` | `10` | Profile-wide, measured against `state.spend` |
| `caps.maxFilesPerBuild` | `5000` | Bigger trees are refused, not truncated |
| `paused` | `false` | Blocks all paid work |
| `maxConcurrency` | `0` | `--max-concurrency`; 0 = graphify default |
| `tokenBudget` | `0` | Per-**chunk** packing size (`--token-budget`). **Not a spend cap** — a larger value spends more per call, not less |
| `exclude` | node_modules, dist, … | Repeated `--exclude` patterns |
| `autoContext.sessionSummary` | `true` | Session-start orientation |
| `autoContext.augmentSearchResults` | `true` | Tool-result hints |
| `autoContext.autoQuery` | `false` | Run real graph queries for high-confidence intents |
| `autoContext.maxSessionAugments` | `8` | Per-session augment budget |
| `autoContext.maxAugmentChars` | `1200` | Per-augment size bound |

`settings` is declared as `sero.app.portableState`, so creating a profile with
"Copy credentials and model preferences" carries the model and the caps across —
and nothing else. Copying `workspaces` would hand the new profile a list of
workspaces that do not exist there, and queue paid builds on arrival.

### Applying the model

The chosen model is sent by flag and environment variable. Extraction reads
`--model`; the pinned naming command reads `--model=<id>`. The backend-specific
environment variable (`GRAPHIFY_OPENAI_MODEL`, and others) is a second guard.

The child environment is an allow-list plus the one selected provider key.
`cluster-only` otherwise scans the environment and takes the first provider with
a key — gemini before claude — so a stray key on the machine could capture and
bill a pass the panel said was running on something else.

`GRAPHIFY_MAX_RETRIES` is set, bounding upstream
[#2880](https://github.com/Graphify-Labs/graphify/issues/2880), where one
rate-limited response is read as truncation and bisected into up to 15 billed
calls.

## Storage layout

```
SERO_HOME/apps/graphify/                        per-profile DATA
├── state.json                                  status, settings, requests
├── graphs/<workspaceId>/graphify-out/          per-workspace graph.json + GRAPH_REPORT.md
└── profile/graph.json                          merged profile-wide graph

SERO_HOST_ARTIFACTS_ROOT/app-tools/graphify/    machine-shared TOOLS (all profiles)
├── bin/graphify                                pinned graphifyy CLI
├── uv-tools/                                   its Python environment
└── python/                                     uv-downloaded CPython (only if no system Python)
```

Graph artifacts never land inside workspaces (no repo pollution): `extract`
uses `--out`, `update` uses an absolute `GRAPHIFY_OUT`. Container sessions only
need read access to this directory.

## Credits

Built on [Graphify](https://github.com/safishamsi/graphify) (PyPI `graphifyy`)
by Safi Shamsi. The bounded-exec discipline, stat parsing, and auto-context
design are adapted from the `pi-graphify` Pi extension.
