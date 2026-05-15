# Installation / Requirements

## Supported alpha target

Sero currently supports source builds on:
- **macOS**
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
| macOS Apple Silicon | Apple Container | Install Apple's `container` CLI, or explicitly select Docker/Podman or Host. |
| macOS Intel | Docker / Podman | Install Docker Desktop/Engine or Podman. Apple Container is not offered on Intel Macs. |
| Linux | Docker / Podman | Install Docker Engine/Desktop or Podman. Host is available as an advanced reduced-capability option. |
| Windows | Docker / Podman | Docker Desktop with Linux containers or a compatible Podman setup is required for workspace execution. |

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

Host mode is available only on macOS and Linux. It starts quickly, but it does
not provide Linux/container parity or browser automation.

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

If containers are unavailable, Sero can continue in host mode with reduced
capabilities on macOS/Linux. Windows workspace execution still requires the
Docker-compatible runtime.

## Related docs

- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
