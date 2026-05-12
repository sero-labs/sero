# Cross-platform Host Runtime Plan

> **Windows host runtime was removed.** All decisions, code, tests, and docs related to WSL 2, `wsl.exe` substrate, `\\wsl$\` UNC path handling, Windows-drive substrate, and WSL localhost-forwarding diagnostics have been deleted. Windows uses the Docker backend exclusively. The plan below is preserved for historical context; treat any WSL-specific decisions, tasks, and capability gates as obsolete.

## Context

PR #177 adds provider-aware workspace runtimes and Docker support, but the non-container backend is still named `mac-host` and is implemented as a macOS-oriented host backend. The product goal is broader: Sero should support both container and non-container workspaces across platforms.

This plan covers the missing functionality required to make host workspaces a real cross-platform runtime while keeping container workspaces as the preferred parity path for browser automation.

## Decisions

1. **Canonical backend name is `host`.**
   - Replace public/runtime config writes of `mac-host` with `host`.
   - Continue accepting `mac-host` as a deprecated read-time alias for existing configs.
   - Code comments should explicitly mark `mac-host` as deprecated compatibility input.

2. **Windows host mode requires WSL 2.**
   - Native Windows shell execution is not supported for `host` runtime in this phase.
   - On Windows, Sero executes host runtime commands through `wsl.exe`.
   - **Distro selection rule:** if the workspace path is `\\wsl$\<distro>\...` or `\\wsl.localhost\<distro>\...`, the substrate executes in `<distro>` via `wsl.exe -d <distro>`. Otherwise it uses the user's default distro. Mixing distros within a single workspace is rejected with a clear error (e.g., main root in `\\wsl$\Ubuntu` and additional root in `\\wsl$\Debian`).
   - No user-facing distro picker in this phase.

3. **Support both common Windows workspace path styles.**
   - Windows paths like `C:\Users\me\repo` translate to WSL paths like `/mnt/c/Users/me/repo`.
   - WSL-native paths exposed as UNC, e.g. `\\wsl$\Ubuntu\home\me\repo` or `\\wsl.localhost\Ubuntu\home\me\repo`, translate to `/home/me/repo` for the matching distro.
   - Keep renderer/editor virtual paths as `/workspace/...` everywhere.
   - **Canonical sandbox form:** workspace and additional-root paths are normalized to *execution-side* form (POSIX on macOS/Linux, WSL POSIX on Windows) before sandbox/containment checks. Containment checks must never run in mixed forms.

4. **WSL-UNC file ops are routed through `wsl.exe` rather than Node `fs`.**
   - Workspaces under `\\wsl$\...` or `\\wsl.localhost\...` execute file reads/writes/listings/watches via the substrate, not through the SMB share, because Node `fs.watch` over `\\wsl$\...` is unreliable and SMB-backed I/O is materially slower.
   - Workspaces on Windows-native drives (`C:\...`) keep using Node `fs` directly — this path is fast and well-supported.
   - macOS/Linux always use Node `fs` directly.
   - This means `HostBackend` must dispatch file ops based on substrate, not assume Node `fs` everywhere.
   - File-op routing is **the substrate's responsibility, not the backend's**: the substrate exposes `readFile`/`writeFile`/`listFiles`/`stat`/`rename`/`delete`/`createDirectory`/`watchFiles` as first-class primitives so `HostBackend` never branches on `process.platform` or constructs ad-hoc `wsl.exe` command lines for file ops. See "Host substrate abstraction" below for the interface.

5. **Host runtime aims for full practical parity except browser automation.**
   - File ops, exec/spawn, terminal, Git/VCS, language servers, managed dev servers, and preview URLs should work for host runtime.
   - Browser automation remains container-only for now and must be clearly represented in capabilities/diagnostics.

6. **Host managed dev servers should feel local.**
   - Start the process in the host runtime.
   - Detect the listening port.
   - Register the server in runtime-backed dev server state.
   - Return `http://127.0.0.1:<port>`.
   - On Windows/WSL, rely on WSL localhost forwarding; if it fails, surface clear diagnostics.

7. **Internal commands prefer argv form via `runtime.execFile`.**
   - `GitRunner`, dev-server lifecycle, and LSP launch route through `runtime.execFile`, eliminating the platform branch in `GitRunner.runCommandWithEnv` (`git-runner.ts:163`) so a single code path works for all backends.
   - SSH-availability detection (currently in `git-runner.ts`) moves into the substrate so the probe runs *where git actually runs* — on Windows this means probing inside WSL, not on the Electron host.

8. **Minimal Doctor support for this phase.**
   - Add `backends/host/host-doctor.ts` paralleling `backends/docker/docker-doctor.ts`.
   - Verify host runtime shell/substrate exists.
   - On Windows, verify `wsl.exe` exists and `wsl.exe --status` or `wsl.exe sh -lc 'echo ok'` succeeds.
   - If the workspace path references a non-default WSL distro, verify that distro is installed and running.
   - Deeper checks for Node/pnpm/browser tooling can be follow-ups unless required by a failing workflow.

9. **Testing requirement.**
   - Add unit tests for Windows/Linux path translation, shell command construction, signal propagation, config migration, and capabilities.
   - Full Windows/Linux manual testing can follow later; do not block this phase on CI matrix expansion.

10. **Substrate execution semantics are explicit, not best-effort.**
    - **Signal propagation & inner-PID capture (WSL).** Commands launched through the WSL substrate are wrapped by the substrate as `bash -c 'echo $$ > <pidfile>; exec <user-cmd>'`. The substrate generates a per-spawn pidfile path under `/tmp/sero-pid-<uuid>` and exposes that path on the rendered descriptor. `signalChild` first issues `child.kill('SIGTERM')` against the `wsl.exe` parent; if the child has not exited within 250 ms, it reads the pidfile via `wsl.exe -d <distro> -- cat <pidfile>` and runs `wsl.exe -d <distro> -- kill -<sig> <innerPid>`. POSIX substrate calls `child.kill(signal)` directly. Rationale: Windows has no real signals, and SIGTERM to `wsl.exe` does not propagate into the inner shell reliably.
    - **Env propagation across the `wsl.exe` boundary (`WSLENV`).** When the WSL substrate spawns a process, it must set `WSLENV` on the *Windows* environment of `wsl.exe` to list every key it wants to cross the boundary, e.g. `WSLENV=GIT_ASKPASS/u:GH_TOKEN:GIT_TERMINAL_PROMPT`. Without `WSLENV`, vars set on `wsl.exe`'s env do not appear in the inner shell. Auth env vars from `GitRunner` MUST flow through this mechanism — losing them silently would break credential helpers.
    - **Line-ending normalization.** When the substrate is WSL, `RuntimeExecResult.stdout` and `.stderr` have `\r\n` converted to `\n` across the entire stream (not just trailing). POSIX substrate leaves output untouched. This is necessary because `wsl.exe` interop translates LF→CRLF on its way out. PTY/streaming consumers (terminal sessions, log streams) keep raw bytes — only the buffered `exec` result is normalized.
    - **`wsl.exe --cd` detection.** On first use per process, the substrate probes `wsl.exe --help` once and caches whether `--cd` is supported. If absent, it falls back to `wsl.exe -d <distro> -- bash -c 'cd <single-quote-escaped-wslCwd> && <cmd>'`.

11. **Runtime capabilities are computed per (backend, platform), not a static map.**
    - Replace the `Record<RuntimeBackendId, RuntimeCapabilities>` const in `capabilities.ts` with a `getRuntimeCapabilities(backend: RuntimeBackendId, platform: NodeJS.Platform): RuntimeCapabilities` function. Existing callers move to the function. The static `RUNTIME_CAPABILITIES` export is removed (or becomes a deprecated re-export computed at module load for the current platform).
    - Reason: host capabilities for `languageServers`, `vcs.*`, and `browserAutomation` differ between macOS, Linux, and Windows-WSL. The const-map shape made it impossible to express "host has LSP on macOS/Linux but not Windows" or to gate features behind WSL availability without lying in the capability set.

12. **Dev-server port detection and preview reachability are explicit, not "trust localhost".**
    - **Port detection.** When a host-runtime managed dev server is started, the substrate runs `lsof -nP -iTCP -sTCP:LISTEN -p <pid>` on a 100 ms poll, up to 10 s, capturing the first listening TCP port owned by `<pid>` *or any descendant*. WSL substrate runs the same `lsof` invocation inside the distro. If detection times out, the dev server is marked `failed` with diagnostic `dev-server-port-detect-timeout`.
    - **Preview reachability probe (Windows only).** After registration, the host runtime opens a TCP probe to `127.0.0.1:<port>` from the *Windows* side. If it fails, the dev server is still registered but `resolvePreviewUrl` returns a `wsl-localhost-forwarding-disabled` diagnostic that points the user at the WSL `.wslconfig` `localhostForwarding=true` setting. macOS/Linux skip the probe.

13. **`setContainerEnabled` semantics on non-Darwin.**
    - `setContainerEnabled(false)` resolves to `host` on every platform. `setContainerEnabled(true)` picks `apple-container` on Darwin/arm64 and `docker` elsewhere.
    - On Windows, `setContainerEnabled(false)` returns success only after the WSL doctor check passes; otherwise it surfaces a structured error and leaves the previous backend in place. This prevents users from silently selecting an unusable runtime.

## Non-goals

- Native Windows PowerShell/cmd host execution.
- Browser automation in host runtime.
- User-facing WSL distro picker/config UI.
- Full cross-platform CI matrix.
- Removing container runtimes or reducing Docker/Apple Container support.

## Proposed Architecture

### Runtime backend type

Current canonical type:

```ts
export type RuntimeBackendId = 'apple-container' | 'docker' | 'mac-host';
```

Target canonical type:

```ts
export type RuntimeBackendId = 'apple-container' | 'docker' | 'host';
export type DeprecatedRuntimeBackendId = 'mac-host';
```

Keep deprecated alias handling at config/IPC boundaries, not throughout runtime implementation.

### Host substrate abstraction

Introduce a small internal abstraction used by `HostBackend`:

```ts
import type { ChildProcess } from 'child_process';

export interface HostSubstrateRendered {
  /** Process to spawn via Node child_process. On Windows this is `wsl.exe`. */
  program: string;
  /** Argv for the spawned process. cwd is encoded here (e.g. `--cd <wslPath>` or `cd <wslPath> &&`). */
  args: string[];
  /** Native cwd to pass to child_process.spawn — distinct from the *execution-side* cwd, which is in args. */
  nativeCwd: string;
  /** Final env passed to child_process.spawn. For WSL, this includes a computed `WSLENV` listing the keys to cross the boundary. */
  env?: Record<string, string>;
  /**
   * Set by the WSL substrate when the user command was wrapped with a pidfile capture
   * (e.g. `bash -c 'echo $$ > <pidfile>; exec <cmd>'`). `signalChild` reads this to find
   * the inner shell PID when SIGTERM to `wsl.exe` does not propagate. Undefined for POSIX.
   */
  innerPidFile?: string;
}

export interface HostSubstrateSpawnOptions {
  command: string;
  /** Execution-side cwd (POSIX path: `/workspace/...` translated, or absolute WSL/POSIX path). */
  cwd: string;
  env?: Record<string, string>;
  /**
   * When true the substrate uses a login shell (POSIX: `bash --login -c <cmd>`; WSL: same, executed inside `wsl.exe`).
   * When false (default) the substrate uses `bash -c <cmd>`. Login shells source profile files (slower, picks up nvm/asdf/etc.);
   * non-login is preferred for short-lived internal commands and matches the parity of the container backends.
   */
  loginShell?: boolean;
}

export interface HostSubstrateExecFileOptions {
  program: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface HostSubstrateFileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
}

export interface HostSubstrateFileWatchEvent {
  kind: 'modify' | 'create' | 'delete' | 'move';
  path: string;
}

export interface HostSubstrateFileWatch {
  close(): Promise<void>;
}

export interface HostSubstrateStat {
  size: number;
  mtimeMs: number;
  type: 'file' | 'directory' | 'symlink';
}

export interface HostRuntimeSubstrate {
  readonly platform: NodeJS.Platform;
  readonly kind: 'posix' | 'wsl';
  readonly runtimeWorkspacePath: string;

  /** Translate a native host path (e.g. `C:\Users\me\repo` or `/Users/me/repo`) into an execution-side path. */
  toExecutionPath(nativePath: string): string;
  /** Inverse of toExecutionPath, used when surfacing paths to the renderer/host fs. */
  toNativeHostPath(executionPath: string): string;
  /** Returns true if `nativePath` is materially the same location as `root` after canonicalization to execution form. */
  isPathInsideRoot(nativePath: string, root: string): boolean;

  // ── Command rendering ────────────────────────────────────────────────────
  /** Render a shell command ready for child_process.spawn. WSL substrate wraps with pidfile capture (sets innerPidFile). */
  shellCommand(opts: HostSubstrateSpawnOptions): HostSubstrateRendered;
  /** Render an argv-form command ready for child_process.spawn. */
  execFileCommand(opts: HostSubstrateExecFileOptions): HostSubstrateRendered;
  /** Render a login terminal command (used by node-pty). */
  terminalCommand(opts: { cwd: string; env?: Record<string, string> }): HostSubstrateRendered;

  // ── File ops (Decision 13) ───────────────────────────────────────────────
  // POSIX implementation calls Node `fs`. WSL implementation shells out through `wsl.exe -d <distro>`
  // with base64 framing for binary safety on `readFile`/`writeFile`, so byte content survives interop.
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer): Promise<void>;
  listFiles(path: string): Promise<HostSubstrateFileEntry[]>;
  stat(path: string): Promise<HostSubstrateStat>;
  rename(from: string, to: string): Promise<void>;
  delete(path: string, opts?: { recursive?: boolean }): Promise<void>;
  createDirectory(path: string, opts?: { recursive?: boolean }): Promise<void>;
  /**
   * POSIX: Node `fs.watch` (recursive on macOS, polled fallback on Linux).
   * WSL: streams `wsl.exe -d <distro> -- inotifywait -m -r -e modify,create,delete,move <root>` and parses output lines.
   */
  watchFiles(path: string, onEvent: (event: HostSubstrateFileWatchEvent) => void): Promise<HostSubstrateFileWatch>;

  // ── Probes & process control ─────────────────────────────────────────────
  /** Probe whether SSH is available in the execution environment (runs inside WSL on Windows). */
  isSshAvailable(): Promise<boolean>;
  /**
   * Send a signal to a previously-spawned child. WSL: SIGTERM the wsl.exe parent; if not exited within 250 ms
   * read `rendered.innerPidFile` and run `wsl.exe -d <distro> -- kill -<sig> <innerPid>`. POSIX: `child.kill(signal)`.
   * Async because the SIGTERM-then-kill fallback must wait briefly.
   */
  signalChild(child: ChildProcess, rendered: HostSubstrateRendered, signal: NodeJS.Signals | number): Promise<void>;
  /** Normalize buffered exec output (CRLF → LF) when kind === 'wsl'. No-op on POSIX. Streaming consumers do not call this. */
  normalizeExecOutput(output: string): string;
}
```

Expected implementations:

- `PosixHostSubstrate` for macOS/Linux.
  - Shell: `{ program: 'bash', args: ['-c', command], nativeCwd: cwd }` (or `['--login', '-c', command]` when `loginShell: true`).
  - ExecFile: `{ program, args, nativeCwd: cwd }`.
  - Terminal shell uses `process.env.SHELL ?? '/bin/bash'`.
  - File ops use Node `fs`.
  - `signalChild` calls `child.kill(signal)`. `normalizeExecOutput` returns input unchanged.
- `WslHostSubstrate` for Windows.
  - Shell: `{ program: 'wsl.exe', args: ['-d', distro, '--cd', wslCwd, '--', 'bash', '-c', "echo $$ > " + pidfile + "; exec bash -c " + quoted(command)], nativeCwd: process.cwd(), innerPidFile: pidfile }` (login flag swaps `bash -c` for `bash --login -c`). Falls back to `... -- bash -c 'cd <quoted-wslCwd> && <wrapped-cmd>'` on Windows builds without `--cd` support; `--cd` availability is detected once per process by probing `wsl.exe --help` and cached.
  - Terminal uses `wsl.exe -d <distro> --cd <wslPath> -- bash --login`. **Test note:** unit tests assert the *argv* passed to `pty.spawn` matches expected shape — node-pty/ConPTY behavior is verified by manual smoke, not unit tests, since real PTY behavior is not unit-testable.
  - File ops: argv form `wsl.exe -d <distro> -- <cmd> <args>`. `readFile`/`writeFile` use `base64` (`base64 -w0 <path>` / `base64 -d > <path>`) to keep bytes intact across interop. `listFiles` uses `find <path> -mindepth 1 -maxdepth 1 -printf '%y %f\n'`. `stat` uses `stat -c '%s %Y %F' <path>`. `watchFiles` streams `inotifywait` lines and emits typed events.
  - `signalChild` is async (see interface comment).
  - `isSshAvailable` runs the SSH probe via `wsl.exe -d <distro> -- ssh -T ...`, so the result reflects the environment where git actually executes.
  - Env: every key in `opts.env` is added to the spawned `wsl.exe`'s Windows env, AND a computed `WSLENV=<key1>[/u]:<key2>[/u]:...` is set so the keys cross the boundary. `/u` is appended for Unicode-string vars (the default, unless we know the var holds a path that needs translation, in which case `/p`).

**Imports:** Imports inside substrate/backend modules must be top-level. Do not introduce *new* dynamic `import('...')` calls — including type-only inline `import('...')` expressions. Pre-existing dynamic imports in `runtime-resolution.ts` (used to break a circular dependency between `workspace/manager` and `container/core/singleton`) are out of scope and remain.

### Command contract

Keep `RuntimeExecInput.command` as a shell string for compatibility, but add an argv-based option for internal portable calls:

```ts
export interface RuntimeExecInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  injectGitAuth?: boolean;
}

export interface RuntimeExecFileInput {
  program: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  injectGitAuth?: boolean;
}
```

Then add `execFile(input: RuntimeExecFileInput)` to `RuntimeBackend` or add it as an optional capability and migrate internal Git/dev-server/LSP callers where shell quoting is currently fragile.

Do not attempt to make arbitrary user shell strings magically portable. Internal Sero commands should prefer argv form where possible.

### Path model

Renderer/editor paths remain virtual and POSIX-like:

- Primary root: `/workspace/...`
- Additional roots: `/<rootId>/...`

Runtime host backend maps these to:

- macOS/Linux native paths for local execution.
- WSL execution paths on Windows.

Avoid leaking native Windows paths into renderer/editor APIs.

### Capabilities

`host` capabilities should be platform-aware:

- `exec`: true
- `processes.spawn`: true
- `terminal`: true
- `files.*`: true
- `vcs.*`: true if Git is available through substrate
- `devServers.*`: true
- `ports.previewUrl`: true for localhost dev server URLs
- `languageServers`: true once LSP manager can run via host substrate
- `browserAutomation`: false

## Implementation Tasks

### Task 1 — Rename runtime model to canonical `host`

**What**
Update shared runtime types/config so `host` is canonical and `mac-host` is accepted only as deprecated input. Update the migration logic so any persisted `mac-host` value is rewritten to `host` on next config touch.

**Files**
- `apps/desktop/src/types/workspace-runtime.ts`
- `apps/desktop/electron/features/workspace/runtime/types.ts`
- `apps/desktop/electron/features/workspace/runtime/config.ts` (`isWorkspaceRuntimeBackend` accepts `'host'` and `'mac-host'`; `normalizeWorkspaceConfigForWrite` rewrites `'mac-host'` → `'host'` on its way out)
- `apps/desktop/electron/features/workspace/runtime/capabilities.ts` (rename `createMacHostCapabilities` → `createHostCapabilities`, update `RUNTIME_BACKEND_IDS`; the `RUNTIME_CAPABILITIES` const is replaced by a function in Task 6 — for this task just keep it working for `'host'`)
- `apps/desktop/electron/features/workspace/runtime/platform-default.ts` (the `workspaceId === 'global'` branch must return `'host'`, not `'mac-host'`)
- `apps/desktop/electron/features/workspace/manager.ts`:
  - `DEFAULT_GLOBAL_CONFIG` (line ~49) hardcoded `runtime: { backend: 'mac-host' }` → `runtime: { backend: 'host' }`.
  - `migrateRuntimeConfig` (line ~138) currently skips when `config.runtime?.backend && config.container === undefined`. Change the gating to ALSO trigger a rewrite when `config.runtime.backend === 'mac-host'`. Effective predicate: `if (config.runtime?.backend && config.runtime.backend !== 'mac-host' && config.container === undefined) continue;`. The rewrite itself is implicit through `normalizeWorkspaceConfigForWrite` once that helper rewrites the alias.
  - `isContainerEnabled` (line ~409) is reimplemented as `runtime.backend !== 'host'` (still treating `'mac-host'` as host through the alias path; this stays a compatibility helper, see Task 7).
- `apps/desktop/electron/features/vcs/core/git-runner.ts:163` (`backend !== 'mac-host'` becomes a no-op once Task 4 lands; in this task, generalize the check to accept `'host'` as the new canonical name)
- Renderer test files that reference `'mac-host'` literals: `useSessionAgent.test.tsx`, `RemoteOriginManager.test.tsx`, `WorkspaceReferencesMenu.test.tsx`, `useWorkspaceTreeRuntime.test.tsx`, `RuntimePickerMenu.test.tsx`
- Electron test files: `workspace-runtime-config.test.ts`, `runtime-types.test.ts`, `mac-host-backend.test.ts` (Task 2 renames the file), `vcs-manager.test.ts`, `git-runner.test.ts`, `subagent/integration.test.ts`, `cli/workspace-mount-plugin.test.ts`

**Constraints**
- Writes must normalize to `host`.
- Existing `.sero-workspace.json` with `mac-host` must continue to load and be rewritten to `host` next time the config is saved.
- IPC payloads always carry the canonical `host` value, even if the on-disk file still contains `mac-host`.
- Add comments marking `mac-host` as deprecated compatibility input wherever the alias is read.
- Keep source files under 500 LOC.

**Acceptance Criteria**
- New configs write `{ "runtime": { "backend": "host" } }`.
- Old configs with `{ "backend": "mac-host" }` resolve to host runtime AND are rewritten to `{ "backend": "host" }` after the first save (covered by an explicit migration test).
- `getDefaultRuntimeBackend({ workspaceId: 'global' })` returns `'host'` on every platform.
- `pnpm --filter desktop typecheck` passes.
- Workspace runtime config tests cover alias read, canonical write, and `mac-host` → `host` migration.

### Task 2 — Replace `MacHostBackend` with cross-platform `HostBackend`

**What**
Rename/refactor the backend class into a platform-aware `HostBackend` that delegates platform details to a substrate. Move backend code under `backends/host/` to mirror `backends/docker/`.

**Files**
- Move `backends/mac-host-backend.ts` → `backends/host/host-backend.ts`.
- Add `backends/host/posix-substrate.ts` and `backends/host/wsl-substrate.ts`.
- `runtime-manager.ts` — update `case 'mac-host':` to `case 'host':` (with the deprecated alias handled at the resolution layer).
- Rename `__tests__/features/workspace/runtime/mac-host-backend.test.ts` → `host-backend.test.ts`. Add `posix-substrate.test.ts` and `wsl-substrate.test.ts` that mock `process.platform` and `child_process.spawn`/`execFile`.

**Constraints**
- Preserve current macOS behavior.
- Linux uses POSIX substrate.
- Windows requires WSL substrate.
- Do not keep `mac-host` names in new implementation except deprecated alias handling at config/IPC boundaries.
- Substrate selection happens at `HostBackend` construction (based on `process.platform` and the workspace path's UNC prefix) and is injectable for tests.

**Acceptance Criteria**
- Runtime manager returns backend `host` for host configs.
- Existing macOS host file/exec/terminal tests still pass under updated names.
- Windows substrate can be unit-tested without running WSL by mocking `process.platform`/spawn helpers.
- A unit test confirms `HostBackend` selects the WSL substrate when constructed with a `\\wsl$\...` workspace path on `process.platform === 'win32'`, and the POSIX substrate otherwise.
- Unit test asserts the *argv* handed to `pty.spawn` for a WSL terminal is `['wsl.exe', '-d', '<distro>', '--cd', '<wslPath>', '--', 'bash', '--login']` (or the documented `--cd`-less fallback). Real PTY/ConPTY behavior is verified by manual smoke in Task 9, not by unit tests, since interactive PTY behavior cannot be unit-tested reliably.

### Task 3 — Add WSL path translation helpers and additional-root canonicalization

**What**
Create tested utilities to translate host workspace paths into execution paths for WSL, and a canonicalization helper used by `HostBackend.findAllowedHostRoot`-style sandbox checks.

**Examples**

```ts
toWslPath('C:\\Users\\daniel\\repo') === '/mnt/c/Users/daniel/repo'
toWslPath('\\\\wsl$\\Ubuntu\\home\\daniel\\repo') === '/home/daniel/repo'
toWslPath('\\\\wsl.localhost\\Ubuntu\\home\\daniel\\repo') === '/home/daniel/repo'

extractWslDistro('\\\\wsl$\\Ubuntu\\home\\daniel\\repo') === 'Ubuntu'
extractWslDistro('C:\\Users\\daniel\\repo') === null
```

**Files**
- New `apps/desktop/electron/features/workspace/runtime/backends/host/wsl-paths.ts`
- Tests under `electron/__tests__/features/workspace/runtime/`

**Constraints**
- Keep renderer virtual paths as `/workspace`.
- Do not use path translation based on string prefix alone for sandbox decisions; validate normalized roots.
- Handle drive-letter case-insensitively.
- **Sandbox canonicalization rule:** before any containment check, both candidate path and root are translated to execution form (`/mnt/c/...` or `/home/...` on WSL, native POSIX on macOS/Linux). Containment checks must never run on a mix of native and translated forms.
- **Mixed-distro rejection:** if the main workspace is in distro X and an additional root is in distro Y, `HostBackend` rejects the additional root with a clear error and the diagnostic is surfaced to the renderer.
- **Cross-side roots are allowed within a single distro:** a Windows-native additional root (`C:\...`) and a WSL-native main workspace are both reachable through `/mnt/c/...` from inside the distro, so this combination is supported.

**Acceptance Criteria**
- Unit tests cover drive-letter paths, both `\\wsl$\` and `\\wsl.localhost\` UNC prefixes, spaces, backslashes, path traversal attempts, and mixed-distro additional-root rejection.
- Unit test confirms canonicalized containment check: `/mnt/c/Users/me/repo/sub` is inside root `C:\Users\me\repo`.
- Unit test confirms canonicalized containment check rejects `\\wsl$\Ubuntu\home\me\other` against root `C:\Users\me\repo`.

### Task 4 — Implement host exec/spawn/terminal/file-ops through substrate

**What**
Route host `exec`, `spawn`, `execFile`, terminal creation, and (on Windows-WSL workspaces) file ops through the substrate. Add `execFile` to `RuntimeBackend` as part of this work and migrate `GitRunner` to use it.

**Files**
- `backends/host/host-backend.ts`
- `backends/host/posix-substrate.ts`, `backends/host/wsl-substrate.ts`
- `runtime/types.ts` — add `execFile(input: RuntimeExecFileInput)` to `RuntimeBackend`. Apple Container and Docker backends implement it via their existing exec primitives.
- `apps/desktop/electron/features/container/terminal/terminal.ts` — generalize `createHostTerminal` to accept a substrate-rendered command (program/args/cwd/env) instead of hard-coding `process.env.SHELL ?? '/bin/zsh'`. Or extract a `createSubstrateTerminal` helper.
- `apps/desktop/electron/features/vcs/core/git-runner.ts` — collapse the two branches in `runCommandWithEnv` into a single `runtime.execFile(...)` call. Remove `isHostSshAvailable` from this file; call `substrate.isSshAvailable()` (exposed by the runtime) instead. Keep the auth-env-vars logic but apply it via `execFile`'s `env` parameter regardless of backend.

**Constraints**
- Windows host mode must not use PowerShell/cmd.
- Windows host mode must fail clearly if `wsl.exe` is unavailable.
- Maintain replay buffer and terminal lifecycle behavior.
- **Signal/kill (per Decision 10):** `RuntimeProcess.signal` for the host backend calls `substrate.signalChild(child, rendered, signal)` (async). The WSL substrate first SIGTERMs the `wsl.exe` parent; if the child has not exited within 250 ms it reads `rendered.innerPidFile` via `wsl.exe -d <distro> -- cat <pidfile>` and runs `wsl.exe -d <distro> -- kill -<sig> <innerPid>`. The pidfile is best-effort cleaned up after the child exits.
- **Env propagation (per Decision 10):** every key in the caller's `env` is mirrored into the spawned `wsl.exe`'s Windows env AND added to a computed `WSLENV` so it crosses the boundary. Auth env vars from `GitRunner` (e.g. `GIT_ASKPASS`, `GH_TOKEN`, `GIT_TERMINAL_PROMPT`) are flagged Unicode (`/u`) and tested explicitly.
- **File ops route through substrate primitives (per Decision 4 and 13):** `HostBackend.readFile` etc. delegate to `substrate.readFile` etc.; the backend never branches on `process.platform` and never constructs `wsl.exe` argv for file ops itself. POSIX substrate uses Node `fs`; WSL substrate uses `wsl.exe -d <distro> -- <argv>` with base64 framing for binary-safe `readFile`/`writeFile`. Workspaces on `C:\...` are served by a POSIX-style substrate variant that uses Node `fs` directly (the WSL substrate is only chosen for `\\wsl$\...` / `\\wsl.localhost\...` workspaces; see Task 2 substrate selection rule).
- **Line-ending normalization (per Decision 10):** `RuntimeExecResult.stdout` and `.stderr` from buffered `exec`/`execFile` calls are passed through `substrate.normalizeExecOutput` which converts `\r\n` → `\n` across the entire stream when `kind === 'wsl'`. Streaming consumers (PTY data callbacks, log streams) keep raw bytes.
- **`--cd` fallback detection:** WSL substrate probes `wsl.exe --help` once per process and caches whether `--cd` is supported. The fallback path uses `wsl.exe -d <distro> -- bash -c 'cd <quoted-wslCwd> && <wrapped-cmd>'` with single-quote-escaping on `<quoted-wslCwd>`.

**Acceptance Criteria**
- Unit tests assert Windows command construction uses `wsl.exe -d <distro>`.
- Unit tests assert Linux/macOS command construction uses POSIX shell (`bash -c` for non-login, `bash --login -c` for login).
- Unit tests assert `signal('SIGTERM')` on a WSL-substrate process triggers a follow-up `wsl.exe -d <distro> -- kill -<sig> <pid>` when the parent exit hasn't been observed within 250 ms, and that the inner PID is sourced from `rendered.innerPidFile` via `wsl.exe -- cat <pidfile>`.
- Unit test asserts the rendered shell command for the WSL substrate begins with `bash -c 'echo $$ > <pidfile>; exec ...'` (or the `--login` variant) so `innerPidFile` capture is wired up.
- Unit test asserts auth env vars round-trip: spawning through the WSL substrate with `env: { GIT_ASKPASS: '/usr/bin/foo' }` results in (a) the var on the `wsl.exe` Windows env AND (b) `WSLENV` containing `GIT_ASKPASS/u`.
- Host terminal tests do not assume `/bin/zsh` on Linux/Windows.
- `GitRunner.runCommandWithEnv` has a single code path; tests assert that on `host` backend on Windows the rendered argv begins with `wsl.exe`.
- A unit test confirms file-op routing: `HostBackend.readFile` on a `\\wsl$\Ubuntu\...` workspace calls `WslHostSubstrate.readFile` which spawns `wsl.exe -d Ubuntu -- base64 -w0 <wslPath>`; on `C:\...` it calls the POSIX-style substrate's `fs.readFile`.
- Unit test asserts CRLF normalization: `wsl.exe` substrate's exec result `stdout` containing `"a\r\nb\r\nc"` is normalized to `"a\nb\nc"`; POSIX substrate leaves `"a\r\nb"` untouched.
- Unit test asserts `watchFiles` on WSL substrate spawns `wsl.exe -d <distro> -- inotifywait -m -r -e modify,create,delete,move <root>` and emits typed events on parsed lines.
- Unit test asserts `--cd` fallback: when the cached probe reports `--cd` unsupported, the rendered argv has the form `wsl.exe -d <distro> -- bash -c 'cd <quoted-cwd> && ...'` instead of `--cd <cwd> --`.

### Task 5 — Add host managed dev servers and preview URLs

**What**
Implement host runtime `startDevServer`, `stopDevServer`, `restartDevServer`, `getDevServerStatus`, `resolvePreviewUrl`, and `listDevServersSync`.

**Files**
- `backends/host/host-backend.ts`
- New `backends/host/host-dev-server-manager.ts`
- `runtime/runtime-manager.ts`
- App runtime host capability tests.

**Constraints**
- Return localhost URLs directly: `http://127.0.0.1:<port>`.
- Use the per-runtime in-memory dev-server map exposed via `RuntimeBackend.listDevServersSync`, not the legacy `containerManager.devServers` registry.
- **Port detection (per Decision 12):** after spawning the dev-server process, poll `lsof -nP -iTCP -sTCP:LISTEN -p <pid>` every 100 ms for up to 10 s, capturing the first listening TCP port owned by `<pid>` *or any descendant* (`-p` accepts multiple PIDs; the manager walks `pgrep -P <pid>` to enumerate descendants). On WSL the same `lsof` call runs inside the distro through `substrate.execFile`. Timeout marks the server `failed` with diagnostic code `dev-server-port-detect-timeout`.
- **Preview reachability probe (Windows only, per Decision 12):** after registration, open a TCP probe from the Windows side to `127.0.0.1:<port>` (3 attempts, 500 ms apart). If unreachable, register the server but have `resolvePreviewUrl` return a `wsl-localhost-forwarding-disabled` diagnostic. macOS/Linux skip the probe.
- Do not enable browser automation as part of this task.
- **Registry coexistence rule:** `RuntimeManager.listDevServersSync` continues to merge runtime-backed and legacy-container registries during this phase. Container-backed workspaces still write to the legacy registry; host-backed workspaces only write to the runtime-backed one. A follow-up (out of scope) deprecates the legacy registry entirely once Apple Container and Docker also publish through `RuntimeBackend.listDevServersSync`.

**Acceptance Criteria**
- Smoke plugin from `docs/reference/runtime-manual-test.md` works on host runtime as well as container runtime.
- `host.devServers.startManaged()` followed by `host.devServers.list()` returns the started server with the detected port.
- `stop` and `restart` operate on the same server id.
- Unit test confirms host-backed servers do not appear in `containerManager.devServers.list(workspaceId)` and *do* appear in `runtimeManager.listDevServersSync(workspaceId)`.
- Unit test asserts port-detection timeout produces a `failed` server entry with diagnostic `dev-server-port-detect-timeout` after the configured window.
- Unit test (mocking the TCP probe) asserts that on `process.platform === 'win32'` an unreachable preview probe causes `resolvePreviewUrl` to surface a `wsl-localhost-forwarding-disabled` diagnostic, while on macOS/Linux the probe is not invoked.

### Task 6 — Make LSP host-runtime aware AND make capabilities a function

**What**
Two concurrent moves that interlock: (a) ensure language servers can run in host runtime on macOS/Linux/WSL; (b) restructure `capabilities.ts` from a static `Record<RuntimeBackendId, RuntimeCapabilities>` const into a `getRuntimeCapabilities(backend, platform)` function so host capabilities can vary by platform. Without (b), enabling `languageServers` for host runtime would force-flip it on Windows-WSL too, where LSP support lands later.

**Files**
- `apps/desktop/electron/features/editor/lsp/lsp-manager.ts`
- `apps/desktop/electron/features/editor/lsp/lsp-process.ts` — replace the duplicated literal `const WORKSPACE_DIR = '/workspace';` (line 16) with the shared `RUNTIME_WORKSPACE_PATH` import from `runtime/runtime-paths.ts` so substrate translation is applied uniformly.
- `apps/desktop/electron/features/workspace/runtime/capabilities.ts`:
  - Replace `RUNTIME_CAPABILITIES` const with `export function getRuntimeCapabilities(backend: RuntimeBackendId, platform: NodeJS.Platform): RuntimeCapabilities`.
  - `host` capabilities by platform:
    - `darwin` / `linux`: full parity except `browserAutomation: false`.
    - `win32`: as macOS/Linux except `languageServers` flips with substrate readiness (initially `true` once Task 6 LSP work lands; otherwise `false`).
  - `apple-container` capabilities are only valid on `darwin`; calling `getRuntimeCapabilities('apple-container', 'linux' | 'win32')` throws `UnsupportedRuntimeOnPlatformError` (used by Task 7's load-time rejection).
- All existing callers of `RUNTIME_CAPABILITIES` migrate to the function. Confirm with a repo-wide grep that no `RUNTIME_CAPABILITIES[` access survives.
- Host backend/substrate as needed.

**Constraints**
- LSP process cwd must use the runtime virtual path (`/workspace`); the substrate translates it on spawn.
- Avoid container-only assumptions.
- Do not implement browser automation here.
- The capabilities function must be pure (depends only on `backend` and `platform`); runtime-state-dependent gating happens elsewhere (e.g. WSL doctor result feeding into `setContainerEnabled`).

**Acceptance Criteria**
- `languageServers` host capability is true on macOS/Linux once LSP launch works through host runtime; tested per platform.
- Unit tests cover host runtime LSP command/cwd construction for POSIX and WSL.
- Unit test confirms `lsp-process.ts` no longer defines its own `WORKSPACE_DIR` constant.
- Unit test confirms `getRuntimeCapabilities('host', 'darwin').languageServers === true`, `getRuntimeCapabilities('host', 'win32').languageServers === false` (until WSL LSP path lands).
- Unit test confirms `getRuntimeCapabilities('apple-container', 'linux')` throws `UnsupportedRuntimeOnPlatformError`.
- Repo grep shows zero remaining direct `RUNTIME_CAPABILITIES[...]` accesses.

### Task 7 — Provider-aware diagnostics and validation

**What**
Update runtime diagnostics to understand `host`, Docker, and Apple Container providers directly. Replace usages of the legacy two-valued `WorkspaceRuntimeKind` (`'container' | 'host'`) and `isContainerEnabled` boolean with the canonical backend id where they leak into business logic.

**Files**
- `apps/desktop/electron/features/workspace/runtime-resolution.ts`:
  - Keep `WorkspaceRuntimeKind` only as an internal "is the actual runtime container-shaped" classifier; expose `desiredBackend: RuntimeBackendId` and `actualBackend: RuntimeBackendId` on `WorkspaceRuntimeResolution`.
  - **This is the load-time rejection site for unsupported backend/platform combinations.** `resolveWorkspaceRuntimeWithManagers` consults `getRuntimeCapabilities(desiredBackend, process.platform)` (which throws `UnsupportedRuntimeOnPlatformError` for invalid combos) and produces a fallback resolution with `fallbackCode: 'backend-unsupported-on-platform'` and `fallbackReason` text. The fallback target is `host` if the platform supports it, otherwise the rejection is fatal and surfaces in diagnostics. Pre-existing dynamic imports here (workspace/manager and container/core/singleton) remain — out of scope per Decisions section.
- `apps/desktop/electron/ipc/workspace/workspace.ts` — surface backend ids in diagnostics payloads.
- `apps/desktop/electron/ipc/container/container.ts:50` — switch from `isContainerEnabled` boolean to `runtime.backend !== 'host'` semantics when deciding whether the IPC applies.
- `apps/desktop/electron/ipc/editor/editor.ts:146` — same.
- `apps/desktop/electron/cli/commands/workspace/workspace.ts:150` — same.
- `apps/desktop/electron/features/workspace/manager.ts`:
  - `isContainerEnabled` stays as a compatibility helper, reimplemented in terms of `runtime.backend !== 'host'`. Mark with a deprecation comment pointing readers at `runtime.backend`.
  - `setContainerEnabled` (per Decision 13) resolves `false` to `host` on every platform; `true` picks `apple-container` on Darwin/arm64, else `docker`. On Windows, `setContainerEnabled(false)` runs the host doctor first and only commits the change if the WSL substrate check passes — otherwise it returns a structured error and leaves the previous backend in place.
- New `apps/desktop/electron/features/workspace/runtime/backends/host/host-doctor.ts` paralleling `backends/docker/docker-doctor.ts`. Returns `DoctorResult[]`. Wired into the existing Doctor pipeline. Checks:
  - **POSIX:** `bash` resolvable on `PATH`; `git` resolvable; basic `bash -c 'echo ok'` round-trip.
  - **Windows:** `wsl.exe` present on `PATH`; `wsl.exe --status` exits 0; if the workspace path references a non-default distro, `wsl.exe -d <distro> -- echo ok` round-trips; `wsl.exe -d <distro> -- which bash` succeeds.

**Constraints**
- Do not rely solely on old `isContainerEnabled` boolean for new code paths; existing call sites are migrated as listed.
- Diagnostics should say WSL is required for host runtime on Windows.
- Unsupported backend/platform combinations (e.g. `apple-container` on Linux/Windows) are rejected in `runtime-resolution.ts` via `getRuntimeCapabilities` throwing, NOT silently fall through. The rejection produces a typed fallback or fatal diagnostic that the renderer can render.
- Doctor host check verifies: shell substrate exists; on Windows, `wsl.exe` is present and the resolved distro is running.

**Acceptance Criteria**
- Runtime diagnostics show desired/actual backend id, not only container/host kind.
- Windows host mode reports missing WSL clearly when unavailable.
- Unit test in `runtime-resolution.test.ts` confirms that resolving `apple-container` on `process.platform === 'linux'` produces a resolution with `fallbackCode: 'backend-unsupported-on-platform'` and `actualBackend !== 'apple-container'` (or a fatal diagnostic).
- Each migrated call site has a unit test asserting host-runtime-aware behavior.
- `host-doctor.ts` surfaces a `DoctorResult` for the substrate check; failure case is unit tested for both POSIX (missing `bash`) and Windows (missing `wsl.exe`).
- Unit test confirms `setContainerEnabled(false)` on `process.platform === 'win32'` with a stubbed-failing host doctor returns a structured error and does NOT mutate the workspace runtime config.

### Task 8 — Update UI copy and platform gating

**What**
Update runtime picker and workspace UI to reflect `host` as cross-platform non-container mode with platform-specific requirements.

**Files**
- `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.tsx` — `runtimeName`, `runtimeIcon`, `getRuntimePickerOptions`, and the `MAC_HOST_COPY` constant must be renamed/repurposed to `host`. The function must accept `'host'` as canonical and treat any rendered `'mac-host'` value (from a not-yet-migrated workspace) as a synonym.
- `RuntimePickerMenu.test.tsx` and `useWorkspaceTreeRuntime.test.tsx`
- onboarding/runtime notices if applicable

**Constraints**
- Non-macOS runtime picker can show Docker and Host only if Host is supported by platform checks.
- On Windows, Host option should mention WSL 2 requirement.
- Do not call it "Mac Host" in user-facing copy. The display label is "Host".

**Acceptance Criteria**
- macOS shows Apple Container, Docker, Host.
- Linux shows Docker, Host.
- Windows shows Docker, Host (WSL required) or disables Host with clear setup guidance if WSL is missing.
- A unit test confirms `runtimeName('mac-host')` and `runtimeName('host')` both render "Host" so a stale in-flight prop never shows the deprecated label.

### Task 9 — Update docs and manual test plan

**What**
Update docs to describe runtime support matrix and manual tests.

**Files**
- `docs/features/runtime-provider-architecture.md`
- `docs/reference/runtime-manual-test.md`
- Possibly `docs/features/docker-runtime.md`

**Acceptance Criteria**
- Docs distinguish container parity from host runtime parity.
- Docs explain browser automation remains container-only.
- Manual tests include host runtime file/exec/dev-server smoke for macOS, Linux, and Windows/WSL.

## Open Questions Deferred

- Should Sero eventually add a profile-level WSL distro selector?
- Should host browser automation be supported through host-installed Playwright later?
- Should CI add Ubuntu/Windows runners for runtime unit tests?
- Should additional roots always stay virtual (`/<rootId>`) internally instead of ever passing native host paths?

## Suggested Implementation Order

1. Type/config rename and compatibility alias (Task 1).
2. Host substrate abstraction with `cwd`/signal semantics, plus path translation tests (foundation for Tasks 2–4).
3. HostBackend refactor preserving current macOS behavior (Task 2).
4. WSL path translation, additional-root canonicalization, and mixed-distro rejection (Task 3).
5. Windows/WSL exec/spawn/terminal/file-op support, including `runtime.execFile` and the `GitRunner` collapse (Task 4).
6. Host dev server/preview support (Task 5).
7. LSP support and capability flip (Task 6).
8. Provider-aware diagnostics, Doctor host check, and `isContainerEnabled` migrations (Task 7).
9. UI copy and platform gating (Task 8).
10. Docs/manual tests (Task 9).

This order keeps the public data model stable before adding WSL behavior, then progressively turns on parity capabilities only after tests exist. Tasks 3–4 are the policy-heavy steps and should not begin until the substrate interface (step 2) is reviewed and merged.

### Optional split: ship Linux host first, WSL host as follow-up

The plan can be safely split if Windows test hardware is unavailable or if reviewers want a smaller blast radius:

- **Phase A (POSIX-only):** Tasks 1, 2 (POSIX substrate only — WSL substrate stub throws "not implemented"), 5, 6, 7 (excluding the Windows-specific host-doctor branch and the `setContainerEnabled` Windows-gating), 8 (Linux runtime picker shows Docker + Host; Windows still shows Docker-only), 9. After Phase A, `host` runtime is fully functional on macOS/Linux; Windows still defaults to Docker.
- **Phase B (WSL):** Tasks 3 and 4 in full, plus the deferred Windows pieces of Tasks 7 and 8. Phase B is gated behind a feature flag (`SERO_WSL_HOST=1`) until manual smoke on Windows passes.

Choose Phase A→B if reviewers prefer staged risk; choose the unified order above if Windows hardware is available throughout the project.
