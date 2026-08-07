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

| Command | Output / side effects |
|---|---|
| `sero workspace list` | Lists known workspaces, path, runtime, and current marker. |
| `sero workspace info [id]` | Shows path, runtime, description, hints, tags. |
| `sero workspace create <name> [--parent <path>]` | Creates and registers a workspace; reconciles app runtimes; broadcasts workspace change. |
| `sero workspace add-folder <path> [--name <display-name>]` | Registers an existing folder; path resolves from current cwd; reconciles app runtimes. |
| `sero workspace open <id>` | Expands/opens a workspace in Sero. |
| `sero workspace close <id>` | Closes workspace; re-add with `add-folder`; cannot close `global`. |
| `sero workspace mount-plugin <path> [--name <display-name>] [--yes]` | Attaches a Sero plugin source folder as an Explorer root only; recreates running container. |

## `devserver`

See [Containers and Dev Servers](/guide/containers-dev-servers).

| Command | Output / side effects |
|---|---|
| `sero devserver list` | Lists registered servers for current workspace as `id [status] name — url (port n)`. |
| `sero devserver register --name <name> --port <port> --command <cmd> [--framework <name>]` | Adds in-memory registry entry; URL uses detected port/container IP when available. |
| `sero devserver stop <id>` | Kills the listening port/process tree inside the container and marks stopped. |

## `app`

See [Browser and Capture](/guide/browser-and-capture). `app` commands are UI-backed and depend on the renderer app panel being visible.

| Command | Output / side effects |
|---|---|
| `sero app list` | Lists app ids, names, scope, and `[no UI]` when applicable. |
| `sero app open <appId\|name>` | Switches active Sero app. |
| `sero app active` | Prints active app id. |
| `sero app info <appId\|name>` | JSON app metadata. |
| `sero app screenshot [--app <id\|name>] [--save <path>]` | Returns PNG image block; optional file save relative to cwd. |
| `sero app screenshot --selector <sel> --full` | Captures a full long scroll container. |
| `sero app screenshot-around --text "text" [--within <sel>] [--save <path>]` | Scrolls to text, confirms the target, then captures the app. |
| <code>sero app click &lt;selector&gt;</code><br /><code>--ref &lt;ref&gt;</code><br /><code>--x &lt;n&gt; --y &lt;n&gt;</code> | Clicks and returns a post-action screenshot. |
| <code>sero app type "&lt;text&gt;"</code><br /><code>[--selector &lt;sel&gt;\|--ref &lt;ref&gt;]</code> | Types into focused/selected input and returns screenshot. |
| <code>sero app scroll --y &lt;px&gt; [--x &lt;px&gt;]</code><br /><code>[--selector &lt;sel&gt;\|--ref &lt;ref&gt;]</code><br /><code>[--at-x &lt;n&gt; --at-y &lt;n&gt;]</code> | Scrolls the selected or nearest scroll container and reports the actual target. |
| <code>sero app scroll-to --selector &lt;sel&gt;</code><br /><code>--text "text"\|--ref &lt;ref&gt;</code><br /><code>[--within &lt;sel&gt;\|--container "text"]</code> | Scrolls a target element/text into view and reports visibility/rect. |
| `sero app select <selector\|--ref ref>` | Focuses/selects element, returns screenshot. |
| `sero app hover <selector\|--ref ref>` | Hovers element, returns screenshot. |
| <code>sero app inspect [&lt;selector&gt;]</code><br /><code>[--x &lt;n&gt; --y &lt;n&gt;\|--ref &lt;ref&gt;]</code><br /><code>[--visible-only] [--interactive-only] [--limit &lt;n&gt;]</code> | Returns JSON inspection data with temporary refs; no post-action screenshot. |
| `sero app visible --text "text"\|--selector <sel>\|--ref <ref>` | Checks whether an element/text is visible. |
| `sero app snapshot` | Returns visible headings, sections, buttons, links, and inputs as JSON. |
| `sero app scroll-containers` | Lists scrollable containers with refs, dimensions, scrollTop, and max scroll. |
| `sero app get-text [--app <id\|name>] [<selector>\|--selector <sel>] [--visible-only] [--around "text"]` | Returns text content, optionally limited to visible or nearby text. |
| `sero app record start [--fps <n>] [--crf <n>] [--full-window]` | Starts capture. Default 2 FPS, up to 30; `--crf` sets quality (lower is better, default 23); `--full-window` captures the whole Sero window instead of the active app panel. Needs `ffmpeg` on `PATH`. |
| `sero app record status` | Shows recording state/duration. |
| `sero app record stop [--save <path>]` | Saves the MP4. Default: `<workspace>/sero-recordings/`. |
| `sero app preview <url>` | Opens a dev-server URL in Explorer's editor preview so `app screenshot/record` can capture it. |

## `browser`

See [Browser and Capture](/guide/browser-and-capture). `browser` controls the visible in-app browser tabs, not arbitrary hidden browser automation.

| Command | Output / side effects |
|---|---|
| `sero browser list [--all]` | Lists loaded tabs for current workspace or all workspaces. |
| `sero browser open <url>` | Opens an HTTP(S) tab in the current workspace. |
| `sero browser close <tab-id>` | Closes a tab owned by the current workspace. |
| `sero browser navigate <tab-id> <url>` | Navigates a current-workspace tab to HTTP(S) URL. |
| `sero browser get-text [--tab <id>]` | Returns title, URL, and plain page text; defaults to active tab. |
| `sero browser screenshot [--tab <id>]` | Returns PNG image block; defaults to active tab. |

Tabs are workspace-owned and loaded lazily through the browser panel. Explicit tab ids cannot cross workspace boundaries.

## `editor`

| Command | Output / side effects |
|---|---|
| `sero editor read <path>` | Reads a file from the container when available, otherwise host workspace. |
| `sero editor list [dir]` | Lists directory entries, default `/workspace`. |

## `terminal`

| Command | Output / side effects |
|---|---|
| `sero terminal read [lines]` | Returns recent workspace terminal output. Default 100; maximum 500 with truncation notice. |

## `vcs`

| Command | Output / side effects |
|---|---|
| `sero vcs status` | Shows changed files and conflicts, or clean state. |
| `sero vcs log [--limit N]` | Recent change ids/descriptions/bookmarks; default 10. |
| `sero vcs diff <from> [to]` | Diff text between revisions. |
| <code>sero vcs checkpoint [message]</code><br /><code>sero vcs checkpoint --message &lt;msg&gt;</code> | Creates a manual checkpoint when files changed. |
| `sero vcs push [branch]` | Pushes to remote. |
| `sero vcs fetch [remote]` | Fetches remote changes. |
| `sero vcs remote [list]` | Lists remotes. |
| `sero vcs remote add <name> <url>` | Adds remote. |
| `sero vcs remote remove <name>` | Removes remote. |
| `sero vcs bookmarks` | Lists bookmarks. |

## `session` and `set-title`

| Command | Output / side effects |
|---|---|
| `sero session info` | Workspace, session id/name, model/provider, thinking level, tokens, cost, request count, streaming state, active turn. |
| `sero set-title [--if-unnamed] <text>` | Sets a session title of up to 48 characters. `--if-unnamed` keeps an existing title. |

## `appstate`

| Command | Output / side effects |
|---|---|
| `sero appstate read <path>` | Reads app state JSON and prints formatted JSON. |
| `sero appstate write <path> --json <json>` | Parses JSON and writes app state. |

`appstate` is JSON state only; it is not UI automation.

## `artifacts`

| Command | Output / side effects |
|---|---|
| `sero artifacts list [--session <id>]` | Lists artifacts with id, type, title, timestamp, optional container path. |
| `sero artifacts save --title <t> --type <screenshot\|log\|video> [--path <p>]` | Adds registry entry for current session/workspace. |
| `sero artifacts remove <id>` | Removes artifact registry entry. |
| `sero artifacts summary [--session <id>]` | Builds PR-style artifact summary. |

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
