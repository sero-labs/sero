# Plan Mode Plugin

Plan Mode separates read-only investigation from implementation. Use it when you want to inspect a task and approve a saved plan before the agent changes files.

## Create and run a plan

Run `/plan` and describe the task. During this phase, the agent can inspect the workspace but must not implement the task. It saves an ordered plan when the investigation is complete.

Review the plan in **Plan Mode**. Then use `/plan-execute` to start implementation. During execution, the agent marks each saved step complete. Use `/plan-todos` to view progress.

Use `/plan-stop` to stop plan execution and return to the normal session mode. Stopping does not undo changes that execution already made.

The underlying `plan_todos` tool supports `set_plan`, `complete_step`, and `list`. Plans are workspace-scoped at `<workspace>/.sero/apps/planmode/state.json`.

Read-only mode limits the planning agent's tools. It does not prove that the final plan is correct or safe. Check file paths, commands, tests, and destructive steps before execution.

## Recovery

If execution has no plan, run `/plan` again and confirm that the plan was saved. If progress is wrong, stop execution before you create a new plan. Use Git or Sero checkpoints to review or restore file changes; Plan Mode does not provide its own undo operation.

## Related docs

- [Checkpoints and Undo](/guide/checkpoints-and-undo)
- [Plugin Catalog](/plugins/catalog)
