# Docker-backed local runtime

Sero runtime support is local only:

- **Apple Container** on supported Apple Silicon Macs.
- **Docker / Podman** through a Docker-compatible CLI on macOS, Windows, and Linux. The persisted backend ID remains `docker`.
- **Host** as an advanced direct-host option on macOS/Linux. Windows workspace execution uses the Docker-compatible runtime.

Remote execution, hosted/cloud runtimes, and policy sandbox UX are out of scope.

## Docker behavior

Docker workspaces run in a Sero-managed Linux container named for the workspace. The host workspace is bind-mounted live at `/workspace`, so agent edits, terminal commands, Git operations, editor changes, and dev-server files all operate on the same files without upload/download sync.

The `docker` backend can execute through either Docker or Podman. Sero auto-detects `docker` or `podman` on `PATH` plus common install locations; Docker is preferred when both are available. If the auto-selected Docker CLI reports a daemon connection failure and Podman is available, Sero retries the command with Podman and remembers the working implicit engine. Explicit selections are respected: set `SERO_CONTAINER_ENGINE=podman` to force Podman, `SERO_CONTAINER_ENGINE=docker` to force Docker, or `SERO_DOCKER_BIN=/path/to/binary` for a specific executable.

Sero uses the shared `ghcr.io/sero-labs/sero-node` image for Docker/Podman and Apple Container. See `docs/reference/runtime-images.md` for image tags, publishing, and recreate behavior.

## Container parity vs host parity

Docker/Podman and Apple Container provide the full container feature set, including browser automation. Host runtime targets practical workspace parity for file operations, exec/spawn, terminals, Git/VCS, language servers, managed dev servers, and preview URLs, but browser automation remains container-only.

The canonical non-container backend ID is `host`. The old `mac-host` value is a deprecated read-time alias only; existing configs are normalized to `host` on write.

## Preview URLs

Docker/Podman and Apple Container both use loopback host-port pools. Managed dev servers return host-reachable URLs such as:

```text
http://127.0.0.1:<hostPort>
```

The gateway proxies those provider-neutral URLs and does not inspect container IPs. See `docs/reference/runtime-preview-ports.md` for the pool size and recreation notes.

Host runtime returns direct `http://127.0.0.1:<port>` preview URLs for managed dev servers on macOS/Linux.

## Platform support

| Runtime | macOS | Linux | Windows | Browser automation |
| --- | --- | --- | --- | --- |
| Apple Container | Apple Silicon recommended | No | No | Yes |
| Docker / Podman (`docker`) | Yes | Yes | Yes, through Docker Desktop or Podman | Yes |
| Host | Yes | Yes | No | No |

When Docker/Podman or Apple Container is selected and unavailable, Sero reports a runtime/Doctor failure instead of silently falling back to host execution. Sero does not run Windows workspaces through native PowerShell/cmd host mode; use the Docker-compatible runtime on Windows.

## Smoke coverage

Use `docs/reference/runtime-smoke.md` for the full smoke matrix and `docs/reference/runtime-manual-test.md` for host runtime manual checks on macOS/Linux.
