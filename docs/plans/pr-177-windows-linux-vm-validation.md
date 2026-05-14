# PR #177 Windows/Linux VM validation

Use this checklist to validate PR #177 in fresh Parallels Windows and Linux VMs.

## Runtime scope

- **Windows VM:** Docker Desktop runtime only.
- **Linux VM:** Docker Engine runtime and direct Host runtime.

Windows Host mode / WSL-backed Host execution is deprecated for PR #177. Do not validate or claim WSL path translation, WSLENV propagation, mixed-distro rejection, WSL-native workspaces, or WSL localhost-forwarding diagnostics for this PR. Apple Container is macOS-only and is not part of this VM pass.

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

   On Windows, use Task Manager/PowerShell cleanup if needed, then start the renderer and Electron from Windows PowerShell.

## Windows 11 VM smoke — Docker Desktop only

### Setup

1. Install Git, Node.js LTS, Docker Desktop, and Visual Studio Build Tools as needed.
2. Reboot after installation.
3. Open a new non-admin PowerShell.
4. Enable the repo-pinned pnpm version:

   ```powershell
   corepack enable
   corepack prepare pnpm@10.11.0 --activate
   pnpm --version
   ```

5. Start Docker Desktop with Linux containers enabled.
6. Clone/run the repo inside the Windows filesystem, for example `C:\Users\<you>\Dev\sero`. Avoid Parallels shared folders for this smoke.
7. Create a disposable Windows workspace, for example `C:\Users\<you>\Projects\sero-pr177-win`.

Expected runtime picker behavior on Windows: Docker is available; Host is not offered for workspace execution.

### Docker runtime checks

In Sero DevTools:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
```

Ask the agent or use an available runtime command path to run:

```text
pwd && uname -s && command -v bash && command -v git && command -v node && command -v python3
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- Basic runtime tools are present.

File parity:

1. From the runtime, write `docker-ok` to `/workspace/pr177-docker-runtime.txt`.
2. Confirm the file appears in Windows Explorer and can be edited/deleted from Windows.
3. Create `host-file.txt` from Windows and confirm `cat /workspace/host-file.txt` sees it inside Docker.

Terminal:

- Open a workspace terminal.
- Confirm it starts at `/workspace` and runs Linux commands.

Managed dev server / preview:

- Start a simple Vite/Python/Node HTTP server through the managed dev-server path.
- Confirm preview URL is `http://127.0.0.1:<hostPort>`.
- Stop and restart the dev server.
- Repeat with a second workspace and confirm host ports differ.

Browser automation:

- Launch browser automation in the Docker runtime.
- Take a screenshot.
- Start and stop a short recording.
- Confirm the `.webm` exists and plays in Sero Explorer and outside Sero.

Doctor failure text:

- Temporarily stop Docker Desktop.
- Run Environment Doctor / runtime diagnostics.
- Expected: failure explains Docker is unavailable/stopped and gives actionable remediation.
- Restart Docker Desktop after this check.

## Linux VM smoke

### Docker Engine runtime

1. Install Docker Engine and ensure the current user can run Docker without `sudo`.
2. Select Docker for a disposable Linux workspace.
3. Run the same Docker checks from the Windows section.

Expected Linux Docker specifics:

- The Sero container runs as the host UID/GID.
- Runtime-created files can be edited and deleted by the host user without `sudo`.

### Direct Host runtime

In DevTools:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

Ask the agent:

```text
Run: pwd && uname -s && command -v bash && command -v git && command -v node && command -v python3. Then write host-ok to /workspace/pr177-host-runtime.txt and read it back.
```

Expected:

- Commands execute directly on the Linux host.
- File changes are visible from both Sero and the host filesystem.
- Git status/diff work in a Git workspace.
- LSP initializes if the language server is installed in the host environment.
- Managed dev-server preview URL is `http://127.0.0.1:<port>`.
- Host runtime does **not** expose browser automation.

## Workspace/session regression smoke

Run once on each VM after creating at least one session in a non-global workspace.

1. Create a new disposable workspace.
2. Create or auto-create a session in that workspace.
3. Send a short message so the session is visible.
4. Delete/close/remove the workspace from the sidebar.
5. Inspect the Global workspace session list.

Expected:

- The deleted workspace's session does **not** appear under Global.
- If the workspace folder still exists, the session remains associated with the workspace id from `.sero-workspace.json`.
- If the folder/config is gone, the session is detached rather than re-homed to Global.

## Pass/fail criteria

A Windows VM run passes when:

- automated baseline tests and desktop typecheck pass,
- Docker runtime passes file parity, terminal, preview, Doctor, and browser recording checks,
- Host runtime is not offered/used on Windows,
- deleted workspace sessions do not appear under Global.

A Linux VM run passes when:

- automated baseline tests and desktop typecheck pass,
- Docker runtime passes file parity, terminal, preview, Doctor, and browser recording checks,
- Host runtime passes file parity, exec, terminal, Git, LSP, and preview checks,
- deleted workspace sessions do not appear under Global.

Capture failures with exact prompt/DevTools command, runtime backend, workspace path, OS/Docker versions, logs, and screenshots/video if UI behavior is involved.
