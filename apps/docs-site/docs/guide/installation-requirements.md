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
| macOS Apple Silicon | Apple Container | Install Apple's `container` CLI, or explicitly select Docker or Host. |
| macOS Intel | Docker | Install Docker Desktop. Apple Container is not offered on Intel Macs. |
| Linux | Docker | Install Docker Engine/Desktop. Host is available as an advanced reduced-capability option. |
| Windows | Docker | Docker Desktop with Linux containers is required for workspace execution. |

For Apple Container on Apple Silicon Macs, make sure the CLI is available at:

```text
/usr/local/bin/container
```

For Docker-backed workspaces, install Docker Desktop or Docker Engine and make
sure `docker info` succeeds.

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
```

If containers are unavailable, Sero can continue in host mode with reduced
capabilities.

## Related docs

- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
