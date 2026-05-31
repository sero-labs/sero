# Troubleshooting

Start here when Sero will not launch, a workspace runtime is unavailable, or a preview does not work.

First run [Environment Doctor](/reference/environment-doctor). It checks your platform, runtime, profile, providers, plugins, and workspace state, then reports which items passed, warned, or failed.

Use this page by symptom. For exact platform support, see [Support Scope](/reference/support-scope). To choose or switch between Host, Apple Container, and Docker / Podman, see [Choose a Workspace Runtime](/guide/choose-workspace-runtime).

## 1. Run Environment Doctor first

If Sero opens:

1. Press <kbd>⌘K</kbd> on macOS or <kbd>Ctrl+K</kbd> elsewhere.
2. Choose **Diagnostics → Environment Doctor**.
3. Run the full check.
4. Export or copy the report before changing anything else.

If Sero does not open, run Doctor in safe mode from the built app or Electron command you normally use:

```bash
electron --doctor --json --report ./sero-doctor-report.json
```

If your install includes the bundled shim, you can also run:

```bash
sero-doctor --json --report ./sero-doctor-report.json
```

A failing Doctor result is usually the best next action. Fix the failed row, rerun Doctor, then retry the workflow that failed.

## Sero will not start

1. Run Environment Doctor in safe mode.
2. Check whether Doctor reports native module, profile, provider, or plugin failures.
3. Stop stale development processes and retry:

```bash
pkill -f "vite"
pkill -f "electron"
```

4. If you are running from a source checkout, retry the normal source-build path:

```bash
pnpm build
pnpm dev
```

Useful logs:

- `/tmp/sero-vite.log`
- `/tmp/sero-electron.log`
- `/tmp/sero-web-remote-watch.log`
- `/tmp/sero-remote-<plugin>.log`

If the failure mentions `node-pty`, `better-sqlite3`, `ERR_DLOPEN_FAILED`, or `NODE_MODULE_VERSION`, use the native-module steps below.

### macOS won't open Sero

Current Sero releases are signed with a Developer ID certificate and notarized by
Apple, so the DMG should open normally with no Gatekeeper prompt.

If macOS warns that it "could not verify Sero is free of malware" or says Sero is
**damaged**, you almost certainly have an **older, pre-notarization build**. Delete
the installed app, download the latest DMG from the releases page, and reinstall.

If the latest release still fails, report the release filename and your macOS
version. As a last resort you can clear the download quarantine flag and open it
manually:

```sh
xattr -dr com.apple.quarantine /Applications/Sero.app
```

## Terminals or memory features fail after install

Interrupted installs and Electron ABI changes can leave native modules in the wrong state.

From the repo root, rebuild the module named in the error:

```bash
node scripts/rebuild-node-pty.mjs
node scripts/rebuild-better-sqlite3.mjs
```

Use the `node-pty` repair when terminals fail. Use the `better-sqlite3` repair when memory search or database-backed features fail.

If the repair still fails, include the command output and Doctor report in your issue.

## Container runtime is unavailable

First confirm whether the workspace is actually using a container runtime. Host is the default on supported platforms. Apple Container and Docker / Podman are explicit per-workspace choices.

If you selected a container runtime and it is unavailable, Sero reports that selected runtime as failed. It does not silently switch that selected workspace to Host. Fix the selected runtime or explicitly choose another supported runtime.

### Apple Container checks

Apple Container is for supported Apple Silicon Macs only.

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
```

If it is installed but stopped:

```bash
/usr/local/bin/container system start
```

If you are not on a supported Apple Silicon Mac, choose Host or Docker / Podman according to [Support Scope](/reference/support-scope). macOS Intel is not a supported Sero target.

### Docker / Podman checks

```bash
docker info
podman info
```

The runtime picker calls this option **Docker / Podman**. The saved runtime ID is `docker`. Sero prefers Docker when both engines are available, but can use Podman when configured or auto-selected.

If Docker Desktop, the Docker daemon, or the Podman machine/service is stopped, start it and retry Doctor.

## Host runtime tools or browser automation fail

Host runs commands directly in your real workspace folder. It is the default on supported macOS arm64, Linux x64/arm64, and Windows x64 systems.

Common Doctor results and next actions:

| Doctor result | What to do |
| --- | --- |
| Host core tools missing | Use onboarding or Runtime settings to install Sero-managed core tools, or confirm Node, pnpm, Git/SSH, and your shell are available on `PATH`. |
| Managed tools still installing | Wait for the install to finish, then rerun Doctor. |
| Browser pack missing but installable | Use the in-app install action if offered, then rerun Doctor. |
| Browser pack failed | Check disk space and network access, then rerun Doctor. Include the report if it still fails. |
| Browser pack unavailable for your platform | Use a container runtime for browser automation, or move to a supported platform. |
| Native build tools missing | Install your platform compiler stack, or use a container runtime when you need image-provided tools. |

Host browser automation is ready only when a browser pack is available for your platform and Environment Doctor passes the launch check. Available public Host browser packs are macOS arm64, Linux x64, Linux arm64, and Windows x64. Windows arm64 is not supported today.

## A workflow works in containers but not on Host

Host and container runtimes do not provide identical behavior.

Use Host for normal local development, direct workspace paths, and `localhost` workflows. Switch the workspace to Apple Container or Docker / Podman when you need:

- container-provided tools or compiler stacks
- Linux/container parity
- container networking behavior
- browser automation from the runtime image

For the runtime decision path, see [Choose a Workspace Runtime](/guide/choose-workspace-runtime). For exact behavior, see [Containers and Host Mode](/reference/containers-host-mode).

## Preview URL fails

First identify the workspace runtime.

### Host preview checks

- Start the dev server normally in the real project folder.
- Open the same `localhost` URL in your normal browser.
- Register the server if Sero does not know about it:

```bash
sero devserver register --name "Web app" --port 3000 --command "npm run dev" --framework vite
sero devserver list
```

Use the URL reported by `sero devserver list`.

### Container preview checks

Many frameworks must bind to all interfaces inside the container:

```bash
npm run dev -- --host 0.0.0.0
```

Then register the same command:

```bash
sero devserver register --name "Web app" --port 3000 --command "npm run dev -- --host 0.0.0.0" --framework vite
sero devserver list
```

If a URL worked before a container restart, run `sero devserver list` again. Preview URLs can change when the runtime restarts or the in-memory registry is rebuilt.

For the full dev-server guide, see [Preview Dev Servers](/guide/containers-dev-servers).

## Browser or app capture fails

`sero browser ...` commands operate on visible in-app browser tabs. `sero app ...` screenshot, interaction, preview, and recording commands use the UI-backed app-control bridge. Both need the target panel to be loaded and visible.

Quick checks:

```bash
sero browser list
sero app list
sero app open explorer
sero app screenshot --save ./debug.png
```

If screenshots say the app panel is not found or not visible, switch to the target app and retry after it renders. See [Browser and Capture](/guide/browser-and-capture).

## Checkpoint restore or undo fails

Before restoring or undoing a turn:

- stop any active streaming agent turn
- confirm you are in the intended workspace and session
- review current diffs so you know what may be overwritten
- refresh Git/source-control views after restore
- distinguish VCS-only restore from **Undo this turn**

See [Checkpoints and Undo](/guide/checkpoints-and-undo).

## Unsupported target or unsupported expectation

Sometimes the correct fix is to change platform or runtime.

The current public beta does not support macOS Intel or Windows arm64. It also does not promise full Host/container parity, stable internal plugin/runtime APIs, automatic updates for every beta release, or a hardened multi-tenant security boundary.

If your workflow depends on container-provided tools, container networking, or browser automation without Host browser packs, choose Apple Container or Docker / Podman on a supported platform.

## What to include in an issue

Include the smallest reproducible signal and the support fields maintainers need:

- operating system and version
- CPU architecture
- Node and pnpm versions
- runtime mode: Host (`host`), Apple Container (`apple-container`), or Docker / Podman (`docker`)
- install path: packaged beta artifact or source build
- packaged artifact type or release tag when relevant
- source build branch and commit SHA when relevant
- exact command or workflow that failed
- Environment Doctor result or exported report
- relevant redacted log excerpts from `/tmp/sero-*.log`
- whether browser automation used a Host browser pack or a container runtime

Before sharing logs, redact tokens, auth headers, provider keys, private repository names when needed, and private local paths.

## See also

- [Environment Doctor](/reference/environment-doctor)
- [Support Scope](/reference/support-scope)
- [Choose a Workspace Runtime](/guide/choose-workspace-runtime)
- [Preview Dev Servers](/guide/containers-dev-servers)
- [Containers and Host Mode](/reference/containers-host-mode)
- [Container Isolation](/reference/container-isolation)
- [Browser and Capture](/guide/browser-and-capture)
- [Checkpoints and Undo](/guide/checkpoints-and-undo)
- [State and Folders](/reference/state-and-folders)
- [Sero CLI](/reference/sero-cli)
