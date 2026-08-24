# Weight Tracker Plugin

The Weight Tracker is an external plugin for personal weight records. Install it from its owner with this source:

```text
git:https://github.com/monobyte/sero-weight-tracker.git
```

The app records a weight, date, and optional note. It shows a trend chart, changes over time, and progress towards a goal. The `weight` tool supports `log`, `list`, `remove`, `goal`, `status`, and `clear`. The `/weight` command shows the same records in an agent session.

## Store and delete health data

In Sero, this global plugin stores its state as plain JSON at:

```text
~/.sero-ui/apps/weight-tracker/state.json
```

The state includes every entry, note, unit, and goal. It is not encrypted by the plugin. Any agent that can use the `weight` tool can list or change this data.

Remove one entry in the app or use the tool's `remove` action with its numeric ID. Use `clear` to remove all entries. `clear` also removes the goal and resets the unit to `kg`. Removing the plugin is not documented as a data-deletion method. Check the state file if you must confirm deletion.

Use made-up values in screenshots and public support reports. Weight records and notes can contain health information.

## Other runtimes

The package manifest requires Sero 0.1.0 or later and runtime ABI 3. When the package runs in Pi CLI without Sero, it uses `workspace-root/.sero/apps/weight-tracker/state.json` instead of the global Sero path.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites)
- [Security / Privacy](/reference/security-privacy)
