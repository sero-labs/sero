# @sero/todo

Todo app for Sero — a standard Pi extension with an optional web UI.

## Sero Plugin Install

Install in **Sero → Admin → Plugins** with:

```text
git:https://github.com/monobyte/sero-todo-plugin.git
```

Sero clones the source repo, installs its dependencies locally, builds the UI,
and then hot-loads the plugin into the sidebar.

## Pi CLI Usage

Install as a Pi package:

```bash
pi install npm:@sero/todo
```

The agent gains a `todo` tool (list, add, toggle, clear) and a `/todos`
command. State is stored in `.sero/apps/todo/state.json` relative to the
workspace root.

## Sero Usage

When loaded in Sero, the web UI mounts in the main app area and watches
the same state file. Changes from the agent or the UI are reflected
instantly in both directions.

## State File

```
workspace-root/
└── .sero/
    └── apps/
        └── todo/
            └── state.json
```

```json
{
  "todos": [
    { "id": 1, "text": "Ship it", "done": false, "createdAt": "2025-01-01T00:00:00.000Z" }
  ],
  "nextId": 2
}
```
