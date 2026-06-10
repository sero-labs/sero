# Graphify CLI spike notes (Task 1)

**Date:** 2026-06-10
**Method:** `uv tool install graphifyy`, CLI runs against a small doc corpus,
plus direct inspection of the installed package source
(`~/.local/share/uv/tools/graphifyy/lib/python3.14/site-packages/graphify/`).

## Version pins

| Pin | Value |
|---|---|
| `GRAPHIFY_VERSION` | `0.8.36` (PyPI `graphifyy==0.8.36`) |
| `UV_MIN_VERSION` | `0.7.3` |
| uv artifact pin (Task 5) | `0.7.3` (astral-sh/uv GitHub release assets) |

`uv tool install graphifyy` installs two executables: `graphify`, `graphify-mcp`.
Python is uv-managed CPython 3.14.

## Output location (the critical question) — RESOLVED

Output is **input-path-relative by default, NOT cwd-relative** (the plan's
primary assumption was wrong; the contingency applies, but better mechanisms
exist than moving directories):

| Command | Graph dir resolution | Redirect mechanism |
|---|---|---|
| `extract <path>` | `<path>/graphify-out/` by default | `--out DIR` → writes `<DIR>/graphify-out/` (verified in source: `out_root = out_dir.resolve() if out_dir else target`) |
| `update <path>` | `watch_path / $GRAPHIFY_OUT` | `GRAPHIFY_OUT=<abs path>` env var — absolute path wins over the relative join (`Path(rel) / Path(abs)` → abs). **Verified live:** wrote to the store dir, zero files in the input dir |
| `cluster-only <path>` | reads/writes `<path>/graphify-out/` (hardcoded) | pass the **store dir** (not the workspace path) as `<path>` |
| `query` / `path` / `explain` | `graphify-out/graph.json` cwd-relative | `--graph <path>` flag (we use the TS engine instead) |
| `merge-graphs <g1> <g2> …` | n/a | `--out <path>` explicit. **Verified live** |

**Runner strategy (Task 11):**
- Full build: `graphify extract <workspaceHostPath> --backend B --out <storeWsDir> [--token-budget N] [--exclude P]…`
  then `graphify cluster-only <storeWsDir> --no-viz` for GRAPH_REPORT.md + community names.
- Incremental: `graphify update <workspaceHostPath>` with env
  `GRAPHIFY_OUT=<storeWsDir>/graphify-out` (absolute). No LLM needed; exits 1
  only on real failure (a no-change update still rebuilds via AST and exits 0).
  `update` regenerates GRAPH_REPORT.md itself.
- Merge: `graphify merge-graphs <g1> <g2> … --out <profile>/graph.json`.

Notes:
- `extract` **no longer writes GRAPH_REPORT.md** — it prints
  `next: run 'graphify cluster-only <dir>' to generate GRAPH_REPORT.md`.
- `cluster-only` does LLM community naming by default (degrades to
  `Community N` placeholders without a key); `--no-label` skips it.
- `extract` flags confirmed: `--backend gemini|kimi|claude|openai|deepseek|ollama`,
  `--model`, `--token-budget N` (per-chunk, default 60000), `--exclude` (repeatable),
  `--out DIR`, `--no-cluster`, `--max-concurrency`, `--api-timeout`.
- There is also a `global add/remove/list` registry (`~/.graphify/global-graph.json`)
  — not used; our per-profile store + `merge-graphs` is the right isolation.

## graph.json schema (networkx node-link)

Top-level keys: `directed` (**false**), `multigraph`, `graph`, `nodes`, `links`,
`hyperedges` (merged graphs from `merge-graphs` omit `hyperedges`).

Node fields (all present on every node):
`id` (slug, e.g. `hosttoolchain_host_managed_toolchain`), `label` (display name —
the primary human string; **there is no `description` field**), `norm_label`,
`community` (int), `file_type` (e.g. `document`), `source_file`,
`source_location`, `source_url`, `captured_at`, `author`, `contributor`.
Merged graphs add `repo` (tag) and `local_id` per node.

Link fields: `source`, `target` (node id strings), `relation` (e.g.
`references`), `confidence` (`EXTRACTED`/`INFERRED`), `confidence_score`,
`weight`, `source_file`, `source_location`.

## Stat lines (stdout parsing, Task 11)

```
[graphify extract] wrote /tmp/.../graph.json: 26 nodes, 34 edges, 5 communities
[graphify extract] tokens: 45,123 in / 9,456 out, est. cost (~claude): $0.5100
[graphify watch] Rebuilt: 35 nodes, 42 edges, 5 communities        # update
Merged 2 graphs -> 61 nodes, 76 edges                              # merge-graphs
```

The plan's regexes (`(\d[\d,]*)\s+nodes?,\s*(\d[\d,]*)\s+edges?,\s*(\d[\d,]*)\s+communities`
and `(\d[\d,]*)\s+in\s*/\s*(\d[\d,]*)\s+out`) match all of these.

## Sample query outputs (fidelity reference, Task 8)

`graphify query "what is the toolchain" --budget 800`:

```
Traversal: BFS depth=2 | Start: ['toolchain:merge-metadata (pnpm script)', 'toolchain:verify-published (pnpm script)', 'Toolchain Storage (~/.sero-ui/toolchains/)'] | 26 nodes found

NODE Host Managed Toolchain [src=host-toolchain.md loc=None community=0]
NODE Browser Automation Pack [src=host-toolchain.md loc=None community=1]
…
EDGE toolchain:merge-metadata (pnpm script) --references [EXTRACTED]--> apps/desktop/electron/features/workspace/runtime/toolchains/generated-artifacts.json
... (truncated — 0 more nodes cut by ~800-token budget. Narrow with context_filter=['call'] or use get_node for a specific symbol)
```

`graphify query "toolchain storage" --dfs --budget 400` → same shape, header
`Traversal: DFS depth=2 | Start: […] | 9 nodes found`.

`graphify explain "Host Managed Toolchain"`:

```
Node: Host Managed Toolchain
  ID:        hosttoolchain_host_managed_toolchain
  Source:    host-toolchain.md None
  Type:      document
  Community: 0
  Degree:    12

Connections (12):
  --> Browser Automation Pack [references] [EXTRACTED]
  …
```

`graphify path "Host Managed Toolchain" "SHA-256 Checksums"`:

```
Shortest path (2 hops):
  Host Managed Toolchain --references [EXTRACTED]--> apps/desktop/electron/features/workspace/runtime/toolchains/generated-artifacts.json --references [EXTRACTED]--> SHA-256 Checksums
```

Takeaways for the TS engine: seeds match on **`label`** (display names with
spaces); traversal treats the graph as undirected (`directed: false`); output
sections are `Traversal:` header → `NODE label [src=… community=N]` lines →
`EDGE a --relation [CONFIDENCE]--> b` lines → budget-truncation marker.

## Backend → env var map (Task 11 credentials)

From `llm.py`: `claude` → `ANTHROPIC_API_KEY`, `openai` → `OPENAI_API_KEY`,
`gemini` → `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), `deepseek` →
`DEEPSEEK_API_KEY`, `kimi` → `MOONSHOT_API_KEY`, `ollama` → none
(`OLLAMA_BASE_URL` optional, default `http://localhost:11434/v1`).

## Implementation verification record (Task 17)

Run on 2026-06-10 after completing all tasks:

- `pnpm --filter @sero-ai/common typecheck` — PASS
- `pnpm --filter @sero/desktop typecheck` — PASS
- `pnpm --filter @sero/desktop test` — 1621/1622 pass. The single failure
  (`token-baseline.test.ts › CLI prompt block`, 819 > 600 tokens) is
  **pre-existing and unrelated**: the measured block contains no graphify
  content (`block.includes('graphify') === false`); the static built-in CLI
  guidance text alone is 2,292 chars ≈ 819 tokens. It grew before this work
  (the app/browser CLI guidance lines).
- `pnpm --filter @sero-ai/plugin-graphify typecheck` (ui + extension + runtime) — PASS
- `pnpm --filter @sero-ai/plugin-graphify test` — 83/83 pass
- `pnpm --filter @sero-ai/plugin-graphify build` — PASS (MF remote)
- `bash scripts/build-plugin.sh plugins/sero-graphify-plugin` — PASS
  (extension + runtime bundled; graphify is the first plugin exercising the
  runtime bundling path)
- `pnpm --filter @sero/desktop toolchain:verify-published` — PASS (uv is
  on-demand, not gated)

E2E smoke test (dev app: `SERO_DEV_PLUGINS=graphify bash scripts/dev.sh`) —
**PASS** for checklist item 1: the plugin's vite remote came up on :5197, the
global background runtime started in the Electron main process with no
`[app-runtime]` errors, and `~/.sero-ui/apps/graphify/state.json` was created
with all 6 profile workspaces synced (enabled=false, status=idle) — proving
the discovery → global runtime → `host.workspace.list()` → atomic state write
chain end-to-end.

Manual E2E (2026-06-10, live dev app) — **ALL CHECKLIST ITEMS PASS**:

- Host-mode builds with real Claude extraction (GStackPlugin, FactoryTest-1),
  stats/cost shown, live progress streaming in the panel.
- Container workspace (AppleContainerTest, apple-container backend) built
  host-side as designed; **spike item 2 resolved**: from a session running
  inside the container (`uname -s` → Linux), `graphify_status` and
  `graphify_search` read the shared graphs under SERO_HOME, and
  `graphify_index refresh` successfully wrote a state request.
- Profile-wide search answers cross-workspace questions with per-workspace
  provenance; single-workspace profiles work (copy instead of merge-graphs).
- Auto-context orientation appears in indexed workspaces only (regression
  test added for the unindexed-workspace case).
- Error path exercised organically: missing backend SDK surfaced as a
  per-workspace error with retry; queue continued; recovery worked after the
  provisioner fix.

Field findings folded back into the implementation during E2E: backend SDK
extras + self-repair marker, machine-shared tools dir, `.graphifyignore`
management from the canonical WORKSPACE_COMMON_IGNORES list (junk sources
found live: `.sero/` 2,169 nodes, `.pnpm-store/` 41,063 nodes), authoritative
stats from graph files (no-change updates print no stats line), startup
catch-up gating, model override setting, human-label query rendering.

## Live verification record

- Prior extract run (claude backend) against a one-file doc corpus succeeded:
  26 nodes / 34 edges / 5 communities.
- `GRAPHIFY_OUT` absolute redirect for `update`: verified — artifacts written
  to the store dir, input dir untouched.
- `cluster-only <storeDir> --no-viz --no-label`: verified — GRAPH_REPORT.md
  generated in `<storeDir>/graphify-out/`.
- `merge-graphs a b --out merged.json`: verified — 61 nodes / 76 edges, output
  keys `directed/multigraph/graph/nodes/links`, nodes gain `repo` + `local_id`.
