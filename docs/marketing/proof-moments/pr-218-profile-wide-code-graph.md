## Proof moment

Open the Graphify plugin, enable indexing for a workspace, then show an agent using Graphify context or tools to trace relationships across files from the generated code graph. This hits "that is not just a chat UI" because the agent can use a profile-wide code graph, background index state, and app tools rather than only the files pasted into conversation. It also hits "the workspace extends itself" because Graphify is a built-in plugin with its own UI, background runtime, local stored artefacts, and agent tools. PR: https://github.com/sero-labs/sero/pull/218

## Draft X post

Sero can now build a local code graph and give it to the agent when a question needs more than grep.

Graphify is a built-in plugin that indexes opted-in workspaces and exposes graph search through the Sero agent runtime.

[video]

- The Graphify panel lets a developer opt workspaces into indexing and see per-workspace index state from the plugin UI.
- Graph artefacts are stored under the profile's `apps/graphify` area, and indexing runs in the plugin's background runtime rather than inside a chat turn.
- Agent sessions can use Graphify tools and auto-context to answer relationship questions such as where a symbol is called or how one feature path reaches another file.

https://github.com/sero-labs/sero

If a local-first workplace for AI agents sounds useful, starring the repo genuinely helps more developers find it.

## 60-second demo script

1. Open Sero and select the Graphify plugin from the app/sidebar area. Show the management panel listing available workspaces and index status. Run for about 8 seconds.
2. Enable indexing for a real workspace in the active profile. Show the index state moving into progress or a completed state, using an already indexed workspace if the graph was built earlier by the product. Run for about 10 seconds.
3. Open the workspace in Sero and start an agent session. Ask a relationship question that needs cross-file context, such as where a named function is called or how a feature path reaches a UI component. Run for about 8 seconds.
4. Show the agent using Graphify context or tools in the session output, including the relevant files or symbols returned from the graph. Do not paste a prepared answer; let the product output be visible. Run for about 14 seconds.
5. Click or open at least one referenced file from the answer so the viewer can verify that the graph result connects real code in the workspace. Run for about 10 seconds.
6. End on a split view or sequence showing Graphify's indexed workspace state beside the agent answer, making clear that the code graph is part of the local Sero workspace. Run for about 10 seconds.
