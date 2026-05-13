# Installation / Requirements

## Supported alpha target

Sero currently supports:
- **macOS on Apple Silicon**
- **Node.js 22**
- **pnpm 10**

For the canonical current support contract and exact validated baseline, see
[Support Scope](/reference/support-scope).

## Recommended runtime requirement

For the full intended experience, use a container-backed runtime. Sero supports
Apple Container and Docker-backed workspaces.

For Apple Container, install Apple's `container` CLI and make sure it is
available at:

```text
/usr/local/bin/container
```

For Docker-backed workspaces, install Docker and make sure `docker info`
succeeds.

Containers are strongly recommended, but they are not a hard requirement for
trying Sero.

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
