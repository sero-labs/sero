# Docker-backed local runtime

Sero runtime support is local only:

- **Apple Container** on supported Apple Silicon Macs.
- **Docker** through Docker Desktop or Docker Engine on macOS, Windows, and Linux.
- **Host** as an advanced direct-host option on macOS/Linux and a WSL 2-backed option on Windows.

Remote execution, hosted/cloud runtimes, and policy sandbox UX are out of scope.

## Docker behavior

Docker workspaces run in a Sero-managed Linux container named for the workspace. The host workspace is bind-mounted live at `/workspace`, so agent edits, terminal commands, Git operations, editor changes, and dev-server files all operate on the same files without upload/download sync.

Sero uses the shared `ghcr.io/sero-labs/sero-node` image for Docker and Apple Container. See `docs/reference/runtime-images.md` for image tags, publishing, and recreate behavior.

## Container parity vs host parity

Docker and Apple Container provide the full container feature set, including browser automation. Host runtime targets practical workspace parity for file operations, exec/spawn, terminals, Git/VCS, language servers, managed dev servers, and preview URLs, but browser automation remains container-only.

The canonical non-container backend ID is `host`. The old `mac-host` value is a deprecated read-time alias only; existing configs are normalized to `host` on write.

## Preview URLs

Docker and Apple Container both use loopback host-port pools. Managed dev servers return host-reachable URLs such as:

```text
http://127.0.0.1:<hostPort>
```

The gateway proxies those provider-neutral URLs and does not inspect container IPs. See `docs/reference/runtime-preview-ports.md` for the pool size and recreation notes.

Host runtime returns direct `http://127.0.0.1:<port>` preview URLs for managed dev servers. On Windows/WSL, Sero diagnoses broken localhost forwarding with `wsl-localhost-forwarding-disabled`.

## Platform support

| Runtime | macOS | Linux | Windows | Browser automation |
| --- | --- | --- | --- | --- |
| Apple Container | Apple Silicon recommended | No | No | Yes |
| Docker | Yes | Yes | Yes, through Docker Desktop | Yes |
| Host | Yes | Yes | WSL 2 required | No |

When Docker or Apple Container is selected and unavailable, Sero reports a runtime/Doctor failure instead of silently falling back to host execution. Windows host runtime uses WSL 2 through `wsl.exe`; Sero does not run host workspaces through native PowerShell or cmd.

## Smoke coverage

Use `docs/reference/runtime-smoke.md` for the full smoke matrix and `docs/reference/runtime-manual-test.md` for host runtime manual checks across macOS, Linux, and Windows/WSL.
