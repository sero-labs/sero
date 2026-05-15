# Container Isolation

Container-backed workspaces are Sero's preferred runtime across supported platforms. Apple Container and the Docker-compatible runtime (Docker or Podman, saved as backend ID `docker`) isolate workspace execution from the host enough to provide reproducible tooling, runtime networking, and per-workspace dev-server previews, but they are not documented as a hardened multi-tenant security boundary.

## Lifecycle

| Behavior | Current implementation |
|---|---|
| Container id | `sero-<workspaceId>` from `containerId(workspaceId)` or the runtime-specific equivalent. |
| Image | `ghcr.io/sero-labs/sero-node:latest` by default for Docker/Podman-backed workspaces; Apple Container uses the same Sero node image contents in its separate image store. |
| Start model | Lazy/deduplicated `ensure()` per workspace; stopped containers are reused when possible. |
| System runtime | Apple Container (`/usr/local/bin/container`) or Docker/Podman; Sero can start the Apple Container system if it is installed but stopped. |
| Recovery | Stale/ghost containers may be force-removed or recreated. |
| Host alternative | On macOS/Linux, explicitly select Host when you want reduced direct-host execution. Selected container runtimes fail closed if unavailable. |

```text
Workspace opened
   ↓
Runtime action needs container
   ↓
ensure runtime + image + `sero-<workspaceId>`
   ↓
mount workspace and configured extra roots
   ↓
run terminals/tools/dev servers through the active runtime backend
```

## Mounts

| Mount | Semantics |
|---|---|
| Primary workspace | Host workspace path mounted at `/workspace`. |
| Read-only extra mounts | Existing host directories mounted at the same absolute path with `:ro`; used for readable shared resources. |
| Writable extra mounts | Existing host directories mounted at the same absolute path; used where cross-workspace writes are intended. |
| Attached/plugin roots | Workspace configuration can add roots; a running container may need recreation before new mounts appear. |

Missing extra mount directories are skipped rather than created. Do not assume every host path is visible in the container.

## Environment and networking

Sero writes shell profile defaults such as:

```text
TERM=xterm-256color
HOST=0.0.0.0
VITE_HOST=0.0.0.0
HOSTNAME=0.0.0.0
```

When Sero's container HTTP proxy starts, proxy variables are also injected and `NO_PROXY` includes localhost and the container subnet. DNS fallback is best effort.

Dev-server URLs are resolved by the active runtime backend. Apple Container and Docker/Podman expose host-reachable forwarded URLs, and host mode exposes a localhost URL. The registry id is scope-aware:

```text
workspaceId:scope:cardId:port
```

The registry is in-memory and liveness is checked periodically. It does not persist across app restart.

## Stopping and restarting dev servers

Container-backed runtimes stop a dev server by finding processes listening on the port inside the runtime with `ss`, terminating the process group, and force-killing remaining listeners if needed. Restart re-runs the original registered command through the active runtime backend.

This means stop/restart depends on the registered id and runtime process state, not just a host-side port forward.

## Host mode

Host mode keeps core workflows available when you explicitly select it on macOS/Linux:

- onboarding and provider setup
- chat and coding tasks
- file browsing/editing
- normal host terminal workflows

It is reduced for:

- browser automation
- containerized language servers/tooling
- Linux/container parity
- managed preview and dev-server automation
- container networking semantics

See [Containers and Host Mode](/reference/containers-host-mode) for user-facing runtime guidance.

## Cleanup and image changes

If you change `apps/desktop/images/Dockerfile.sero-node` or tools installed in the image, rebuild `ghcr.io/sero-labs/sero-node:latest` and recreate affected workspace containers. Existing containers do not automatically receive Dockerfile changes. Podman uses the same fully-qualified image refs as Docker, while Apple Container has a separate image store from Docker/Podman; rebuild/import there separately when testing that runtime.

Use the app/runtime controls where available. If debugging manually, be careful: deleting or restarting Apple Container, Docker, or Podman resources can stop other running containers on the machine.

## Security caveats

Container-backed mode improves runtime separation and keeps per-workspace execution scoped, but it is not a substitute for:

- reviewing agent changes
- redacting secrets before sharing logs
- OS-level account separation for highly sensitive projects
- network allow/deny controls for untrusted code

## Related docs

- [Containers and Dev Servers](/guide/containers-dev-servers)
- [Containers and Host Mode](/reference/containers-host-mode)
- [Security / Privacy](/reference/security-privacy)
- [Troubleshooting](/reference/troubleshooting)
