# Host-first runtime manual test — Windows x64

Use this guide to validate Sero on Windows x64. Windows arm64 is future/unsupported until it has runner, browser-pack, package, and workflow gates. This guide is written for a first-time Sero tester and covers:

- Native Windows Host runtime, the recommended local runtime.
- Docker Desktop Linux-container runtime as an optional fallback/upgrade.
- Managed host tools, browser automation pack, file operations, terminals, Git Bash behavior, dev servers, and native-build fallback behavior.

> Host mode is not a sandbox. Use Docker when you need isolation, Linux parity, preinstalled browser automation, or native build toolchains.

## Pass/fail record

Copy this block into your test notes before you start.

```text
Tester:
Date:
Windows version/build:
CPU/arch: x64
Sero commit:
Node version:
pnpm version:
Git for Windows version:
Docker Desktop version:
Workspace path:
Host runtime: pass/fail/not run
Docker runtime: pass/fail/not run
Browser pack: pass/fail/not run
Notes:
```

## 1. Install prerequisites

### 1.1 Install source-development tools

These tools are for running Sero from source. They are separate from Sero-managed host runtime tools.

1. Install **Git for Windows** from the official Git website.
   - Include Git Bash.
   - Allow Git to be available from PowerShell.
2. Install **Node.js 22 x64** from the official Node.js website.
3. Open PowerShell and install pnpm 10.33.4:

   ```powershell
   npm install -g pnpm@10.33.4
   ```

4. Install native build prerequisites for running Sero from source:
   - Visual Studio Build Tools with **Desktop development with C++**.
   - Windows 10/11 SDK.
   - Python 3 if your Node/native module setup requires it.

   These are source-development prerequisites. Sero must not auto-install Visual Studio Build Tools or compiler stacks for host runtime users.

Verify in PowerShell:

```powershell
git --version
node --version
pnpm --version
```

Expected: Node reports `v22...` and pnpm reports `10.33.4`.

### 1.2 Install Docker Desktop

Docker is optional for normal host-mode use, but install it for this full test.

1. Install Docker Desktop for Windows.
2. Enable Linux containers.
3. Start Docker Desktop.
4. Verify in PowerShell:

   ```powershell
   docker version
   ```

## 2. Get and start Sero

From PowerShell:

```powershell
mkdir $HOME\Projects -ErrorAction SilentlyContinue
cd $HOME\Projects
git clone <SERO_REPOSITORY_URL> sero
cd sero
pnpm install
pnpm typecheck
```

Start Sero normally; Host is the default on this supported platform:

```powershell
Get-Process vite,electron -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

Expected: the Sero desktop window opens.

## 3. First-time Sero setup

1. Create a profile when prompted.
2. If you want to test agent-driven actions, add a model/provider API key in Sero settings. Runtime checks below can still be run with the built-in terminal and DevTools.
3. Create a disposable workspace at a normal Windows path, for example:

   ```text
   C:\Users\<you>\Projects\sero-host-first-windows-smoke
   ```

   Avoid WSL paths such as `\\wsl$\...` for this Windows host test.

4. Open Developer Tools with `Ctrl` + `Shift` + `I`.
5. In the DevTools Console, capture the workspace:

   ```js
   const ws = (await window.sero.workspace.list()).find((workspace) => workspace.id !== "global");
   ws;
   ```

## 4. Host runtime tests

### 4.1 Select Host

In the Sero UI, open the workspace runtime picker and choose **Host (recommended)**. Or run:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

Expected:

- Host is current/recommended.
- Docker is described as an optional upgrade/fallback, not a required default.
- Apple Container is not offered on Windows.
- Host execution is native Windows plus a verified Git Bash/MSYS-compatible shell. It must not silently switch to WSL, PowerShell, or cmd for workspace shell execution.

### 4.2 Check runtime diagnostics

Open Runtime settings or run:

```js
await window.sero.workspace.getRuntimeDiagnostics();
```

Expected:

- The selected backend is `host`.
- Core tools are `ready`, `installing`, `missing`, or `failed` with install/retry detail.
- Browser automation is `installable` when the published Windows x64 browser-pack artifact exists and is absent locally, then `ready` only after install and launch checks. If the Windows x64 artifact is still pending in `generated-artifacts.json`, this is release-blocking and should show unavailable/non-installable with container fallback.
- Native build tools are informational only. Sero must not claim it will install Visual Studio Build Tools, MSVC, Windows SDK, or compiler stacks as managed tools.

### 4.3 Verify managed tool storage

If Sero installs managed tools, they must be under:

```text
%USERPROFILE%\.sero-ui\toolchains\<manifest-version>\
```

Expected:

- Sero does not use `%USERPROFILE%\.pi\agent` for Sero runtime tools.
- Sero does not edit your PowerShell profile, Git Bash profile, global PATH, Corepack state, or npm global prefix.

### 4.4 Terminal, shell, Git, and paths

Open a Sero terminal for the workspace and run:

```bash
pwd
git status --short
node --version
pnpm --version
printf 'host windows ok\n' > host-windows-smoke.txt
cat host-windows-smoke.txt
```

Expected:

- The terminal uses a Bash/MSYS-compatible shell.
- Commands execute against the real Windows workspace path.
- Git, Node, and pnpm run from compatible system tools or Sero-managed tools.
- The file appears in File Explorer at the workspace path.

Test Windows path behavior from DevTools:

```js
await window.sero.editor.createFile(ws.id, "/workspace/windows-alias-smoke.txt");
await window.sero.editor.writeFile(ws.id, "/workspace/windows-alias-smoke.txt", "alias ok");
await window.sero.editor.readFile(ws.id, "/workspace/windows-alias-smoke.txt");
```

Expected: `/workspace` is accepted as a Sero compatibility alias and maps to the real Windows workspace. Sero must not require a real `C:\workspace` directory.

### 4.5 Editor and file operations

In the Sero file tree:

1. Create `manual-host-file.txt`.
2. Add text and save it.
3. Rename it to `manual-host-file-renamed.txt`.
4. Delete it.

Expected: each operation is reflected immediately in File Explorer and stays inside the workspace.

### 4.6 Git and language features

1. Open or create a JavaScript/TypeScript file.
2. Wait for diagnostics/completion to initialize.
3. Run in the Sero terminal:

   ```bash
   git status --short
   git diff --stat
   ```

Expected: Git and language features run against the Windows host workspace.

### 4.7 Managed dev server and preview

Create a tiny app in the workspace from the Sero terminal:

```bash
cat > package.json <<'JSON'
{"scripts":{"dev":"vite --host 127.0.0.1"},"dependencies":{"@vitejs/plugin-react":"latest","vite":"latest","typescript":"latest","react":"latest","react-dom":"latest"},"devDependencies":{}}
JSON
cat > index.html <<'HTML'
<div id="root">Sero Windows host smoke</div><script type="module" src="/src/main.jsx"></script>
HTML
mkdir -p src
cat > src/main.jsx <<'JS'
document.getElementById('root').textContent = 'Sero Windows host preview works';
JS
pnpm install
pnpm dev
```

Expected:

- Sero detects or lets you open the dev server preview at `http://127.0.0.1:<port>`.
- Stopping the terminal stops the dev server.
- No WSL path is involved.

### 4.8 Browser automation pack on Host

Windows x64 host browser automation is a release-supported target only after the Windows x64 GitHub Release artifact is published and verified. Do not use a local artifact override as the supported path. Windows arm64 remains future/unsupported.

1. Run the release publication gate from the repo root:

   ```bash
   pnpm --filter @sero/desktop browser-pack:verify-published
   ```

2. Open Runtime settings.
3. Confirm browser automation is shown as `installable`, not ready, when the published Windows x64 pack is absent locally. If metadata is still pending, record this as a release blocker and use Docker Desktop for browser automation.
4. Click install for the browser automation pack when the published artifact is available.
5. Watch progress until complete.
6. Confirm files are under `%USERPROFILE%\.sero-ui\toolchains\<manifest-version>\browser\` and `.installed` exists.
7. Re-run diagnostics.
8. Trigger browser automation from the agent/tooling, for example by asking for a browser screenshot of a local preview.
9. Uninstall the browser pack from Runtime settings.

Expected:

- Windows x64 host browser automation is not claimed unless `browser-pack:verify-published` and the `release` workflow pass.
- Duplicate install clicks attach to the same in-flight install.
- Browser automation becomes ready only after install and launch checks pass.
- Uninstall returns the state to installable when a published artifact remains available.

For rebuilding/debugging the current-platform pack, use the local artifact smoke in [`../../runtime-smoke.md`](../../runtime-smoke.md#local-host-browser-pack-artifact-smoke), adapted for PowerShell/Git Bash paths. That flow is a developer diagnostic only.

## 5. Docker runtime tests

### 5.1 Select Docker

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
```

Expected:

- Docker becomes current.
- Apple Container is not offered on Windows.
- Docker is optional and selectable; it is not silently selected just because Docker Desktop is installed.

### 5.2 Command, mount, terminal

In the Sero terminal:

```bash
pwd
uname -s
printf 'windows docker ok\n' > /workspace/windows-docker-smoke.txt
cat /workspace/windows-docker-smoke.txt
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- The file appears at `C:\Users\<you>\Projects\sero-host-first-windows-smoke\windows-docker-smoke.txt`.
- The file can be edited/deleted from File Explorer or VS Code without permission errors.

From PowerShell:

```powershell
Set-Content -Path "C:\Users\<you>\Projects\sero-host-first-windows-smoke\host-created.txt" -Value "windows host edit visible"
```

In Sero terminal:

```bash
cat /workspace/host-created.txt
```

Expected: the container sees the Windows-created file without a manual sync.

### 5.3 Additional root mapping

Create another Windows folder in PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path "C:\Users\<you>\Projects\sero-extra-root" | Out-Null
Set-Content -Path "C:\Users\<you>\Projects\sero-extra-root\source.txt" -Value "extra root ok"
```

In DevTools:

```js
const root = await window.sero.workspace.addRoot(ws.id, {
  name: "Windows Extra Root",
  path: "C:\\Users\\<you>\\Projects\\sero-extra-root",
});
await window.sero.editor.readFile(ws.id, `/${root.id}/source.txt`);
await window.sero.workspace.removeRoot(ws.id, root.id);
```

Expected:

- Read returns `extra root ok`.
- Docker maps the Windows path correctly into Linux; it must not pass a malformed `C:\...` path inside Linux.

Cleanup:

```powershell
Remove-Item -Recurse -Force "C:\Users\<you>\Projects\sero-extra-root"
```

### 5.4 Git, LSP, dev server, browser

Repeat Host sections 4.6 and 4.7 with Docker selected.

Expected differences:

- Commands run inside Linux at `/workspace`.
- Browser automation is preinstalled in the container image; it must not require the host browser pack.
- Preview URL exposed to Windows is `http://127.0.0.1:<hostPort>`.

Optional Docker check from PowerShell:

```powershell
docker ps --filter "label=ai.sero.managed=true"
```

## 6. Native-build fallback check

On Host, trigger a Sero-owned install/build that fails with native build requirements, or use a project known to require `node-gyp`/compiler tools.

Expected:

- Sero reports `NATIVE_BUILD_TOOLS_REQUIRED` or equivalent native-build metadata.
- Sero does not auto-install Visual Studio Build Tools, MSVC, Windows SDK, Python, or compiler stacks as managed tools.
- The UI offers platform install instructions or a switch/setup path for Docker fallback.

## 7. Cleanup

From PowerShell:

```powershell
Get-Process vite,electron -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force "C:\Users\<you>\Projects\sero-host-first-windows-smoke" -ErrorAction SilentlyContinue
```

Optional cleanup:

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.sero-ui\toolchains" -ErrorAction SilentlyContinue
```

Only remove `.sero-ui\toolchains` if you intentionally want the next test to reinstall managed tools/browser assets.

## 8. Final pass criteria

Mark the Windows run as pass only if:

- Host runtime works with real Windows paths and `/workspace` remains only a compatibility alias.
- Host terminal uses a verified Git Bash/MSYS-compatible shell, not WSL/PowerShell/cmd as the workspace shell.
- Managed tool and browser pack states are visible and actionable.
- Docker works as an optional container runtime with correct Windows-to-Linux path mapping.
- Browser automation works in Docker and works on Host after published browser pack install, or reports the pending artifact as release-blocking without claiming support.
- Native build failures point to OS tools or container fallback, not Sero-managed compiler installs.
