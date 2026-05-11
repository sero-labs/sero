# PR 177 Runtime Reliability Fix Plan

**Date:** 2026-05-11  
**Scope:** Fix review findings for PR #177 (`feat(desktop): add provider-aware workspace runtimes`).  
**Primary goal:** Preserve the provider-neutral runtime architecture while removing silent host fallbacks, stale runtime state, and brittle WSL/Docker behavior.

## Context

PR #177 adds a provider-aware workspace runtime layer with `host`, `docker`, and `apple-container` backends. Review found that the architecture is directionally correct, but several reliability seams still route through legacy container code or expose capabilities that are not actually implemented.

This plan is intended to be implementable in a fresh session. Read these files first:

- `apps/desktop/electron/features/workspace/runtime/types.ts`
- `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts`
- `apps/desktop/electron/features/workspace/runtime/run-workspace-command.ts`
- `apps/desktop/electron/features/workspace/runtime/start-managed-dev-server.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/*`
- `apps/desktop/electron/features/workspace/runtime/backends/docker/*`
- `apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts`
- `apps/desktop/electron/features/doctor/engine/*`
- `apps/desktop/electron/features/container/tools/tools-browser-agent.ts`

## Non-goals

- Do not add remote/cloud/OpenShell runtime surfaces.
- Do not redesign the whole runtime model beyond the fixes below.
- Do not implement full file watching for Docker or Apple Container in this pass; advertise it correctly as unsupported.
- Do not make Windows host runtime execute through PowerShell/cmd. Windows host execution remains WSL-backed.

## Cross-cutting constraints

- Keep all source files under 500 LOC.
- No `any`, `@ts-ignore`, or `@ts-expect-error` unless unavoidable with an explanatory comment.
- Prefer top-level imports; no inline `import('...')` type expressions.
- Do not use `localStorage`/`sessionStorage`.
- Use exact runtime backend ids: `host`, `docker`, `apple-container`.
- Selected Docker/Apple runtimes must not silently fall back to host execution.
- Use argv-form execution (`runtime.execFile`) where possible for internal commands.
- Keep tests platform-safe: WSL/Docker behavior should be testable with mocks on macOS/Linux CI.

---

## Architecture decisions for these fixes

### A1. `runtimeManager` is the execution source of truth

Any workspace execution path that receives a `workspaceId` must use `runtimeManager.getRuntime(workspaceId)` rather than `resolveWorkspaceRuntime()` + `containerManager`. `resolveWorkspaceRuntime()` can continue to power legacy diagnostics/UX, but it must not decide command execution for provider-aware runtimes.

### A2. Runtime backend changes are reset operations

Changing a workspace backend is an explicit runtime reset. Existing cached backends, terminals, dev servers, and container processes for that workspace must be destroyed or invalidated before the new backend is used. Do not keep an old Docker/Apple container alive when the workspace is switched to `host`.

### A3. Managed dev-server success is a running server with a usable URL

A start operation that cannot detect a port must be a failure to callers. Do not return `{ port: 0, url: '' }` as a successful start. If the process is still alive after a failed detection, terminate it or clearly surface that it was left running for logs.

### A4. Capabilities must describe implemented behavior

If a backend method throws “not implemented”, the capability must be `false`. Do not use one “full capabilities” object for all container runtimes if their implementations differ.

### A5. Docker doctor must be lightweight/cancellable by default

The registered Doctor check should not pull/build images or start long-running probes that outlive the Doctor timeout. Heavy smoke tests can remain as explicit/manual helpers, but the default check must be bounded and abort-aware.

---

## Task 1 — Route workspace command execution through `runtimeManager`

### What

Replace legacy command execution in `run-workspace-command.ts` with provider-neutral runtime execution. This prevents Docker-selected workspaces from being treated as “container unavailable” and silently running commands on the host.

### Files

- `apps/desktop/electron/features/workspace/runtime/run-workspace-command.ts`
- `apps/desktop/electron/features/workspace/runtime/runtime-paths.ts`
- `apps/desktop/electron/__tests__/features/workspace/runtime/run-workspace-command.test.ts`
- Any tests under `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts` if they assert old behavior.

### Implementation details

1. Remove direct imports of:
   - `containerManager`
   - `buildWorkspaceContainerConfig`
   - `resolveWorkspaceRuntime`
   - `toWorkspaceContainerPath`
2. Import `runtimeManager` and `toRuntimeWorkspacePath`.
3. Resolve the backend using:
   ```ts
   const runtime = await runtimeManager.getRuntime(workspaceId);
   ```
4. Convert `cwd` from host path to runtime path with `toRuntimeWorkspacePath(workspacePath, cwd)`.
   - If `cwd` is outside the workspace root, return exit code `1` with a clear message.
   - Keep this behavior consistent with the old container path helper.
5. Execute through:
   ```ts
   return runtime.exec({ command, cwd: runtimeCwd, timeoutMs });
   ```
6. Do not inspect legacy container state and do not host-fallback when `docker`/`apple-container` is selected.

### Example shape

```ts
const runtime = await runtimeManager.getRuntime(workspaceId);
const runtimeCwd = toRuntimeWorkspacePath(workspacePath, cwd);
if (!runtimeCwd) {
  return { stdout: '', stderr: `Cannot run command outside workspace root: ${cwd}`, exitCode: 1 };
}
return runtime.exec({ command, cwd: runtimeCwd, timeoutMs });
```

### Tests

Update `run-workspace-command.test.ts` to assert:

- Host backend calls `runtime.exec()` with `/workspace` cwd.
- Docker backend calls `runtime.exec()` and never calls `containerManager.ensure()`.
- Outside-root cwd returns exit code `1`.
- Runtime errors are converted to `{ stdout: '', stderr, exitCode: 1 }` if the old public contract requires non-throwing results.

---

## Task 2 — Reset runtime state on backend changes

### What

Ensure switching backend destroys any cached/running backend for the workspace before the new backend is resolved. This fixes stale Docker/Apple containers and dev servers remaining alive after switching to host.

### Files

- `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts`
- `apps/desktop/electron/ipc/workspace/workspace.ts`
- `apps/desktop/electron/features/workspace/container-sync.ts`
- `apps/desktop/electron/__tests__/ipc/workspace-runtime-reconcile.test.ts`
- `apps/desktop/electron/__tests__/ipc/runtime-boundaries.test.ts`
- Add/update a focused runtime-manager test if needed.

### Implementation details

1. Add a dedicated method to `RuntimeManager`, for example:
   ```ts
   async resetWorkspaceRuntime(workspaceId: string): Promise<void> {
     await this.destroy(workspaceId);
   }
   ```
   It may be a thin wrapper today, but the name makes backend-change intent explicit.
2. In `setRuntimeBackend` IPC, reset before persisting the new backend:
   ```ts
   await runtimeManager.resetWorkspaceRuntime(id);
   await workspaceManager.setRuntimeBackend(id, backend);
   ```
3. Do not call `recreateContainerIfRunning(id)` after a backend change. Recreate logic is for mount/reference mutations on an existing backend, not backend swaps.
4. Keep `recreateContainerIfRunning()` for references/mounts/roots, but do not use it for backend swaps.
5. For active terminals, backend switching is a user-requested reset. It is acceptable to terminate runtime terminals; make sure tests and notifications reflect that.

### Acceptance criteria

- Switching Docker → host calls runtime destruction for old Docker backend.
- Switching Apple Container → host calls runtime destruction for old Apple backend.
- Switching host → Docker does not leave a cached host backend as the active runtime.
- Mount/reference mutations still recreate non-host runtimes when no active sessions exist.

---

## Task 3 — Add execution-side PID support for WSL processes

### What

Fix WSL dev-server detection by exposing the Linux PID inside WSL rather than using the Windows `wsl.exe` PID.

### Files

- `apps/desktop/electron/features/workspace/runtime/types.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-substrate.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/posix-substrate.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/wsl-substrate.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/windows-drive-substrate.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-dev-server-manager.ts`
- `apps/desktop/electron/__tests__/features/workspace/runtime/wsl-substrate.test.ts`
- `apps/desktop/electron/__tests__/features/workspace/runtime/host-dev-server-manager.test.ts`

### Implementation details

1. Extend `RuntimeProcess` with an optional execution PID:
   ```ts
   export interface RuntimeProcess {
     pid?: number;              // local host process PID, e.g. wsl.exe on Windows
     executionPid?: number;     // process PID in the runtime/substrate namespace
     ...
   }
   ```
2. Add a substrate method such as:
   ```ts
   resolveExecutionPid?(child: ChildProcess, rendered: HostSubstrateRendered): Promise<number | undefined>;
   ```
3. POSIX substrate returns `child.pid`.
4. WSL substrate reads `rendered.innerPidFile` with a short retry loop because the file may not exist immediately after spawn.
   - Retry for roughly 1 second with small sleeps.
   - Normalize CRLF.
   - Return `undefined` if unavailable; do not throw from generic spawn.
5. `HostBackend.spawn()` awaits the substrate execution PID before returning the `RuntimeProcess`:
   ```ts
   const executionPid = await this.substrate.resolveExecutionPid?.(child, rendered);
   return { pid: child.pid, executionPid, ... };
   ```
6. `HostDevServerManager.start()` uses:
   ```ts
   const pid = process.executionPid ?? process.pid;
   ```
   for `pgrep`/`lsof` detection.
7. Keep the existing WSL signal fallback, but make it resilient if `innerPidFile` is missing or already deleted.

### Tests

- WSL substrate returns an execution PID from the pidfile.
- Host dev-server detection uses `executionPid` when present.
- Host dev-server detection falls back to `pid` for POSIX.

---

## Task 4 — Make host dev-server failures fail, and emit runtime dev-server events

### What

Ensure failed host dev-server starts are not treated as successful starts. Also surface runtime-managed dev-server registration/stop/restart events through `RuntimeManager.onDevServerChange()`.

### Files

- `apps/desktop/electron/features/workspace/runtime/types.ts`
- `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts`
- `apps/desktop/electron/features/workspace/runtime/start-managed-dev-server.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-dev-server-manager.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts`
- Relevant tests under `apps/desktop/electron/__tests__/features/workspace/runtime/` and `apps/desktop/electron/__tests__/ipc/`.

### Implementation details

1. Add a shared runtime dev-server event type:
   ```ts
   export interface RuntimeDevServerChangeEvent {
     type: 'registered' | 'unregistered' | 'status_changed';
     workspaceId: string;
     serverId?: string;
     server?: RuntimeDevServer & { workspaceId: string };
     status?: 'running' | 'stopped' | 'starting' | 'failed';
   }
   ```
2. Add an optional backend method:
   ```ts
   onDevServerChange?(cb: (event: RuntimeDevServerChangeEvent) => void): () => void;
   ```
3. `RuntimeManager` should:
   - Subscribe to `backend.onDevServerChange` when a backend is created.
   - Re-emit those events to its own subscribers.
   - Continue forwarding legacy `containerManager.devServers.onChange()` while legacy registry remains.
   - Unsubscribe when a backend is destroyed.
4. `HostDevServerManager.start()` should throw on port-detection failure rather than returning a failed success result.
   - Terminate the spawned process with `SIGTERM` before throwing.
   - Include diagnostic text: `No listening port was detected after starting the command.`
5. `startManagedDevServer()` should defensively check all returned servers:
   ```ts
   if (server.status === 'failed' || !server.port || !server.url) {
     return { reason: server.diagnosticCode ?? 'Managed dev server failed to start.' };
   }
   ```
6. Docker and Apple backends should emit `registered` after `registerServer`, `unregistered` after stop, and `status_changed`/`registered` after restart.

### Tests

- Host start timeout returns a `reason`, not `{ url: '', port: 0 }`.
- Failed host start terminates the spawned process.
- RuntimeManager subscribers receive events for host, Docker, and Apple dev-server registration/stop.
- Existing legacy container dev-server events still flow through RuntimeManager.

---

## Task 5 — Fix WSL file-read buffering and host doctor dependency checks

### What

Make WSL file reads work for files larger than Node’s default `execFile` buffer and add doctor checks for commands required by host runtime features.

### Files

- `apps/desktop/electron/features/workspace/runtime/backends/host/wsl-substrate.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-doctor.ts`
- `apps/desktop/electron/__tests__/features/workspace/runtime/wsl-substrate.test.ts`
- `apps/desktop/electron/__tests__/features/workspace/runtime/host-doctor.test.ts`

### Implementation details

1. Replace WSL `readFile()` use of `execFile()` + default buffer with a streaming implementation.
   - Prefer `spawn('wsl.exe', args)` and collect stdout chunks as `Buffer`s.
   - Use `cat -- <path>` or `base64 -w0 -- <path>`; if using base64, decode after streaming.
   - Collect stderr separately and reject on non-zero exit.
2. If a max read limit exists elsewhere in Sero, honor it. If not, do not introduce a small limit that breaks existing file reads.
3. Add host doctor checks:
   - POSIX host: `bash`, `git`, `pgrep`, `lsof`.
   - Windows/WSL host: `wsl.exe`, WSL status, WSL `bash`, WSL `pgrep`, WSL `lsof`.
   - WSL file watching: `inotifywait` should be a warning unless file watching is required by an active feature.
4. Include remediation details in failed/warn doctor results.

### Tests

- WSL `readFile()` can read a mocked stdout larger than 1 MiB.
- WSL read rejects with stderr on non-zero exit.
- Host doctor includes `pgrep`/`lsof` checks.
- WSL doctor includes `inotifywait` warning/fail behavior as decided above.

---

## Task 6 — Correct runtime capability declarations

### What

Remove capability drift where Docker and Apple Container advertise file watching even though their methods throw.

### Files

- `apps/desktop/electron/features/workspace/runtime/capabilities.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts`
- `apps/desktop/electron/__tests__/features/workspace/runtime/runtime-types.test.ts`

### Implementation details

1. Replace `createFullCapabilities()` with backend-specific builders, for example:
   - `createDockerCapabilities()` — `files.watch: false`.
   - `createAppleContainerCapabilities()` — `files.watch: false` until implemented.
   - `createHostCapabilities(platform)` — keep `files.watch: true` only where implemented.
2. Keep browser automation container-only:
   - Docker: `browserAutomation: true`.
   - Apple Container: confirm current browser automation support; if unsupported by implementation, set false.
   - Host: `browserAutomation: false`.
3. Add tests that assert each advertised capability matches implemented behavior.

### Acceptance criteria

- No backend advertises `files.watch: true` while `watchFiles()` throws “not implemented”.
- Runtime picker/diagnostics still render correctly from the updated capabilities.

---

## Task 7 — Fix Docker Playwright browser installation and resolution

### What

Make Docker browser automation reliable when containers run as arbitrary non-root host UID/GID.

### Files

- `apps/desktop/images/Dockerfile.sero-node`
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-lifecycle.ts`
- `apps/desktop/electron/features/container/tools/tools-browser-agent.ts`
- Tests for browser resolver if they exist; otherwise add a focused unit test for resolver command/path behavior.

### Implementation details

1. In the Dockerfile, install Playwright browsers into a shared path:
   ```dockerfile
   ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
   RUN mkdir -p /ms-playwright && \
       npm install -g agent-browser && \
       npx -y playwright@1.57.0 install --with-deps chromium ffmpeg && \
       chmod -R a+rX /ms-playwright
   ```
2. Keep `/tmp/sero-home` writable for arbitrary UIDs.
3. In `runtimeEnvArgs()`, include:
   ```ts
   PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright'
   ```
4. Update browser executable resolver to check:
   - `$PLAYWRIGHT_BROWSERS_PATH/chromium-...`
   - `/ms-playwright/chromium-...`
   - `$HOME/.cache/ms-playwright/chromium-...`
   - existing distro/browser paths.
5. Update ffmpeg resolver similarly to include `$PLAYWRIGHT_BROWSERS_PATH` and `$HOME/.cache/ms-playwright`.
6. If fallback install runs, it should install to the same shared path when possible, or the resolver must find the fallback `$HOME` location.

### Tests / validation

- Unit test resolver command includes `/ms-playwright` and `$HOME/.cache/ms-playwright`.
- Rebuild `sero-node:latest` after Dockerfile changes before manual Docker smoke.
- Manual Docker browser smoke: launch, screenshot, recording path.

---

## Task 8 — Make Docker CLI resolution and Doctor checks bounded/cancellable

### What

Improve Docker reliability in packaged Electron environments and prevent Docker doctor work from timing out while continuing in the background.

### Files

- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-cli.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-doctor.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-image.ts`
- `apps/desktop/electron/features/doctor/engine/checks/runtime-docker.ts`
- `apps/desktop/electron/features/doctor/engine/runner.ts` if adding per-check timeout support.
- `apps/desktop/electron/__tests__/features/workspace/runtime/docker-doctor.test.ts`
- `apps/desktop/electron/__tests__/features/workspace/runtime/docker-backend.test.ts`

### Implementation details

#### Docker binary/path

1. Add centralized Docker executable/path handling in `docker-cli.ts`.
2. Prefer explicit override if present:
   - `SERO_DOCKER_BIN` or `DOCKER_BIN`.
3. Otherwise call `docker` with an augmented PATH containing at least:
   - Existing `process.env.PATH`
   - `/usr/local/bin`
   - `/opt/homebrew/bin`
   - `/usr/bin`
   - `/bin`
   - Docker Desktop CLI locations if present.
4. Use the same resolution/env for `runDocker()` and `spawnDocker()`.

#### Abort/cancellation

1. Extend `DockerRunOptions`:
   ```ts
   export interface DockerRunOptions {
     signal?: AbortSignal;
     ...
   }
   ```
2. Pass `signal` to `execFile` and `spawn` where supported.
3. Normalize abort errors to a clear result, e.g. exit code `130` or `124` with `Command aborted.`.
4. Thread `signal` through Docker doctor checks.

#### Doctor scope

Use a conservative default Doctor check:

1. The registered `runtime.docker` check should run bounded checks only:
   - Docker CLI version.
   - Docker daemon reachable.
   - Image local availability via `docker image inspect` only.
2. Do not pull/build images from the registered Doctor check.
3. Keep bind mount/network/port smoke checks as explicit helper functions for manual smoke or runtime-specific diagnostics if needed, but do not let them run under the 3s default check unless the Doctor runner supports a longer cancellable timeout.
4. If adding per-check timeout support to Doctor, also account for the full global budget (`FULL_BUDGET_MS`) so the check is not globally cut off at 10s while Docker work continues.

### Tests

- `runDocker()` uses augmented PATH.
- `spawnDocker()` uses augmented PATH.
- Aborted Docker command resolves/stops without continuing background work.
- Registered Docker Doctor check does not call `docker pull`, `docker build`, or long `docker run` smoke probes.
- Docker Doctor returns bounded results when Docker is missing.

---

## Task 9 — Regression and manual validation

### Required automated checks

Run from repo root unless noted:

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
  electron/__tests__/ipc/workspace-runtime-reconcile.test.ts
```

Also run:

```bash
pnpm typecheck
```

### Required static checks

```bash
# No touched source file above project limit.
git diff --name-only origin/main...HEAD | rg '\.(ts|tsx)$' | xargs wc -l | sort -nr | head -30

# No stale direct capability indexing.
rg 'RUNTIME_CAPABILITIES\[' apps packages plugins

# No new stale Mac Host user-facing copy, except deprecated compatibility tests/types.
rg -i 'mac host|mac-host' apps packages plugins docs
```

### Manual smoke checks

1. **Host macOS/Linux**
   - Select Host runtime.
   - Run plugin workspace command through app runtime; confirm it executes in `/workspace` mapping and not stale container code.
   - Start managed dev server; confirm a valid URL is returned.

2. **Windows WSL host**
   - Use a Windows-drive workspace and a WSL UNC workspace.
   - Start a managed dev server.
   - Confirm port detection succeeds using the WSL execution PID.
   - Confirm localhost-forwarding diagnostic appears only when probing fails.
   - Read a file larger than 1 MiB through runtime file read.

3. **Docker**
   - Rebuild `sero-node:latest` after Dockerfile changes.
   - Select Docker runtime.
   - Run workspace command through app runtime; confirm it executes inside Docker.
   - Start/stop managed dev server and confirm RuntimeManager emits events.
   - Launch browser automation and take a screenshot.
   - Run Docker Doctor from packaged-like environment with a restricted PATH.

4. **Apple Container**
   - Select Apple Container runtime on Apple Silicon.
   - Start/stop managed dev server and confirm RuntimeManager emits events.
   - Confirm unsupported file-watch capability is not advertised.

---

## Suggested implementation order

1. Task 1 — runtime command seam.
2. Task 2 — backend reset semantics.
3. Task 3 — WSL execution PID.
4. Task 4 — dev-server failure semantics and events.
5. Task 5 — WSL read/doctor checks.
6. Task 6 — capability correction.
7. Task 7 — Docker Playwright runtime image fix.
8. Task 8 — Docker CLI/Doctor reliability.
9. Task 9 — full validation.

This order fixes the highest-risk silent-misrouting issues first, then hardens WSL/Docker reliability, then cleans up advertised capabilities and validation.
