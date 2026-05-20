# Troubleshooting

Most Sero OSS alpha setup problems fall into one of these buckets:
- interrupted install / native module ABI mismatch
- dev launcher startup failure
- Apple Container or Docker/Podman runtime unavailable
- Host core tools, browser pack, or native build tools missing
- host mode being used for a workflow that still expects containers
- dev-server preview URL, runtime forwarding, or browser/app capture mismatch

Before working through the buckets manually, run the
[Environment Doctor](/reference/environment-doctor). In Sero, open it with
<kbd>⌘K</kbd> → **Diagnostics** → **Environment Doctor**. It produces a structured
report covering most of the categories below and works even when Sero cannot
finish booting (`electron --doctor` or the bundled `sero-doctor` CLI shim).

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

## Container runtimes are unavailable or unhealthy

Sero works best with a container-backed runtime: Apple Container on supported
Apple Silicon Macs, or Docker/Podman on macOS, Linux, and Windows.

Apple Container quick checks:

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
```

If the Apple Container system is installed but not running:

```bash
/usr/local/bin/container system start
```

Docker/Podman quick checks:

```bash
docker info
podman info
```

The runtime picker labels this option **Docker / Podman**, but the saved backend ID is `docker`. Sero prefers Docker when both CLIs are available and can retry Podman when auto-selected Docker cannot reach its daemon. Use `SERO_CONTAINER_ENGINE=podman` or `SERO_CONTAINER_ENGINE=docker` to force one engine.

If container runtimes still are not available, explicitly select Host mode on
macOS/Linux for reduced direct-host execution. Sero does not silently switch a
selected container runtime to host execution. Windows workspace execution uses the Docker-compatible runtime.

## A workflow works in containers but not in host mode

Host mode is a supported explicit macOS/Linux runtime for:
- onboarding and provider setup
- core chat and coding tasks
- file browsing and editing
- general host-shell development workflows

Host mode has reduced capability compared with container-backed runtimes:
- browser automation requires a published, installed browser pack and a passing Doctor launch check
- containerized language servers are not available
- preview / dev-server automation uses normal host networking rather than container forwarding
- Linux/container parity is not guaranteed

If you hit one of those gaps, check whether the workspace should be running in
container-backed mode instead.

See [Support Scope](/reference/support-scope) for the canonical matrix,
[Containers and Host Mode](/reference/containers-host-mode) for runtime-specific
guidance, and [Containers and Dev Servers](/guide/containers-dev-servers) for the dev-server quick path.

## Host browser pack, toolchain, or native build diagnostics fail

Environment Doctor separates Host runtime issues so each warning maps to a concrete action:

- **Host core tools missing or installing** — confirm Node, pnpm, Git/SSH, and your shell are available. Sero-managed host tools install under `~/.sero-ui/toolchains/<manifest-version>/`; if Doctor reports an install in progress, wait and retry the check.
- **Browser pack `missing` but `installable`** — use the in-app install action when offered, then rerun Doctor. Host browser automation is ready only after the files exist and the launch check passes.
- **Browser pack pending or non-installable** — do not keep retrying local installs. macOS Intel is not a supported target. On supported platforms, use Apple Container or Docker/Podman for browser automation until your platform pack is published and verified.
- **Browser pack `failed`** — rerun Doctor after checking disk space and network access. If the artifact is published for your platform and the launch check still fails, include the Doctor report in the issue.
- **Native build tools missing** — install the platform compiler stack yourself, such as Xcode Command Line Tools, Linux `build-essential`/gcc/make, or MSVC/Windows SDK. Sero does not install compiler stacks; use a container-backed runtime when you need image-provided build tooling.

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

Use the URL reported by `sero devserver list`. In container-backed workspaces, that URL is resolved by the active runtime backend and is usually a localhost forwarding URL.

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
- operating system and version
- CPU architecture
- Node and pnpm versions
- whether you were using Apple Container, Docker/Podman, or host mode
- relevant log excerpts

Before sharing logs, redact tokens, auth files, and private local paths.

## See also

- [Environment Doctor](/reference/environment-doctor)
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
- [`docs/features/docker-runtime.md`](https://github.com/sero-labs/sero/blob/main/docs/features/docker-runtime.md)
- [`docs/guides/macos-containers.md`](https://github.com/sero-labs/sero/blob/main/docs/guides/macos-containers.md)
- [`CONTRIBUTING.md`](https://github.com/sero-labs/sero/blob/main/CONTRIBUTING.md)
