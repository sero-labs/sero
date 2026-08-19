# Container Isolation

Container runtimes run workspace commands inside Sero-managed containers. Apple Container and Docker / Podman provide container mounts, container networking behavior, runtime-image tooling, browser automation from the image, and per-workspace dev-server previews. They are not documented as a hardened multi-tenant security boundary.

Host is the direct-host runtime where supported. It uses the real host workspace directory and normal host networking rather than container mounts or container network semantics. For the exact public support matrix, see [Support Scope](/reference/support-scope). For choosing a runtime, see [Choose a Workspace Runtime](/guide/choose-workspace-runtime).

## Lifecycle

| Behavior | Current implementation |
| --- | --- |
| Container id | `sero-<workspaceId>` from `containerId(workspaceId)` or the runtime-specific equivalent. |
| Image | `ghcr.io/sero-labs/sero-node:latest` by default for Docker / Podman-backed workspaces; Apple Container uses the same Sero node image contents in its separate image store. |
| Start model | Lazy/deduplicated `ensure()` per workspace; stopped containers are reused when possible. |
| System runtime | Apple Container (`/usr/local/bin/container`) or Docker / Podman; Sero can start the Apple Container system if it is installed but stopped. |
| Recovery | Stale or ghost containers may be force-removed or recreated. |
| Host alternative | Explicitly select Host when you want supported direct-host execution. Selected container runtimes fail closed if unavailable. |

```text
Workspace opened
   ↓
Runtime action needs container
   ↓
ensure runtime + image + `sero-<workspaceId>`
   ↓
mount workspace and configured extra roots
   ↓
run terminals/tools/dev servers through the active container runtime
```

## Mounts

Container runtimes use these mount semantics:

| Mount | Semantics |
| --- | --- |
| Primary workspace | Host workspace path mounted at `/workspace` inside the container. |
| Read-only extra mounts | Existing host directories mounted at the same absolute path with `:ro`; used for readable shared resources. |
| Writable extra mounts | Existing host directories mounted at the same absolute path; used where cross-workspace writes are intended. |
| Attached/plugin roots | Workspace configuration can add roots; a running container may need recreation before new mounts appear. |

Missing extra mount directories are skipped rather than created. Do not assume every host path is visible in the container.

In Host mode, shell commands run in the real workspace directory on the host. Use relative paths such as `package.json` or real host paths. `/workspace` is only a Sero file/runtime API compatibility alias in Host mode; it is not a host mount or shell path.

## Environment and networking

Sero writes shell profile defaults for container runtimes such as:

```text
TERM=xterm-256color
HOST=0.0.0.0
VITE_HOST=0.0.0.0
HOSTNAME=0.0.0.0
```

When Sero's container HTTP proxy starts, proxy variables are also injected and `NO_PROXY` includes localhost and the container subnet. DNS fallback is best effort.

Dev-server URLs are resolved by the active workspace runtime. All backends report a host-reachable loopback URL. Do not construct a URL from a container IP. Host uses `127.0.0.1`. The registry id is scope-aware:

```text
workspaceId:scope:cardId:port
```

The registry is in-memory and liveness is checked periodically. It does not persist across app restart.

## Stopping and restarting dev servers

Container runtimes stop a dev server by finding processes listening on the port inside the runtime with `ss`, terminating the process group, and force-killing remaining listeners if needed. Restart re-runs the original registered command through the active workspace runtime.

This means stop/restart depends on the registered id and runtime process state, not just a host-side port forward.

In Host mode, a server started by Sero is owned by Sero, so stop terminates its process tree. A server that you start and then register remains your process. For that server, stop only updates Sero's record. Stop the process in its terminal.

## Host behavior

Host keeps direct local workflows available on supported platforms:

- chat and coding tasks
- file browsing/editing
- normal host terminal workflows
- localhost dev-server registration and preview

Host browser-agent tools require an installed browser pack that passes its launch check. Host does not provide containerized language servers or tooling, Linux/container parity, image-provided compiler stacks, or container networking semantics.

See [Containers and Host Mode](/reference/containers-host-mode) for exact runtime behavior and failure rules.

## Cleanup and image changes

If you change `apps/desktop/images/Dockerfile.sero-node` or tools installed in the image, rebuild `ghcr.io/sero-labs/sero-node:latest` and recreate affected workspace containers. Existing containers do not automatically receive Dockerfile changes.

Podman uses the same fully-qualified image refs as Docker, while Apple Container has a separate image store from Docker / Podman; rebuild or import there separately when testing that runtime.

Use the app/runtime controls where available. If debugging manually, be careful: deleting or restarting Apple Container, Docker, or Podman resources can stop other running containers on the machine.

## Security caveats

Container runtimes improve runtime separation and keep per-workspace execution scoped, but they are not a substitute for:

- reviewing agent changes
- redacting secrets before sharing logs
- OS-level account separation for highly sensitive projects
- network allow/deny controls for untrusted code

## Related docs

- [Choose a Workspace Runtime](/guide/choose-workspace-runtime)
- [Preview Dev Servers](/guide/containers-dev-servers)
- [Containers and Host Mode](/reference/containers-host-mode)
- [Support Scope](/reference/support-scope)
- [Security / Privacy](/reference/security-privacy)
- [Troubleshooting](/reference/troubleshooting)
