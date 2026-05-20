# Docker-backed local runtime

Sero runtime support is local only:

- **Apple Container** on supported Apple Silicon Macs.
- **Docker / Podman** through a Docker-compatible CLI on macOS, Windows, and Linux. The persisted backend ID remains `docker`.
- **Host** as an advanced direct-host option on release-supported macOS Apple Silicon, Linux, and Windows x64 targets. Windows x64 Host is an internal host-first release target behind `SERO_HOST_FIRST=1`; the public support scope can still keep Windows workspace execution on Docker/Podman until deliberately changed.

Remote execution, hosted/cloud runtimes, and policy sandbox UX are out of scope.

## Docker behavior

Docker workspaces run in a Sero-managed Linux container named for the workspace. The host workspace is bind-mounted live at `/workspace`, so agent edits, terminal commands, Git operations, editor changes, and dev-server files all operate on the same files without upload/download sync.

The `docker` backend can execute through either Docker or Podman. Sero auto-detects `docker` or `podman` on `PATH` plus common install locations; Docker is preferred when both are available. If the auto-selected Docker CLI reports a daemon connection failure and Podman is available, Sero retries the command with Podman and remembers the working implicit engine. Explicit selections are respected: set `SERO_CONTAINER_ENGINE=podman` to force Podman, `SERO_CONTAINER_ENGINE=docker` to force Docker, or `SERO_DOCKER_BIN=/path/to/binary` for a specific executable.

Sero uses the shared `ghcr.io/sero-labs/sero-node` image for Docker/Podman and Apple Container. See `docs/reference/runtime-images.md` for image tags, publishing, and recreate behavior.

## Container parity vs host parity

Docker/Podman and Apple Container provide the full container feature set, including browser automation from the runtime image. Host runtime targets practical workspace parity for file operations, exec/spawn, terminals, Git/VCS, language servers, managed dev servers, preview URLs, and browser automation when a published browser pack is installed and Doctor launch checks pass.

The canonical non-container backend ID is `host`. The old `mac-host` value is a deprecated read-time alias only; existing configs are normalized to `host` on write. The detailed Host release matrix and browser-pack gates live in [`../reference/host-mode-support.md`](../reference/host-mode-support.md).

## Preview URLs

Docker/Podman and Apple Container both use loopback host-port pools. Managed dev servers return host-reachable URLs such as:

```text
http://127.0.0.1:<hostPort>
```

The gateway proxies those provider-neutral URLs and does not inspect container IPs. See `docs/reference/runtime-preview-ports.md` for the pool size and recreation notes.

Host runtime returns direct `http://127.0.0.1:<port>` preview URLs for managed dev servers on release-supported macOS Apple Silicon, Linux, and Windows x64 host-first targets.

## Platform support

| Runtime | macOS | Linux | Windows | Browser automation |
| --- | --- | --- | --- | --- |
| Apple Container | Apple Silicon recommended | No | No | Runtime image |
| Docker / Podman (`docker`) | Yes | Yes | Yes, through Docker Desktop or Podman | Runtime image |
| Host (`host`) | Release-supported on arm64 | Release-supported on x64/arm64 | Release-supported on x64 behind host-first release gates | Published browser pack + Doctor readiness |

When Docker/Podman or Apple Container is selected and unavailable, Sero reports a runtime/Doctor failure instead of silently falling back to host execution. Native Windows Host uses a verified Git Bash/MSYS-compatible shell and is gated by the internal host-first release matrix; keep public Windows support wording in `apps/docs-site/docs/reference/support-scope.md` separate unless that public contract is deliberately changed.

## Path policy

Docker/Podman and Apple Container execute commands inside the runtime with the primary workspace mounted at `/workspace`. Host execution uses the real workspace cwd; `/workspace` on Host is only a Sero file/runtime API compatibility alias, not a real mount or shell path.

## Smoke coverage

Use `docs/reference/runtime-smoke.md` for the full smoke matrix and `docs/reference/runtime-manual-test.md` for host runtime manual checks across the host-first release targets.
