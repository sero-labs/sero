# PR #177 Manual Test — Linux

Use this checklist on a Linux desktop/dev machine. Validate Docker or Podman plus Host.

## Pass/fail record

```text
Tester:
Date:
Distribution/version:
Kernel:
CPU/arch:
Sero commit:
Container engine/version:
Runtime image/tag:
Workspace path:
Docker/Podman: pass/fail/not run
Host: pass/fail/not run
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

Create/open a disposable workspace under a normal Linux home path:

```text
/home/<you>/projects/sero-pr177-linux-smoke
```

In DevTools:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
ws;
```

## 1. Runtime picker UX and platform gating

1. Open runtime picker.
2. Confirm Docker and Host are shown.
3. Confirm Apple Container is not shown.
4. Confirm Host is marked `Advanced`.
5. Confirm hover/current/switching feedback is obvious.
6. Click `Open Environment Doctor`; confirm the Doctor dialog opens.

Expected: no `mac-host` label and no Windows/WSL Host wording.

## 2. Container runtime — Docker or Podman

The backend auto-detects `docker` first, then `podman`. To force one:

```bash
export SERO_CONTAINER_ENGINE=docker
# or
export SERO_CONTAINER_ENGINE=podman
```

Restart Sero after changing the env var.

### 2.1 Prerequisites

Docker:

```bash
docker version
docker image inspect ghcr.io/sero-labs/sero-node:latest --format '{{.Id}} {{.Created}}' || true
```

Podman:

```bash
podman version
podman image inspect ghcr.io/sero-labs/sero-node:latest --format '{{.Id}} {{.Created}}' || true
```

Expected: current user can run the engine without `sudo` for the selected smoke path.

### 2.2 Switch runtime

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
```

The backend ID remains `docker` even when Podman is the compatible engine.

### 2.3 Command, file ownership, terminal

From Sero terminal/agent:

```bash
pwd
uname -s
id -u
id -g
printf 'linux-container-ok\n' > /workspace/linux-container-smoke.txt
cat /workspace/linux-container-smoke.txt
```

On Linux host:

```bash
ls -ln /home/<you>/projects/sero-pr177-linux-smoke/linux-container-smoke.txt
rm /home/<you>/projects/sero-pr177-linux-smoke/linux-container-smoke.txt
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- File owner UID/GID match the host user or are otherwise editable/deletable without `sudo`.
- Interactive terminal starts in `/workspace`.

### 2.4 Host-to-runtime live mount

On Linux host:

```bash
printf 'linux host edit visible\n' > /home/<you>/projects/sero-pr177-linux-smoke/host-created.txt
```

In Sero terminal:

```bash
cat /workspace/host-created.txt
```

Expected: current contents appear without sync.

### 2.5 LSP and Git

1. Open a TS/JS file and confirm diagnostics/completions initialize.
2. Run:

```bash
git status --short
git diff --stat
```

Expected: command path uses the selected container runtime.

### 2.6 Managed dev server and preview

Use the runtime-managed smoke plugin in [`docs/reference/runtime-manual-test.md`](../runtime-manual-test.md#3-runtime-managed-dev-server-listing-plugin) with backend `docker`. This covers Docker Engine and Podman because the runtime backend ID remains `docker`.

Do not use a raw terminal-only server for this gate. A command started manually in a terminal is not a managed dev server and will not be registered in the Sero dev-server panel. For container runtimes, `http://127.0.0.1:5173` on the host is also not expected to work unless Sero has forwarded that container port.

Expected from the managed smoke plugin:

- `started.serverId` is present in `.sero/apps/runtime-smoke/state.json`.
- `foundInList` is `true`.
- `started.url` is `http://127.0.0.1:<hostPort>`.
- Opening `started.url` loads the smoke server.
- Stop/restart works from the dev-server panel.
- A second workspace gets a different host port.

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
printf 'linux-host-ok\n' > /workspace/linux-host-smoke.txt
cat /workspace/linux-host-smoke.txt
git status --short
```

Expected:

- Commands execute on Linux host.
- File read/write/rename/delete works through Sero editor.
- Terminal starts in workspace.
- LSP initializes using host environment.
- Managed dev-server preview uses `http://127.0.0.1:<port>`.
- Browser automation is not advertised for Host.

## 4. Additional-root escape check for Host

Create an extra root:

```bash
mkdir -p /tmp/sero-pr177-extra-root
printf 'extra-root-ok\n' > /tmp/sero-pr177-extra-root/source.txt
```

In DevTools:

```js
const root = await window.sero.workspace.addRoot(ws.id, {
  name: "Linux Extra Root",
  path: "/tmp/sero-pr177-extra-root",
});
await window.sero.editor.readFile(ws.id, `/${root.id}/source.txt`);
```

Expected: read returns `extra-root-ok\n`. Attempts to access outside workspace/additional roots should fail.

Cleanup:

```js
await window.sero.workspace.removeRoot(ws.id, root.id);
```

```bash
rm -rf /tmp/sero-pr177-extra-root
```

## 5. Cleanup

```bash
pkill -f "vite" || true
docker ps -a --filter 'label=ai.sero.managed=true' || true
podman ps -a --filter 'label=ai.sero.managed=true' || true
# Remove only disposable smoke containers if desired.
```
