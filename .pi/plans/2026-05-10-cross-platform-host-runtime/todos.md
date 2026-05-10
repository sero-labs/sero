# Todos: Cross-platform Host Runtime

**Tag:** `cross-platform-host-runtime`
**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Spec:** `docs/plans/cross-platform-host-runtime.md`

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-01 — Canonicalize runtime backend id to `host`

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Canonicalized runtime backend/config/defaults to `host`, kept `mac-host` as a deprecated read-time alias normalized on write, updated compatibility shims and targeted tests.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`

### What
Change runtime type/config/defaults so `host` is the canonical non-container backend and `mac-host` is accepted only as a deprecated read-time compatibility alias. This establishes the data model before moving backend behavior.

### Constraints
- Canonical writes must use `host`, never `mac-host`.
- `mac-host` must still load from old config and be normalized to `host` on the next write.
- Add comments wherever `mac-host` is accepted: `// Deprecated compatibility input; normalize to host on write.`
- Keep `isContainerEnabled` as a compatibility helper only, implemented as `runtime.backend !== 'host'`.
- Do not rename implementation files/classes in this todo; that is Todo 03.
- No touched source file may exceed 500 LOC; no `any`, `@ts-ignore`, or inline `import('...')` type expressions.

### Files
- `apps/desktop/src/types/workspace-runtime.ts` — renderer-safe backend union and deprecated alias type.
- `apps/desktop/electron/features/workspace/runtime/types.ts` — main-process backend union and deprecated alias type.
- `apps/desktop/electron/features/workspace/runtime/config.ts` — alias read and canonical write.
- `apps/desktop/electron/features/workspace/runtime/platform-default.ts` — `global` default becomes `host`.
- `apps/desktop/electron/features/workspace/runtime/capabilities.ts` — temporary support for `host` before Todo 08 changes to platform function.
- `apps/desktop/electron/features/workspace/manager.ts` — default global config, migration gating, `isContainerEnabled` shim.
- Tests currently referencing `mac-host` literals: renderer runtime tests and Electron runtime/git/session tests listed in the source spec.

### Expected Outcome
New configs and IPC payloads expose `runtime.backend: 'host'`; stale `.sero-workspace.json` files containing `mac-host` load correctly and rewrite to `host` after save.

### Example
Follow the current `runtime/config.ts` shape, but normalize aliases:

```ts
export type WorkspaceRuntimeBackend = 'apple-container' | 'docker' | 'host';
export type DeprecatedWorkspaceRuntimeBackend = 'mac-host';

type RuntimeBackendInput = WorkspaceRuntimeBackend | DeprecatedWorkspaceRuntimeBackend;

export function isWorkspaceRuntimeBackend(value: unknown): value is RuntimeBackendInput {
  // Deprecated compatibility input; normalize to host on write.
  return value === 'apple-container' || value === 'docker' || value === 'host' || value === 'mac-host';
}

function normalizeBackend(backend: RuntimeBackendInput): WorkspaceRuntimeBackend {
  return backend === 'mac-host' ? 'host' : backend;
}
```

Reference: existing `apps/desktop/electron/features/workspace/runtime/config.ts` and tests under `apps/desktop/electron/__tests__/features/workspace/workspace-runtime-config.test.ts`.

### Acceptance Criteria
- [ ] New writes produce `{ "runtime": { "backend": "host" } }` for host mode.
- [ ] Existing `{ "runtime": { "backend": "mac-host" } }` loads as `host` and is rewritten to `host` by the save/migration path.
- [ ] `getDefaultRuntimeBackend({ workspaceId: 'global' })` returns `host` on every platform.
- [ ] `isContainerEnabled` returns false for both canonical `host` and deprecated loaded `mac-host`.
- [ ] Targeted runtime config/type tests pass.
- [ ] `pnpm --filter @sero/desktop typecheck` passes.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-02 — Add host substrate contract and WSL path utilities

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Added host substrate interfaces plus pure WSL drive/UNC translation, canonicalization, containment, and mixed-distro validation helpers with targeted unit coverage.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todo 01

### What
Create the substrate seam and tested WSL path/canonicalization helpers before changing backend behavior. This keeps WSL-specific path rules out of `HostBackend` and gives later todos a stable interface.

### Constraints
- Keep renderer virtual paths as `/workspace`; these helpers translate native host paths to execution-side paths only.
- Containment/sandbox checks must compare canonical execution-side forms, never mixed native and WSL forms.
- Support `C:\...`, `\\wsl$\<distro>\...`, and `\\wsl.localhost\<distro>\...`.
- Drive letters are case-insensitive and normalize to lowercase `/mnt/<drive>/...`.
- Reject mixed WSL distros within one workspace with a clear error helper.
- Do not implement subprocess/file ops here; only types and pure path utilities.

### Files
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-substrate.ts` — `HostRuntimeSubstrate` and related interfaces.
- `apps/desktop/electron/features/workspace/runtime/backends/host/wsl-paths.ts` — path translation, distro extraction, canonicalization, containment.
- `apps/desktop/electron/__tests__/features/workspace/runtime/wsl-paths.test.ts` — pure path tests.

### Expected Outcome
Workers can import substrate types and path helpers without pulling backend code. WSL path behavior is tested independently of actual Windows/WSL availability.

### Example
Use this shape from the plan; do not add dynamic imports:

```ts
import type { ChildProcess } from 'child_process';

export interface HostSubstrateRendered {
  program: string;
  args: string[];
  nativeCwd: string;
  env?: Record<string, string>;
  innerPidFile?: string;
}

export interface HostRuntimeSubstrate {
  readonly platform: NodeJS.Platform;
  readonly kind: 'posix' | 'wsl';
  readonly runtimeWorkspacePath: string;
  toExecutionPath(nativePath: string): string;
  toNativeHostPath(executionPath: string): string;
  isPathInsideRoot(nativePath: string, root: string): boolean;
  signalChild(child: ChildProcess, rendered: HostSubstrateRendered, signal: NodeJS.Signals | number): Promise<void>;
}
```

Path helper examples to test:

```ts
expect(toWslPath('C:\\Users\\me\\repo')).toBe('/mnt/c/Users/me/repo');
expect(toWslPath('\\\\wsl$\\Ubuntu\\home\\me\\repo')).toBe('/home/me/repo');
expect(extractWslDistro('\\\\wsl.localhost\\Debian\\home\\me')).toBe('Debian');
```

### Acceptance Criteria
- [ ] Tests cover drive-letter paths, both WSL UNC prefixes, spaces, backslashes, traversal attempts, and case-insensitive drive letters.
- [ ] Tests prove `/mnt/c/Users/me/repo/sub` is inside root `C:\Users\me\repo` after canonicalization.
- [ ] Tests prove `\\wsl$\Ubuntu\home\me\other` is not inside root `C:\Users\me\repo`.
- [ ] Tests cover mixed-distro additional-root rejection helper.
- [ ] No backend behavior changes yet beyond exported types/helpers.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-03 — Rename `MacHostBackend` to `HostBackend` with POSIX substrate preserving behavior

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Renamed the host runtime implementation/tests to `HostBackend`, wired `RuntimeManager` to instantiate it for canonical `host`, and added a POSIX substrate with command-rendering/signal tests while preserving direct host file/exec behavior.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todos 01-02

### What
Move the host backend into `backends/host/`, rename it to `HostBackend`, and introduce a POSIX substrate implementation that preserves the current macOS/Linux direct host behavior.

### Constraints
- New implementation class/backend id is `HostBackend` / `host`.
- Do not leave `mac-host` names in implementation paths/classes except compatibility tests/comments at config boundaries.
- Substrate selection must be injectable for tests.
- Preserve current file read/write/list/mutate, exec, spawn, terminal replay-buffer behavior on POSIX.
- `HostBackend` may still have unsupported dev-server/preview methods until Todo 07.
- Use top-level imports only.

### Files
- Move `apps/desktop/electron/features/workspace/runtime/backends/mac-host-backend.ts` → `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts`.
- Add `apps/desktop/electron/features/workspace/runtime/backends/host/posix-substrate.ts`.
- `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts` — import/create `HostBackend` for `case 'host'`.
- Rename `apps/desktop/electron/__tests__/features/workspace/runtime/mac-host-backend.test.ts` → `host-backend.test.ts`.
- Add `apps/desktop/electron/__tests__/features/workspace/runtime/posix-substrate.test.ts`.

### Expected Outcome
Runtime manager returns a `host` backend backed by POSIX substrate on macOS/Linux, and existing mac-host backend tests pass under the new name with canonical backend id expectations.

### Example
Reference current `mac-host-backend.ts` for file behavior, but change construction to inject substrate:

```ts
import { createHostSubstrate } from './host-substrate-factory';
import type { HostRuntimeSubstrate } from './host-substrate';

export class HostBackend implements RuntimeBackend {
  readonly backend = 'host' as const;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;
  readonly workspaceAccess = 'host' as const;
  private readonly substrate: HostRuntimeSubstrate;

  constructor(options: HostBackendOptions) {
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.substrate = options.substrate ?? createHostSubstrate(options.hostWorkspacePath);
  }
}
```

Reference: existing `apps/desktop/electron/__tests__/features/workspace/runtime/mac-host-backend.test.ts` for read/write/list/additional-root expectations.

### Acceptance Criteria
- [ ] `RuntimeManager.getRuntime()` creates `HostBackend` when backend id is `host`.
- [ ] Renamed host backend tests pass and assert `backend.backend === 'host'`.
- [ ] POSIX substrate tests assert `bash -c` for non-login, `bash --login -c` for login, direct program/args for execFile render, and direct `child.kill` signal behavior.
- [ ] No imports reference `backends/mac-host-backend` after this todo.
- [ ] `pnpm --filter @sero/desktop typecheck` passes.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-04 — Implement WSL substrate command, env, signal, output, and file-watch semantics

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Added WSL host substrate command rendering, WSLENV propagation, CRLF normalization, pidfile signal fallback, --cd probe/fallback behavior, WSL file primitives and inotify-based watch parsing with targeted unit coverage.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todos 02-03

### What
Implement `WslHostSubstrate` for Windows WSL-native workspace paths. Cover command rendering, `WSLENV`, pidfile signal fallback, CRLF normalization, `--cd` probing/fallback, and WSL file primitives via `wsl.exe` commands.

### Constraints
- Windows host mode must never use PowerShell/cmd.
- WSL substrate is selected for `\\wsl$\...` and `\\wsl.localhost\...` workspaces and uses `wsl.exe -d <distro>`.
- Generate one pidfile under `/tmp/sero-pid-<uuid>` per spawn where signal fallback is needed.
- Every caller env key must be placed in the spawned `wsl.exe` Windows env and listed in `WSLENV`; auth vars use `/u`.
- Buffered `exec`/`execFile` results normalize `\r\n` to `\n`; streaming PTY/log output stays raw.
- Probe `wsl.exe --help` once per process for `--cd` support; fallback uses `bash -c 'cd <quoted-cwd> && ...'`.
- WSL file ops belong in the substrate, not `HostBackend`.

### Files
- `apps/desktop/electron/features/workspace/runtime/backends/host/wsl-substrate.ts`.
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-substrate-factory.ts` if not created in Todo 03.
- `apps/desktop/electron/__tests__/features/workspace/runtime/wsl-substrate.test.ts`.

### Expected Outcome
WSL behavior is unit-testable without a real WSL installation by mocking `child_process.spawn`/`execFile`, platform helpers, and `wsl.exe --help` probe responses.

### Example
Expected rendered argv shape:

```ts
const rendered = substrate.shellCommand({ command: 'pnpm dev', cwd: '/home/me/repo' });
expect(rendered.program).toBe('wsl.exe');
expect(rendered.args).toEqual(expect.arrayContaining(['-d', 'Ubuntu', '--cd', '/home/me/repo', '--', 'bash', '-c']));
expect(rendered.innerPidFile).toMatch(/^\/tmp\/sero-pid-/);
expect(rendered.env?.WSLENV).toContain('GIT_ASKPASS/u');
```

File-op command reference:

```ts
// readFile('/home/me/repo/a.png') should spawn roughly:
['-d', 'Ubuntu', '--', 'base64', '-w0', '/home/me/repo/a.png']
```

Reference: `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts` for base64-safe file read/write patterns.

### Acceptance Criteria
- [ ] Tests assert WSL shell/execFile rendering starts with `wsl.exe -d <distro>`.
- [ ] Tests assert `WSLENV` includes `GIT_ASKPASS/u`, `GH_TOKEN/u`, and `GIT_TERMINAL_PROMPT/u` when provided.
- [ ] Tests assert `signalChild('SIGTERM')` attempts parent kill, waits 250 ms when needed, reads `innerPidFile`, then runs `wsl.exe -d <distro> -- kill -TERM <pid>`.
- [ ] Tests assert CRLF normalization changes `a\r\nb\r\nc` to `a\nb\nc` for WSL and POSIX leaves output unchanged.
- [ ] Tests assert `--cd` fallback argv when probe says unsupported.
- [ ] Tests assert `watchFiles` spawns `inotifywait -m -r -e modify,create,delete,move <root>` and parses typed events.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-05 — Add `runtime.execFile` and route host exec/spawn/terminal/file ops through substrates

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Added required `RuntimeBackend.execFile` implementations for host, Docker, and Apple Container; routed host exec/spawn/execFile/terminal/file primitives through substrate-rendered commands and substrate file ops with targeted WSL terminal, file routing, and execFile tests.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todos 03-04

### What
Extend `RuntimeBackend` with argv-form `execFile` and make host `exec`, `spawn`, `execFile`, terminal creation, and file operations delegate to substrate primitives. Add equivalent `execFile` implementations for Docker and Apple Container to satisfy the interface.

### Constraints
- `RuntimeExecInput.command` remains a shell string for compatibility.
- Internal portable calls should use `RuntimeExecFileInput`.
- `HostBackend` must not branch on `process.platform` or construct `wsl.exe` argv for file ops; delegate to substrate.
- Host terminal creation must accept a substrate-rendered command; do not hard-code `/bin/zsh` or `/bin/bash` in `TerminalManager.createHostTerminal`.
- Preserve terminal replay buffer and lifecycle behavior.
- Docker/Apple execFile can wrap existing exec primitives initially, but must quote args safely.

### Files
- `apps/desktop/electron/features/workspace/runtime/types.ts` — add `RuntimeExecFileInput` and `execFile(...)` to `RuntimeBackend`.
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts` — delegate through substrate.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts` — implement `execFile`.
- `apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts` — implement `execFile`.
- `apps/desktop/electron/features/container/terminal/terminal.ts` — generalize host PTY creation to rendered program/args/cwd/env.
- Tests for host backend, Docker/Apple execFile shape, and terminal argv.

### Expected Outcome
All backends satisfy the new argv-based command contract. Host runtime execution is substrate-driven and ready for GitRunner/LSP/dev-server migration.

### Example
Use explicit argv input:

```ts
export interface RuntimeExecFileInput {
  program: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  injectGitAuth?: boolean;
}

async execFile(input: RuntimeExecFileInput): Promise<RuntimeExecResult> {
  const cwd = await this.resolveExecutionPath(input.cwd ?? this.runtimeWorkspacePath);
  const rendered = this.substrate.execFileCommand({ ...input, cwd });
  const result = await runRenderedCommand(rendered, input.timeoutMs ?? 120_000);
  return {
    stdout: this.substrate.normalizeExecOutput(result.stdout),
    stderr: this.substrate.normalizeExecOutput(result.stderr),
    exitCode: result.exitCode,
  };
}
```

Reference: current `DockerBackend.exec` in `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts` for timeout/result shape.

### Acceptance Criteria
- [ ] `RuntimeBackend` requires `execFile`, and all backend classes compile with an implementation.
- [ ] Host `exec`/`spawn`/`execFile` use substrate-rendered program/args/cwd/env.
- [ ] Host file primitives call `substrate.readFile/writeFile/listFiles/stat/rename/delete/createDirectory/watchFiles`.
- [ ] Host terminal tests assert WSL terminal argv is `wsl.exe -d <distro> --cd <wslPath> -- bash --login` or documented fallback.
- [ ] Tests assert Windows-native drive workspaces use Node fs substrate file ops while WSL UNC workspaces use WSL substrate file ops.
- [ ] `pnpm --filter @sero/desktop typecheck` passes.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-06 — Migrate GitRunner to `runtime.execFile` and substrate SSH probe

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Migrated GitRunner to a single `runtime.execFile` path with auth vars passed through `execFile.env`, added runtime/substrate SSH availability probing with TTL caching, and covered WSL-rendered argv plus SSH-available/unavailable auth behavior in tests.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todo 05

### What
Collapse `GitRunner.runCommandWithEnv` to one backend-neutral `runtime.execFile(...)` path and move SSH availability probing into the runtime/substrate environment so Windows host probes run inside WSL.

### Constraints
- Remove host-vs-container command branch in `GitRunner`.
- Preserve current GitHub auth behavior: if SSH works, keep `GH_TOKEN`, `GIT_TERMINAL_PROMPT`, and HTTPS extraheader for HTTPS remotes, but do not rewrite SSH remotes; otherwise apply all auth vars.
- SSH probe must run where git executes: substrate on host/WSL, runtime exec for containers where appropriate.
- Do not shell-quote by concatenating `env KEY=... git ...`; use `runtime.execFile({ program, args, env })`.
- Keep cache behavior or equivalent TTL to avoid excessive SSH probes.

### Files
- `apps/desktop/electron/features/vcs/core/git-runner.ts`.
- Host substrate module(s) — expose `isSshAvailable()` through a backend method or internal helper used by `GitRunner`.
- `apps/desktop/electron/features/workspace/runtime/types.ts` — if a minimal runtime method is needed for SSH/auth probing, add it explicitly rather than using casts.
- `apps/desktop/electron/__tests__/features/vcs/git-runner.test.ts` and related VCS tests.

### Expected Outcome
Git commands use the same code path across `host`, `docker`, and `apple-container`, and auth env vars cross WSL through `WSLENV` because they pass through `execFile.env`.

### Example
Target shape in `GitRunner`:

```ts
const runtime = await this.runtimeManager.getRuntime(workspaceId);
const env = await this.buildGitEnv(runtime, program, extraEnv);
return runtime.execFile({
  program,
  args,
  cwd: runtime.runtimeWorkspacePath,
  timeoutMs,
  env,
  injectGitAuth: program === 'git' || program === 'gh',
});
```

Reference: current `apps/desktop/electron/features/vcs/core/git-runner.ts` around `runCommandWithEnv`; remove the `runtime.backend !== 'mac-host'` branch instead of updating it.

### Acceptance Criteria
- [ ] `GitRunner.runCommandWithEnv` has one `runtime.execFile` code path.
- [ ] No direct `child_process.execFile` git execution remains in `GitRunner`.
- [ ] Tests assert host Windows/WSL path produces rendered argv beginning with `wsl.exe` through the runtime mock/substrate.
- [ ] Tests assert auth vars are passed in `execFile.env`, not shell-concatenated.
- [ ] Tests cover SSH-available and SSH-unavailable auth env decisions.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-07 — Add host managed dev-server and preview URL support

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Added runtime-owned host dev-server lifecycle with lsof/pgrep port detection, localhost preview URL resolution, failed timeout diagnostics, Windows WSL localhost-forwarding diagnostics, and tests proving runtime/legacy registry merge behavior.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todo 05

### What
Implement host runtime dev-server lifecycle with runtime-owned state, explicit port detection, localhost preview URLs, restart/stop/status, and Windows WSL localhost-forwarding diagnostics.

### Constraints
- Host dev servers register only in runtime-backed state, not `containerManager.devServers`.
- `RuntimeManager.listDevServersSync` continues to merge runtime-backed and legacy-container registries.
- Start the process in the host runtime, detect the listening port, and return `http://127.0.0.1:<port>`.
- Port detection polls every 100 ms up to 10 s using `lsof -nP -iTCP -sTCP:LISTEN -p <pid>` for the process and descendants via `pgrep -P <pid>`.
- On timeout, keep a failed server entry with diagnostic `dev-server-port-detect-timeout`.
- On Windows, TCP-probe `127.0.0.1:<port>` from the Windows side; if unreachable, `resolvePreviewUrl` surfaces `wsl-localhost-forwarding-disabled`.
- Do not enable browser automation.

### Files
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-dev-server-manager.ts`.
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts`.
- `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts` — ensure list behavior remains merged.
- Host dev-server tests under `apps/desktop/electron/__tests__/features/workspace/runtime/`.

### Expected Outcome
Host runtime supports managed dev servers and preview URLs at practical parity with container runtimes, with clear diagnostics for port detection and WSL forwarding failures.

### Example
Manager state shape:

```ts
interface HostDevServerRecord extends RuntimeDevServer {
  status: 'starting' | 'running' | 'failed' | 'stopped';
  pid?: number;
  diagnosticCode?: 'dev-server-port-detect-timeout' | 'wsl-localhost-forwarding-disabled';
}

const server = await manager.start({ command: 'pnpm dev', cwd: RUNTIME_WORKSPACE_PATH });
expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
```

Reference: `DockerBackend.startDevServer`, `DockerPortManager`, and `apps/desktop/electron/features/container/registries/dev-server-registry.ts` for current server record/list semantics.

### Acceptance Criteria
- [ ] `startDevServer`, `stopDevServer`, `restartDevServer`, `getDevServerStatus`, `resolvePreviewUrl`, and `listDevServersSync` work on `HostBackend`.
- [ ] Unit test confirms host servers do not appear in `containerManager.devServers.list(workspaceId)` and do appear in `runtimeManager.listDevServersSync(workspaceId)`.
- [ ] Unit test confirms port timeout produces failed server entry with `dev-server-port-detect-timeout`.
- [ ] Unit test confirms Windows unreachable TCP probe yields `wsl-localhost-forwarding-disabled`; macOS/Linux skip probe.
- [ ] Manual smoke note added for smoke plugin from `docs/reference/runtime-manual-test.md` (docs updated in Todo 12).

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-08 — Convert capabilities to platform function and make LSP host-runtime aware

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Replaced the static capability map with platform-aware `getRuntimeCapabilities`, added unsupported Apple Container platform errors, enabled host LSP capability, routed LSP cwd/root through shared `RUNTIME_WORKSPACE_PATH`, and covered POSIX/WSL host LSP launch construction.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todos 05-07

### What
Replace static runtime capabilities with `getRuntimeCapabilities(backend, platform)` and update LSP launch code so host runtime language servers run through runtime/substrate semantics using the shared virtual workspace path.

### Constraints
- Remove direct `RUNTIME_CAPABILITIES[...]` callers.
- `getRuntimeCapabilities` is pure and depends only on backend/platform.
- `apple-container` on non-darwin throws `UnsupportedRuntimeOnPlatformError` for Todo 09 resolution handling.
- Host `browserAutomation` is always false.
- LSP cwd must use `RUNTIME_WORKSPACE_PATH` (`/workspace`), not a duplicated literal.
- Do not add browser automation or native Windows PowerShell LSP support.

### Files
- `apps/desktop/electron/features/workspace/runtime/capabilities.ts`.
- `apps/desktop/electron/features/editor/lsp/lsp-manager.ts`.
- `apps/desktop/electron/features/editor/lsp/lsp-process.ts`.
- Tests for capabilities and LSP command/cwd construction.

### Expected Outcome
Capabilities can express platform-valid runtimes and host language-server support without lying through a static map. LSP startup no longer assumes container-only semantics.

### Example
Capability function shape:

```ts
export class UnsupportedRuntimeOnPlatformError extends Error {
  constructor(readonly backend: RuntimeBackendId, readonly platform: NodeJS.Platform) {
    super(`${backend} is not supported on ${platform}`);
  }
}

export function getRuntimeCapabilities(
  backend: RuntimeBackendId,
  platform: NodeJS.Platform = process.platform,
): RuntimeCapabilities {
  if (backend === 'apple-container' && platform !== 'darwin') {
    throw new UnsupportedRuntimeOnPlatformError(backend, platform);
  }
  if (backend === 'host') return createHostCapabilities(platform);
  return createFullCapabilities();
}
```

Reference: current `apps/desktop/electron/features/workspace/runtime/capabilities.ts`; replace the static `RUNTIME_CAPABILITIES` map rather than extending it.

### Acceptance Criteria
- [ ] `getRuntimeCapabilities('host', 'darwin').browserAutomation === false` and language-server expected value is covered by tests.
- [ ] `getRuntimeCapabilities('apple-container', 'linux')` throws `UnsupportedRuntimeOnPlatformError`.
- [ ] Repo grep shows zero direct `RUNTIME_CAPABILITIES[` accesses.
- [ ] `lsp-process.ts` imports `RUNTIME_WORKSPACE_PATH` and no longer defines its own `WORKSPACE_DIR = '/workspace'`.
- [ ] Tests cover host LSP command/cwd construction for POSIX and WSL substrate scenarios.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-09 — Add provider-aware runtime diagnostics, host doctor, and `setContainerEnabled` semantics

**Status:** Done
**Tags:** `cross-platform-host-runtime`

**Completion note:** Added backend-aware runtime resolution diagnostics with desired/actual backend ids and unsupported-platform fallback, introduced host doctor checks for POSIX and WSL, and updated container compatibility toggling so Windows host selection runs doctor before mutating config.

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todo 08

### What
Update runtime resolution to expose desired/actual backend ids, reject unsupported backend/platform combinations, add host doctor checks, and implement cross-platform `setContainerEnabled` semantics.

### Constraints
- Keep `WorkspaceRuntimeKind` only as an internal container-shaped classifier if needed; public diagnostics should include backend ids.
- `resolveWorkspaceRuntimeWithManagers` validates desired backend via `getRuntimeCapabilities(desiredBackend, process.platform)`.
- Unsupported backend/platform produces typed fallback `backend-unsupported-on-platform` or fatal diagnostic; do not silently fall through.
- `setContainerEnabled(false)` resolves to `host` on every platform.
- `setContainerEnabled(true)` picks `apple-container` on Darwin/arm64 and `docker` elsewhere.
- On Windows, `setContainerEnabled(false)` runs host doctor first; if WSL check fails, return structured error and do not mutate config.
- Host doctor parallels `docker-doctor.ts` style and returns `DoctorResult[]`.

### Files
- `apps/desktop/electron/features/workspace/runtime-resolution.ts`.
- `apps/desktop/electron/features/workspace/manager.ts`.
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-doctor.ts`.
- Existing doctor wiring files, if needed.
- Tests: `runtime-resolution.test.ts`, workspace manager runtime tests, `host-doctor.test.ts`.

### Expected Outcome
Runtime diagnostics are backend-aware, invalid backend/platform choices are explicit, and Windows users cannot silently select an unusable WSL host runtime.

### Example
Resolution payload shape:

```ts
export type WorkspaceRuntimeFallbackCode = 'container_unavailable' | 'backend-unsupported-on-platform';

export interface WorkspaceRuntimeResolution {
  workspaceId: string;
  workspacePath: string;
  desiredBackend: RuntimeBackendId;
  actualBackend: RuntimeBackendId;
  fallbackCode?: WorkspaceRuntimeFallbackCode;
  fallbackReason?: string;
  capabilityAudit: WorkspaceRuntimeCapabilityAuditEntry[];
}
```

Host doctor reference: follow `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-doctor.ts` result construction style.

### Acceptance Criteria
- [ ] Runtime diagnostics include `desiredBackend` and `actualBackend`.
- [ ] Resolving `apple-container` on Linux/Windows yields `backend-unsupported-on-platform` fallback or fatal diagnostic; test covers it.
- [ ] `host-doctor.ts` checks POSIX `bash`, `git`, `bash -c 'echo ok'`; Windows `wsl.exe`, `wsl.exe --status`, distro echo, and `which bash`.
- [ ] Tests cover POSIX missing `bash` and Windows missing `wsl.exe` failures.
- [ ] Test confirms failed Windows host doctor in `setContainerEnabled(false)` returns structured error and leaves previous runtime config unchanged.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-10 — Migrate IPC/CLI call sites away from container boolean business logic

**Status:** Pending
**Tags:** `cross-platform-host-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todo 09

### What
Update IPC/CLI boundaries that still branch on `isContainerEnabled` or assume container-vs-host to use canonical runtime backend semantics and surface backend-aware diagnostics.

### Constraints
- Compatibility channel names may remain, but behavior should be runtime-aware.
- Do not use `isContainerEnabled` for new business logic; compare `runtime.backend !== 'host'` only in compatibility boundaries where explicitly needed.
- Keep renderer/main IPC types in sync (`src/types/ipc.ts` and Electron handlers).
- Do not grow `apps/desktop/src/types/ipc.ts` over 500 LOC; split types if needed.
- Avoid `localStorage`/`sessionStorage`.

### Files
- `apps/desktop/electron/ipc/workspace/workspace.ts` — backend ids in diagnostics payloads.
- `apps/desktop/electron/ipc/container/container.ts` — update applicability checks.
- `apps/desktop/electron/ipc/editor/editor.ts` — update runtime applicability checks.
- `apps/desktop/electron/cli/commands/workspace/workspace.ts` — update CLI runtime semantics.
- `apps/desktop/src/types/ipc.ts` and/or smaller runtime type files if payloads change.
- Unit tests for each migrated boundary where existing tests exist.

### Expected Outcome
IPC/CLI callers behave correctly for canonical `host`, `docker`, and `apple-container`, and no migrated path depends on stale `mac-host` or legacy container booleans.

### Example
Expected boundary pattern:

```ts
const runtime = await workspaceManager.getRuntimeConfig(workspaceId);
const isContainerRuntime = runtime.backend !== 'host';
if (!isContainerRuntime) {
  return { ok: false, error: 'This operation requires a container runtime.', backend: runtime.backend };
}
```

Reference: current direct boolean call sites listed in scout context: `ipc/container/container.ts`, `ipc/editor/editor.ts`, `ipc/workspace/workspace.ts`, and `cli/commands/workspace/workspace.ts`.

### Acceptance Criteria
- [ ] Grep shows no new `isContainerEnabled` business logic in migrated files; remaining uses are documented compatibility shims.
- [ ] IPC diagnostics include backend ids where runtime diagnostics are surfaced.
- [ ] Tests assert host-runtime-aware behavior for container/editor/workspace/CLI boundaries.
- [ ] `pnpm --filter @sero/desktop typecheck` passes.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-11 — Update runtime picker UI copy and platform gating

**Status:** Pending
**Tags:** `cross-platform-host-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todos 01 and 09

### What
Update renderer runtime picker/UI copy so the non-container runtime is displayed as “Host”, is not macOS-only, and explains WSL 2 requirements on Windows.

### Constraints
- User-facing copy must not say “Mac Host”. Display label is “Host”.
- Treat a stale rendered `mac-host` value as synonym for `host` so in-flight props never show deprecated copy.
- macOS options: Apple Container, Docker, Host.
- Linux options: Docker, Host.
- Windows options: Docker, Host with WSL requirement or disabled Host with clear setup guidance when diagnostics say WSL is missing.
- Keep state in Zustand/runtime IPC patterns; do not use browser storage.

### Files
- `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.tsx`.
- `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.test.tsx`.
- `apps/desktop/src/components/layout/workspace/workspace-tree/useWorkspaceTreeRuntime.test.tsx`.
- Onboarding/runtime notice components if existing grep finds “Mac Host” copy.

### Expected Outcome
Runtime picker presents a cross-platform Host runtime and never exposes `mac-host` as a user-facing label.

### Example
Expected label helper:

```ts
type RuntimeBackendForDisplay = WorkspaceRuntimeBackend | 'mac-host';

export function runtimeName(backend: RuntimeBackendForDisplay): string {
  if (backend === 'host' || backend === 'mac-host') return 'Host';
  if (backend === 'apple-container') return 'Apple Container';
  return 'Docker';
}
```

Reference: current `RuntimePickerMenu.tsx` functions `runtimeName`, `runtimeIcon`, `getRuntimePickerOptions`, and `MAC_HOST_COPY`.

### Acceptance Criteria
- [ ] Unit test confirms `runtimeName('host')` and `runtimeName('mac-host')` both render `Host`.
- [ ] Unit tests cover macOS/Linux/Windows option sets.
- [ ] Windows Host option mentions WSL 2 requirement or disabled setup guidance based on diagnostics.
- [ ] Grep user-facing source for “Mac Host” and update/remove stale labels.

---

## TODO CROSS-PLATFORM-HOST-RUNTIME-12 — Update docs/manual tests and run final validation sweep

**Status:** Pending
**Tags:** `cross-platform-host-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-cross-platform-host-runtime/plan.md`
**Depends on:** Todos 01-11

### What
Update runtime docs/manual test instructions and run the final typecheck/test/grep validation required before completing the implementation.

### Constraints
- Docs must distinguish container parity from host parity.
- Explicitly state browser automation remains container-only.
- Manual tests must include macOS host, Linux host, and Windows/WSL host smoke paths.
- Do not claim Windows native PowerShell/cmd host support.
- Run `pnpm typecheck` from monorepo root before completion.

### Files
- `docs/features/runtime-provider-architecture.md`.
- `docs/reference/runtime-manual-test.md`.
- `docs/features/docker-runtime.md` if existing runtime matrix needs updates.
- Optional completion notes under `.pi/plans/2026-05-10-cross-platform-host-runtime/` if workers record smoke results.

### Expected Outcome
Documentation matches implementation and future maintainers have a clear manual smoke checklist for host runtime across supported platforms.

### Example
Add a support matrix like:

```md
| Runtime | macOS | Linux | Windows | Browser automation |
| --- | --- | --- | --- | --- |
| Host | Yes | Yes | WSL 2 required | No |
| Docker | Yes | Yes | Yes | Yes |
| Apple Container | Apple Silicon recommended | No | No | Yes |
```

Reference: existing `docs/reference/runtime-manual-test.md` smoke plugin flow and `docs/features/runtime-provider-architecture.md` runtime descriptions.

### Acceptance Criteria
- [ ] Docs explain `host` canonical id and `mac-host` deprecated alias behavior.
- [ ] Docs explain WSL distro/path rules and localhost-forwarding diagnostic.
- [ ] Manual test plan includes file ops, exec, terminal, Git, LSP, managed dev server, preview URL for host runtime.
- [ ] Grep confirms no canonical/public docs still instruct users to choose “Mac Host”.
- [ ] Grep confirms no `RUNTIME_CAPABILITIES[` accesses remain.
- [ ] `pnpm typecheck` passes from repository root.
- [ ] Relevant targeted Vitest suites pass or documented manual blockers are recorded.
