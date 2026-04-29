# Installation / Requirements

## Supported alpha target

Sero currently supports:
- **macOS on Apple Silicon**
- **Node.js 22**
- **pnpm 10**

For the canonical current support contract and exact validated baseline, see
[Support Scope](/reference/support-scope).

## Recommended runtime requirement

For the full intended experience, install Apple's `container` CLI and make sure
it is available at:

```text
/usr/local/bin/container
```

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
```

If containers are unavailable, Sero can continue in host mode with reduced
capabilities.

## Related docs

- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
