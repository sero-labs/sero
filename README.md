# Sero

> Zero context switch, zero sprawl.

Sero is a **local-first, agent-first desktop workspace for macOS**. It brings
project workspaces, agent chat, plugin apps, terminals, previews, and runtime
integration into one application, with **Pi** as the intelligence layer behind
the system.

## Alpha status

Sero is currently a **source-only OSS alpha**.

Current release posture:
- **supported platform:** macOS on Apple Silicon
- **distribution:** build from source only
- **preferred runtime:** Apple container-backed workspaces
- **supported fallback:** host mode with reduced capabilities
- **stability:** plugin/runtime contracts may still evolve during alpha

Sero does **not** currently promise:
- Linux support
- Windows support
- official public binaries
- fully stable internal plugin/runtime APIs
- full feature parity when containers are unavailable

## Why Sero?

Sero is built for people who want an integrated coding environment without
splitting work across too many separate tools.

Key ideas:
- **one desktop shell for the whole workflow** — workspace, agent, plugins, and
  supporting tools in one place
- **local-first execution** — your app, state, logs, and project workflows stay
  on your machine
- **container-backed workspaces** — preferred for isolation, tooling, and Linux
  parity where Apple container support is available
- **host-mode fallback** — you can keep working even when containers are not
  available
- **plugin-first extensibility** — built-in and third-party Sero apps can ship
  UI, Pi extensions, runtime hooks, and provider integrations
- **Pi-native agent model** — Sero is built on Pi rather than treating the
  agent as an afterthought

## Highlights

- Electron + React desktop shell focused on agent-assisted development
- workspace model with per-workspace runtime control
- integrated chat panel backed by Pi sessions
- plugin system for UI apps, agent tools, and runtime features
- local plugin development flow for running plugin checkouts directly
- eval and e2e infrastructure for prompt, tooling, and desktop behavior

## Quick start

### Requirements

- macOS on Apple Silicon
- Node.js 22
- pnpm 10
- optional but strongly recommended: Apple's `container` CLI for the full
  container-backed experience

### Run from source

```bash
pnpm install
pnpm dev
```

This starts the desktop app from the monorepo root.

### Common commands

```bash
pnpm typecheck
pnpm build
pnpm --filter @sero/desktop test -- --run
pnpm --filter @sero/desktop test:e2e
pnpm eval:snapshot
```

Notes:
- `pnpm install` runs native-module repair hooks for `node-pty` and
  `better-sqlite3`.
- If Apple containers are unavailable, Sero can continue in host mode with a
  reduced feature set.
- If native terminal support breaks, see the node-pty troubleshooting guide
  below.

## Repository layout

```text
sero/
├── apps/desktop/     # Electron + React desktop shell
├── packages/         # shared runtime, UI, and common packages
├── plugins/          # built-in Sero plugins and in-repo examples
├── docs/             # architecture, guides, plugins, security, testing
├── eval/             # Promptfoo-based eval harness
└── scripts/          # shared tooling and release helpers
```

## Documentation

Current canonical docs live in `docs/`.

Start here:
- [`docs/sero.md`](./docs/sero.md) — vision, platform constraints, runtime modes
- [`docs/architecture.md`](./docs/architecture.md) — shell and subsystem overview
- [`docs/guides/macos-containers.md`](./docs/guides/macos-containers.md) — Apple container setup
- [`docs/plugins/guide.md`](./docs/plugins/guide.md) — plugin author and user guide
- [`docs/features/local-plugin-development.md`](./docs/features/local-plugin-development.md) — running plugin checkouts directly
- [`docs/testing/eval-guide.md`](./docs/testing/eval-guide.md) — eval framework and prompt checks
- [`docs/node-pty-setup.md`](./docs/node-pty-setup.md) — native terminal troubleshooting
- [`SECURITY.md`](./SECURITY.md) — vulnerability reporting policy

A dedicated public docs site is planned as part of the OSS alpha work, but the
files above are the current source of truth.

## Plugins and ecosystem

Sero supports built-in and external plugins.

A plugin can provide:
- a React UI loaded via Module Federation
- a Pi extension with tools, commands, and hooks
- optional runtime/background behavior
- optional provider metadata for model integration

See [`docs/plugins/guide.md`](./docs/plugins/guide.md) for packaging,
distribution, installation, and local development workflows.

## Containers and runtime modes

Sero works best with Apple's container runtime enabled. Containers unlock:
- containerized workspace execution
- containerized tooling and language-server flows
- better Linux parity
- browser automation and managed preview workflows

If containers are unavailable, Sero still supports a reduced host mode for core
chat, file access, and general development tasks.

See [`docs/guides/macos-containers.md`](./docs/guides/macos-containers.md) and
[`docs/sero.md`](./docs/sero.md) for details.

## Known limitations

Current alpha caveats include:
- macOS Apple Silicon only
- no official binary distribution yet
- host mode is supported, but it is intentionally a reduced experience
- some CI/test/eval coverage is still being rationalized for public alpha
- some plugin and internal runtime contracts may change during the alpha period

## Contributing and support

Public alpha contribution and support surfaces are currently:
- GitHub Issues
- Pull Requests

Please read:
- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- [`SECURITY.md`](./SECURITY.md)

## Security and privacy

Sero is local-first, but it still manages local auth state, logs, runtime
artifacts, and optional remote/gateway features. Please review:
- [`SECURITY.md`](./SECURITY.md)
- [`docs/security/gateway.md`](./docs/security/gateway.md)

When sharing logs, issues, screenshots, or repro steps, always redact tokens,
private local paths, auth files, and other sensitive information.

## License

Sero is licensed under the [Apache License 2.0](./LICENSE).
