# PR #177 Manual Test — macOS Intel

Use this checklist on an Intel Mac (`x64`). Validate Docker and Host. Apple Container must not be offered.

## Pass/fail record

```text
Tester:
Date:
macOS version:
CPU:
Sero commit:
Docker Desktop version:
Runtime image/tag:
Workspace path:
Docker: pass/fail/not run
Host: pass/fail/not run
Apple Container absent: pass/fail
Notes:
```

## 0. Prep

```bash
git status --short --branch
pnpm install
pnpm typecheck
pkill -f "vite" || true
pkill -f "electron" || true
pnpm dev
```

Create/open a disposable workspace, for example:

```text
/Users/<you>/Projects/sero-pr177-intel-smoke
```

In DevTools:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
ws;
```

## 1. Runtime picker UX and platform gating

1. Open runtime picker.
2. Confirm visible choices are Docker and Host only.
3. Confirm Apple Container is not shown.
4. Confirm Host is marked `Advanced`.
5. Hover each row and confirm obvious border/background feedback.
6. Confirm current runtime is marked `Current`.
7. Click `Open Environment Doctor` and confirm the Doctor dialog opens.

Expected: no `mac-host` label and no silent Doctor action.

## 2. Docker runtime

### 2.1 Prerequisites

```bash
docker version
docker image inspect ghcr.io/sero-labs/sero-node:latest --format '{{.Id}} {{.Created}}' || true
```

Start Docker Desktop if needed.

### 2.2 Switch runtime

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
```

Expected: runtime picker shows Docker as current.

### 2.3 Command, file, terminal

From Sero terminal/agent:

```bash
pwd
uname -s
printf 'docker-intel-ok\n' > /workspace/docker-intel-smoke.txt
cat /workspace/docker-intel-smoke.txt
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- File appears in Finder and is editable/deletable by the macOS user.
- Interactive terminal starts in `/workspace`.

### 2.4 Host-to-runtime live mount

On macOS:

```bash
printf 'host edit visible on intel\n' > /Users/<you>/Projects/sero-pr177-intel-smoke/host-created.txt
```

In Sero terminal:

```bash
cat /workspace/host-created.txt
```

Expected: current contents appear immediately.

### 2.5 LSP and Git

1. Open a TS/JS file and confirm diagnostics/completions initialize.
2. Run:

```bash
git status --short
git diff --stat
```

Expected: command path uses Docker runtime, not host fallback.

### 2.6 Managed dev server and preview

Use the runtime-managed smoke plugin in [`docs/reference/runtime-manual-test.md`](../runtime-manual-test.md#3-runtime-managed-dev-server-listing-plugin) with backend `docker`.

Do not use a raw terminal-only server for this gate. A command started manually in a terminal is not a managed dev server and will not be registered in the Sero dev-server panel. For Docker, `http://127.0.0.1:5173` on the host is also not expected to work unless Sero has forwarded that container port.

Expected from the managed smoke plugin:

- `started.serverId` is present in `.sero/apps/runtime-smoke/state.json`.
- `foundInList` is `true`.
- `started.url` is `http://127.0.0.1:<hostPort>`.
- Opening `started.url` loads the smoke server.
- Stop/restart works from the dev-server panel.

### 2.7 Browser automation

Use one path deliberately: visible Sero Browser panel via `sero-cli` browser commands, or hidden runtime automation via the direct `browser` tool. Do not expect direct `browser` tool actions to create visible Sero Browser tabs.

Expected: Chromium and ffmpeg are available in the runtime image.

## 3. Host runtime

Switch:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

Run:

```bash
pwd
uname -s
printf 'host-intel-ok\n' > /workspace/host-intel-smoke.txt
cat /workspace/host-intel-smoke.txt
git status --short
```

Expected:

- Commands execute on macOS host.
- File operations work through Sero editor and Finder.
- Terminal starts in workspace.
- LSP initializes using host environment.
- Managed dev-server preview uses `http://127.0.0.1:<port>`.
- Browser automation is not advertised for Host.

## 4. Runtime switching regression check

Switch Docker → Host → Docker from the picker.

Expected:

- Picker remains open while pending.
- Pending runtime row shows `Switching` and spinner.
- Success/error status is visible.
- No stale Docker/Host dev server survives as an active preview after switching.

## 5. Cleanup

```bash
pkill -f "vite" || true
docker ps -a --filter 'label=ai.sero.managed=true'
# Remove only disposable smoke containers if desired.
```
