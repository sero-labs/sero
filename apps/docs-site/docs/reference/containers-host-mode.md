# Containers and Host Mode

Sero works best with container-backed workspaces. Apple Container and Docker are
the current container-backed runtime options. Host mode is supported as an
explicit reduced-capability macOS/Linux runtime when a workspace is configured
to use the host. Selected container runtimes fail closed when unavailable rather
than silently switching to host execution.

This page explains the current runtime expectations. For task-oriented dev-server setup, see [Containers and Dev Servers](/guide/containers-dev-servers). For lifecycle, mounts, and networking details, see [Container Isolation](/reference/container-isolation). For the canonical support matrix, see [Support Scope](/reference/support-scope).

![Container-backed workspaces compared with host mode](../assets/generated/img5.jpg)

## Runtime modes

### Container-backed workspaces

Container-backed runtime is the preferred path for the full Sero experience. It
is intended for:

- containerized workspace execution
- containerized tooling and language servers
- browser automation
- managed preview and dev-server flows that expose runtime-specific preview URLs
- Linux/container parity and container networking semantics

### Host mode

Host mode is a **supported explicit runtime**, not feature parity with containers.

Host mode is currently appropriate for:

- onboarding and provider setup
- core agent chat and coding tasks
- file browsing and editing
- general host-shell development workflows

Host mode is not currently the supported path for:

- browser automation
- containerized language servers
- feature-equivalent managed preview or dev-server automation
- Linux/container networking semantics
- full container isolation

Host mode can still run and register a normal host dev server on macOS/Linux. The distinction is that Sero's container networking, Linux parity, and browser-automation assumptions do not apply outside container-backed workspaces. Windows workspace execution uses Docker rather than host mode.

If a workflow works in containers but fails in host mode, check whether that
workflow depends on container-only capabilities. On Windows, use Docker-backed
workspaces for runtime execution.

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

For Docker-backed workspaces, Docker must be installed and running:

```bash
docker info
```

Sero expects the workspace image:

```text
ghcr.io/sero-labs/sero-node:latest
```

If you change `apps/desktop/images/Dockerfile.sero-node` or container-installed
tools, rebuild the image and recreate affected workspace containers before
expecting new workspaces or existing containers to pick up those changes.

For the deeper source guide, see
[`docs/guides/macos-containers.md`](https://github.com/sero-labs/sero/blob/main/docs/guides/macos-containers.md).

## Runtime selection in the app

Sero checks container availability during startup and onboarding. Container
startup failures are non-fatal to the app, but the selected workspace runtime
reports an actionable failure until you fix it or explicitly select another
runtime such as Host on macOS/Linux.

Source-confirmed user-facing surfaces include:

- onboarding/preflight diagnostics for container availability
- a per-workspace runtime picker in the workspace tree
- a workspace status indicator for runtime state
- terminal creation that resolves to container or host terminal based on the
  workspace runtime

The workspace runtime picker is per workspace. Do not assume one global switch
controls every workspace.

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
```

Common situations:

### Container runtime command is missing

Sero treats that runtime as unavailable and will not execute that workspace through host mode unless you explicitly select Host on macOS/Linux. For Apple Container, install Apple's container CLI and confirm it exists at `/usr/local/bin/container`. For Docker, install Docker and confirm `docker info` succeeds.

### Container system is installed but unavailable

For Apple Container, run `container system start`, wait for `container system status` to report a healthy/running state, then restart or retry the affected Sero workflow. For Docker, start Docker Desktop or the Docker daemon and retry.

### A workspace behaves incorrectly after changing the image

Rebuild `sero-node:latest` and recreate affected workspace containers. Existing
containers do not automatically receive changes made to the Dockerfile or base
tooling.

### A feature works in one runtime but not another

Check whether the feature requires browser automation, containerized language
servers, managed preview behavior, or container networking. If so, use a
container-backed workspace.

## Support caveats

During the current alpha, do not treat containers as:

- a hardened multi-tenant security boundary
- identical runtime behavior on every operating system
- Windows host-mode workspace execution
- a promise of full host/container feature parity
- a guarantee that dev-server automation or browser tooling works in host mode
- a guarantee that proxy, cleanup, or status reporting is perfect in every local
  setup

Container-backed mode is the recommended runtime for the full experience. Host
mode is a practical explicit alternative for core work on macOS/Linux.

## Related docs

- [Containers and Dev Servers](/guide/containers-dev-servers)
- [Container Isolation](/reference/container-isolation)
- [Explorer Workspace](/guide/explorer-workspace)
- [Support Scope](/reference/support-scope)
- [Troubleshooting](/reference/troubleshooting)
- [Architecture](/reference/architecture)
- [Security / Privacy](/reference/security-privacy)
