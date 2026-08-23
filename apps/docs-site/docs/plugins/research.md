# Research Plugin

Research splits a question into parallel agent workstreams and then synthesizes their results. Use public, low-risk material for your first run.

## Plan and approve research

Run `/research <question>` or ask the agent to use the `research` tool with the `plan` action. The plugin creates a plan before it launches agents. Review the question, workstreams, and expected sources. Use `approve` only when the scope is suitable.

`/analyze` creates a structured analysis plan for article URLs. It also waits for approval before launch.

After approval, use the `status` action to check workstreams and finalize the synthesis. Use `cancel` to stop active research. Cancellation stops the plugin workflow, but provider requests that already started can still complete and incur cost.

Parallel work can use several model calls and network requests. Cost and duration depend on the selected models, the plan, and the sources. Verify important claims in the original sources. Model output is not evidence by itself.

Research state is workspace-scoped at `<workspace>/.sero/apps/research/state.json`. If a run appears stuck, check status before you approve or start another run. Cancel the active run before you replace its plan.

## Related docs

- [Models and Providers](/guide/models-and-providers)
- [Plugin Catalog](/plugins/catalog)
- [Security / Privacy](/reference/security-privacy)
