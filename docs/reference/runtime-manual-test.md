# Runtime Manual Test Checklist

Manual checklist for validating local runtime behavior. Use the canonical backend IDs `apple-container`, `docker`, and `host`. The old `mac-host` value is a deprecated compatibility alias only; do not choose or document it for new manual tests.

Host runtime aims for practical workspace parity: file operations, exec/spawn, terminal, Git/VCS, language servers, managed dev servers, and preview URLs. Browser automation remains container-only and should be validated on Docker or Apple Container, not on host.

## Prep

Start Sero from the branch under test:

```bash
pkill -f "vite"; pkill -f "electron"
pnpm install
pnpm dev
```

Open DevTools in the desktop app, then pick a non-global workspace:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
ws;
```

Use a disposable workspace when possible.

---

## 1. Apple Container mutation failures

Requires Apple Container available.

In DevTools:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
```

Wait for the runtime switch to complete, then run:

```js
await window.sero.editor.rename(
  ws.id,
  "/workspace/__sero_missing_file__",
  "/workspace/__sero_should_not_exist__"
);
```

Expected:

```js
false
```

Then test failed `mkdir`:

```js
await window.sero.editor.createFile(ws.id, "/workspace/__sero_file_not_dir__");

await window.sero.editor.createDir(
  ws.id,
  "/workspace/__sero_file_not_dir__/child"
);
```

Expected:

```js
false
```

Cleanup:

```js
await window.sero.editor.delete(ws.id, "/workspace/__sero_file_not_dir__");
```

Also check `/tmp/sero-electron.log`; you should see editor warnings for the failed operations, not silent success.

---

## 2. Host runtime smoke checklist

Run this section on each supported host path:

- **macOS host:** workspace path under `/Users/<you>/...`; backend `host`.
- **Linux host:** workspace path under `/home/<you>/...`; backend `host`.

Host runtime is not supported on Windows. Windows uses Docker exclusively.

Switch the workspace to host:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

### 2.1 File operations and additional roots

Create an external test folder using the platform-native shell:

```bash
mkdir -p /tmp/sero-extra-root-smoke
echo "hello from extra root" > /tmp/sero-extra-root-smoke/source.txt
```

In DevTools:

```js
const root = await window.sero.workspace.addRoot(ws.id, {
  name: "Extra Smoke",
  path: "/tmp/sero-extra-root-smoke",
});

root;
```

Use the returned `root.id`:

```js
await window.sero.editor.listFiles(ws.id, `/${root.id}`);
await window.sero.editor.readFile(ws.id, `/${root.id}/source.txt`);
```

Expected: list includes `source.txt`, and read returns `"hello from extra root\n"`.

Create/write/read/rename/delete:

```js
await window.sero.editor.createFile(ws.id, `/${root.id}/created.txt`);

await window.sero.editor.writeFile(
  ws.id,
  `/${root.id}/created.txt`,
  "created through Sero"
);

await window.sero.editor.readFile(ws.id, `/${root.id}/created.txt`);

await window.sero.editor.rename(
  ws.id,
  `/${root.id}/created.txt`,
  `/${root.id}/renamed.txt`
);

await window.sero.editor.readFile(ws.id, `/${root.id}/renamed.txt`);
await window.sero.editor.delete(ws.id, `/${root.id}/renamed.txt`);
```

Expected:

- created read returns `"created through Sero"`
- rename returns `true`
- renamed read returns `"created through Sero"`
- delete returns `true`

Cleanup:

```js
await window.sero.workspace.removeRoot(ws.id, root.id);
```

```bash
rm -rf /tmp/sero-extra-root-smoke
```

### 2.2 Exec and terminal

From an agent or runtime command path, run:

```bash
pwd
printf 'exec-ok\n' > /workspace/host-exec-smoke.txt
cat /workspace/host-exec-smoke.txt
```

Expected:

- `pwd` is `/workspace` from the renderer/runtime perspective.
- `cat` prints `exec-ok`.
- The file appears in the host workspace and can be edited/deleted from the host.

Open an interactive terminal for the workspace.

Expected:

- macOS/Linux: shell starts in the workspace.

### 2.3 Git/VCS

In a Git workspace:

```bash
git status --short
git diff --stat
```

Expected: commands run in the selected host execution environment.

If using GitHub auth, run a read-only GitHub operation already supported by your workspace flow and confirm it does not prompt unexpectedly.

### 2.4 LSP

Open a TypeScript or JavaScript file in the workspace and wait for language features to initialize.

Expected:

- diagnostics/completions are available when the language server is installed in the host execution environment.

### 2.5 Managed dev server and preview URL

Use the smoke plugin from section 3 below with `setRuntimeBackend(ws.id, "host")`, or start a managed dev server from a plugin/app path that calls `ctx.host.devServers.startManaged()`.

Expected:

- start returns a `serverId`, detected `port`, and `url` shaped like `http://127.0.0.1:<port>`.
- `ctx.host.devServers.list(ws.id)` includes the server.
- stop and restart operate on the same server id.
- preview resolves to the localhost URL.

### 2.6 Browser automation expectation

Confirm host runtime does not advertise browser automation. Browser automation smoke should be run on Docker or Apple Container instead.

---

## 3. Runtime-managed dev server listing plugin

This test can run against `docker`, `apple-container`, or `host`. It validates the app-runtime path `host.devServers.startManaged()` → `host.devServers.list()`.

Create a temporary built-in plugin:

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
        before,
        started,
        after,
        foundInList: Boolean(started.serverId && after.some((s) => s.id === started.serverId))
      }));
    },

    async handleStateChange() {},

    async dispose() {
      if (serverId) {
        await ctx.host.devServers.stop(serverId).catch(() => false);
      }
    }
  };
};
JS
```

Switch to the backend being tested:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
// or: await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
// or: await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
```

Restart Sero with the target workspace id:

```bash
pkill -f "vite"; pkill -f "electron"
SERO_RUNTIME_SMOKE_WORKSPACE_ID="<YOUR_WORKSPACE_ID>" pnpm dev
```

Replace `<YOUR_WORKSPACE_ID>` with `ws.id` from DevTools.

After Sero starts, inspect the state file inside the workspace:

```bash
cat "<WORKSPACE_PATH>/.sero/apps/runtime-smoke/state.json"
```

Expected shape:

```json
{
  "workspaceId": "...",
  "started": {
    "serverId": "...",
    "url": "http://127.0.0.1:...",
    "port": 12345
  },
  "after": [
    {
      "id": "...",
      "url": "http://127.0.0.1:...",
      "command": "python3 -m http.server 5177 --bind 0.0.0.0"
    }
  ],
  "foundInList": true
}
```

The key assertion is:

```json
"foundInList": true
```

Open the `started.url` in the app preview or browser and confirm the Python directory listing loads.

Cleanup:

```bash
pkill -f "vite"; pkill -f "electron"
rm -rf plugins/sero-runtime-smoke-plugin
```

Then restart normally:

```bash
pnpm dev
```

---

## 4. Container-only browser automation smoke

Select Docker or Apple Container:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
// or, on supported Apple Silicon:
// await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
```

Run the existing browser automation smoke path for the workspace.

Expected: automation succeeds only when the selected container runtime reports browser automation support. Re-run against `host` only to verify the capability is unavailable and the UI/diagnostic is clear.
