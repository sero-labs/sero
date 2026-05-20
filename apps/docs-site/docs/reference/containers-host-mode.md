# Containers and Host Mode

Sero can run a workspace through a container-backed runtime or through explicit Host mode. Apple Container and Docker/Podman provide the container-backed options. Host mode runs commands in the real host workspace directory and is a reduced-capability runtime, not an automatic replacement for a selected container runtime.

Selected container runtimes fail closed when unavailable: fix the container runtime or explicitly choose a different runtime. For the canonical platform and runtime support contract, see [Support Scope](/reference/support-scope).

This page explains runtime expectations. For task-oriented dev-server setup, see [Containers and Dev Servers](/guide/containers-dev-servers). For lifecycle, mounts, and networking details, see [Container Isolation](/reference/container-isolation).

![Container-backed workspaces compared with host mode](../assets/generated/img5.jpg)

## Runtime modes

### Container-backed workspaces

Container-backed runtimes are the preferred path for the full Sero experience. They are intended for:

- workspace execution inside the selected runtime
- project access at `/workspace` inside the runtime
- runtime-provided tooling, language servers, and compiler stacks from the image
- browser automation from the runtime image
- managed preview and dev-server flows that expose runtime-specific host-reachable URLs
- Linux/container parity and container networking semantics

### Host mode

Host mode is a **supported explicit runtime**, not feature parity with containers.

Host mode is appropriate for:

- onboarding and provider setup
- core agent chat and coding tasks
- file browsing and editing
- general host-shell development workflows from the real workspace cwd
- running and registering normal host dev servers

Host mode is reduced for:

- containerized language servers and image-provided compiler stacks
- Linux/container networking semantics
- full container isolation
- browser automation unless a published browser pack is available for your platform and Doctor confirms it launches

In Host mode, shell commands run from the actual host workspace directory. Use relative paths such as `src/App.tsx` or real host paths in terminal commands. `/workspace` is reserved for container-backed runtimes and Sero API compatibility aliases; it is not a host shell path to rely on.

If a workflow works in containers but fails in Host mode, check whether that workflow depends on container-only capabilities. Defer exact platform support and Windows runtime guidance to [Support Scope](/reference/support-scope).

## Requirements for container-backed mode

For Apple Container on Apple Silicon macOS, the public setup checks are:

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
```

If the system is installed but not running, start it:

```bash
/usr/local/bin/container system start
```

For Docker-backed workspaces, Docker or Podman must be installed and running:

```bash
docker info
podman info
```

The runtime picker labels this option **Docker / Podman**, while the persisted backend ID remains `docker`. Sero prefers Docker when both CLIs are available, can retry Podman if auto-selected Docker cannot reach its daemon, and respects explicit overrides such as `SERO_CONTAINER_ENGINE=podman` or `SERO_DOCKER_BIN=/path/to/binary`.

Sero expects the workspace image:

```text
ghcr.io/sero-labs/sero-node:latest
```

If you change `apps/desktop/images/Dockerfile.sero-node` or container-installed tools, rebuild the image and recreate affected workspace containers before expecting new workspaces or existing containers to pick up those changes.

For the deeper source guide, see [`docs/guides/macos-containers.md`](https://github.com/sero-labs/sero/blob/main/docs/guides/macos-containers.md).

## Runtime selection in the app

Sero checks runtime availability during startup and onboarding. Container startup failures are non-fatal to the app, but the selected workspace runtime reports an actionable failure until you fix it or explicitly select another supported runtime.

Source-confirmed user-facing surfaces include:

- onboarding/preflight diagnostics for runtime availability
- a per-workspace runtime picker in the workspace tree
- a workspace status indicator for runtime state
- terminal creation that resolves to container or host terminal based on the workspace runtime

The workspace runtime picker is per workspace. Do not assume one global switch controls every workspace.

## Logs and troubleshooting

Useful local logs include:

```text
/tmp/sero-vite.log
/tmp/sero-electron.log
/tmp/sero-web-remote-watch.log
/tmp/sero-remote-<plugin>.log
```

For container-specific problems, start with:

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
/usr/local/bin/container system start
docker info
podman info
```

Common situations:

### Container runtime command is missing

Sero treats that runtime as unavailable and will not execute that workspace through Host mode unless you explicitly select Host and your platform is supported for it. For Apple Container, install Apple's container CLI and confirm it exists at `/usr/local/bin/container`. For Docker/Podman, install a compatible engine and confirm `docker info` or `podman info` succeeds.

### Container system is installed but unavailable

For Apple Container, run `container system start`, wait for `container system status` to report a healthy/running state, then restart or retry the affected Sero workflow. For Docker/Podman, start Docker Desktop, the Docker daemon, or the Podman machine/service and retry.

### A workspace behaves incorrectly after changing the image

Rebuild `sero-node:latest` and recreate affected workspace containers. Existing containers do not automatically receive changes made to the Dockerfile or base tooling.

### A feature works in one runtime but not another

Check whether the feature requires browser automation, containerized language servers, managed preview behavior, or container networking. If so, use a container-backed workspace. If Host browser automation is relevant, confirm your platform has an available browser pack and that Doctor reports it ready.

## Support caveats

During the current alpha, do not treat containers as:

- a hardened multi-tenant security boundary
- identical runtime behavior on every operating system
- a promise of full host/container feature parity
- a guarantee that proxy, cleanup, or status reporting is perfect in every local setup

Do not treat Host mode as:

- container isolation
- Linux/container networking parity
- a compiler-stack manager
- browser automation without a ready browser pack
- an automatic rescue path for a selected container runtime

Container-backed mode is the recommended runtime for the full experience. Host mode is a practical explicit alternative for supported direct-host workflows.

## Related docs

- [Containers and Dev Servers](/guide/containers-dev-servers)
- [Container Isolation](/reference/container-isolation)
- [Explorer Workspace](/guide/explorer-workspace)
- [Support Scope](/reference/support-scope)
- [Troubleshooting](/reference/troubleshooting)
- [Architecture](/reference/architecture)
- [Security / Privacy](/reference/security-privacy)
