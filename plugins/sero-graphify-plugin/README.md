# Graphify — profile-wide knowledge graphs

A global Sero plugin that builds [Graphify](https://github.com/safishamsi/graphify)
knowledge graphs of every opted-in workspace in the active profile, merges them
into one profile-wide graph, and gives agent sessions graph search tools plus
automatic context injection. Works identically for host-mode and
container-isolated workspaces: all Python/LLM extraction runs host-side in the
plugin's single global background runtime; sessions answer queries with a pure
TypeScript engine over `graph.json` (no Python at query time).

## Indexing model

Indexing is **opt-in per workspace** (toggle in the panel, "Index all", or the
`graphify_index` tool). The first build is the only LLM-expensive step; after
that updates are **push-based — no polling**:

- **Agent edits** — the extension watches `tool_execution_end`/`agent_end` SDK
  events and queues one incremental `refresh` (AST-only `graphify update`, no
  LLM) per agent run that mutated files, for enabled workspaces only.
- **Workspace discovery** — opening the Graphify panel (and any session
  starting in a workspace graphify has not seen) queues a `sync` request that
  re-reads the profile workspace list.
- **Boot catch-up** — at runtime start, interrupted full builds restart and
  every other enabled workspace gets one cheap update to absorb changes made
  while Sero was closed.

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
| `graphify_index` | enable / disable / rebuild / refresh / enable-all / sync |

All tools are CLI-bridged (`sero graphify_search ...`).

Auto-context (ported from pi-graphify) adds a one-time session orientation from
the workspace's `GRAPH_REPORT.md` + profile-graph stats, and appends bounded
graph-query hints to broad search results. Hard per-session budgets, dedup
caches, fully idle when no graph exists.

## Settings (`state.json` → `settings`)

| Setting | Default | Notes |
|---|---|---|
| `backend` | `claude` | `claude` / `openai` / `gemini` / `deepseek` / `kimi` / `ollama`; API key comes from Sero's provider credentials |
| `model` | `''` | Model override (`--model`); empty = the backend's default (claude → `claude-sonnet-4-6`) |
| `tokenBudget` | `0` | Per-chunk LLM token cap (`--token-budget`); 0 = graphify default |
| `exclude` | node_modules, dist, … | Repeated `--exclude` patterns |
| `autoContext.sessionSummary` | `true` | Session-start orientation |
| `autoContext.augmentSearchResults` | `true` | Tool-result hints |
| `autoContext.autoQuery` | `false` | Run real graph queries for high-confidence intents |
| `autoContext.maxSessionAugments` | `8` | Per-session augment budget |
| `autoContext.maxAugmentChars` | `1200` | Per-augment size bound |

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
