# Container Isolation

Container-backed workspaces are Sero's preferred runtime on macOS Apple Silicon. They isolate workspace execution from the host enough to provide reproducible tooling, container networking, and per-workspace dev-server previews, but they are not documented as a hardened multi-tenant security boundary.

Source checked: `apps/desktop/electron/features/container/**`, `apps/desktop/electron/cli/commands/container/devserver.ts`, `docs/guides/macos-containers.md`, and AD-018 in `docs/decisions.md`. AD-019 was used only as historical context because the current code differs for registry ids and stop behavior.

## Lifecycle

| Behavior | Current implementation |
|---|---|
| Container id | `sero-<workspaceId>` from `containerId(workspaceId)`. |
| Image | `sero-node:latest` by default. |
| Start model | Lazy/deduplicated `ensure()` per workspace; stopped containers are reused when possible. |
| System runtime | `/usr/local/bin/container`; Sero can start the container system if it is installed but stopped. |
| Recovery | Stale/ghost containers may be force-removed or recreated. |
| Fallback | If containers are unavailable, Sero can continue in reduced host mode. |

```text
Workspace opened
   ↓
Runtime action needs container
   ↓
ensure system + image + `sero-<workspaceId>`
   ↓
mount workspace and configured extra roots
   ↓
run terminals/tools/dev servers via `container exec`
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

Dev-server URLs prefer a detected port URL from the port scanner, then the container IP, then localhost. The registry id is scope-aware:

```text
workspaceId:scope:cardId:port
```

The registry is in-memory and liveness is checked periodically. It does not persist across app restart.

## Stopping and restarting dev servers

The current implementation stops a dev server by finding processes listening on the port inside the container with `ss`, terminating the process group, and force-killing remaining listeners if needed. Restart re-runs the original registered command in the background with `setsid`.

This means stop/restart depends on the registered id and container process state, not a host-side port forward.

## Host-mode fallback

Host mode keeps core workflows available when the container runtime is missing or disabled:

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

See [Containers and Host Mode](/reference/containers-host-mode) for user-facing fallback guidance.

## Cleanup and image changes

If you change `apps/desktop/images/Dockerfile.sero-node` or tools installed in the image, rebuild `sero-node:latest` and recreate affected workspace containers. Existing containers do not automatically receive Dockerfile changes.

Use the app/runtime controls where available. If debugging manually, be careful: deleting or restarting Apple container system resources can stop other running containers on the machine.

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
