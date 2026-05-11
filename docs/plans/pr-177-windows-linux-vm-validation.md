# PR #177 Windows/Linux VM validation

Use this checklist to validate PR #177 in fresh Parallels Windows and Linux VMs. It focuses on the runtimes available on those platforms:

- **Windows VM:** Docker Desktop runtime and Host runtime through WSL 2.
- **Linux VM:** Docker Engine runtime and direct Host runtime.

Apple Container is macOS-only and is not part of this VM pass.

## Validation record

Create one copy of this table per VM/run.

| Field | Value |
| --- | --- |
| PR/branch | `feat/docker-runtime` / PR #177 |
| Sero commit |  |
| OS/version |  |
| CPU architecture |  |
| VM product/version | Parallels  |
| Node version |  |
| pnpm version |  |
| Docker version |  |
| Docker image used | `ghcr.io/sero-labs/sero-node:<tag>` |
| Windows WSL distro/version | Windows only |
| Workspace path(s) tested |  |
| Result | Pass / Fail |
| Notes/screenshots/logs |  |

## Prep on each VM

1. Install repo dependencies from the repo root:

   ```bash
   pnpm install
   ```

2. Confirm the branch and image-related files are current:

   ```bash
   git status --short
   git rev-parse --short HEAD
   ```

3. Run baseline validation before manual smoke:

   ```bash
   pnpm --filter @sero/desktop exec vitest run \
     electron/__tests__/features/workspace/runtime/docker-backend.test.ts \
     electron/__tests__/features/workspace/runtime/docker-doctor.test.ts \
     electron/__tests__/features/workspace/runtime/host-backend.test.ts \
     electron/__tests__/features/workspace/runtime/host-substrate-factory.test.ts \
     electron/__tests__/features/workspace/runtime/wsl-paths.test.ts \
     electron/__tests__/features/container/tools-browser-agent.test.ts \
     electron/__tests__/ipc/session-workspace-resolution.test.ts

   pnpm --filter @sero/desktop typecheck
   ```

4. Start Sero from the branch:

   ```bash
   pkill -f "vite" || true
   pkill -f "electron" || true
   pnpm dev
   ```

   On Windows, use the equivalent Task Manager/PowerShell cleanup if needed, then run `pnpm dev` from the repo root.

5. Open DevTools in Sero and keep this helper handy:

   ```js
   const workspaces = await window.sero.workspace.list();
   workspaces;
   ```

## Windows 11 Parallels VM quick path

Use this section for the Windows #8 smoke. It is intentionally prescriptive: run Sero from **Windows PowerShell**, use **Ubuntu in WSL 2** only as the Host runtime execution substrate, and use **Docker Desktop Linux containers** for Docker runtime.

### 1. Recommended install order

Run PowerShell as Administrator for the install commands.

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Docker.DockerDesktop -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
wsl --install -d Ubuntu
```

Reboot Windows after WSL/Docker/Build Tools installation.

Notes:

- Prefer cloning/running the repo inside the Windows VM filesystem, for example `C:\Users\<you>\Dev\sero`. Avoid Parallels shared folders for this smoke; they add file watching, symlink, and path edge cases unrelated to PR #177.
- Enable Windows Developer Mode if pnpm reports symlink permission issues: open `ms-settings:developers` and turn on **Developer Mode**.
- The repo currently pins `pnpm@10.11.0`. If you installed pnpm 11 globally, let Corepack activate the repo-pinned version instead of debugging pnpm-version noise.

### 2. Pin pnpm to the repo version

Open a **new non-admin PowerShell after reboot**. First verify that Node, npm, and pnpm are all visible to normal child processes:

```powershell
where.exe node
where.exe npm
where.exe pnpm
node --version
npm --version
```

If `where.exe node` or `where.exe npm` fails, pnpm install will fail later with errors like `'node' is not recognized` from packages such as `esbuild` or `sharp`. Fix PATH before running `pnpm install`:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$env:Path = "$machinePath;$userPath"
where.exe node
where.exe npm
```

If Node is installed at `C:\Program Files\nodejs` but still not visible in the current shell, restart PowerShell or temporarily add it:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
where.exe node
where.exe npm
```

Then enable the repo-pinned pnpm version:

```powershell
corepack enable
corepack prepare pnpm@10.11.0 --activate
pnpm --version
```

Expected:

```text
10.11.0
```

If `pnpm --version` still prints `11.x`, use Corepack explicitly from the repo root:

```powershell
corepack pnpm@10.11.0 install
corepack pnpm@10.11.0 --filter @sero/desktop typecheck
```

If you already ran `pnpm install` while `node` was missing, remove the partial install after fixing PATH:

```powershell
Get-Process node,pnpm -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps\desktop\node_modules -ErrorAction SilentlyContinue
pnpm install
```

### 2.1 Native rebuild troubleshooting on Windows ARM64

For PR #177 runtime smoke, you do **not** need to compile Sero's optional native desktop modules. The container/host runtime work does not depend on locally rebuilding `node-pty` or `better-sqlite3`.

If `pnpm install` reaches the root `postinstall` and fails rebuilding `node-pty` with `gyp ERR! find Python`, use the smoke-test shortcut first:

```powershell
cd C:\Users\<you>\dev\sero
Get-Process node,pnpm -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps\desktop\node_modules -ErrorAction SilentlyContinue
$env:SERO_SKIP_NATIVE_REBUILD = "1"
pnpm install
pnpm --filter @sero/desktop typecheck
pnpm dev
```

This skips only Sero's root native-rebuild verification scripts. Package install scripts for Electron, esbuild, sharp, etc. still run. The trade-off is that integrated terminals and memory-search native checks may be unavailable in that Windows dev checkout. That is acceptable for the PR #177 backend smoke unless you are specifically validating Sero's terminal native module on Windows.

Only install Python + Visual Studio C++ Build Tools if you specifically want full native desktop-module validation on Windows ARM64:

```powershell
winget install --id Python.Python.3.12 -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.ARM64 --includeRecommended"
```

Close PowerShell, open a new PowerShell, then verify:

```powershell
where.exe python
python --version
where.exe node
node --version
```

Point npm/node-gyp at the Python executable discovered by PowerShell:

```powershell
$py = (Get-Command python).Source
npm config set python $py
$env:PYTHON = $py
```

Then clean the failed native install and retry without the skip flag:

```powershell
cd C:\Users\<you>\dev\sero
Get-Process node,pnpm -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps\desktop\node_modules -ErrorAction SilentlyContinue
Remove-Item Env:SERO_SKIP_NATIVE_REBUILD -ErrorAction SilentlyContinue
pnpm install
```

If Python was installed but `python --version` prints nothing or node-gyp says the version is empty, disable the Windows Store Python aliases in **Settings → Apps → Advanced app settings → App execution aliases**, then reopen PowerShell and retry the verification commands.

### 3. Prepare WSL for Host runtime

Open Ubuntu from the Start menu, create a Linux user, then run:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git build-essential python3 python3-pip
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
command -v bash git node python3
node --version
python3 --version
```

Back in PowerShell, verify Windows can see the WSL distro:

```powershell
wsl --status
wsl --list --verbose
wsl -d Ubuntu -e sh -lc "uname -a && command -v bash && command -v git && command -v node && command -v python3"
```

Expected:

- Ubuntu shows `VERSION` 2 in `wsl --list --verbose`.
- `bash`, `git`, `node`, and `python3` all resolve inside Ubuntu.

### 4. Prepare Docker Desktop

1. Start Docker Desktop.
2. Settings → General: ensure **Use the WSL 2 based engine** is enabled.
3. Settings → Resources → WSL Integration: enable integration for Ubuntu.
4. Confirm Docker uses Linux containers.

PowerShell checks:

```powershell
docker version
docker run --rm hello-world
docker run --rm ghcr.io/sero-labs/sero-node:latest sh -lc "uname -s && command -v node && test -d /ms-playwright && test -r /ms-playwright"
```

Expected: all commands pass. If the last command fails because `/ms-playwright` is missing, remove the stale image and let Sero pull/rebuild it:

```powershell
docker rm -f $(docker ps -aq --filter "name=sero-") 2>$null
docker rmi ghcr.io/sero-labs/sero-node:latest
```

### 5. Clone and start Sero from Windows PowerShell

```powershell
mkdir $env:USERPROFILE\Dev -Force
cd $env:USERPROFILE\Dev
git clone https://github.com/sero-labs/sero.git
cd sero
git checkout feat/docker-runtime
git pull
git config --global core.longpaths true
$env:SERO_SKIP_NATIVE_REBUILD = "1"
pnpm install
pnpm --filter @sero/desktop typecheck
```

Do **not** use root `pnpm dev` for this Windows smoke. It calls `bash scripts/dev.sh`; on Windows, `bash` may resolve to WSL's `bash.exe` and fail if no distro is installed, or run in the wrong environment. Start the renderer and Electron manually from two PowerShell windows instead.

PowerShell window 1 — renderer/Vite:

```powershell
cd C:\Users\<you>\Dev\sero
pnpm --dir apps\desktop dev:renderer
```

PowerShell window 2 — Electron main process:

```powershell
cd C:\Users\<you>\Dev\sero
pnpm --dir apps\desktop build:electron
$env:NODE_ENV = "development"
pnpm --dir apps\desktop exec electron .
```

If a previous dev server is stuck:

```powershell
Get-Process electron,vite,node -ErrorAction SilentlyContinue | Stop-Process -Force
```

Then restart the two-window flow above.

### 6. Create the Windows smoke workspaces

Create these two folders before opening Sero:

PowerShell:

```powershell
mkdir $env:USERPROFILE\Projects\sero-pr177-win-drive -Force
```

Ubuntu/WSL:

```bash
mkdir -p ~/sero-pr177-wsl-native
```

In Sero:

1. Add/open `C:\Users\<you>\Projects\sero-pr177-win-drive`.
2. Later, add/open `\\wsl.localhost\Ubuntu\home\<you>\sero-pr177-wsl-native`.

Start with the Windows-drive workspace. It is the easiest path and validates the important Windows-drive → WSL `/mnt/c/...` execution bridge. Use the WSL-native workspace as a second pass if time allows.

### 7. Windows paths to test

Test in this order:

1. **Windows drive workspace**
   - Example: `C:\Users\<you>\Projects\sero-pr177-win-drive`
   - Docker runtime bind-mounts this path into `/workspace`.
   - Host runtime executes through WSL as `/mnt/c/Users/<you>/Projects/sero-pr177-win-drive`.

2. **WSL-native workspace**
   - Example: `\\wsl.localhost\Ubuntu\home\<you>\sero-pr177-wsl-native`
   - Host runtime executes inside Ubuntu.

Do not mix multiple WSL distros in one workspace. A workspace rooted in Ubuntu plus an additional root in Debian should be rejected.

## Linux VM setup

### Required software

- A current Ubuntu/Debian/Fedora-style desktop VM is sufficient.
- Docker Engine installed and running.
- Current user can run Docker without `sudo`.
- Git, Node, pnpm, Python 3, and bash available.

Run:

```bash
uname -a
command -v bash git node pnpm python3 docker
docker version
docker run --rm hello-world
```

Expected: Docker runs successfully as the current user.

## Runtime smoke A: Docker runtime

Run this on both Windows and Linux.

### A1. Select Docker

Create a disposable workspace in Sero, then in DevTools:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
await window.sero.workspace.getConfig(ws.id);
```

Expected: config/runtime reports backend `docker`.

### A2. Runtime identity and file parity

Ask the agent in that workspace:

```text
Run: pwd && uname -s && id && node --version && python3 --version. Then create /workspace/pr177-docker-runtime.txt containing docker-ok and read it back.
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- file is created and read back as `docker-ok`.
- file appears in the host filesystem and can be edited/deleted without permission errors.

From the host, edit the file to `host-edit-ok`, then ask the agent:

```text
Read /workspace/pr177-docker-runtime.txt and report the contents.
```

Expected: agent sees `host-edit-ok` immediately.

### A3. Terminal

Open an interactive terminal for the workspace.

Expected:

- terminal starts in `/workspace`.
- `pwd`, `ls`, and `cat pr177-docker-runtime.txt` work.

### A4. Managed dev server and preview

In the workspace, create a minimal web app if needed:

```bash
printf '<h1>PR177 Docker Preview</h1>' > index.html
python3 -m http.server 5177 --bind 0.0.0.0
```

Use Sero's managed dev-server path if available from the UI/plugin flow. Otherwise, use the existing runtime-managed smoke plugin steps in `docs/reference/runtime-manual-test.md` section 3.

Expected:

- detected preview URL is `http://127.0.0.1:<hostPort>`.
- the page loads from Windows/Linux browser and Sero preview.
- stop/restart keeps working.
- two Docker workspaces get different host ports.

### A5. Browser automation and recording

Ask the agent:

```text
Use the browser tool in this workspace. Launch https://example.com, take a screenshot, start recording to /workspace/pr177-browser-smoke.webm, wait 2 seconds, stop recording, then close the browser. Report the screenshot result and whether /workspace/pr177-browser-smoke.webm exists.
```

Expected:

- If VM networking is available, the screenshot captures `example.com`.
- If external networking fails, the browser tool reports the navigation failure, resets to `about:blank`, and still completes later actions without poisoning the session.
- `/workspace/pr177-browser-smoke.webm` exists.
- Open the `.webm` in Sero Explorer and outside Sero; it should play.

### A6. Doctor failure text

Temporarily stop Docker and run Environment Doctor / runtime diagnostics.

Expected: failure explains Docker is unavailable/stopped and gives actionable remediation. Restart Docker after this check.

## Runtime smoke B: Host runtime

Run on Linux directly. Run on Windows through WSL 2.

### B1. Select Host

In DevTools:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
await window.sero.workspace.getConfig(ws.id);
```

Expected: backend is `host`. The deprecated `mac-host` label should not appear as a selectable runtime.

### B2. Exec identity

Ask the agent:

```text
Run: pwd && uname -s && command -v bash && command -v git && command -v node && command -v python3. Then write host-ok to /workspace/pr177-host-runtime.txt and read it back.
```

Expected:

- `pwd` is the runtime workspace path presented as `/workspace` where Sero exposes it.
- Linux VM: commands execute directly on Linux host.
- Windows VM: commands execute inside WSL, not PowerShell/cmd.
- file appears in the underlying host workspace and remains editable from the host.

### B3. Windows-specific host path checks

For a Windows drive workspace:

- Expected execution path maps to `/mnt/<drive>/...` inside WSL.
- Editing from Windows Explorer is visible to host runtime commands.

For a WSL-native workspace:

- Expected execution happens inside the selected distro.
- File operations should not bounce through Windows text/binary conversions.

Optional mixed-distro rejection check:

1. Create/open a workspace under `\\wsl.localhost\Ubuntu\home\<you>\sero-pr177-ubuntu`.
2. Try adding an additional root under `\\wsl.localhost\Debian\home\<you>\sero-pr177-debian`.

Expected: Sero rejects mixed WSL distros with a clear error.

### B4. Git/VCS

In a Git workspace, ask the agent:

```text
Run git status --short and git diff --stat. Do not commit anything.
```

Expected:

- command runs in the selected host runtime.
- Windows: Git runs inside WSL and auth/env propagation does not produce unexpected prompts for read-only commands.

### B5. LSP

Open a TypeScript/JavaScript file in the workspace.

Expected:

- diagnostics/completion initialize if dependencies are installed.
- Windows: language server runs through WSL.
- no stale host-vs-runtime path diagnostics.

### B6. Managed dev server and preview

Start a simple server through the agent or managed dev-server UI path:

```text
Create index.html with PR177 Host Preview, start python3 -m http.server 5177 bound to 0.0.0.0, and report the preview URL.
```

Expected:

- preview URL is `http://127.0.0.1:<port>`.
- Linux: host browser and Sero preview can open it.
- Windows/WSL: if localhost forwarding is disabled, Sero reports `wsl-localhost-forwarding-disabled` instead of hanging or giving a misleading container error.

### B7. Browser capability

Expected: Host runtime does **not** expose browser automation. Browser automation should be container-only.

## Workspace/session regression smoke

Run once on each VM after creating at least one session in a non-global workspace.

1. Create a new disposable workspace.
2. Create or auto-create a session in that workspace.
3. Send a short message so the session is visible.
4. Delete/close/remove the workspace from the sidebar.
5. Inspect the Global workspace session list.

Expected:

- the deleted workspace's session does **not** appear under Global.
- if the workspace folder still exists, the session remains associated with the workspace id from `.sero-workspace.json`.
- if the folder/config is gone, the session is detached rather than re-homed to Global.

## Pass/fail criteria

A VM run passes when:

- automated baseline tests and desktop typecheck pass,
- Docker runtime passes file parity, terminal, preview, doctor, and browser recording checks,
- Host runtime passes file parity, exec, terminal, Git, LSP, and preview checks,
- Windows Host runtime clearly uses WSL 2 and handles Windows-drive and/or WSL-native paths as expected,
- deleted workspace sessions do not appear under Global,
- no source/runtime behavior requires manual prompt hacks or environment-specific instructions to recover from normal runtime failures.

Capture failures with:

- exact prompt or DevTools command,
- runtime backend,
- workspace path,
- OS/WSL/Docker versions,
- `/tmp/sero-electron.log` or platform-equivalent Sero logs,
- screenshots/video if UI behavior is involved.
