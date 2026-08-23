# Todo Plugin

Todo keeps a task list for the current workspace. Use the **Todo** app for direct changes, or ask the agent to update the list.

## Manage tasks

The `todo` tool supports four actions:

- `list` shows current tasks.
- `add` creates a task.
- `toggle` changes a task between open and complete.
- `clear` removes completed tasks.

The `/todos` command shows the list in chat. Task changes in the app and agent use the same state file:

```text
<workspace>/.sero/apps/todo/state.json
```

Todo does not create calendar reminders, schedules, Git issues, or Kanban cards. Clearing completed tasks removes them from Todo state. Keep a separate record if you need task history.

If tasks appear to be missing, confirm that you opened the expected workspace. Do not copy `state.json` into a different workspace while Sero is writing to it.

## Related docs

- [Kanban Plugin](/plugins/kanban)
- [Plugin Catalog](/plugins/catalog)
- [Security / Privacy](/reference/security-privacy)
