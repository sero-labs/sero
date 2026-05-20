# Installation / Requirements

## Supported alpha target

Sero currently supports source builds on:
- **macOS Apple Silicon**
- **Linux**
- **Windows**

Required local tooling:
- **Node.js 22**
- **pnpm 10**

For the canonical current support contract and exact validated baseline, see
[Support Scope](/reference/support-scope).

## Runtime requirements by platform

Sero supports local workspace runtimes only. Pick the runtime that matches your platform:

| Platform | Default runtime | Requirement |
| --- | --- | --- |
| macOS Apple Silicon | Apple Container | Install Apple's `container` CLI, or explicitly select Docker/Podman (`docker`) or Host (`host`). |
| Linux | Docker / Podman | Install Docker Engine/Desktop or Podman. Host (`host`) is available as an explicit reduced-capability option; browser packs are pending. |
| Windows | Docker / Podman | Docker Desktop with Linux containers or a compatible Podman setup is required for public workspace execution. |

For Apple Container on Apple Silicon Macs, make sure the CLI is available at:

```text
/usr/local/bin/container
```

For Docker-backed workspaces, install Docker Desktop, Docker Engine, or Podman and make sure one of these succeeds:

```bash
docker info
podman info
```

The workspace runtime picker labels this option **Docker / Podman**, but the saved backend ID remains `docker`. Sero prefers Docker when both CLIs are available, can retry Podman if auto-selected Docker cannot reach its daemon, and respects explicit overrides such as `SERO_CONTAINER_ENGINE=podman` or `SERO_DOCKER_BIN=/path/to/binary`.

Host mode is an explicit reduced-capability runtime, not an automatic fallback.
In the public alpha, Host is a setup path on macOS Apple Silicon and Linux;
Windows source builds are supported, but public Windows workspace execution uses
Docker/Podman. Host does not provide container isolation, Linux/container parity,
or container networking semantics.

Host browser automation requires a published browser pack for your platform and
a passing Doctor launch check. macOS Intel is not a supported target. If your
platform's pack is pending, use Docker/Podman or Apple Container for browser
automation.

## Install dependencies

From the repo root:

```bash
pnpm install
```

The install flow runs native-module repair hooks for `node-pty` and
`better-sqlite3`.

## Optional runtime verification

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
docker info
podman info
```

If a container runtime is unavailable, select Host only on a supported public
Host platform and expect reduced capabilities. Selecting Host is a deliberate
choice; selected container runtimes do not silently become Host. macOS Intel is
not a supported target, and Windows workspace execution still requires
Docker/Podman in the public support scope.

## Related docs

- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
