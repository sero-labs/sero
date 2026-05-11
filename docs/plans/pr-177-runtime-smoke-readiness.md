# PR #177 Runtime Smoke Readiness Checklist

Use this document after rebuilding the local `ghcr.io/sero-labs/sero-node:latest` image for both Docker and Apple Container. The goal is to prove the PR is ready without relying on the old GHCR image.

## Readiness bar

PR #177 is smoke-ready when:

1. Automated repo validation passes.
2. The rebuilt Docker image passes the direct image smoke below.
3. The desktop app passes backend smoke for every runtime available on your machine:
   - `docker` on Docker Desktop / Docker Engine.
   - `apple-container` on Apple Silicon with Apple Container installed.
   - `host` on the local OS.
4. Browser automation works on at least one container runtime (`docker` or `apple-container`).
5. Managed dev-server registration/list/preview works on `docker`, `apple-container` where available, and `host`.
6. Any unavailable platform smoke is recorded explicitly as `not run` with a reason.

Windows/WSL host smoke is required before claiming full Windows readiness, but it cannot be proven from macOS/Linux.

---

## 0. Prerequisites

From repo root:

```bash
git status --short --branch
```

Expected:

- On the PR branch.
- No unexpected uncommitted source changes.
- Local images already rebuilt:
  - Docker image store: `ghcr.io/sero-labs/sero-node:latest`
  - Apple Container image store: `ghcr.io/sero-labs/sero-node:latest` if testing Apple Container.

Confirm Docker sees the rebuilt image:

```bash
docker image inspect ghcr.io/sero-labs/sero-node:latest --format '{{.Id}} {{.Created}}'
```

If you have Apple Container installed, confirm the system is running:

```bash
/usr/local/bin/container system status
```

If needed:

```bash
/usr/local/bin/container system start
```

Recreate old Sero workspace containers after rebuilding images. The simplest safe option is to remove Sero-managed runtime containers for disposable smoke workspaces:

```bash
docker ps -a --filter 'label=ai.sero.managed=true'
# Remove only disposable smoke containers, or containers you are comfortable recreating:
docker rm -f <container-id>
```

---

## 1. Automated repo validation

Run from repo root:

```bash
pnpm --filter @sero/desktop typecheck
pnpm --filter @sero/desktop exec vitest run \
  electron/__tests__/features/workspace/runtime/run-workspace-command.test.ts \
  electron/__tests__/features/workspace/runtime/runtime-types.test.ts \
  electron/__tests__/features/workspace/runtime/host-dev-server-manager.test.ts \
  electron/__tests__/features/workspace/runtime/host-doctor.test.ts \
  electron/__tests__/features/workspace/runtime/wsl-substrate.test.ts \
  electron/__tests__/features/workspace/runtime/docker-doctor.test.ts \
  electron/__tests__/features/workspace/runtime/docker-backend.test.ts \
  electron/__tests__/features/workspace/runtime/apple-container-backend.test.ts \
  electron/__tests__/ipc/runtime-boundaries.test.ts \
  electron/__tests__/ipc/workspace-runtime-reconcile.test.ts \
  electron/__tests__/features/container/tools-browser-agent.test.ts
pnpm typecheck
```

Static checks:

```bash
git diff --name-only origin/main...HEAD | rg '\.(ts|tsx)$' | xargs wc -l | sort -nr | head -30
rg 'RUNTIME_CAPABILITIES\[' apps packages plugins
rg -i 'mac host|mac-host' apps packages plugins docs
```

Expected:

- All typecheck/test commands pass.
- No touched source file exceeds 500 LOC.
- `RUNTIME_CAPABILITIES[` has no matches.
- `mac-host` / `Mac Host` matches are only deprecated compatibility references or historical docs/plans.

---

## 2. Automated Docker image smoke

This proves the rebuilt image contains the new Playwright layout and works for arbitrary non-root UID/GID, without starting the desktop app.

Run on macOS/Linux with Docker:

```bash
set -euo pipefail
IMAGE=ghcr.io/sero-labs/sero-node:latest
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/sero-home \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -v "$TMP_DIR:/workspace" \
  -w /workspace \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail

    echo "== toolchain =="
    command -v bash
    command -v git
    command -v node
    command -v npm
    command -v python3
    command -v pgrep
    command -v agent-browser

    echo "== workspace write as arbitrary uid =="
    printf "runtime-write-ok\n" > /workspace/runtime-created.txt
    test "$(cat /workspace/runtime-created.txt)" = "runtime-write-ok"

    echo "== shared Playwright path =="
    test "$PLAYWRIGHT_BROWSERS_PATH" = "/ms-playwright"
    test -d /ms-playwright
    test -r /ms-playwright
    chrome="$(find /ms-playwright "$HOME/.cache/ms-playwright" -path "*/chrome-linux/chrome" -type f -perm -111 -print -quit 2>/dev/null)"
    ffmpeg="$(find /ms-playwright "$HOME/.cache/ms-playwright" -path "*/ffmpeg-linux" -type f -perm -111 -print -quit 2>/dev/null)"
    test -n "$chrome"
    test -n "$ffmpeg"
    echo "chrome=$chrome"
    echo "ffmpeg=$ffmpeg"

    echo "== chromium headless =="
    "$chrome" --headless=new --no-sandbox --disable-gpu \
      --screenshot=/workspace/chrome-smoke.png \
      "data:text/html,<html><body><h1>sero smoke</h1></body></html>"
    test -s /workspace/chrome-smoke.png

    echo "== ffmpeg =="
    "$ffmpeg" -version >/dev/null

    echo "== agent-browser =="
    agent-browser --session sero-image-smoke --executable-path "$chrome" open about:blank --json
    agent-browser --session sero-image-smoke --executable-path "$chrome" screenshot /workspace/agent-browser-smoke.png --json
    agent-browser --session sero-image-smoke close --json || true
    test -s /workspace/agent-browser-smoke.png
  '

test -s "$TMP_DIR/chrome-smoke.png"
test -s "$TMP_DIR/agent-browser-smoke.png"
test -f "$TMP_DIR/runtime-created.txt"
echo "Docker image smoke passed: $TMP_DIR"
```

Expected:

- Command exits 0.
- `runtime-created.txt`, `chrome-smoke.png`, and `agent-browser-smoke.png` are created in the temp workspace.
- No permission errors writing as your host UID/GID.

If this fails before desktop app testing, fix the image first.

---

## 2A. Automated Apple Container image smoke

Run this only on Apple Silicon with Apple Container available. It proves the rebuilt Apple Container image store has the same toolchain/browser assets as Docker.

```bash
set -euo pipefail
IMAGE=ghcr.io/sero-labs/sero-node:latest
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

/usr/local/bin/container run --rm \
  --uid "$(id -u)" \
  --gid "$(id -g)" \
  -e HOME=/tmp/sero-home \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -v "$TMP_DIR:/workspace" \
  -w /workspace \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    command -v bash
    command -v git
    command -v node
    command -v npm
    command -v python3
    command -v pgrep
    command -v agent-browser
    printf "runtime-write-ok\n" > /workspace/runtime-created.txt
    test "$(cat /workspace/runtime-created.txt)" = "runtime-write-ok"
    test "$PLAYWRIGHT_BROWSERS_PATH" = "/ms-playwright"
    test -d /ms-playwright
    test -r /ms-playwright
    chrome="$(find /ms-playwright "$HOME/.cache/ms-playwright" -path "*/chrome-linux/chrome" -type f -perm -111 -print -quit 2>/dev/null)"
    ffmpeg="$(find /ms-playwright "$HOME/.cache/ms-playwright" -path "*/ffmpeg-linux" -type f -perm -111 -print -quit 2>/dev/null)"
    test -n "$chrome"
    test -n "$ffmpeg"
    echo "chrome=$chrome"
    echo "ffmpeg=$ffmpeg"
    "$chrome" --headless=new --no-sandbox --disable-gpu \
      --screenshot=/workspace/chrome-smoke.png \
      "data:text/html,<html><body><h1>sero smoke</h1></body></html>"
    test -s /workspace/chrome-smoke.png
    "$ffmpeg" -version >/dev/null
    agent-browser --session sero-image-smoke --executable-path "$chrome" open about:blank --json
    agent-browser --session sero-image-smoke --executable-path "$chrome" screenshot /workspace/agent-browser-smoke.png --json
    agent-browser --session sero-image-smoke close --json || true
    test -s /workspace/agent-browser-smoke.png
  '

test -s "$TMP_DIR/chrome-smoke.png"
test -s "$TMP_DIR/agent-browser-smoke.png"
test -f "$TMP_DIR/runtime-created.txt"
echo "Apple Container image smoke passed"
```

Expected:

- Command exits 0.
- The same browser assets and arbitrary-UID workspace write behavior pass under Apple Container.

---

## 3. Desktop app setup for live runtime smoke

Start Sero from the PR branch:

```bash
pkill -f "vite" || true
pkill -f "electron" || true
pnpm dev
```

Create or choose a disposable workspace. Open DevTools in the desktop app.

In DevTools, get a workspace object:

```js
const workspaces = await window.sero.workspace.list();
const ws = workspaces.find((w) => w.id !== "global");
ws;
```

If `ws` is not a disposable workspace, create/open one before continuing.

---

## 4. Mostly automated backend smoke from DevTools

Paste this helper into DevTools:

```js
async function runPr177BackendSmoke(backend) {
  const workspaces = await window.sero.workspace.list();
  const ws = workspaces.find((w) => w.id !== "global");
  if (!ws) throw new Error("No non-global workspace found. Open a disposable workspace first.");

  console.log(`Switching ${ws.id} to ${backend}`);
  await window.sero.workspace.setRuntimeBackend(ws.id, backend);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const diagnostics = await window.sero.workspace.getRuntimeDiagnostics(ws.id);
  console.log("diagnostics", diagnostics);

  const marker = `pr177-${backend}-${Date.now()}`;
  const editorFile = "/workspace/pr177-editor-smoke.txt";
  const execFile = "/workspace/pr177-exec-smoke.txt";

  await window.sero.editor.writeFile(ws.id, editorFile, marker);
  const editorRead = await window.sero.editor.readFile(ws.id, editorFile);
  if (editorRead !== marker) throw new Error(`editor read mismatch: ${editorRead}`);

  const containerOnlyChecks = backend === "docker" || backend === "apple-container"
    ? "test \"$(uname -s)\" = Linux && test -d /ms-playwright && test -r /ms-playwright"
    : ":";

  const command = [
    "set -eu",
    "echo PWD=$(pwd)",
    "echo UNAME=$(uname -s 2>/dev/null || echo unknown)",
    "git --version >/dev/null",
    "python3 --version >/dev/null",
    "node --version >/dev/null",
    containerOnlyChecks,
    `printf '${marker}' > ${execFile}`,
    `cat ${execFile}`,
  ].join(" && ");

  const execResult = await window.sero.editor.exec(ws.id, command);
  console.log("exec", execResult);
  if (execResult.exitCode !== 0) throw new Error(execResult.stderr || execResult.stdout);
  if (!execResult.stdout.includes(marker)) throw new Error("exec marker missing from stdout");

  const execRead = await window.sero.editor.readFile(ws.id, execFile);
  if (execRead !== marker) throw new Error(`exec file read mismatch: ${execRead}`);

  await window.sero.editor.delete(ws.id, editorFile).catch(() => false);
  await window.sero.editor.delete(ws.id, execFile).catch(() => false);

  const doctor = await window.sero.doctor.run({ category: "runtime" });
  console.log("runtime doctor", doctor.results.map((r) => ({ id: r.id, status: r.status, message: r.message })));

  return { backend, workspaceId: ws.id, diagnostics, execResult, doctor };
}
```

Run the helper for each backend available on your machine:

```js
await runPr177BackendSmoke("docker");
await runPr177BackendSmoke("host");
// Apple Silicon + Apple Container only:
await runPr177BackendSmoke("apple-container");
```

Expected for `docker` and `apple-container`:

- Runtime switch succeeds.
- Exec succeeds.
- `UNAME=Linux` appears in stdout.
- `/ms-playwright` exists and is readable.
- Files written by editor and exec can be read/deleted through Sero.
- Runtime Doctor does not hang. Docker image missing may warn only if you did not rebuild/load the image into the relevant runtime store.

Expected for `host`:

- Runtime switch succeeds.
- Exec succeeds using the host/WSL environment.
- File write/read/delete works.
- Browser automation is not advertised for host.

---

## 5. Managed dev-server smoke using a temporary plugin

This is the clearest way to prove `startManaged()`, runtime dev-server events/listing, preview URL generation, and stop/dispose behavior through the app-runtime path.

### 5.1 Create the temporary plugin

From repo root:

```bash
mkdir -p plugins/sero-runtime-smoke-plugin/runtime
cat > plugins/sero-runtime-smoke-plugin/package.json <<'JSON'
{
  "name": "@sero-ai/plugin-runtime-smoke",
  "version": "0.0.0",
  "private": true,
  "sero": {
    "app": {
      "id": "runtime-smoke",
      "name": "Runtime Smoke",
      "icon": "box",
      "stateFile": ".sero/apps/runtime-smoke/state.json",
      "runtime": "./runtime/index.js",
      "scope": "workspace"
    }
  }
}
JSON

cat > plugins/sero-runtime-smoke-plugin/runtime/index.js <<'JS'
exports.createAppRuntime = async function createAppRuntime(ctx) {
  let serverId = null;

  return {
    async start() {
      const target = process.env.SERO_RUNTIME_SMOKE_WORKSPACE_ID;
      if (!target || ctx.workspaceId !== target) return;

      const before = ctx.host.devServers.list(ctx.workspaceId);
      const started = await ctx.host.devServers.startManaged({
        workspaceId: ctx.workspaceId,
        workspacePath: ctx.workspacePath,
        cwdPath: ctx.workspacePath,
        command: "python3 -m http.server 5177 --bind 0.0.0.0",
        name: "Runtime Smoke Server"
      });

      serverId = started.serverId || null;
      const after = ctx.host.devServers.list(ctx.workspaceId);

      await ctx.host.appState.update(ctx.stateFilePath, () => ({
        workspaceId: ctx.workspaceId,
        backend: process.env.SERO_RUNTIME_SMOKE_BACKEND || "unknown",
        before,
        started,
        after,
        foundInList: Boolean(started.serverId && after.some((s) => s.id === started.serverId)),
        usableUrl: Boolean(started.url && started.port)
      }));
    },

    async handleStateChange() {},

    async dispose() {
      if (serverId) await ctx.host.devServers.stop(serverId).catch(() => false);
    }
  };
};
JS
```

### 5.2 Run it for each backend

In DevTools, switch the disposable workspace to the backend under test:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
// or "host"
// or "apple-container"
```

Restart Sero with the workspace id and backend label:

```bash
pkill -f "vite" || true
pkill -f "electron" || true
SERO_RUNTIME_SMOKE_WORKSPACE_ID="<WORKSPACE_ID>" \
SERO_RUNTIME_SMOKE_BACKEND="docker" \
pnpm dev
```

Replace:

- `<WORKSPACE_ID>` with `ws.id` from DevTools.
- `docker` with `host` or `apple-container` for those runs.

After Sero starts, inspect the state file in the workspace:

```bash
cat "<WORKSPACE_PATH>/.sero/apps/runtime-smoke/state.json"
```

Expected JSON fields:

```json
{
  "started": {
    "serverId": "...",
    "url": "http://127.0.0.1:...",
    "port": 12345
  },
  "foundInList": true,
  "usableUrl": true
}
```

Open `started.url` in a browser or Sero preview.

Expected:

- Python directory listing loads.
- URL uses `http://127.0.0.1:<port>`.
- Stop/restart/dispose does not leave obvious orphan dev-server entries after app restart.

Repeat for:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container"); // Apple Silicon only
```

Cleanup when done:

```bash
pkill -f "vite" || true
pkill -f "electron" || true
rm -rf plugins/sero-runtime-smoke-plugin
pnpm dev
```

---

## 6. Browser automation smoke through Sero

Run this on a container backend only. Use `docker` first; use `apple-container` too if available.

In DevTools:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
// or: await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
```

In a Sero chat for that workspace, send this exact prompt:

```text
Use the browser tool in this workspace. Launch https://example.com, take a screenshot, start recording to /workspace/pr177-browser-smoke.webm, wait 2 seconds, stop recording, then close the browser. Report the screenshot result and whether /workspace/pr177-browser-smoke.webm exists.
```

Expected:

- Browser launch succeeds.
- Screenshot succeeds.
- Recording starts and stops successfully.
- `/workspace/pr177-browser-smoke.webm` exists and is non-empty.
- No Playwright browser install permission error involving `/ms-playwright`.

Verify the recording file through DevTools:

```js
await window.sero.editor.exec(ws.id, "test -s /workspace/pr177-browser-smoke.webm && echo recording-ok");
await window.sero.editor.delete(ws.id, "/workspace/pr177-browser-smoke.webm");
```

Host expectation:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

The host runtime should not advertise browser automation. Do not expect browser tool success on host.

---

## 7. Backend switch/reset smoke

This proves backend changes are destructive resets and do not keep stale Docker/Apple state.

In DevTools:

```js
await runPr177BackendSmoke("docker");
await runPr177BackendSmoke("host");
await runPr177BackendSmoke("docker");
```

If Apple Container is available:

```js
await runPr177BackendSmoke("apple-container");
await runPr177BackendSmoke("host");
await runPr177BackendSmoke("apple-container");
```

Expected:

- Every switch succeeds.
- Commands execute in the newly selected backend.
- Docker/Apple commands still report Linux after switching away and back.
- No stale terminal/dev-server errors appear in `/tmp/sero-electron.log`.

Check logs:

```bash
tail -200 /tmp/sero-electron.log
```

---

## 8. Windows/WSL smoke, if you have a Windows machine

Run this separately on Windows with WSL 2. This cannot be proven from macOS.

1. Start Docker Desktop if testing Docker.
2. Create a disposable workspace on a Windows drive, for example:
   `C:\Users\<you>\Projects\sero-pr177-smoke`.
3. Also test a WSL-native workspace if possible:
   `\\wsl.localhost\Ubuntu\home\<you>\sero-pr177-smoke`.
4. Start Sero from the PR branch.
5. In DevTools:

```js
await runPr177BackendSmoke("host");
```

Expected for Windows host:

- Host execution uses WSL, not PowerShell/cmd.
- File reads/writes work for files larger than 1 MiB:

```js
await window.sero.editor.exec(ws.id, "python3 - <<'PY'\nfrom pathlib import Path\nPath('/workspace/pr177-large.txt').write_text('x' * (2 * 1024 * 1024))\nPY");
const large = await window.sero.editor.readFile(ws.id, "/workspace/pr177-large.txt");
if (large.length !== 2 * 1024 * 1024) throw new Error(`large read failed: ${large.length}`);
await window.sero.editor.delete(ws.id, "/workspace/pr177-large.txt");
```

- Managed dev-server smoke from section 5 returns a usable localhost URL.
- If localhost forwarding is disabled, the diagnostic should mention WSL localhost forwarding instead of returning an empty successful URL.

---

## 9. Results template

Save results in the PR or a local note using this template:

```markdown
# PR #177 Smoke Results

Date:
Machine/OS:
Branch/head SHA:
Docker image id/created:
Apple Container image rebuilt: yes/no/not available

## Automated repo validation
- Desktop typecheck:
- Targeted vitest:
- Root typecheck:
- Static greps/LOC:

## Docker direct image smoke
- Result:
- Notes:

## Desktop backend smoke
- docker:
- host:
- apple-container:
- Windows/WSL host:

## Managed dev-server smoke
- docker:
- host:
- apple-container:

## Browser automation smoke
- docker:
- apple-container:
- host capability unavailable as expected: yes/no

## Issues found
- 
```

PR is ready when all applicable rows are pass, and unavailable rows have a clear reason such as `not run: no Windows machine` or `not run: Apple Container unavailable on Intel Mac`.

---

## 10. Automated run results — 2026-05-11

These were run after rebuilding both local images from this PR branch.

### Source fix found during automation

The first broad automated run exposed a WSL LSP test timeout caused by the test not mocking the new WSL execution-PID pidfile read. The test was fixed so WSL host LSP startup now covers the pidfile read path deterministically.

### Results

- Desktop runtime/container/app-runtime/VCS/LSP/Doctor focused Vitest suite — **pass**
  - Command:
    `pnpm --filter @sero/desktop exec vitest run electron/__tests__/features/workspace/runtime electron/__tests__/features/container electron/__tests__/features/workspace/runtime-resolution.test.ts electron/__tests__/features/workspace/workspace-runtime-config.test.ts electron/__tests__/ipc/runtime-boundaries.test.ts electron/__tests__/ipc/workspace-runtime-reconcile.test.ts electron/__tests__/features/apps/runtime electron/__tests__/features/vcs/git-runner.test.ts electron/__tests__/features/editor/lsp-config-routing.test.ts electron/__tests__/features/editor/lsp-process.test.ts electron/__tests__/features/doctor/checks.test.ts electron/__tests__/features/doctor/runner.test.ts`
  - Result: 45 files passed, 239 tests passed.
- `pnpm --filter @sero/desktop typecheck` — **pass**.
- `pnpm typecheck` — **pass**; 15/15 Turbo tasks successful.
- Static checks — **pass/reviewed**:
  - no changed source file exceeds 500 LOC;
  - `rg 'RUNTIME_CAPABILITIES\[' apps packages plugins` has no matches;
  - `mac-host` matches are deprecated compatibility references, tests, or historical docs/plans.
- Docker live image smoke — **pass**.
  - Docker version: 29.4.1.
  - Docker image: `sha256:ea34799768cc4cb51beb031b0521bc69bfeaf677f47f5239e07abd2c9ceffa9d`, created `2026-05-11T09:34:42.268732468Z`.
  - Covered arbitrary UID/GID workspace write, `/ms-playwright` Chromium/ffmpeg lookup, Chromium headless screenshot, `agent-browser` launch/screenshot/close.
- Apple Container live image smoke — **pass**.
  - Apple Container image: `ghcr.io/sero-labs/sero-node:latest` digest prefix `7d5ae62ada12bf5a692e80e7...`.
  - Covered arbitrary UID/GID workspace write, `/ms-playwright` Chromium/ffmpeg lookup, Chromium headless screenshot, `agent-browser` launch/screenshot/close.
- Host direct dependency smoke on this macOS machine — **pass**.
  - `bash`, `git`, `node`, `python3`, `pgrep`, and `lsof` are available.

### Remaining manual / in-app smoke

The only remaining checks require an interactive Sero desktop session or another OS:

1. In-app `runPr177BackendSmoke("docker")`, `runPr177BackendSmoke("host")`, and `runPr177BackendSmoke("apple-container")` from section 4.
2. Temporary-plugin managed dev-server smoke from section 5 for Docker, Host, and Apple Container.
3. Browser tool smoke through Sero chat from section 6 for Docker and Apple Container.
4. Backend switch/reset smoke in the running app from section 7.
5. Windows/WSL host smoke from section 8 on a Windows machine.
