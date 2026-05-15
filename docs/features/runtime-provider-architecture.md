# Runtime provider architecture

Status: cross-platform local runtime architecture.

Sero supports local, live workspace runtimes through three canonical backend IDs:

- `apple-container` — Apple Container on supported macOS hosts.
- `docker` — Docker-compatible execution through Docker Desktop, Docker Engine, or Podman on macOS, Windows, and Linux.
- `host` — direct host runtime on macOS/Linux. Windows workspace execution uses the Docker-compatible runtime.

`mac-host` is a deprecated compatibility alias. Existing workspace config files that contain `{ "runtime": { "backend": "mac-host" } }` are accepted on read, normalized to `host` in IPC/runtime state, and rewritten as `host` on the next config write. New docs, UI, and config should use only `host`.

Remote runtimes, cloud runtimes, and policy/profile sandbox controls are out of scope for this local runtime architecture. They must not appear as selectable providers, provider IDs, docs, eval targets, or UI copy.

## Goals

Sero uses one runtime abstraction for the normal workspace loop so every backend owns its own execution, file, process, terminal, preview, and diagnostic behavior.

Required properties:

- Primary workspaces are exposed to runtimes at `/workspace` by live bind mount or host path translation.
- Host and runtime file changes are visible immediately without push/pull sync.
- Runtime-created files remain editable and deletable from the host.
- Selected container runtimes fail closed with actionable diagnostics; they do not silently fall back to host execution.
- Preview URLs returned to the app and gateway are host-reachable `http://127.0.0.1:<port>` URLs.
- Browser automation remains container-only. The `host` backend must report browser automation as unsupported.

## Provider IDs

```ts
export type RuntimeBackendId = 'apple-container' | 'docker' | 'host';
export type DeprecatedRuntimeBackendId = 'mac-host';
```

Persist workspace selection as:

```json
{
  "runtime": { "backend": "host" }
}
```

Legacy `container?: boolean` values and deprecated `mac-host` backend values are read only for migration. New writes should persist `runtime.backend` with the canonical ID.

## Workspace access

```ts
export type RuntimeWorkspaceAccess = 'host' | 'live-mount';
```

- `host` uses `host` access and translates renderer `/workspace` paths to the real host execution path.
- `apple-container` and `docker` use `live-mount` access with the primary workspace mounted at `/workspace`.

Explicit upload/download sync is not part of the runtime model.

## Runtime support matrix

| Runtime | macOS | Linux | Windows | Browser automation |
| --- | --- | --- | --- | --- |
| Host (`host`) | Yes | Yes | No | No |
| Docker / Podman (`docker`) | Yes | Yes | Yes, through Docker Desktop or Podman | Yes |
| Apple Container (`apple-container`) | Apple Silicon recommended | No | No | Yes |

Host runtime targets practical workspace parity for file operations, exec/spawn, terminals, Git/VCS, language servers, managed dev servers, and preview URLs. Container parity is broader because browser automation remains available only through Docker/Podman and Apple Container.

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

Callers must use `getRuntimeCapabilities(backend, platform, arch)` and runtime diagnostics instead of branching on provider-specific implementation details.

## Backend responsibilities

### Apple Container

- Wraps the existing `ContainerManager` implementation behind `RuntimeBackend`.
- Uses the shared `sero-node` image.
- Live-mounts the workspace at `/workspace`.
- Uses the shared loopback preview-port pool.
- Preserves existing Apple Container command, terminal, file, Git, dev-server, LSP, and browser behavior where capabilities report support.

### Docker / Podman

- Creates one Sero-managed container per workspace with labels identifying the workspace and runtime.
- Uses `ghcr.io/sero-labs/sero-node:<tag>` with `:latest` as the development fallback.
- Mounts the primary workspace at `/workspace` and required Sero agent resources from `SERO_AGENT_DIR` read-only.
- Auto-detects `docker` or `podman`; Docker is preferred when both are available, but an auto-selected Docker daemon failure can retry through Podman. Explicit `SERO_CONTAINER_ENGINE` and `SERO_DOCKER_BIN` selections disable implicit fallback.
- Runs as the host UID/GID on Unix so bind-mounted files stay host-editable; uses Docker Desktop defaults on Windows.
- Marks `/workspace` as a Git `safe.directory` and copies host Git identity into the container so mounted repositories are usable with arbitrary UID/GID mappings.
- Executes Docker-compatible CLI commands with argument arrays, never shell-concatenated runtime arguments.
- Publishes a preview-port pool on `127.0.0.1` and returns provider-neutral loopback preview URLs.
- Provides Doctor checks for CLI, daemon, image, bind mount, permissions, networking, and preview ports.

### Host

- Runs directly against the host workspace on macOS and Linux.
- Is not supported on Windows; Windows workspace execution uses the Docker-compatible runtime.
- Translates renderer `/workspace` paths in the main process.
- Supports file ops, exec/spawn, terminals, Git/VCS, language servers, managed dev servers, and localhost preview URLs.
- Reports unsupported capabilities explicitly when container-only features such as browser automation are unavailable.

## Windows runtime rule

Windows workspace execution uses the Docker-compatible runtime. The `host` backend is intentionally not
available on Windows, and Sero does not run workspace commands through native
PowerShell/cmd host mode.

## Preview URL contract

Callers ask the runtime for a preview URL:

```ts
const preview = await runtime.resolvePreviewUrl({ targetPort: 5173 });
```

The returned URL is always host-accessible:

```ts
{
  url: 'http://127.0.0.1:<port>',
  targetPort: 5173,
  hostPort: 49152,
  backend: 'docker'
}
```

Docker/Podman and Apple Container pre-publish internal gateway ports at container creation time, then start an in-runtime bridge from each allocated gateway port to the detected target port. Host runtime returns direct localhost URLs for managed dev servers. See `docs/reference/runtime-preview-ports.md`.

## Platform defaults

| Platform | Default local runtime |
| --- | --- |
| macOS Apple Silicon | Apple Container when available, otherwise Docker / Podman with setup diagnostics |
| macOS Intel | Docker / Podman |
| Windows | Docker / Podman |
| Linux | Docker / Podman |
| Global workspace | Host |

Host remains selectable as an advanced local option on macOS and Linux. Windows and Linux do not silently switch to host execution when the selected Docker-compatible runtime is missing or stopped.

## Documentation and smoke tests

- Runtime image publishing and bumps: `docs/reference/runtime-images.md`
- Preview port pool behavior: `docs/reference/runtime-preview-ports.md`
- Manual/automated runtime smoke matrix: `docs/reference/runtime-smoke.md`
- Manual host runtime checklist: `docs/reference/runtime-manual-test.md`
- User-facing Docker runtime summary: `docs/features/docker-runtime.md`
