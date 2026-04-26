# Containers and Host Mode

Sero works best with Apple container-backed workspaces on macOS Apple Silicon.
Host mode is supported as a reduced fallback so the alpha can still run when the
container runtime is unavailable or a workspace is explicitly configured to use
the host.

This page explains the current runtime expectations. For the canonical support
matrix, see [Support Scope](/reference/support-scope).

## Runtime modes

### Container-backed workspaces

Container-backed runtime is the preferred path for the full Sero experience. It
is intended for:

- containerized workspace execution
- containerized tooling and language servers
- browser automation
- managed preview and dev-server flows with container assumptions
- Linux/container parity and container networking semantics

### Host mode

Host mode is a **supported fallback**, not feature parity with containers.

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

If a workflow works in containers but fails in host mode, check whether that
workflow depends on container-only capabilities.

## Requirements for container-backed mode

Sero expects Apple container tooling on Apple Silicon macOS. The public setup
checks are:

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
```

If the system is installed but not running, start it:

```bash
/usr/local/bin/container system start
```

Sero expects the workspace image:

```text
sero-node:latest
```

If you change `apps/desktop/images/Dockerfile.sero-node` or container-installed
tools, rebuild the image and recreate affected workspace containers before
expecting new workspaces or existing containers to pick up those changes.

For the deeper source guide, see
[`docs/guides/macos-containers.md`](https://github.com/sero-labs/sero/blob/main/docs/guides/macos-containers.md).

## Runtime selection in the app

Sero checks container availability during startup and onboarding. Container
startup failures are non-fatal: the app can continue and report degraded or host
mode behavior.

Source-confirmed user-facing surfaces include:

- onboarding/preflight diagnostics for container availability
- a per-workspace container toggle in the workspace tree
- a workspace status indicator for runtime state
- terminal creation that resolves to container or host terminal based on the
  workspace runtime

The workspace toggle is per workspace. Do not assume one global switch controls
every workspace.

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
```

Common situations:

### `container` command is missing

Sero treats containers as unavailable and continues in host mode. Install
Apple's container CLI and confirm it exists at `/usr/local/bin/container`.

### Container system is installed but unavailable

Run `container system start`, wait for `container system status` to report a
healthy/running state, then restart or retry the affected Sero workflow.

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
- Linux or Windows support
- a promise of full host/container feature parity
- a guarantee that dev-server automation or browser tooling works in host mode
- a guarantee that proxy, cleanup, or status reporting is perfect in every local
  setup

Container-backed mode is the recommended runtime for the full experience. Host
mode is a practical fallback for core work.

## Related docs

- [Explorer Workspace](/guide/explorer-workspace)
- [Support Scope](/reference/support-scope)
- [Troubleshooting](/reference/troubleshooting)
- [Architecture](/reference/architecture)
- [Security / Privacy](/reference/security-privacy)
