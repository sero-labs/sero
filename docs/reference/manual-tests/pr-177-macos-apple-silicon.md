# PR #177 Manual Test — macOS Apple Silicon

Use this checklist on an Apple Silicon Mac (`arm64`). This is the broadest PR #177 platform: validate Apple Container, Docker, and Host.

## Pass/fail record

```text
Tester: Daniel Carter
Date: 2026-05-15
macOS version: 26.3 (25D125)
CPU: Apple Silicon arm64
Sero commit: d0f5e7f0e
Docker Desktop version: Docker Engine 29.4.1
Apple Container version: container CLI 0.8.0 (build: release, commit: a18df81)
Runtime image/tag: ghcr.io/sero-labs/sero-node:latest
Workspace path: /Users/danielcarter/.sero-ui/workspaces/applecontainertest
Apple Container: pass
Docker: pass
Host: pass
Notes: Full checklist passed. Runtime picker/Doctor, command/file/terminal, host-to-runtime mount, LSP/Git, managed dev-server preview, browser/recording workflows, and negative checks passed across Apple Container, Docker, and Host.
```

## 0. Prep

From repo root:

```bash
git status --short --branch
pnpm install
pnpm typecheck
```

Start Sero:

```bash
pkill -f "vite" || true
pkill -f "electron" || true
pnpm dev
```

Create or open a disposable workspace under a normal macOS path, for example:

```text
/Users/<you>/Projects/sero-pr177-smoke
```

Open DevTools and capture a non-global workspace:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
ws;
```

## 1. Runtime picker UX and Doctor

1. Open the workspace tree runtime picker.
2. Confirm these options are visible:
   - Apple Container
   - Docker
   - Host with `Advanced`
3. Confirm hover/focus visibly changes row background/border.
4. Confirm the current runtime has a `Current` badge and checkmark.
5. Click `Open Environment Doctor`.
6. Confirm an `Environment Doctor` dialog opens and contains re-run/quick diagnostic controls.

Expected: no silent button, no unexplained menu disappearance.

## 2. Apple Container runtime

### 2.1 Prerequisites

```bash
/usr/local/bin/container system status || /usr/local/bin/container system start
/usr/local/bin/container image list | rg 'sero-node|ghcr.io/sero-labs/sero-node' || true
```

If the image was changed in this PR, rebuild/reload it before testing and remove disposable old Sero containers.

### 2.2 Switch runtime

In DevTools:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
```

Expected:

- Runtime picker shows Apple Container as current.
- Selecting a different runtime later shows a `Switching` badge/status while pending.

### 2.3 Command, file, terminal

From the Sero agent or workspace terminal:

```bash
pwd
uname -s
printf 'apple-container-ok\n' > /workspace/apple-container-smoke.txt
cat /workspace/apple-container-smoke.txt
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- File appears in the macOS workspace folder and is editable/deletable from Finder/editor.

Open an interactive terminal. Expected: it starts in `/workspace`.

### 2.4 Host-to-runtime live mount

On macOS:

```bash
printf 'host edit visible\n' > /Users/<you>/Projects/sero-pr177-smoke/host-created.txt
```

In Sero terminal:

```bash
cat /workspace/host-created.txt
```

Expected: prints `host edit visible` without a sync step.

### 2.5 LSP and Git

1. Open a TypeScript/JavaScript file.
2. Confirm diagnostics/completion initialize.
3. Run:

```bash
git status --short
git diff --stat
```

Expected: commands run inside the Apple Container runtime and do not use host fallback.

### 2.6 Managed dev server and preview

Use the runtime-managed smoke plugin in [`docs/reference/runtime-manual-test.md`](../runtime-manual-test.md#3-runtime-managed-dev-server-listing-plugin) with backend `apple-container`.

Do not use a raw terminal-only server for this gate. A command started manually in a terminal is not a managed dev server and will not be registered in the Sero dev-server panel. For container runtimes, `http://127.0.0.1:5173` on the host is also not expected to work unless Sero has forwarded that container port.

Expected from the managed smoke plugin:

- `started.serverId` is present in `.sero/apps/runtime-smoke/state.json`.
- `foundInList` is `true`.
- `started.url` is `http://127.0.0.1:<hostPort>`.
- Opening `started.url` loads the smoke server.
- Stop/restart works from the dev-server panel.

### 2.7 Browser automation

Use one of these paths deliberately; do not mix them:

- Visible Sero Browser panel / app recording: ask the agent to use `sero-cli` browser commands (`sero browser show`, `sero browser goto <url>`, `sero browser screenshot`) and `sero app record start|stop`. The `automation_browser` tool is hidden and will not create tabs in the visible Browser panel.
- Hidden runtime automation browser: ask the agent to use the `automation_browser` tool (`launch`, `screenshot`, `start_recording`, `stop_recording`) and save its own recording file.

Expected: Chromium launches from the runtime image; recording/screenshot does not fail due missing `ffmpeg`.

## 3. Docker runtime

### 3.1 Prerequisites

```bash
docker version
docker image inspect ghcr.io/sero-labs/sero-node:latest --format '{{.Id}} {{.Created}}' || true
```

Start Docker Desktop if needed.

### 3.2 Switch and repeat core runtime checks

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
```

Repeat sections 2.3 through 2.7 with filenames/content changed to `docker-smoke.txt` / `pr177 docker running`.

Additional Docker checks:

```bash
docker ps --filter 'label=ai.sero.managed=true'
docker inspect <container-id> --format '{{json .Config.Labels}}'
```

Expected:

- Container has Sero runtime labels.
- Runtime-created files are editable/deletable by the macOS user.
- Docker LSP starts without waiting for Apple Container renderer status.

## 4. Host runtime

Switch:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

Run:

```bash
pwd
uname -s
printf 'host-ok\n' > /workspace/host-smoke.txt
cat /workspace/host-smoke.txt
git status --short
```

Expected:

- Sero runtime path is still `/workspace` from the app perspective.
- Commands execute on macOS host.
- Browser automation is not advertised for Host.
- LSP, terminal, Git, file read/write, and managed dev-server preview work.

## 5. Negative checks

- Apple Container should not appear on non-Apple-Silicon machines; on this machine it should appear.
- `mac-host` should not be shown anywhere as a selectable runtime.
- Switching between all three runtimes should leave no stale preview server from the previous runtime.

## 6. Cleanup

```bash
pkill -f "vite" || true
docker ps -a --filter 'label=ai.sero.managed=true'
# Remove only disposable smoke containers if desired.
```
