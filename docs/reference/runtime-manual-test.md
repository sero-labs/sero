# Runtime Manual Test Checklist

Concrete manual steps for validating the runtime fixes in PR #177.

## Prep

Start Sero from the PR branch:

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

## 2. Additional roots under Mac Host runtime

Create an external test folder:

```bash
mkdir -p /tmp/sero-extra-root-smoke
echo "hello from extra root" > /tmp/sero-extra-root-smoke/source.txt
```

In DevTools:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "mac-host");

const root = await window.sero.workspace.addRoot(ws.id, {
  name: "Extra Smoke",
  path: "/tmp/sero-extra-root-smoke",
});

root;
```

Use the returned `root.id`:

```js
await window.sero.editor.listFiles(ws.id, `/${root.id}`);
```

Expected: includes `source.txt`.

Now test file operations:

```js
await window.sero.editor.readFile(ws.id, `/${root.id}/source.txt`);
```

Expected:

```js
"hello from extra root\n"
```

Create/write/read:

```js
await window.sero.editor.createFile(ws.id, `/${root.id}/created.txt`);

await window.sero.editor.writeFile(
  ws.id,
  `/${root.id}/created.txt`,
  "created through Sero"
);

await window.sero.editor.readFile(ws.id, `/${root.id}/created.txt`);
```

Expected:

```js
"created through Sero"
```

Rename/delete:

```js
await window.sero.editor.rename(
  ws.id,
  `/${root.id}/created.txt`,
  `/${root.id}/renamed.txt`
);

await window.sero.editor.readFile(ws.id, `/${root.id}/renamed.txt`);

await window.sero.editor.delete(ws.id, `/${root.id}/renamed.txt`);
```

Expected:

- rename returns `true`
- read returns `"created through Sero"`
- delete returns `true`

Cleanup:

```js
await window.sero.workspace.removeRoot(ws.id, root.id);
```

```bash
rm -rf /tmp/sero-extra-root-smoke
```

---

## 3. Runtime-managed dev server listing

This test must run against a container runtime (`docker` or `apple-container`). `mac-host` intentionally does not support managed dev servers, so `started.reason` will be `Managed dev servers are not available for mac-host runtime.` if you use a Mac Host workspace.

In DevTools, switch the target workspace to Docker or Apple Container first:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
// or, on Apple Silicon if Apple Container is available:
// await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
```

This test needs a tiny temporary app-runtime plugin because the fixed path is `host.devServers.startManaged()` → `host.devServers.list()`.

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
      "command": "python3 -m http.server 0"
    }
  ],
  "foundInList": true
}
```

The key assertion is:

```json
"foundInList": true
```

Cleanup:

```bash
pkill -f "vite"; pkill -f "electron"
rm -rf plugins/sero-runtime-smoke-plugin
```

Then restart normally:

```bash
pnpm dev
```
