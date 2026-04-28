# Sero CLI

`sero-cli` is Sero's workspace/session command surface. Agents call it as a tool, and operators can use the same syntax in Sero-aware terminal contexts.

## Scope and syntax

- A leading `sero` token is optional for command resolution, but examples use it for clarity.
- Commands run in the current workspace and, when invoked during an agent turn, the current session/turn.
- Invocation sources are `tool`, `bash`, and `terminal`.
- Session-owned plugin/extension commands only appear for the active scoped session.
- Blacklisted command roots are not registerable: `auth`, `safeStorage`, `net`, `layout`, `agent`, `github`.

```bash
sero help workspace
sero workspace info
sero session info
```

## Batch behavior

`sero-cli` accepts multiple commands, one per line. Execution stops on the first non-zero exit code or timeout.

```text
sero workspace info
sero vcs status
sero terminal read 50
```

Non-terminal invocations truncate output at 50KB / 2000 lines. Multi-command batches omit rich image output; rerun screenshot commands alone to receive images. Interactive commands disable normal per-command timeout behavior.

## Built-in namespaces

| Namespace | Source file | Purpose |
|---|---|---|
| `app` | `commands/apps/app-control*.ts` | Switch apps, screenshot, interact with UI, record, preview dev servers. |
| `appstate` | `commands/apps/app-state.ts` | Read/write app state JSON. |
| `artifacts` | `commands/apps/artifacts.ts` | Manage verification artifacts. |
| `browser` | `commands/browser/browser.ts` | Drive the visible in-app browser tabs. |
| `devserver` | `commands/container/devserver.ts` | Register/list/stop workspace dev servers. |
| `editor` | `commands/editor/editor.ts` | Read/list workspace files. |
| `session` | `commands/agent/session.ts` | Show current agent session state. |
| `set-title` | `commands/agent/session.ts` | Rename the current session. |
| `terminal` | `commands/container/terminal.ts` | Read recent terminal output. |
| `vcs` | `commands/vcs/vcs.ts` | Status, log, diff, checkpoints, remotes, push/fetch. |
| `workspace` | `commands/workspace/workspace.ts` | List/create/open/close workspaces and attach plugin folders. |

## `workspace`

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero workspace list` | Lists known workspaces, path, runtime, and current marker. | None if no workspaces; returns empty message. |
| `sero workspace info [id]` | Shows path, runtime, description, hints, tags. | `Workspace not found`. |
| `sero workspace create <name> [--parent <path>]` | Creates and registers a workspace; reconciles app runtimes; broadcasts workspace change. | Missing name. |
| `sero workspace add-folder <path> [--name <display-name>]` | Registers an existing folder; path resolves from current cwd; reconciles app runtimes. | Missing/invalid path. |
| `sero workspace open <id>` | Expands/opens a workspace in Sero. | Missing id. |
| `sero workspace close <id>` | Closes workspace; re-add with `add-folder`; cannot close `global`. | Missing id, default workspace. |
| `sero workspace mount-plugin <path> [--name <display-name>] [--yes]` | Attaches a Sero plugin source folder as an Explorer root only; recreates running container. | Invalid plugin folder; confirmation unavailable without `--yes`. |

## `devserver`

See [Containers and Dev Servers](/guide/containers-dev-servers).

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero devserver list` | Lists registered servers for current workspace as `id [status] name — url (port n)`. | No registered servers. |
| `sero devserver register --name <name> --port <port> --command <cmd> [--framework <name>]` | Adds in-memory registry entry; URL uses detected port/container IP when available. | Missing required fields; invalid port. |
| `sero devserver stop <id>` | Kills the listening port/process tree inside the container and marks stopped. | Missing id; failed stop. |

## `app`

See [Browser and Capture](/guide/browser-and-capture). `app` commands are UI-backed and depend on the renderer app panel being visible.

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero app list` | Lists app ids, names, scope, and `[no UI]` when applicable. | No apps available. |
| `sero app open <appId|name>` | Switches active Sero app. | App not found; failed open. |
| `sero app active` | Prints active app id. | Renderer bridge unavailable. |
| `sero app info <appId|name>` | JSON app metadata. | App not found. |
| `sero app screenshot [--app <id|name>] [--save <path>]` | Returns PNG image block; optional file save relative to cwd. | App panel not found/visible. |
| `sero app click <selector>` / `--x <n> --y <n>` | Clicks and returns a post-action screenshot. | Missing selector/coords; target not found. |
| `sero app type "<text>" [--selector <sel>]` | Types into focused/selected input and returns screenshot. | Missing text; target is not editable. |
| `sero app scroll --direction <dir> [--amount <px>] [--selector <sel>]` | Scrolls, default amount 300px, returns screenshot. | Invalid amount. |
| `sero app select <selector>` | Focuses/selects element, returns screenshot. | Missing selector. |
| `sero app hover <selector>` | Hovers element, returns screenshot. | Missing selector. |
| `sero app inspect [<selector>] [--x <n> --y <n>]` | Returns JSON inspection data; no post-action screenshot. | Cannot combine selector and coordinates. |
| `sero app get-text [<selector>|--selector <sel>]` | Returns text content. | Interaction failure. |
| `sero app record start` | Starts 2 FPS capture. | Already recording or panel not found. |
| `sero app record status` | Shows recording state/duration. | None. |
| `sero app record stop [--save <path>]` | Saves MP4 or PNG frame folder. Default: `<workspace>/sero-recordings/`. | No active recording or no frames. |
| `sero app preview <url>` | Opens a dev-server URL in Explorer's editor preview so `app screenshot/record` can capture it. | Missing URL; failed preview. |

## `browser`

See [Browser and Capture](/guide/browser-and-capture). `browser` controls the visible in-app browser tabs, not arbitrary hidden browser automation.

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero browser list [--all]` | Lists loaded tabs for current workspace or all workspaces. | No loaded tabs. |
| `sero browser open <url>` | Opens an HTTP(S) tab in the current workspace. | Missing URL; unsupported URL. |
| `sero browser close <tab-id>` | Closes a tab owned by the current workspace. | Unknown/other-workspace tab. |
| `sero browser navigate <tab-id> <url>` | Navigates a current-workspace tab to HTTP(S) URL. | Invalid URL; other-workspace tab. |
| `sero browser get-text [--tab <id>]` | Returns title, URL, and plain page text; defaults to active tab. | No active tab; extraction failed. |
| `sero browser screenshot [--tab <id>]` | Returns PNG image block; defaults to active tab. | No active tab; capture failed. |

Tabs are workspace-owned and loaded lazily through the browser panel. Explicit tab ids cannot cross workspace boundaries.

## `editor`

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero editor read <path>` | Reads a file from the container when available, otherwise host workspace. | Missing path; path escapes workspace in host mode. |
| `sero editor list [dir]` | Lists directory entries, default `/workspace`. | Filesystem errors. |

## `terminal`

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero terminal read [lines]` | Returns recent workspace terminal output. Default 100; maximum 500 with truncation notice. | Invalid line count. |

## `vcs`

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero vcs status` | Shows changed files and conflicts, or clean state. | VCS operation failure. |
| `sero vcs log [--limit N]` | Recent change ids/descriptions/bookmarks; default 10. | None if no changes. |
| `sero vcs diff <from> [to]` | Diff text between revisions. | Missing `from`. |
| `sero vcs checkpoint [message|--message <msg>]` | Creates a manual checkpoint when files changed. | No file changes. |
| `sero vcs push [branch]` | Pushes to remote. | Remote/auth failure. |
| `sero vcs fetch [remote]` | Fetches remote changes. | Remote/auth failure. |
| `sero vcs remote [list]` | Lists remotes. | None if no remotes. |
| `sero vcs remote add <name> <url>` | Adds remote. | Missing name/url. |
| `sero vcs remote remove <name>` | Removes remote. | Missing name. |
| `sero vcs bookmarks` | Lists bookmarks. | None if no bookmarks. |

## `session` and `set-title`

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero session info` | Workspace, session id/name, model/provider, thinking level, tokens, cost, request count, streaming state, active turn. | No active session reports workspace only. |
| `sero set-title <text>` | Sets the current agent session title. | Missing title; no active agent session. |

## `appstate`

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero appstate read <path>` | Reads app state JSON and prints formatted JSON. | Missing path; read failure. |
| `sero appstate write <path> --json <json>` | Parses JSON and writes app state. | Missing JSON; parse/write failure. |

`appstate` is JSON state only; it is not UI automation.

## `artifacts`

| Command | Output / side effects | Common errors |
|---|---|---|
| `sero artifacts list [--session <id>]` | Lists artifacts with id, type, title, timestamp, optional container path. | No artifacts recorded. |
| `sero artifacts save --title <t> --type <screenshot|log|video> [--path <p>]` | Adds registry entry for current session/workspace. | Missing title/type; invalid type. |
| `sero artifacts remove <id>` | Removes artifact registry entry. | Missing or unknown id. |
| `sero artifacts summary [--session <id>]` | Builds PR-style artifact summary. | Missing session when no current session. |

## Plugin-bridged commands

Sero bridges selected extension tools and commands into `sero-cli` so agents use one command surface.

- Core tools such as `todo`, `memory`, `question`, `cron`, `git_manager`, and others are allowlisted.
- Plugin packages can opt into bridging with `sero.plugin.bridgeTools` metadata.
- `research` is explicitly not bridged.
- Admin tooling is intentionally not agent-accessible through this bridge.
- Session-owned bridged commands are visible only for the matching active session scope.
- For JSON-heavy bridged commands, run `sero help <command>` first and follow the reported schema.

## Related docs

- [Containers and Dev Servers](/guide/containers-dev-servers)
- [Browser and Capture](/guide/browser-and-capture)
- [Remote Control](/guide/remote-control)
- [Troubleshooting](/reference/troubleshooting)
