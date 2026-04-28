# Runtime / CLI / Browser source inventory

## Scope
Source-of-truth pass for DSC-006/007/008 areas:
- container/dev servers
- Sero CLI namespaces/commands
- browser + app capture

## Relevant Files
- `apps/desktop/electron/cli/index.ts` — CLI registry bootstrap; registers all built-in namespaces and builds the `sero-cli` prompt block from registry contents.
- `apps/desktop/electron/cli/core/registry.ts` / `core/types.ts` — command resolution, scoping, help lookup, command metadata, timeout/interactive flags.
- `apps/desktop/electron/cli/commands/container/devserver.ts` — `sero devserver` command surface.
- `apps/desktop/electron/cli/commands/container/terminal.ts` — `sero terminal`.
- `apps/desktop/electron/cli/commands/browser/browser.ts` — `sero browser`.
- `apps/desktop/electron/cli/commands/apps/app-control*.ts` — `sero app` subcommands.
- `apps/desktop/electron/cli/commands/workspace/workspace.ts`, `vcs/vcs.ts`, `editor/editor.ts`, `apps/app-state.ts`, `apps/artifacts.ts`, `agent/session.ts` — rest of built-in CLI namespaces.
- `apps/desktop/electron/features/container/**` — container lifecycle + dev-server registry implementation.
- `apps/desktop/src/lib/app-control-bridge.ts` and `src/lib/app-control/dom-interactions.ts` (+ submodules) — renderer-side app control bridge and DOM actions.
- `docs/decisions.md` — AD-018 / AD-019.
- `docs/guides/macos-containers.md` — user-facing container setup + caveats.

## Container / Dev Server Source of Truth

### Container subsystem
- `apps/desktop/electron/features/container/core/types.ts`
  - Canonical constants: `CONTAINER_BIN=/usr/local/bin/container`, `DEFAULT_IMAGE=sero-node:latest`, mount path `/workspace`.
  - `ContainerState` shape: `running|stopped|unknown`, image, ipAddress, cpus, memoryBytes.
  - Workspace container id convention: `sero-${workspaceId}`.
- `core/lifecycle.ts`
  - `ensureSystemRunning()` checks `container system status` and starts the system if needed.
  - `createFreshContainer()` uses `container run --name <cid> -d --cpus ... --memory ... --network default --ssh --volume <workspace>:/workspace`.
  - Injects shell profile env (`TERM`, `HOST`, `VITE_HOST`, proxy vars, `NO_PROXY`) and sets git identity / git init.
  - Ghost/stale container recovery exists; if create/start fails, it may delete/restart the system.
- `features/container/index.ts`
  - `ContainerManager` is the orchestrator and owns terminals, port scanning, HTTP proxy, and `DevServerRegistry`.
  - `ensure()` is lazy/deduplicated per workspace.
  - `exec()` uses `container exec`; default timeout 120s.
  - `disposeAllPortForwards()` tears down registry, scanners, proxy.
- `registries/dev-server-registry.ts`
  - In-memory only; not persisted across restart.
  - Register ID format is `workspaceId:scope:cardId:port` (not just workspace+port).
  - URL preference: detected port URL from port scanner, else container IP, else localhost.
  - Liveness check every 5s; status transitions emit events.
  - Stop = kill port inside container via `ss`/`kill`; restart = stop + re-run original command with `setsid`.

### Dev-server CLI
- `apps/desktop/electron/cli/commands/container/devserver.ts`
  - Namespace: `devserver` (group `Dev Servers`, source `ipc`).
  - Actions:
    - `list` — lists registered dev servers for current workspace.
    - `register --name <name> --port <port> --command <cmd> [--framework <name>]`.
    - `stop <id>`.
  - Output is plain text; errors are returned via `fail(...)` with usage strings.
  - `register` validates numeric port and requires name/port/command.
  - `stop` delegates to registry stop; failure message if missing.
- `docs/decisions.md` AD-019 currently says the registry is keyed by `${workspaceId}:${port}` and uses `fuser -k <port>/tcp`; code now differs on both points (ID format and stop implementation).

### Container docs caveats
- `docs/guides/macos-containers.md`
  - Strongly recommends Apple Silicon + `/usr/local/bin/container`.
  - Explicit host-mode fallback: core chat/file access still works, but browser automation / dev-server automation / Linux parity are reduced.
  - Rebuild `sero-node:latest` after Dockerfile/tooling changes and recreate affected workspace containers.
- `docs/decisions.md` AD-018
  - Confirms one container per workspace, lazy creation on first `agent.open()`, host-side tool execution proxied via container exec, and host fallback if startup fails.
  - Notes container status indicator, xterm via `node-pty`, and system prompt injection.

## CLI Namespace Inventory

### Registry / syntax behavior
- `CliRegistry.resolveTokens()` accepts an optional leading `sero` token and matches longest command-prefix first.
- Help lookup can match a parent command for nested text (`findHelpTarget`).
- Scoping: app/session-owned commands can be hidden or replaced per session; `buildCliPromptBlock()` groups visible commands by `group`.
- `CliCommand` metadata supports `source`, `group`, `hidden`, `timeoutMs`, `interactive`, and optional `owner` metadata.
- Root command blacklist blocks `auth`, `safeStorage`, `net`, `layout`, `agent`, `github`.

### Registered namespaces from `apps/desktop/electron/cli/index.ts`
- `app` — app control
- `workspace` — workspace management
- `session` / `set-title` — agent session controls
- `vcs` — version control
- `devserver` — dev server registry
- `artifacts` — verification artifacts
- `editor` — filesystem helpers
- `appstate` — app-state JSON
- `terminal` — terminal readback
- `browser` — browser control
- `help` — registered by `registerHelpCliCommand()` (core; not inspected in this pass)

### Command surface notes by namespace
- `workspace` (`group: Builtin`, `interactive: true`)
  - `list`, `info [id]`, `create <name> [--parent <path>]`, `add-folder <path> [--name <display-name>]`, `open <id>`, `close <id>`, `mount-plugin <path> [--name <display-name>] [--yes]`.
  - Emits workspace-changed broadcasts; create/add-folder may reconcile app runtimes; mount-plugin triggers container recreation if running.
  - Confirmation prompt for mount-plugin is bridged via `askConfirm`; can fail if no UI bridge exists.
- `vcs`
  - `status`, `log [--limit N]`, `diff <from> [to]`, `checkpoint [message]`, `push [branch]`, `fetch [remote]`, `remote [list|add|remove]`, `bookmarks`.
  - Uses `vcsOps` / `vcsManager`; returns plain text or fail strings.
- `editor`
  - `read <path>`, `list [dir]`.
  - Reads from container when container-enabled + container exists; otherwise host filesystem.
  - Host path safety prevents escaping workspace root.
- `appstate`
  - `read <path>`, `write <path> --json <json>`.
  - JSON parse/write errors bubble through `fail`.
- `artifacts`
  - `list [--session <id>]`, `save --title <t> --type <screenshot|log|video> [--path <p>]`, `remove <id>`, `summary [--session <id>]`.
  - Saves via `artifactRegistry`; type validation is explicit.
- `session`
  - `info` only; reports workspace, session id, session name, model/provider, thinking level, token/cost stats, streaming state, active turn.
- `set-title`
  - Sets current session title; requires active agent session.
- `terminal`
  - `read [lines]` default 100, max 500; truncation notice appended.
- `browser`
  - See separate section below.
- `app`
  - See separate section below.

## Browser / App Capture Source of Truth

### `sero browser`
- `apps/desktop/electron/cli/commands/browser/browser.ts`
- Actions:
  - `list [--all]`
  - `open <url>`
  - `close <tab-id>`
  - `navigate <tab-id> <url>`
  - `get-text [--tab <id>]`
  - `screenshot [--tab <id>]`
- Scope protection: explicit tab ids must belong to the invoking workspace.
- URL validation: open/navigate accept only `http:`/`https:`.
- Output:
  - text lists / extracted page text
  - screenshot returns image content block (`image/png`)
- Tabs are workspace-isolated and share a persistent session partition per workspace.
- `list --all` can show all loaded tabs, but tab reuse across workspaces is blocked.
- Alpha/partial caveat: command talks to `browserViewManager`; behavior depends on tabs being loaded into the browser panel.

### `sero app`
- `apps/desktop/electron/cli/commands/apps/app-control.ts`
- Group: `App Control` (not builtin); routed through app-control host service.
- Top-level actions:
  - `list`, `open`, `active`, `info`, `screenshot`, `click`, `type`, `scroll`, `select`, `hover`, `inspect`, `get-text`, `record`, `preview`.
- Help text includes “Dev Server Preview (in-app)” and MP4 recording.
- App matching accepts ids and visible names; `Calculator` → `calc` style aliases.
- Important behavior:
  - click/type/scroll/select/hover auto-capture a screenshot after the action.
  - inspect returns JSON and skips post-action screenshot.
  - `screenshot` can target `--app <id|name>` and/or `--save <path>`.
  - `record start/stop/status` is available; stop can save MP4 or frame folder.
  - `preview <url>` opens a dev-server URL in the editor panel so it can be captured.

### Renderer bridge and DOM helpers
- `apps/desktop/src/lib/app-control-bridge.ts`
  - Exposes `window.__appControl` methods used by main-process `executeJavaScript` bridge.
  - Methods include: getList/getActive/openApp/getInfo/openFile/getAppRect/interact/recordStart/recordStop/getRecordingStatus/openDevPreview.
  - `openDevPreview(url)` switches to explorer and opens `devserver://<url>` in the editor bridge.
  - Bridge-local recording state is ephemeral in-memory only.
- `apps/desktop/src/lib/app-control/dom-interactions.ts`
  - Dispatches DOM actions from `AppInteractionParams` and returns `AppInteractionResult`.
  - Supports `click`, `type`, `scroll`, `select`, `hover`, `inspect`, `get-text`.
- `dom/actions.ts`
  - Selector or point-based click targeting.
  - Type requires input/textarea/contenteditable; appends text and emits input/change.
  - Scroll defaults to 300px and supports direction + optional selector.
  - Inspect/list/get-text return structured inspection data or plain text.
- `dom/targeting.ts`
  - Hit-target resolution prefers interactive ancestors; coordinate scans use `elementsFromPoint`.
- `dom/inspect.ts`
  - Builds selector hints from id, data-testid, aria-label, title, role.
  - Point inspection returns panel rect, matched element, click target, and stack.

## Alpha / Partial Caveats
- `app` capture flows depend on the editor/app panel being visible; screenshot/record failures often mean the panel is not found or not visible.
- `browser` and `app` are UI-backed commands, not pure filesystem/CLI operations; command success is tied to renderer bridge state.
- `devserver` registry is in-memory and ephemeral; docs should not imply persistence.
- `workspace mount-plugin` is confirmation-gated unless `--yes`/`--y` is present and will recreate a running container to pick up mounts.
- AD-019 in `docs/decisions.md` is partially stale relative to code (ID keying and stop mechanism).
