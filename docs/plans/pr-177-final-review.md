# PR #177 Final Review and Merge Readiness

**PR:** https://github.com/sero-labs/sero/pull/177  
**Branch:** `feat/docker-runtime`  
**Head reviewed:** `d0f5e7f0e fix(desktop): support visible browser scrolling`
**Date:** 2026-05-15

## Verdict

PR #177 is **merge-ready after the manual OS matrix below is recorded** and the PR is moved out of draft / receives required review approval.

The final code review found and fixed the remaining high-risk runtime issues:

- Docker LSP startup no longer waits on legacy Apple Container renderer state.
- Docker bind mounts and editor runtime paths share Windows path normalization through `toRuntimeIdentityMountPath()`.
- The runtime picker now gives visible hover/current/switching feedback and keeps the menu open during backend changes.
- The runtime picker Doctor footer now opens the Environment Doctor UI instead of silently running a quick check.

## Local validation already completed

Run from repo root on the reviewed head:

```bash
pnpm typecheck
pnpm --filter @sero/desktop test -- src/components/layout/workspace/workspace-tree/RuntimePickerMenu.test.tsx
git diff --check
```

Observed result on `31cd8f093`:

- `pnpm typecheck` passed.
- Desktop test suite passed: `265` files / `1278` tests.
- `git diff --check` passed.
- Touched source files stayed below 500 LOC.

GitHub checks for the PR head were reported as skipped/no checks; treat the local validation above plus the manual matrix below as the release gate.

## Runtime scope that must be reviewed

| OS / hardware | Supported runtime backends | Must not happen |
| --- | --- | --- |
| macOS Apple Silicon | `apple-container`, `docker`, `host` | Apple Container or Docker silently running commands on host |
| macOS Intel | `docker`, `host` | Apple Container shown as available |
| Linux | `docker`, `host` | Runtime-created files requiring `sudo` to edit/delete |
| Windows | `docker` only | Host/WSL runtime shown, selected, or documented as supported |

Use exact backend IDs: `apple-container`, `docker`, `host`. `mac-host` is a deprecated compatibility alias only.

## Final review focus areas

### 1. Runtime backend selection and reset

Review these files when checking final diffs:

- `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts`
- `apps/desktop/electron/features/workspace/runtime/config.ts`
- `apps/desktop/electron/features/workspace/runtime/platform-default.ts`
- `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.tsx`

Required behavior:

- Changing a workspace runtime is a reset operation.
- Old terminals, dev servers, cached backends, and containers are invalidated before the new runtime is used.
- The runtime picker stays understandable while switching: visible current backend, pending backend, status/error message, and no unexplained disappearance.
- Windows users only see Docker.

### 2. Execution, file, terminal, Git, and LSP seams

Review these files:

- `apps/desktop/electron/features/workspace/runtime/run-workspace-command.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/*`
- `apps/desktop/electron/features/editor/lsp/lsp-manager.ts`
- `apps/desktop/src/lsp/use-lsp.ts`
- `apps/desktop/electron/features/vcs/core/git-runner.ts`
- `apps/desktop/electron/ipc/editor/path-resolution.ts`

Required behavior:

- Runtime-selected workspaces execute through `runtimeManager`, not legacy container state.
- Docker and Apple Container commands report Linux `/workspace` paths.
- Host runtime is POSIX-only and stays inside workspace/additional roots.
- Docker LSP starts through Docker runtime health, not Apple Container renderer status.
- Windows path mapping is stable for both Docker mounts and editor path resolution.

### 3. Managed dev servers and preview ports

Review these files:

- `apps/desktop/electron/features/workspace/runtime/start-managed-dev-server.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/preview-bridge.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/preview-port-pool.ts`
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-dev-server-manager.ts`
- `apps/desktop/electron/ipc/container/dev-server.ts`

Required behavior:

- Managed dev servers return usable `http://127.0.0.1:<hostPort>` preview URLs.
- Docker/Apple Container preview ports do not collide across simultaneous workspaces.
- Registered foreign host processes are not killed when Sero only unregisters them.
- Invalid preview ports are rejected before script interpolation.

### 4. Doctor and user-facing diagnostics

Review these files:

- `apps/desktop/src/components/diagnostics/DoctorPanel.tsx`
- `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.tsx`
- `apps/desktop/electron/features/doctor/**`
- Docker/Host runtime doctor files under `apps/desktop/electron/features/workspace/runtime/**`

Required behavior:

- Runtime picker footer opens the Environment Doctor dialog.
- Doctor checks are bounded and actionable.
- Missing Docker daemon, stopped Apple Container system, unsupported host runtime, image issues, permission problems, and port failures produce understandable action text.

## Manual OS release gate

Every row must be recorded as `pass`, `fail`, or `not run` with a reason. A failure in a supported runtime blocks merge unless it is explicitly accepted as non-blocking.

| OS / hardware | Document | Required result |
| --- | --- | --- |
| macOS Apple Silicon | [`docs/reference/manual-tests/pr-177-macos-apple-silicon.md`](../reference/manual-tests/pr-177-macos-apple-silicon.md) | **PASS recorded 2026-05-15** — Apple Container, Docker, and Host pass |
| macOS Intel | [`docs/reference/manual-tests/pr-177-macos-intel.md`](../reference/manual-tests/pr-177-macos-intel.md) | Pending — Docker and Host pass; Apple Container absent |
| Linux | [`docs/reference/manual-tests/pr-177-linux.md`](../reference/manual-tests/pr-177-linux.md) | Pending — Docker/Podman and Host pass |
| Windows | [`docs/reference/manual-tests/pr-177-windows.md`](../reference/manual-tests/pr-177-windows.md) | Pending — Docker Desktop passes; Host/WSL absent |

## Evidence to collect for each OS

For each manual run, paste these into the PR comment or release note:

```text
OS:
CPU/arch:
Sero commit:
Runtime(s) tested:
Container engine/version:
Runtime image/tag:
Workspace path:
Doctor result:
File/terminal/Git/LSP result:
Dev-server preview result:
Browser automation result:
Runtime picker / Doctor dialog result:
Failures or anomalies:
```

## Merge instructions

1. Confirm `git status --short --branch` is clean on `feat/docker-runtime`.
2. Confirm all manual OS documents have current pass/fail evidence or a justified `not run` entry.
3. Move PR #177 out of draft.
4. Request/obtain review approval.
5. Merge only after no supported OS row has an unresolved blocking failure.

Do **not** merge based on Windows Host/WSL behavior; Windows Host is intentionally out of scope for PR #177.
