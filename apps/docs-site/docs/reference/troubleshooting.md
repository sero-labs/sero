# Troubleshooting

Most Sero OSS alpha setup problems fall into one of these buckets:
- interrupted install / native module ABI mismatch
- dev launcher startup failure
- Apple container runtime unavailable
- host mode being used for a workflow that still expects containers
- dev-server preview URL, container IP, or browser/app capture mismatch

## `pnpm install` finished, but terminals or memory features still fail

The repo already runs repair hooks during `pnpm install` for the two main native
module risk areas:
- `node-pty`
- `better-sqlite3`

If install was interrupted, scripts were skipped, or Electron ABI drift still
shows up at runtime, rerun the relevant repair from the repo root.

### Terminal / `node-pty` issues

```bash
node scripts/rebuild-node-pty.mjs
```

If terminal sessions still fail, use the manual rebuild flow from the dedicated
node-pty guide.

### Memory search / `better-sqlite3` issues

```bash
node scripts/rebuild-better-sqlite3.mjs
```

This is the right next step if Electron logs mention `ERR_DLOPEN_FAILED`,
`NODE_MODULE_VERSION`, or `better-sqlite3`.

## `pnpm dev` or `bash scripts/dev.sh` does not start cleanly

From the repo root, the canonical first-run command is:

```bash
pnpm build
pnpm dev
```

If you are working directly inside the desktop app package, the equivalent is:

```bash
cd apps/desktop
bash scripts/dev.sh
```

If startup looks stuck or stale, clean up old processes and retry:

```bash
pkill -f "vite"
pkill -f "electron"
```

Useful runtime logs:
- `/tmp/sero-vite.log`
- `/tmp/sero-electron.log`
- `/tmp/sero-web-remote-watch.log`
- `/tmp/sero-remote-<plugin>.log` for any plugin dev remotes you enabled

## Apple containers are unavailable or unhealthy

Sero works best with Apple's `container` CLI available at:

```text
/usr/local/bin/container
```

Quick checks:

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
```

If the system is installed but not running:

```bash
/usr/local/bin/container system start
```

If containers still are not available, Sero can continue in host mode. That is
supported, but it is intentionally a reduced experience.

## A workflow works in containers but not in host mode

Host mode is a supported fallback for:
- onboarding and provider setup
- core chat and coding tasks
- file browsing and editing
- general host-shell development workflows

Host mode is **not** the supported path for:
- browser automation
- containerized language servers
- feature-equivalent managed preview / dev-server automation
- Linux/container parity

If you hit one of those gaps, check whether the workspace should be running in
container-backed mode instead.

See [Support Scope](/reference/support-scope) for the canonical matrix,
[Containers and Host Mode](/reference/containers-host-mode) for runtime-specific
guidance, and [Containers and Dev Servers](/guide/containers-dev-servers) for the dev-server quick path.

## Dev server works in terminal but not in preview

Check the server binding first. Many frameworks default to `localhost`, which can make the server reachable from inside the container shell but not from Sero's preview URL. Prefer binding to all interfaces:

```bash
npm run dev -- --host 0.0.0.0
```

Then register or re-register the server:

```bash
sero devserver register --name "Web app" --port 3000 --command "npm run dev -- --host 0.0.0.0" --framework vite
sero devserver list
```

Use the URL reported by `sero devserver list`. In container-backed workspaces, that URL may use the container IP rather than `localhost`.

## Host port is already used

Container-backed dev servers reduce host port conflicts because the server listens inside the workspace container. Two workspaces can often use the same container port without both claiming the same host port.

This is not a guarantee that every network issue is solved. If the preview still fails, confirm container health, server binding, proxy/DNS behavior, and the URL reported by the registry.

## Container IP changed or preview URL went stale

The dev-server registry is in memory and URLs can change after container restart/recreation. Run:

```bash
sero devserver list
```

If the listed URL differs from the one in your browser or preview tab, open the fresh URL or register the server again. If no servers are listed, start and register the dev server again.

## Browser or app capture fails

`sero browser ...` commands operate on visible in-app browser tabs. `sero app ...` screenshot, interaction, preview, and recording commands use the UI-backed app-control bridge. Both depend on the relevant panel being loaded and visible.

Quick recovery:

```bash
sero browser list
sero app list
sero app open explorer
sero app screenshot --save ./debug.png
```

If screenshots say the app panel is not found or not visible, switch to the target app and retry after it renders. See [Browser and Capture](/guide/browser-and-capture).

## Checkpoint restore or turn undo fails

Checkpoint and undo operations can restore files, and turn undo can also rewind
the chat/session tree. If recovery does not behave as expected:

- stop any active streaming agent turn before restoring
- confirm you are in the intended workspace/session
- review current diffs so you know what may be overwritten
- refresh Git/source-control views after restore
- distinguish VCS-only restore from **Undo this turn**

See [Checkpoints and Undo](/guide/checkpoints-and-undo) for the recovery matrix.

## Quick baseline before filing an issue

From the repo root, gather the smallest helpful signal first:

```bash
pnpm typecheck
pnpm build
pnpm test
```

Use `pnpm test:ci` when you need the current alpha PR-gate shape.

When reporting the problem, include:
- macOS version
- Apple Silicon confirmation
- Node and pnpm versions
- whether you were using container-backed runtime or host mode
- relevant log excerpts

Before sharing logs, redact tokens, auth files, and private local paths.

## See also

- [Support Scope](/reference/support-scope)
- [Explorer Workspace](/guide/explorer-workspace)
- [Containers and Dev Servers](/guide/containers-dev-servers)
- [Browser and Capture](/guide/browser-and-capture)
- [Checkpoints and Undo](/guide/checkpoints-and-undo)
- [Containers and Host Mode](/reference/containers-host-mode)
- [Container Isolation](/reference/container-isolation)
- [Sero CLI](/reference/sero-cli)
- [State and Folders](/reference/state-and-folders)
- [`docs/node-pty-setup.md`](https://github.com/sero-labs/sero/blob/main/docs/node-pty-setup.md)
- [`docs/guides/native-modules.md`](https://github.com/sero-labs/sero/blob/main/docs/guides/native-modules.md)
- [`docs/guides/macos-containers.md`](https://github.com/sero-labs/sero/blob/main/docs/guides/macos-containers.md)
- [`CONTRIBUTING.md`](https://github.com/sero-labs/sero/blob/main/CONTRIBUTING.md)
