# Graphify profile knowledge graphs

This global Sero plugin builds code knowledge graphs for enabled workspaces. It merges them into one profile graph and gives agent sessions graph search tools and bounded context injection.

All Graphify processes run in the host background runtime. Container sessions read the finished JSON graphs through the TypeScript query engine. Python is not required at query time.

## Free-first indexing

Sero runs initial builds with:

```text
graphify extract <workspace> --code-only --out <sero-store>
graphify cluster-only <sero-store> --no-viz
```

The child environment contains no provider API keys, AWS backend settings, Ollama endpoint, or model selector. Code extraction uses Tree-sitter. Community detection uses Leiden clustering. Graphify keeps its deterministic hub-based labels because no model backend is available.

Do not add `--no-label` to the cluster command. That flag explicitly replaces the useful deterministic labels with `Community N` placeholders.

Sero does not enable Graphify's semantic extraction for documents, PDFs, images, transcripts, or other media. That work can call a model and needs a separate opt-in product path.

## Indexing model

Indexing is opt-in per workspace. Updates are push-based:

- Agent edits queue one `graphify update` request per agent run.
- Opening the Graphify panel queues workspace discovery.
- Runtime startup queues a local update for each enabled workspace that already has a graph.
- A workspace without a graph waits for a user action.

Requests use a durable watermark because the state-file watcher can deliver one atomic write more than once. The queue folds repeated work for the same workspace.

The runtime checks every requested workspace against the host registry. It never accepts an arbitrary path. The global memory workspace is excluded.

The profile graph re-merges after each successful change. The managed Graphify toolchain is installed once in the machine-shared tools directory.

## Community labels

`graphify cluster-only` creates a deterministic base label from the highest-degree node in each community. Graphify can replace that label with an LLM result when it discovers a configured backend. Sero prevents that discovery by using a credential-free child environment.

Graphify stores labels with community membership signatures. It reuses a label while the membership stays valid. Changed communities get a new deterministic hub label.

Sero does not have a paid community-label action.

## Agent tools

| Tool | Purpose |
| --- | --- |
| `graphify_search` | Search the merged profile graph. |
| `graphify_query` | Query the current workspace graph, with profile fallback. |
| `graphify_path` | Find the shortest connection between two concepts. |
| `graphify_explain` | Explain the neighborhood of one node. |
| `graphify_status` | Show workspace and profile graph states. |
| `graphify_index` | Enable, disable, rebuild, refresh, synchronize, or update Graphify. |
| `graphify_configure` | Pause indexing, change exclusions, or clear a notice. |

All tools use the `sero` CLI bridge.

## State

The active state fields are:

| Field | Purpose |
| --- | --- |
| `settings.exclude` | Repeated `--exclude` patterns. |
| `settings.paused` | Stops queued and new indexing work. |
| `settings.autoContext` | Controls session summaries and search augmentation. |
| `workspaces` | Per-workspace status and graph statistics. |
| `requests` | Commands waiting for the background runtime. |
| `profileGraph` | State of the merged graph. |

Older state files can contain model, cap, and spend fields from the previous paid-build design. Sero preserves that history but does not use it for code-only indexing.

## Storage

```text
<SERO_HOME>/apps/graphify/
├── state.json
├── graphs/<workspaceId>/graphify-out/
└── profile/graph.json

<SERO_HOST_ARTIFACTS_ROOT>/app-tools/graphify/
├── bin/graphify
├── uv-tools/
└── python/
```

Graph artifacts do not enter workspaces. `GRAPHIFY_OUT` moves the cache and generated files into Sero's profile data directory.

## Validation

Run:

```bash
pnpm --filter @sero-ai/plugin-graphify typecheck
pnpm --filter @sero-ai/plugin-graphify test
bash scripts/build-plugin.sh plugins/sero-graphify-plugin
```

A release check must also run Graphify 0.9.47 against a small code-only fixture with a credential-free environment. Confirm that the build creates deterministic labels and makes no model call.

## Credits

Built on [Graphify](https://github.com/Graphify-Labs/graphify), distributed on PyPI as `graphifyy`.
