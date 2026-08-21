# Graphify plugin guide

## What it does

Graphify builds a map of the code in each workspace that you enable. The map contains code symbols and relationships such as calls, imports, and inheritance.

Sero merges the workspace maps into one profile graph. The agent can use that graph to answer questions across projects without reading every source file.

## How you use it

Open Graphify from the sidebar. Turn on a workspace to build its local code graph. The workspace card shows the build state and graph size.

The search box searches all enabled workspaces. The agent also gets tools for these tasks:

- search the profile graph
- query the current workspace
- trace a path between two code concepts
- explain the connections around one concept

When a session starts in an indexed workspace, Graphify can add a short graph summary to the agent context.

## Local code indexing

Sero runs Graphify in code-only mode. Tree-sitter parses the code on your machine. No model receives the code, and no API key is required.

Initial builds, rebuilds, incremental updates, profile merges, and searches make no model calls.

After an agent edits files, Graphify queues one local update. It also catches up enabled workspaces when Sero starts.

## Communities

Graphify groups closely connected code into communities with the Leiden clustering algorithm. A community often matches a code subsystem.

Graphify gives each community a deterministic name based on its most connected symbol. This keeps reports readable without model-generated names. Sero does not offer a paid community-label action.

## Safety and storage

- Indexing is off until you enable a workspace.
- The global memory workspace is not indexed.
- Graphify skips common dependency and build folders.
- **Pause** stops queued indexing work.
- A failed build does not retry itself.
- Graph artifacts stay under `<SERO_HOME>/apps/graphify/`, not in the repository.
- Graphify installs its Python toolchain once in Sero's shared machine tool area.

## Content outside code

Upstream Graphify can use a model to process documents, PDFs, images, and media. Sero does not enable that pass. It needs separate opt-in, privacy, estimate, and spend controls before it can ship.
