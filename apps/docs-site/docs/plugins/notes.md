# Notes Plugin

Notes keeps a notebook for the active Sero profile. Open **Notes** to write and search notes, or use the agent to manage them. The **Pinboard** dashboard widget shows pinned and recent notes.

## Add and manage notes

Create a note in the app, or ask the agent to add one. The `notes` tool supports `list`, `add`, `edit`, `remove`, `pin`, `unpin`, and `show` actions. The `/notes` command opens the same note workflow in chat.

Pin information that you need often. Pinning changes its position in the Pinboard; it does not make the note public or protect it from deletion.

## Storage and deletion

Notes is a global app. It stores data for the active profile in:

```text
<SERO_HOME>/apps/notes/state.json
```

Removing a note deletes it from this state file. Do not put secrets in notes unless you accept the security of the profile and its configured AI provider. Redact note text before you share logs or screenshots.

If the app and agent show different content, confirm that you are in the expected profile. Then reopen Notes. Do not edit `state.json` while Sero is writing to it.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [Security / Privacy](/reference/security-privacy)
