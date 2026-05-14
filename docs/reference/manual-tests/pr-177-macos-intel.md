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

Start a dependency-free HTTP server and leave it running:

```bash
node -e "require('http').createServer((_, res) => res.end('pr177 docker intel running')).listen(5173, '0.0.0.0', () => console.log('LISTEN 5173'))"
```

Use Sero preview/dev-server UI.

Expected:

- URL is `http://127.0.0.1:<hostPort>`.
- Page loads.
- Stop/restart works.

### 2.7 Browser automation

Run normal Sero browser/screenshot flow against the preview.

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
