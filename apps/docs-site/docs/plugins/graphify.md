# Graphify

> Status: **built-in plugin**. Ships with Sero and is available in every profile.

## Overview

Graphify builds a knowledge graph of your code across every workspace you opt in to, then merges them into one profile-wide graph your agent can search across. After the first build, updates happen automatically in the background — no rescanning, no manual triggers.

## Getting started

1. Open **Graphify** from the sidebar.
2. Toggle on the workspaces you want indexed, or click **Index all**.
3. Wait for the first build to finish — this is the only step that uses your AI provider.
4. Ask the agent questions that span your projects: *"What calls into the auth module?"*, *"How does the payment flow connect to the user profile?"*

The first build can take a few minutes depending on workspace size. After that, incremental updates run quietly after each coding session — no cost, no wait.

## What the agent can do

Once a workspace is indexed, the agent has six new tools it uses automatically:

| Tool | What it does |
| --- | --- |
| `graphify_search` | Search across all indexed workspaces at once |
| `graphify_query` | Explore the current workspace's graph — broad or trace mode |
| `graphify_path` | Find the shortest connection between two concepts |
| `graphify_explain` | Get a plain-language description of how something fits in |
| `graphify_status` | See which workspaces are indexed and graph sizes |
| `graphify_index` | Enable, disable, rebuild, or refresh any workspace |

You don't need to invoke these manually — the agent picks them up when relevant.

## Global search

You can search the profile-wide graph yourself, from anywhere in Sero:

- Click the search icon next to the session search field in the main sidebar, or
- Press **⌘K** and choose **Search Graphify**.

Type a question and press Enter — results come from every indexed workspace.

## Auto-context

Graphify quietly enriches every session in an indexed workspace:

- **Session start** — the agent reads a brief orientation from your workspace's graph before the first message.
- **Search hints** — when you run a broad search, graph context is appended to help the agent navigate.

Both behaviours are on by default and can be turned off in Graphify's settings.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| AI backend | Your configured provider | Claude, OpenAI, Gemini, DeepSeek, Kimi, or Ollama |
| Model override | Backend default | Leave blank to use the provider's default model |
| Token budget | Unlimited | Cap this if you want to limit build cost |
| Exclude patterns | `node_modules`, `dist`, and common build artefacts | Add any paths you don't want indexed |
| Auto-context on session start | On | Session orientation from `GRAPH_REPORT.md` |
| Graph hints in search results | On | Appends graph context to broad searches |

## Privacy and data

- Your code is read **once** during the initial build, using your own provider credentials — nothing is sent to Sero.
- Routine updates (file structure and AST changes) run with no LLM calls.
- Graph files are stored locally at `~/.sero/apps/graphify/` and never inside your repos.
- Container sessions only need read access to the graph directory — your code stays inside its container.

If something goes wrong: check workspace toggle state in the Graphify panel, confirm your provider credentials are set, then restart Sero. Collect redacted logs only — do not include API keys, workspace paths, or private code content in support reports.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Memory](/guide/memory)
- [Models and Providers](/guide/models-and-providers)
- [Security / Privacy](/reference/security-privacy)
