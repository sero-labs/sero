# Cross-platform Host runtime plan

> **Current PR #177 scope:** Windows Host mode / WSL-backed Host execution has been deprecated. Windows uses Docker exclusively. This document now tracks the supported POSIX Host runtime scope for macOS/Linux and keeps Windows Host/WSL work explicitly out of scope.

## Supported runtime model

Sero supports local workspace runtimes through three canonical backend IDs:

```ts
export type RuntimeBackendId = 'apple-container' | 'docker' | 'host';
export type DeprecatedRuntimeBackendId = 'mac-host';
```

Platform support:

| Runtime | macOS | Linux | Windows | Browser automation |
| --- | --- | --- | --- | --- |
| Host (`host`) | Yes | Yes | No | No |
| Docker (`docker`) | Yes | Yes | Yes | Yes |
| Apple Container (`apple-container`) | Apple Silicon recommended | No | No | Yes |

`mac-host` is a deprecated compatibility alias. Existing workspace configs with `{ "runtime": { "backend": "mac-host" } }` are accepted on read, normalized to `host` in IPC/runtime state, and rewritten as `host` on the next config write.

## Goals

- Keep one provider-neutral runtime abstraction for normal workspace execution.
- Expose primary workspaces to runtimes at `/workspace` by live bind mount or host path translation.
- Keep host/runtime file changes immediately visible without upload/download sync.
- Ensure selected Docker/Apple runtimes fail closed with actionable diagnostics instead of silently falling back to host execution.
- Return host-reachable preview URLs such as `http://127.0.0.1:<port>` for every backend.
- Keep browser automation container-only.
- Keep Windows on Docker only for PR #177.

## Host runtime scope

Host runtime is POSIX-only for this workstream:

- macOS direct host execution.
- Linux direct host execution.
- Node/substrate file primitives for file ops.
- Shell exec/spawn, terminals, Git/VCS, LSP, managed dev servers, and direct localhost preview URLs.
- No browser automation.

Windows Host mode is out of scope:

- No native PowerShell/cmd workspace execution.
- No WSL-backed Host execution.
- No WSL path translation, WSLENV propagation, mixed-distro rejection, WSL-native workspace handling, or WSL localhost-forwarding diagnostics.
- The Windows runtime picker should offer Docker only.

## Workspace access

```ts
export type RuntimeWorkspaceAccess = 'host' | 'live-mount';
```

- `host` uses `host` access and translates runtime `/workspace` paths to the real macOS/Linux workspace path in the main process.
- `apple-container` and `docker` use `live-mount` access with the primary workspace mounted at `/workspace`.

## Implementation tasks

### Task 1 — Canonical runtime config

- Use `host`, `docker`, and `apple-container` as canonical backend IDs.
- Accept `mac-host` only as deprecated read-time compatibility input.
- Normalize `mac-host` to `host` on write.
- Default Windows workspaces to Docker.

### Task 2 — Host backend and POSIX substrate

- Implement Host runtime through a POSIX substrate for macOS/Linux.
- Route `exec`, `spawn`, `execFile`, terminals, and file ops through the substrate.
- Keep `HostBackend` free of Docker/Apple-specific behavior.
- Reject Host runtime on Windows with clear Docker guidance.

### Task 3 — Host path safety

- Translate `/workspace/...` to the host workspace path.
- Support configured additional roots.
- Canonicalize existing targets and nearest existing parents before file ops.
- Reject symlink escapes outside allowed workspace roots.

### Task 4 — Runtime-backed VCS and LSP

- Migrate GitRunner/internal GitHub commands to `runtime.execFile`.
- Ensure LSP process cwd/root URIs are valid for the selected backend.
- Keep auth env injection scoped to the execution runtime.

### Task 5 — Managed dev servers and preview URLs

- Host runtime starts managed dev servers on macOS/Linux.
- Detect the first listening child/descendant port.
- Return `http://127.0.0.1:<port>` preview URLs for Host.
- Docker/Apple Container use pre-published loopback preview-port pools.

### Task 6 — Runtime capabilities and UX

- Report capabilities through `getRuntimeCapabilities(backend, platform)`.
- Host: no browser automation; supported on macOS/Linux only.
- Docker: supported on macOS/Linux/Windows.
- Apple Container: supported on macOS where available.
- Runtime picker copy should never expose `mac-host` or Windows Host mode.

## Validation

Automated:

```bash
pnpm --filter @sero/desktop exec vitest run \
  electron/__tests__/features/workspace/runtime/host-substrate-factory.test.ts \
  electron/__tests__/features/workspace/runtime/posix-substrate.test.ts \
  electron/__tests__/features/workspace/runtime/host-backend.test.ts \
  electron/__tests__/features/workspace/runtime/host-dev-server-manager.test.ts \
  electron/__tests__/features/workspace/runtime/host-doctor.test.ts
pnpm --filter @sero/desktop typecheck
pnpm typecheck
```

Manual:

- macOS: Host runtime file/exec/terminal/Git/LSP/dev-server smoke.
- Linux: Host runtime file/exec/terminal/Git/LSP/dev-server smoke.
- Windows: Docker Desktop smoke only.

## Future work

If Windows Host mode is reconsidered later, it should be planned as a separate feature with its own design review, tests, and manual smoke matrix. It should not be treated as part of PR #177.
