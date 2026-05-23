# Runtime manual test checklist

Manual checklist for validating local runtime behavior. Use canonical backend IDs `host`, `docker`, and `apple-container`. The old `mac-host` value is a deprecated compatibility alias only.

Host mode is the default runtime for new workspaces on release-supported Host platforms. Existing persisted workspace runtime selections remain authoritative. `SERO_HOST_FIRST` was migration scaffolding and no longer changes defaults. See [`host-mode-support.md`](./host-mode-support.md) for the platform/arch support table and release gates.

## Prep

Start Sero from the branch under test:

```bash
pkill -f "vite"; pkill -f "electron"
pnpm install
pnpm dev
```

Open DevTools in the desktop app, then pick a non-global disposable workspace:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
ws;
```

## 1. Host runtime smoke

Run this section on:

- macOS: workspace under `/Users/<you>/...`, backend `host`.
- Linux: workspace under `/home/<you>/...`, backend `host`.
- Windows x64: workspace under `C:\Users\<you>\...`, backend `host`.

Switch the workspace to host:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

### 1.1 Defaults and diagnostics

In DevTools:

```js
await window.sero.workspace.getRuntimeDiagnostics?.();
```

Expected:

- Host is shown as selected for the workspace.
- Capability state includes core tools, browser automation, and native build tools install state.
- Browser automation is `installable`, `installing`, `missing`, `failed`, or `ready`; it is ready only after browser pack install and Doctor launch success. Release-supported platforms must use published GitHub Release artifacts; any pending platform in `generated-artifacts.json` is a release blocker.
- Native build tools are informational (`available`, `missing`, or `unknown`), not Sero-managed.

### 1.2 Path policy and file operations

Host execution uses the real host workspace path. `/workspace` is a Sero compatibility alias only.

From an agent/runtime command path, run host-cwd-relative shell commands:

```bash
pwd
printf 'host-relative-ok\n' > host-relative-smoke.txt
cat host-relative-smoke.txt
```

Then test the `/workspace` compatibility alias through Sero file/runtime APIs, not direct host shell redirection:

```js
await window.sero.editor.createFile(ws.id, "/workspace/host-alias-smoke.txt");
await window.sero.editor.writeFile(ws.id, "/workspace/host-alias-smoke.txt", "host-alias-ok\n");
await window.sero.editor.readFile(ws.id, "/workspace/host-alias-smoke.txt");
```

Expected:

- Shell commands execute in the real host workspace cwd and should use relative paths from that cwd.
- `/workspace/...` works through Sero compatibility translation where supported by the runtime/file API.
- No real host `/workspace` mount/symlink is required.
- Both files appear in the host workspace and can be edited/deleted from the host.

Test additional roots using a platform-native temp path.

macOS/Linux:

```bash
mkdir -p /tmp/sero-extra-root-smoke
echo "hello from extra root" > /tmp/sero-extra-root-smoke/source.txt
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\sero-extra-root-smoke"
Set-Content "$env:TEMP\sero-extra-root-smoke\source.txt" "hello from extra root"
```

In DevTools, use the created native path:

```js
const root = await window.sero.workspace.addRoot(ws.id, {
  name: "Extra Smoke",
  path: "<NATIVE_TEMP_PATH>",
});

await window.sero.editor.listFiles(ws.id, `/${root.id}`);
await window.sero.editor.readFile(ws.id, `/${root.id}/source.txt`);
await window.sero.editor.createFile(ws.id, `/${root.id}/created.txt`);
await window.sero.editor.writeFile(ws.id, `/${root.id}/created.txt`, "created through Sero");
await window.sero.editor.rename(ws.id, `/${root.id}/created.txt`, `/${root.id}/renamed.txt`);
await window.sero.editor.readFile(ws.id, `/${root.id}/renamed.txt`);
await window.sero.editor.delete(ws.id, `/${root.id}/renamed.txt`);
await window.sero.workspace.removeRoot(ws.id, root.id);
```

Expected: list/read/write/rename/delete all operate inside the configured root and reject escapes.

### 1.3 Shell, Git, package manager, and terminal

Run:

```bash
git status --short
node --version
pnpm --version
```

Expected:

- Compatible system tools are used when available; otherwise managed tools install under `~/.sero-ui/toolchains/<manifest-version>/`.
- Sero does not mutate global PATH, shell profiles, Corepack, or npm global prefix.
- Windows launches a verified Bash/MSYS-compatible shell for shell commands/terminals. It should not default to WSL, PowerShell, or cmd for host workspace execution.

Open an interactive terminal for the workspace. Expected: it starts in the workspace with resolver-prepared environment.

### 1.4 LSP

Open a TypeScript or JavaScript file and wait for language features to initialize.

Expected: diagnostics/completions are available when required runtime tools are ready or installable remediation has completed.

### 1.5 Managed dev server and preview URL

Use the smoke plugin from section 4 below or any workspace app path that calls `ctx.host.devServers.startManaged()`.

Expected:

- start returns a `serverId`, detected `port`, and `url` shaped like `http://127.0.0.1:<port>`.
- server listing includes the server.
- stop and restart operate on the same server id.
- preview resolves to the localhost URL.

### 1.6 Browser automation pack

With backend `host`, use the published manifest for release-supported platform testing. Use a locally served current-platform pack only as a developer diagnostic/rebuild path.

To build and serve a local pack:

```bash
pnpm --filter @sero/desktop browser-pack:build -- \
  --platform $(node -p "process.platform") \
  --arch $(node -p "process.arch") \
  --url-base http://127.0.0.1:8787/browser-pack/2026-05-16

pnpm --filter @sero/desktop browser-pack:smoke -- \
  --pack-root dist/browser-pack/work/browser-$(node -p "process.platform")-$(node -p "process.arch")/browser \
  --platform $(node -p "process.platform") \
  --arch $(node -p "process.arch")

python3 -m http.server 8787 --directory apps/desktop/dist
```

Then start Sero in another terminal:

```bash
SERO_BROWSER_PACK_BASE_URL=http://127.0.0.1:8787/browser-pack/2026-05-16 \
pnpm dev
```

Validation flow:

1. Confirm diagnostics show browser automation as `installable` when a published pack is available but absent. Pending or unsupported targets should show `missing`/non-installable; pending release-supported targets block release.
2. Trigger install from Runtime settings/onboarding or by first browser tool use only when a published/local pack is available.
3. Confirm progress is visible and duplicate install actions attach to the same in-flight install.
4. Confirm installed files live under `~/.sero-ui/toolchains/<manifest-version>/browser/` and `.installed` exists.
5. Confirm the installed browser root contains Chromium, ffmpeg, and pack-local `agent-browser/bin/agent-browser` (or `agent-browser.cmd` on Windows). Do not install `agent-browser` globally.
6. Run browser automation only after Doctor reports the browser pack launchable. A basic prompt is: `Use automation_browser to launch about:blank, take a screenshot, then close the browser.`
7. On Linux, verify missing shared-library launch failures produce OS instruction/container fallback detail. Doctor owns this remediation; browser-pack build/install does not manage compiler stacks or host shared libraries.
8. Test uninstall from Runtime settings and confirm state returns to `installable`.

Local archives stay in `apps/desktop/dist/browser-pack/2026-05-16/<slug>.tar.gz` and are not committed. Generated digest metadata is committed at `apps/desktop/electron/features/workspace/runtime/browser-pack/generated-artifacts.json`. Do not treat local artifact success as release support. Release support requires `pnpm --filter @sero/desktop browser-pack:verify-published` and the `release` workflow to pass.

## 2. Container runtime smoke

Run against `docker`/Podman on macOS, Linux, and Windows, and `apple-container` on supported Apple Silicon Macs.

Switch backend:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
// or: await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
```

Checklist:

1. Run `pwd && uname -s`; expect `/workspace` and `Linux`.
2. Create a runtime file and confirm it appears in the host editor/filesystem.
3. Create a host file and confirm runtime `cat` sees it immediately.
4. Open terminal; expect cwd `/workspace`.
5. Run Git status/diff and auth-backed read-only GitHub flow if available.
6. Start managed dev server and verify preview URL is `http://127.0.0.1:<hostPort>`.
7. Run browser automation. Expected: preinstalled browser support without host browser pack.
8. Run Environment Doctor and verify missing/stopped daemon, image, mount, permission, and port failures are actionable.

## 3. Native build fallback

On host, trigger or simulate a Sero-owned dependency install/build/LSP setup failure with native build signatures (`node-gyp`, missing `make`, `gcc`, `clang`, Python for node-gyp, Xcode CLT, MSVC Build Tools).

Expected:

- Sero surfaces `NATIVE_BUILD_TOOLS_REQUIRED` metadata.
- No compiler stack is auto-installed.
- UI offers platform install instructions and container fallback/setup actions.
- Switching this workspace to Docker/Podman or Apple Container allows retry where the image provides required build dependencies.

## 4. Runtime-managed dev server listing plugin

This test can run against `host`, `docker`, or `apple-container`. It validates `host.devServers.startManaged()` → `host.devServers.list()`.

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
      if (serverId) await ctx.host.devServers.stop(serverId).catch(() => false);
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

Inspect the state file:

```bash
cat "<WORKSPACE_PATH>/.sero/apps/runtime-smoke/state.json"
```

Expected shape includes:

```json
{
  "foundInList": true,
  "started": {
    "url": "http://127.0.0.1:..."
  }
}
```

Open `started.url` and confirm the Python directory listing loads.

Cleanup:

```bash
pkill -f "vite"; pkill -f "electron"
rm -rf plugins/sero-runtime-smoke-plugin
pnpm dev
```

## 5. Apple Container mutation failures

Requires Apple Container available.

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
await window.sero.editor.rename(ws.id, "/workspace/__sero_missing_file__", "/workspace/__sero_should_not_exist__");
```

Expected: `false`.

Then test failed `mkdir`:

```js
await window.sero.editor.createFile(ws.id, "/workspace/__sero_file_not_dir__");
await window.sero.editor.createDir(ws.id, "/workspace/__sero_file_not_dir__/child");
await window.sero.editor.delete(ws.id, "/workspace/__sero_file_not_dir__");
```

Expected: failed directory creation returns `false`; logs contain warnings for failed operations, not silent success.
