# Graphify

Graphify builds a local knowledge graph for selected workspaces. It also merges those graphs so that you and the agent can search across projects.

## Index your first workspace

When you create a workspace, **Enable Graphify indexing** is on by default. Turn it off before you create the workspace if its code must not go to the configured Graphify provider.

For an existing workspace:

1. Open **Graphify**.
2. Turn on the switch for the workspace. To enable all listed workspaces, select **Index all**.
3. Wait until the workspace status is **indexed**.
4. Enter a question in **Search across all indexed workspaces…** and select the search button.

The first build uses Graphify's configured AI backend. The default backend is Claude, with its default model and token budget. Graphify also supports OpenAI, Gemini, DeepSeek, Kimi, and Ollama in its state configuration. The current Graphify panel does not have controls for these settings.

Graphify installs its Python tools in Sero's shared machine tool area. It does not install them in the active profile.

![Graph search](../assets/images/graphify.jpg)

## Check and update the graph

Each workspace card shows its state and, after a build, its node, edge, and community counts. It also shows token use when the build reports it. Use the **Rebuild** icon on a card after you change Graphify settings or when a graph is not correct.

Graphify queues a low-cost AST update after an agent edits files in an enabled workspace. It also runs an update when Sero starts, so it can include changes made while Sero was closed. These updates do not run the full AI build.

Turning off a workspace stops its updates but keeps its graph files. Turning the workspace on again starts a full rebuild. If you remove the workspace from the profile, Graphify removes its graph files and rebuilds the profile graph.

## Ask the agent about code

The agent can use these tools:

| Tool | Use |
| --- | --- |
| `graphify_search` | Search the merged profile graph. |
| `graphify_query` | Search the current workspace graph, with fallback to the profile graph. |
| `graphify_path` | Find the shortest connection between two concepts. |
| `graphify_explain` | Show the connections for one concept. |
| `graphify_status` | Show provisioning, graph, and workspace states. |
| `graphify_index` | Enable, disable, rebuild, refresh, or synchronize indexing. |

For example, ask, `What calls the authentication module?` Then check the file paths and relationships in the result against the source. A graph can be out of date while an update is queued or after a failed build.

Graphify can also add graph context to an agent session. Session orientation and search-result augmentation are on by default. Automatic query augmentation is off by default.

## Storage and recovery

Graphify stores profile data under `<SERO_HOME>/apps/graphify/`:

- `state.json` contains settings, workspace state, and queued requests.
- `graphs/<workspace-id>/graphify-out/` contains each workspace graph.
- `profile/graph.json` contains the merged graph.

The app manifest also declares `.sero/apps/graphify/state.json` as its host state file. Do not edit either state file while Sero is running.

If indexing fails, read the error on the workspace card. Confirm that the selected backend has valid credentials, then select **Rebuild**. If provisioning fails, the Graphify header shows **failed** and the panel shows the provisioning error. Do not delete the graph folders as a first recovery step because **Rebuild** replaces the affected graph safely.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Models and Providers](/guide/models-and-providers)
- [State and Folders](/reference/state-and-folders)
- [Security / Privacy](/reference/security-privacy)
