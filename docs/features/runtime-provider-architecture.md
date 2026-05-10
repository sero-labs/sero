# Runtime provider architecture

Status: v1 local runtime architecture.

This document describes Sero's runtime-provider boundary after the Docker runtime backend work. The v1 product supports only local, live workspace runtimes:

- `apple-container` — Apple Container on supported macOS hosts.
- `docker` — Docker Desktop or Docker Engine, the normal path for macOS Intel, Windows, and Linux.
- `mac-host` — direct macOS host execution for advanced local workflows.

Remote runtimes, cloud runtimes, and policy/profile sandbox controls are out of scope for v1. They must not appear as selectable providers, provider IDs, docs, eval targets, or UI copy.

## Goals

Sero uses one runtime abstraction for the normal workspace loop so every backend owns its own execution, file, process, terminal, preview, and diagnostic behavior.

Required properties:

- Primary workspaces are exposed to container runtimes at `/workspace` by live bind mount.
- Host and runtime file changes are visible immediately without push/pull sync.
- Runtime-created files remain editable and deletable from the host.
- Selected container runtimes fail closed with actionable diagnostics; they do not silently fall back to host execution.
- Preview URLs returned to the app and gateway are host-reachable `http://127.0.0.1:<hostPort>` URLs.

## Provider IDs

```ts
export type RuntimeBackendId = 'apple-container' | 'docker' | 'mac-host';
```

Persist workspace selection as:

```json
{
  "runtime": { "backend": "docker" }
}
```

Legacy `container?: boolean` values are read only for migration. New writes should persist `runtime.backend`.

## Workspace access

```ts
export type RuntimeWorkspaceAccess = 'host' | 'live-mount';
```

- `mac-host` uses `host` access and translates renderer `/workspace` paths to the real host workspace path.
- `apple-container` and `docker` use `live-mount` access with the primary workspace mounted at `/workspace`.

Explicit upload/download sync is not part of the v1 runtime model.

## Runtime capabilities

Backends report real capabilities for:

- command execution and long-running processes
- file read/write/list/tree mutation/watch
- Git and VCS operations
- interactive terminals
- managed dev servers
- port forwarding and preview URL resolution
- logs and health checks
- browser automation and language servers

Callers must check capabilities instead of branching on provider-specific implementation details.

## Backend responsibilities

### Apple Container

- Wraps the existing `ContainerManager` implementation behind `RuntimeBackend`.
- Uses the shared `sero-node` image.
- Live-mounts the workspace at `/workspace`.
- Uses the shared loopback preview-port pool.
- Preserves existing Apple Container command, terminal, file, Git, dev-server, LSP, and browser behavior where capabilities report support.

### Docker

- Creates one Sero-managed container per workspace with labels identifying the workspace and runtime.
- Uses `ghcr.io/sero-labs/sero-node:<tag>` with `:latest` as the development fallback.
- Mounts the primary workspace at `/workspace` and required Sero agent resources from `SERO_AGENT_DIR` read-only.
- Runs as the host UID/GID on Unix so bind-mounted files stay host-editable; uses Docker Desktop defaults on Windows.
- Executes commands with Docker CLI argument arrays, never shell-concatenated Docker arguments.
- Publishes a preview-port pool on `127.0.0.1` and returns provider-neutral loopback preview URLs.
- Provides Doctor checks for Docker CLI, daemon, image, bind mount, permissions, networking, and preview ports.

### Mac Host

- Runs directly against the macOS host workspace.
- Translates `/workspace` paths to host paths in the main process.
- Is a first-class advanced macOS option, not a fallback for missing Docker on Windows or Linux.
- Reports unsupported capabilities explicitly when container-only features are unavailable.

## Preview URL contract

Callers ask the runtime for a preview URL:

```ts
const preview = await runtime.resolvePreviewUrl({ targetPort: 5173 });
```

The returned URL is always host-accessible:

```ts
{
  url: 'http://127.0.0.1:<hostPort>',
  targetPort: 5173,
  hostPort: 49152,
  backend: 'docker'
}
```

Docker and Apple Container pre-publish internal gateway ports at container creation time, then start an in-runtime bridge from each allocated gateway port to the detected target port. See `docs/reference/runtime-preview-ports.md`.

## Platform defaults

| Platform | Default v1 runtime |
| --- | --- |
| macOS Apple Silicon | Apple Container when available, otherwise Docker with setup diagnostics |
| macOS Intel | Docker |
| Windows | Docker |
| Linux | Docker |
| Global workspace | Mac Host |

Mac Host remains selectable on macOS as an advanced option. Windows and Linux do not silently switch to host execution when Docker is missing or stopped.

## Documentation and smoke tests

- Runtime image publishing and bumps: `docs/reference/runtime-images.md`
- Preview port pool behavior: `docs/reference/runtime-preview-ports.md`
- Manual/automated runtime smoke matrix: `docs/reference/runtime-smoke.md`
- User-facing Docker runtime summary: `docs/features/docker-runtime.md`
