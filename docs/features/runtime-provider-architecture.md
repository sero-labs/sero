# Runtime provider architecture

Status: host-first local runtime architecture.

Sero supports local, live workspace runtimes through three canonical backend IDs:

- `host` — direct host runtime on macOS Apple Silicon, Linux, and Windows x64.
- `docker` — Docker-compatible execution through Docker Desktop, Docker Engine, or Podman.
- `apple-container` — Apple Container on supported macOS hosts.

`mac-host` is a deprecated compatibility alias. Existing workspace config files that contain `{ "runtime": { "backend": "mac-host" } }` are accepted on read, normalized to `host` in IPC/runtime state, and rewritten as `host` on the next config write. New docs, UI, and config should use only `host`.

Remote runtimes, cloud runtimes, and policy/profile sandbox controls are out of scope for this local runtime architecture.

## Goals

Sero uses one runtime abstraction for the normal workspace loop so every backend owns its own execution, file, process, terminal, preview, and diagnostic behavior.

Required properties:

- Host is the recommended runtime for new workspaces when the rollout flag is enabled.
- Existing workspaces keep their persisted `runtime.backend`.
- Host and runtime file changes are visible immediately without push/pull sync.
- Selected container runtimes fail closed with actionable diagnostics; they do not silently fall back to host execution.
- Preview URLs returned to the app and gateway are host-reachable `http://127.0.0.1:<port>` URLs.
- Runtime diagnostics distinguish static support from current install/Doctor availability.

## Workspace access and path policy

```ts
export type RuntimeWorkspaceAccess = 'host' | 'live-mount';
```

- `host` uses real host workspace paths for execution cwd on macOS, Linux, and Windows.
- Sero file/runtime APIs may continue accepting `/workspace/...` as a compatibility alias and translate it to the real host path internally.
- `apple-container` and `docker` use `live-mount` access with the primary workspace mounted at `/workspace` inside the container.

Do not create a real host `/workspace` symlink, mount, or global directory. New tools, prompts, browser flows, and plugin APIs should prefer relative paths or backend-provided cwd/temp helpers.

## Runtime support matrix

Detailed platform/arch release status lives in [`../reference/host-mode-support.md`](../reference/host-mode-support.md). Summary:

| Platform | Arch | Host runtime | Host browser pack | Packaged app | Status |
| --- | --- | --- | --- | --- | --- |
| macOS | arm64 | Supported with `SERO_HOST_FIRST=1` | Required published GitHub Release artifact | DMG/ZIP | Release-supported target |
| macOS | x64 | Unsupported | Not published | Not published | Future/unsupported |
| Linux | x64/arm64 | Supported with `SERO_HOST_FIRST=1` | Required published GitHub Release artifact | AppImage/deb/tar.gz | Release-supported target |
| Windows | x64 | Supported with `SERO_HOST_FIRST=1` | Required published GitHub Release artifact | NSIS/ZIP | Release-supported target |
| Windows | arm64 | Not defaulted | Not published | Not published | Future/unsupported |

| Capability | Host | Docker / Podman | Apple Container |
| --- | --- | --- | --- |
| macOS | Yes | Yes | Apple Silicon recommended |
| Linux | Yes | Yes | No |
| Windows x64 | Yes, native Windows with verified Bash/MSYS-compatible shell | Yes | No |
| Browser automation | Published browser pack + Doctor readiness after release gate | Preinstalled in image | Preinstalled in image |
| Native build tools | User-installed or container fallback | Image-provided | Image-provided |
| Sandbox | No | Container isolation | Container isolation |
| Workspace execution path | Real host path | `/workspace` | `/workspace` |

Host runtime targets practical workspace parity for file operations, exec/spawn, terminals, Git/VCS, language servers, managed dev servers, process/port management, preview URLs, and browser automation after browser pack installation.

## Runtime capabilities and install state

Backends report real capabilities for command execution, file access/watch, Git/VCS, terminals, managed dev servers, previews, logs, health checks, browser automation, and language servers.

Callers must use runtime diagnostics instead of branching on provider-specific implementation details. Diagnostics expose:

- static support: can this backend ever provide the capability?
- availability: is it available for this workspace right now?
- install state: are core tools, browser pack, and native build tools ready/missing/installing/failed?

Host browser automation is available only when the browser pack is installed and Doctor launch checks pass. Release-supported platforms require published GitHub Release browser-pack artifacts verified by `pnpm --filter @sero/desktop browser-pack:verify-published`; pending entries in `generated-artifacts.json` block the release claim. Local artifact overrides are developer diagnostics only. Native compiler stacks are informational and non-managed.

## Managed host tooling

Packaged-app host mode resolves required CLIs through the host toolchain manager:

1. compatible verified system tool,
2. existing Sero-managed tool,
3. first-use managed install when policy permits,
4. typed failure with retry/fallback metadata.

Managed artifacts are stored under `SERO_FIXED_ROOT`, currently `~/.sero-ui/toolchains/<manifest-version>/`. They are not stored under profile-local `SERO_HOME`, `~/.sero`, or `~/.pi/agent`. See `docs/features/host-toolchain.md`.

Sero does not mutate global Corepack, npm prefixes, shell profiles, or machine PATH for these installs.

## Backend responsibilities

### Host

- Runs directly against the real host workspace path on release-supported macOS Apple Silicon, Linux, and Windows x64.
- Uses resolver-backed shell/tool selection and per-process PATH preparation.
- On Windows, uses native Windows paths and a verified Git Bash/MSYS-compatible shell; WSL is not the default host strategy.
- Translates renderer/API `/workspace` aliases in the main process.
- Supports file ops, exec/spawn, terminals, Git/VCS, language servers, managed dev servers, localhost preview URLs, and browser automation after browser pack install.
- Reports native build tools as user-installed/missing/unknown; Sero does not install compiler stacks.

### Docker / Podman

- Creates one Sero-managed container per workspace with labels identifying the workspace and runtime.
- Uses `ghcr.io/sero-labs/sero-node:<tag>` with `:latest` as the development fallback.
- Mounts the primary workspace at `/workspace` and required Sero agent resources from `SERO_AGENT_DIR` read-only.
- Auto-detects `docker` or `podman`; explicit `SERO_CONTAINER_ENGINE` and `SERO_DOCKER_BIN` selections disable implicit fallback.
- Runs as the host UID/GID on Unix so bind-mounted files stay host-editable; uses Docker Desktop defaults on Windows.
- Provides browser automation and common native build dependencies from the image.
- Provides Doctor checks for CLI, daemon, image, bind mount, permissions, networking, and preview ports.

### Apple Container

- Wraps the existing `ContainerManager` implementation behind `RuntimeBackend`.
- Uses the shared `sero-node` image.
- Live-mounts the workspace at `/workspace`.
- Uses the shared loopback preview-port pool.
- Provides container isolation, browser automation, and image-provided runtime dependencies on supported Macs.

## Platform defaults

The host-first default is rollout-flagged:

| Condition | Default local runtime |
| --- | --- |
| `SERO_HOST_FIRST=1` and release-supported macOS arm64, Linux x64/arm64, or Windows x64 | Host |
| Existing persisted workspace config | Persisted `runtime.backend` |
| Global workspace on supported host platform | Host |
| Flag off, macOS Apple Silicon | Apple Container |
| Flag off, other non-global workspaces | Docker / Podman |

Containers are optional upgrades/fallbacks, not silently selected merely because they are detected when host-first is enabled.

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

## Documentation and smoke tests

- Managed host toolchains: `docs/features/host-toolchain.md`
- Runtime image publishing and bumps: `docs/reference/runtime-images.md`
- Preview port pool behavior: `docs/reference/runtime-preview-ports.md`
- Manual/automated runtime smoke matrix: `docs/reference/runtime-smoke.md`
- Manual runtime checklist: `docs/reference/runtime-manual-test.md`
- User-facing Docker runtime summary: `docs/features/docker-runtime.md`
