# Docker-backed local runtime

Sero v1 runtime support is local only:

- **Apple Container** on supported Apple Silicon Macs.
- **Docker** through Docker Desktop or Docker Engine on macOS, Windows, and Linux.
- **Mac Host** as an advanced macOS direct-host option.

Remote execution, hosted/cloud runtimes, and policy sandbox UX are out of scope for v1.

## Docker behavior

Docker workspaces run in a Sero-managed Linux container named for the workspace. The host workspace is bind-mounted live at `/workspace`, so agent edits, terminal commands, Git operations, editor changes, and dev-server files all operate on the same files without upload/download sync.

Sero uses the shared `ghcr.io/sero-labs/sero-node` image for Docker and Apple Container. See `docs/reference/runtime-images.md` for image tags, publishing, and recreate behavior.

## Preview URLs

Docker and Apple Container both use loopback host-port pools. Managed dev servers return host-reachable URLs such as:

```text
http://127.0.0.1:<hostPort>
```

The gateway proxies those provider-neutral URLs and does not inspect container IPs. See `docs/reference/runtime-preview-ports.md` for the pool size and recreation notes.

## Platform support

| Platform | v1 backend |
| --- | --- |
| macOS Apple Silicon | Apple Container recommended; Docker available |
| macOS Intel | Docker Desktop |
| Linux | Docker Engine |
| Windows | Docker Desktop manual smoke path |
| macOS advanced | Mac Host |

When Docker or Apple Container is selected and unavailable, Sero reports a runtime/Doctor failure instead of silently falling back to host execution.

## Smoke coverage

Use `docs/reference/runtime-smoke.md` for the full smoke matrix, including the committed Windows Docker Desktop manual checklist.
