# PR #177 Manual Test — Windows

Use this checklist on Windows with Docker Desktop Linux containers. Windows Host / WSL-backed Host is intentionally **not supported** for PR #177.

## Pass/fail record

```text
Tester:
Date:
Windows version/build:
CPU/arch:
Sero commit:
Docker Desktop version:
Docker Engine version:
Runtime image/tag:
Workspace path:
Docker: pass/fail/not run
Host absent: pass/fail
Notes:
```

## 0. Prep

In PowerShell from repo root:

```powershell
git status --short --branch
pnpm install
pnpm typecheck
Get-Process vite,electron -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

Create/open a disposable workspace on a normal Windows path, for example:

```text
C:\Users\<you>\Projects\sero-pr177-windows-smoke
```

Avoid WSL paths (`\\wsl$\...`) for this PR's Windows gate.

In DevTools:

```js
const ws = (await window.sero.workspace.list()).find((w) => w.id !== "global");
ws;
```

## 1. Docker Desktop prerequisites

1. Start Docker Desktop.
2. Confirm Linux containers are enabled.
3. In PowerShell:

```powershell
docker version
docker image inspect ghcr.io/sero-labs/sero-node:latest --format '{{.Id}} {{.Created}}'
```

Expected: Docker commands work from the Windows environment Sero is launched from.

## 2. Runtime picker UX and Windows gating

1. Open the workspace runtime picker.
2. Confirm Docker is the only runtime choice.
3. Confirm Host is not shown.
4. Confirm Apple Container is not shown.
5. Confirm there is no `mac-host`, WSL Host, or Windows Host wording.
6. Hover Docker and confirm obvious border/background feedback.
7. Confirm current runtime is marked `Current`.
8. Click `Open Environment Doctor`; confirm the Doctor dialog opens.

Expected: Windows users cannot select Host from the UI.

## 3. Switch/confirm Docker runtime

In DevTools:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
```

Expected: runtime picker shows Docker as current.

If an old config had Host selected, Sero should normalize/fall back to Docker on Windows before execution.

## 4. Command, path mapping, and live mount

From Sero terminal/agent:

```bash
pwd
uname -s
printf 'windows-docker-ok\n' > /workspace/windows-docker-smoke.txt
cat /workspace/windows-docker-smoke.txt
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- File appears at `C:\Users\<you>\Projects\sero-pr177-windows-smoke\windows-docker-smoke.txt`.
- File can be edited/deleted from Windows Explorer/VS Code without permission errors.

From Windows PowerShell:

```powershell
Set-Content -Path "C:\Users\<you>\Projects\sero-pr177-windows-smoke\host-created.txt" -Value "windows host edit visible"
```

In Sero terminal:

```bash
cat /workspace/host-created.txt
```

Expected: prints `windows host edit visible`.

## 5. Additional roots and Windows path mapping

Create an additional root in PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path "C:\Users\<you>\Projects\sero-pr177-extra-root" | Out-Null
Set-Content -Path "C:\Users\<you>\Projects\sero-pr177-extra-root\source.txt" -Value "extra root ok"
```

In DevTools:

```js
const root = await window.sero.workspace.addRoot(ws.id, {
  name: "Windows Extra Root",
  path: "C:\\Users\\<you>\\Projects\\sero-pr177-extra-root",
});
await window.sero.editor.readFile(ws.id, `/${root.id}/source.txt`);
```

Expected:

- Read returns `extra root ok` with Windows newline behavior acceptable.
- Docker bind target maps the Windows path through the runtime identity mount path, not a malformed `C:\...` path inside Linux.
- Editor open/reveal for files under the extra root resolves correctly.

Cleanup DevTools:

```js
await window.sero.workspace.removeRoot(ws.id, root.id);
```

PowerShell cleanup:

```powershell
Remove-Item -Recurse -Force "C:\Users\<you>\Projects\sero-pr177-extra-root"
```

## 6. Terminal, Git, and LSP

From Sero terminal:

```bash
git status --short
git diff --stat
```

Then open a TypeScript/JavaScript file.

Expected:

- Terminal starts in `/workspace`.
- Git commands run inside Docker and operate on the mounted Windows workspace.
- LSP initializes without waiting on legacy Apple Container state.

## 7. Managed dev server and preview

Use the runtime-managed smoke plugin in [`docs/reference/runtime-manual-test.md`](../runtime-manual-test.md#3-runtime-managed-dev-server-listing-plugin) with backend `docker`.

Do not use a raw terminal-only server for this gate. A command started manually in a terminal is not a managed dev server and will not be registered in the Sero dev-server panel. For Docker Desktop, `http://127.0.0.1:5173` on Windows is also not expected to work unless Sero has forwarded that container port.

Expected from the managed smoke plugin:

- `started.serverId` is present in `.sero/apps/runtime-smoke/state.json`.
- `foundInList` is `true`.
- `started.url` is `http://127.0.0.1:<hostPort>`.
- Opening `started.url` loads in the Windows desktop app/browser.
- Stop/restart works from the dev-server panel.
- Starting a second workspace uses a different host port.

## 8. Browser automation

Use one path deliberately: visible Sero Browser panel via `sero-cli` browser commands, or hidden runtime automation via the `automation_browser` tool. Do not expect `automation_browser` tool actions to create visible Sero Browser tabs.

Expected:

- Chromium launches from the Docker runtime image.
- Screenshot/recording works; no missing `ffmpeg` failure.

## 9. Doctor negative checks

Run Environment Doctor with Docker Desktop running. Expected: Docker checks pass or give actionable non-blocking warnings.

Then stop Docker Desktop and run a quick Doctor check again.

Expected:

- Docker unavailable/stopped is reported clearly.
- The app does not fall back to Windows Host execution.

Restart Docker Desktop before continuing normal use.

## 10. Explicit non-goals to verify

These should all be true:

- No Host runtime option in picker.
- No WSL Host setup instructions in Windows UI.
- `await window.sero.workspace.setRuntimeBackend(ws.id, "host")` should not lead to host command execution on Windows; it should be rejected or normalized to Docker by runtime config validation.

## 11. Cleanup

PowerShell:

```powershell
Get-Process vite,electron -ErrorAction SilentlyContinue | Stop-Process -Force
docker ps -a --filter "label=ai.sero.managed=true"
# Remove only disposable smoke containers if desired:
# docker rm -f <container-id>
```
