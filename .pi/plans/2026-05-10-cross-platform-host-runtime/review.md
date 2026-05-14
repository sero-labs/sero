# Review: Cross-platform Host Runtime

Scope reviewed: commits `cff3078de` through `2e69236fb` inclusive, against the plan/todos/spec/scout context.

## Findings

### P1 — Windows drive workspaces do not execute through WSL

**Files/lines:**
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-substrate-factory.ts:10-14`
- `apps/desktop/electron/features/workspace/runtime/backends/host/posix-substrate.ts:44-58`
- Test currently locking in the wrong behavior: `apps/desktop/electron/__tests__/features/workspace/runtime/host-substrate-factory.test.ts:5-9`

`createHostSubstrate()` only selects the WSL substrate for WSL UNC paths. A Windows-native workspace such as `C:\Users\me\repo` receives `PosixHostSubstrate` with `platform: 'win32'`. That substrate renders shell commands as `bash -c ...` and argv commands as the raw program with a Windows cwd. This violates the spec's Windows rule that host runtime command execution goes through `wsl.exe` (default distro for non-UNC paths), with `C:\...` translated to `/mnt/c/...`.

Impact: on a normal Windows install without Git Bash, host runtime exec/spawn/GitRunner/LSP/dev-server commands fail outright for the primary Windows workspace path style. Even with Git Bash installed, commands run in the Windows environment rather than the WSL environment that doctor/capabilities/UI claim is required.

Suggested fix: split Windows drive behavior inside the host substrate instead of using the POSIX substrate wholesale. On `platform === 'win32'`, command rendering/signals/env/output should be WSL-backed for both drive and UNC workspaces; file primitives may use Node `fs` for drive paths per spec and WSL-backed primitives for UNC paths. Update the factory test to assert Windows drive command rendering uses `wsl.exe` and `/mnt/<drive>/...`.

### P1 — Mixed WSL distro rejection helper is never enforced, so containment can approve the wrong distro

**Files/lines:**
- Helper only: `apps/desktop/electron/features/workspace/runtime/backends/host/wsl-paths.ts:65-77`
- Backend construction/root loading: `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts:76-80`, `333-340`
- Containment check ignores distro: `apps/desktop/electron/features/workspace/runtime/backends/host/wsl-paths.ts:59-62`

The plan requires rejecting mixed WSL distros in one workspace. The helper exists, but no production code calls it. `isWslPathInsideRoot()` canonicalizes both `\\wsl$\Ubuntu\home\me\repo` and `\\wsl$\Debian\home\me\repo` to `/home/me/repo`, so an additional root in Debian can be considered inside an Ubuntu-shaped root path if the POSIX portion matches. The substrate then executes/file-ops in the main workspace distro, potentially reading or writing the same POSIX path in the wrong distro.

Impact: WSL additional roots can silently target the wrong Linux filesystem, which is a data-integrity and containment bug.

Suggested fix: enforce `assertSameWslDistroForAdditionalRoots()` when resolving/using additional roots (or at root-add time), and include distro identity in WSL containment comparisons rather than comparing only the stripped execution path. Add a test that a Debian additional root is rejected for an Ubuntu workspace before any file op/exec path resolution.

### P2 — WSL watcher parsing breaks paths containing spaces

**Files/lines:**
- `apps/desktop/electron/features/workspace/runtime/backends/host/wsl-substrate.ts:169-178`

`inotifywait` output is parsed with `^(\S+)\s+(\S+)\s*(.*)$`, which cannot handle watched directories containing spaces. A workspace path like `/home/me/My Project` will be split at the first space, producing bad event paths/kinds.

Suggested fix: invoke `inotifywait` with a delimiter-safe `--format` (for example NUL- or tab-separated fields) and parse that format, or shell-quote a custom format that keeps the path/event/name boundaries unambiguous. Add a test with a root path and filename containing spaces.

## Checks performed

- Grepped touched source/docs for stale `mac-host`, `RUNTIME_CAPABILITIES`, and container-boolean assumptions. Remaining `mac-host` references appear limited to deprecated alias types/config/UI compatibility/tests/docs; no direct `RUNTIME_CAPABILITIES` references remain in `apps`/`packages` source.
- Checked touched source file sizes. No touched source file exceeds 500 LOC; `apps/desktop/electron/features/workspace/manager.ts` is close at 499 LOC.
- Reviewed host substrate abstraction, WSL path/exec/file behavior, `execFile`, GitRunner migration, host dev-server manager, capabilities, runtime diagnostics, host doctor, and IPC/UI/docs surfaces at a code level.

## Fix status

Fixed in this commit:
- Windows drive host workspaces now use a Windows-drive substrate: commands, env, signals, and buffered output go through `wsl.exe` with drive paths translated to `/mnt/<drive>/...`, while file primitives continue to use Node fs on Windows-native paths.
- Mixed WSL distro additional roots are enforced in `HostBackend` root resolution, and WSL containment checks now compare distro identity before accepting same-suffix UNC paths.
- WSL file watcher parsing now uses a tab-delimited `inotifywait --format` so paths and filenames containing spaces are parsed safely.

Validation:
- `pnpm --filter @sero/desktop exec vitest run electron/__tests__/features/workspace/runtime/host-substrate-factory.test.ts electron/__tests__/features/workspace/runtime/wsl-paths.test.ts electron/__tests__/features/workspace/runtime/host-backend.test.ts electron/__tests__/features/workspace/runtime/wsl-substrate.test.ts` — 4 files / 24 tests passed.
- `pnpm --filter @sero/desktop typecheck` — passed.
- `pnpm typecheck` — passed (15 packages).

## Verdict

P0: none found.

P1 fixes required before completion: **fixed**.
