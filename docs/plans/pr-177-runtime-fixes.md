# PR 177 Runtime Reliability Fix Plan

**Date:** 2026-05-11
**Scope:** Fix review findings for PR #177 (`feat(desktop): add provider-aware workspace runtimes`).

## Runtime scope (historical PR #177 context)

This section records the PR #177 scope at the time this plan was written. Current PR #185-era Host platform support and release gates are defined by `docs/reference/host-mode-support.md`.

PR #177 supported these local workspace runtimes:

- `apple-container` on supported Apple Silicon Macs.
- `docker` on macOS, Windows, and Linux.
- `host` on macOS/Linux only.

Windows Host mode / WSL-backed Host execution was deprecated for PR #177. For that historical pass, Windows used Docker exclusively. Do not use this section as current Windows Host guidance; use `docs/reference/host-mode-support.md` instead.

## Primary goal

Preserve the provider-neutral runtime architecture while removing silent host fallbacks, stale runtime state, brittle Docker behavior, and mismatched runtime capabilities.

## Context

PR #177 adds a provider-aware workspace runtime layer with `host`, `docker`, and `apple-container` backends. Review found that the architecture is directionally correct, but several reliability seams still route through legacy container code or expose capabilities that are not actually implemented.

Read these files first:

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
- Do not add Windows Host mode through PowerShell/cmd or WSL for the historical PR #177 scope. Current Windows Host support is governed by `docs/reference/host-mode-support.md`.

## Cross-cutting constraints

- Keep all source files under 500 LOC.
- No `any`, `@ts-ignore`, or `@ts-expect-error` unless unavoidable with an explanatory comment.
- Prefer top-level imports; no inline `import('...')` type expressions.
- Do not use `localStorage`/`sessionStorage`.
- Use exact runtime backend ids: `host`, `docker`, `apple-container`.
- Selected Docker/Apple runtimes must not silently fall back to host execution.
- Use argv-form execution (`runtime.execFile`) where possible for internal commands.
- Keep Docker behavior testable with mocks on macOS/Linux CI.

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

The registered Doctor check should not pull/build images or start long-running probes that outlive the Doctor timeout. Heavy smoke tests can remain explicit/manual helpers, but the default check must be bounded and abort-aware.

## Tasks

### Task 1 — Route workspace command execution through `runtimeManager`

Replace legacy command execution in `run-workspace-command.ts` with provider-neutral runtime execution. Preserve the existing `{ isolated: true }` behavior where callers require an isolated command context.

Acceptance criteria:

- Docker-selected workspaces execute through Docker, never silently on the host.
- Apple Container-selected workspaces execute through Apple Container.
- Host-selected workspaces execute through Host on the release-supported Host platforms for the active rollout.
- Unsupported Host selections fail or normalize to the configured default before execution.
- Existing isolation tests pass or are updated to assert the new runtime-seam behavior.

### Task 2 — Reset runtimes on backend/config changes

When a workspace backend or preview port pool changes, destroy cached runtime state for that workspace before the new runtime is used.

Acceptance criteria:

- Backend switch disposes terminals and dev servers for the previous runtime.
- Docker/Apple containers are recreated when required by immutable port publications.
- Renderer state reflects the selected backend after reset.

### Task 3 — Fix runtime-backed dev-server semantics

Make managed dev-server start/list/stop/restart provider-neutral and reliable.

Acceptance criteria:

- Start fails cleanly if no port/URL is detected.
- Host dev-server start detects the child/descendant listening port or returns an actionable failure.
- Docker and Apple Container use loopback preview-port pools and return `http://127.0.0.1:<hostPort>` URLs.
- IPC stop/restart tries runtime-backed servers first and falls back to the legacy registry for legacy entries.
- Dev-server events do not double-register or leak after runtime reset.

### Task 4 — Correct runtime capabilities

Ensure capabilities match implemented behavior.

Acceptance criteria:

- Docker and Apple Container report file watching unsupported until implemented.
- Host reports browser automation availability from browser-pack install state and Doctor launch readiness.
- Windows Host support follows the current host-mode release matrix.
- Callers use capability helpers rather than direct backend maps.

### Task 5 — Harden Docker backend and Doctor checks

Review Docker CLI calls, mounts, labels, env handling, UID/GID, image checks, and Doctor behavior.

Acceptance criteria:

- Docker CLI invocations use argument arrays.
- Bind mounts include `/workspace` and read-only Sero agent skills/prompts mounts.
- Unix containers run as host UID/GID where supported.
- Windows paths are passed to Docker Desktop without claiming Host support.
- Doctor checks are bounded/cancellable and avoid heavyweight pulls during default runs.

### Task 6 — Harden Apple Container backend

Keep Apple Container behind the runtime seam while preserving existing behavior.

Acceptance criteria:

- Apple Container adapter is the only normal runtime path that reaches the legacy `containerManager` for execution/file ops.
- `execFile` validates env keys or uses native env argument support.
- Binary reads use a binary-safe path.
- Dev-server redirects quote log paths safely.

### Task 7 — Harden Host runtime

Historical PR #177 note: Host was POSIX-only at that point. Current host-mode support follows `docs/reference/host-mode-support.md`.

Acceptance criteria:

- Host file ops canonicalize symlinks/parents and reject escapes outside workspace/additional roots.
- Host terminals use a portable shell fallback aligned with Doctor checks.
- Host LSP/root paths are valid for host execution.
- Host managed dev-server stop does not unregister before termination is handled or surfaced.

### Task 8 — Browser automation resilience

Historical PR #177 note: browser automation was container-only at that point. Current Host browser automation requires a published browser pack and Doctor launch readiness.

Acceptance criteria:

- Docker/Apple Container images include Chromium and an `ffmpeg` executable on `PATH` for recording.
- Browser launch/navigation failures are recoverable and do not poison the session.
- Host runtime exposes browser automation tools only when browser-pack install state and Doctor readiness allow it.

## Validation

Run:

```bash
pnpm --filter @sero/desktop typecheck
pnpm --filter @sero/desktop exec vitest run \
  electron/__tests__/features/workspace/runtime/run-workspace-command.test.ts \
  electron/__tests__/features/workspace/runtime/runtime-types.test.ts \
  electron/__tests__/features/workspace/runtime/host-backend.test.ts \
  electron/__tests__/features/workspace/runtime/host-dev-server-manager.test.ts \
  electron/__tests__/features/workspace/runtime/host-doctor.test.ts \
  electron/__tests__/features/workspace/runtime/host-substrate-factory.test.ts \
  electron/__tests__/features/workspace/runtime/posix-substrate.test.ts \
  electron/__tests__/features/workspace/runtime/docker-doctor.test.ts \
  electron/__tests__/features/workspace/runtime/docker-backend.test.ts \
  electron/__tests__/features/workspace/runtime/apple-container-backend.test.ts \
  electron/__tests__/ipc/runtime-boundaries.test.ts \
  electron/__tests__/ipc/workspace-runtime-reconcile.test.ts \
  electron/__tests__/features/container/tools-browser-agent.test.ts
pnpm typecheck
```

Manual smoke:

- macOS Apple Silicon: Apple Container, Docker, Host.
- macOS Intel: Docker, Host when supported by the current matrix.
- Linux: Docker, Host.
- Windows: Docker Desktop and Host where the current host-mode release matrix gates it.

Do not use this historical PR #177 plan as the current Windows Host/WSL release gate; use `docs/reference/host-mode-support.md`.
