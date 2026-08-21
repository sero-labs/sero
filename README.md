<p align="center">
  <img src="./assets/phoenix2.svg" alt="Sero phoenix mark" width="96" />
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg" />
    <img src="./assets/logo.svg" alt="Sero" width="220" />
  </picture>
</p>

<p align="center">
  <strong>Escape the Terminal</strong><br />
  A local-first, agent-first desktop workspace for macOS, Linux, and Windows.
</p>

<p align="center">
  <a href="https://sero-ai.dev/">Website</a>
  · <a href="https://docs.sero-ai.dev/">Docs</a>
  · <a href="./LICENSE">Apache-2.0</a>
  · <a href="./CONTRIBUTING.md">Contributing</a>
  · <a href="./SECURITY.md">Security</a>
  · <a href="https://github.com/sero-labs/sero/issues/new/choose">Issues</a>
</p>

---

## What is Sero?

Sero is a **personal agent OS** built directly on the
[Pi](https://github.com/badlogic/pi) coding agent.

Pi gives you the minimal, stable agent loop. Sero adds the always-on desktop
shell: visual browser, runtime isolation, persistent project memory,
self-building plugins, and one unified workspace.

Put simply: Sero is where agent-assisted software work happens when the agent
needs more than a terminal.

## Features

- **Unified desktop shell** — chat, terminals, previews, plugins, files,
  browser flows, and full workspace context in one place.
- **Built-in visual browser** — run your dev server or app inside Sero so the
  agent can inspect pages, capture screenshots/video, and reason about what is
  actually on screen.
- **Self-building plugins** — use the loop Sero is designed for: ask for a
  workflow, build the plugin, use it immediately, then improve it with the agent.
- **Runtime-backed workspaces** — Apple Container, Docker, and host runtimes
  let Sero run projects locally while preserving a shared workspace model.
- **Plugin-first Pi support** — plugins can expose Pi tools, slash commands,
  React UI, widgets, background jobs, and provider integrations.
- **Persistent project memory** — project-level context can carry across agent
  sessions instead of starting from scratch every time.

Technical rationale:

Modern agent workflows often scatter across your editor, terminal, browser,
MCP/tools, local scripts, dashboards, plugin UIs, and long-running agent context.
Sero's goal is to pull those pieces into one local, agent-native workspace where
UI, tools, runtime state, and project context can work together.

In practical terms, Sero is exploring:

- **Agent-native app composition** — plugins can bring their own UI, tools,
  commands, and background behavior instead of being limited to chat text.
- **Less context switching** — project files, terminals, previews, browser flows,
  VCS, and agent sessions live in one shell.
- **Local-first control** — workspace state, logs, auth, and runtime integration
  are designed to stay on your machine unless you opt into external services.
- **A proving ground for Pi-powered extensions** — Sero is built around Pi
  primitives rather than wrapping an agent in a conventional desktop UI.

Public links:

- Website: <https://sero-ai.dev/>
- Docs: <https://docs.sero-ai.dev/>

## Beta status

Sero is available as a public beta desktop release for macOS Apple Silicon,
Linux x64/arm64, and Windows x64. Download the packaged installer for your
platform from [GitHub Releases](https://github.com/sero-labs/sero/releases), or
build from source if you are developing Sero.

Current release posture:

- **Supported packaged targets:** macOS Apple Silicon, Linux x64/arm64, and Windows x64
- **Unsupported targets:** macOS Intel/x64 and Windows arm64
- **Distribution:** packaged beta installers are published through GitHub Releases; developers and contributors can still build from source
- **Runtime options:** Host by default on supported targets, plus explicit Apple Container or Docker/Podman where supported
- **Stability:** plugin/runtime contracts may change during beta
- **Updates/support:** updates are manual unless release notes say otherwise; support is best effort

Sero does **not** currently promise stable internal APIs, a support SLA,
auto-update for every beta release, or full feature parity without containers.
Platform and runtime capabilities vary by OS. For the current beta support
contract, see [`Support Scope`](./apps/docs-site/docs/reference/support-scope.md).

## Why Sero?

Modern agent workflows often sprawl across a terminal, browser, editor, chat UI,
local scripts, MCP tools, dashboards, and half a dozen plugin surfaces. Sero is
an attempt to bring those pieces into one coherent desktop shell.

## Highlights

- Electron + React desktop shell for agent-assisted development
- Integrated Pi-backed chat sessions
- Explorer workspace with editor, terminal, visual browser, preview, and VCS
  surfaces
- Workspace model with per-workspace runtime control
- Apple Container and Docker/Podman-backed workspace execution, with explicit Host mode where supported
- Built-in plugin architecture for UI apps, tools, commands, widgets, and
  background behavior
- Persistent memory system for project context across sessions
- Local plugin development flow for running plugin checkouts directly
- Prompt/eval and desktop test infrastructure for safer iteration
- Public docs site source under `apps/docs-site/`

## Screenshots

Captured from the current beta on macOS Apple Silicon.

**Desktop shell overview**

![Desktop shell overview](./apps/docs-site/docs/assets/images/explorer.jpg)

**Screenshots**

![Explorer browser](./apps/docs-site/docs/assets/images/explorer-browser.jpg)

![App Discovery](./apps/docs-site/docs/assets/images/app-discovery.jpg)

![VCS Management](./apps/docs-site/docs/assets/images/git-app.jpg)

![Content Generation](./apps/docs-site/docs/assets/images/design-library.jpg)


## Quick start

### Install the beta

Most users should download the current packaged beta installer for their
platform from [GitHub Releases](https://github.com/sero-labs/sero/releases).
Use Support Scope for exact supported targets and artifact types; GitHub
Releases has the current filenames.

For the exact beta support contract, see
[`Support Scope`](./apps/docs-site/docs/reference/support-scope.md).

### Run from source for development

Developers and contributors can still run Sero from source. You need Node.js 22,
pnpm 10, Git, and a platform covered by Support Scope.


```bash
pnpm install
pnpm build
pnpm dev
```

This starts the desktop app from the monorepo root.

If you also run the packaged Sero app on this machine, use the isolated dev
launcher instead:

```bash
pnpm dev:isolated
```

This uses `~/.sero-ui-dev` for dev state, so the source build and packaged app
do not share profiles, settings, auth, or plugin paths.
Profile switching is disabled in isolated mode; use `pnpm dev` when working on
profile features.

Plugin UI dev servers are opt-in. To live-reload a built-in plugin UI, set
`SERO_DEV_PLUGINS`:

```bash
SERO_DEV_PLUGINS=mcp pnpm dev:isolated
SERO_DEV_PLUGINS=all pnpm dev:isolated
```

### Common commands

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
pnpm eval:snapshot
```

### Prepare a release changelog and tag

Do not create a Git tag manually. Run one of the release commands below from a
clean `main` branch. `release-it` will:

1. choose the next version,
2. update `package.json`,
3. prepend `CHANGELOG.md`,
4. commit those changes,
5. create a `v*` tag on that commit,
6. push the commit and tag.

The pushed tag then starts the Desktop Release workflow, which builds and
publishes the installer assets from the tagged commit.

Before every release:

```bash
git checkout main
git pull
pnpm test:ci
```

Beta release:

```bash
pnpm release:beta:dry # preview only
pnpm release:beta     # update, commit, tag, and push
```

Stable release:

```bash
pnpm release:stable:dry # preview only
pnpm release:stable     # update, commit, tag, and push
```

Examples from current tag `v0.1.1-beta`:

- `pnpm release:beta` creates a beta tag such as `v0.1.2-beta.0`.
- `pnpm release:stable` creates the stable tag `v0.1.1`.

Notes:

- `pnpm install` runs native-module repair hooks for `node-pty` and
  `better-sqlite3`.
- `pnpm test` currently runs the desktop Vitest suite.
- `pnpm test:ci` mirrors the beta PR gate: typecheck, build, desktop tests, and
  desktop CI e2e.
- Explicit Host mode is available where supported for reduced-capability
  non-container workflows; see Support Scope for platform details.
- If native terminal support breaks, see
  [`docs/node-pty-setup.md`](./docs/node-pty-setup.md).

## Repository layout

```text
sero/
├── apps/desktop/     # Electron + React desktop shell
├── apps/docs-site/   # RSPress public docs app
├── apps/homepage/    # Public marketing site
├── packages/         # Shared runtime, UI, and common packages
├── plugins/          # Built-in Sero plugins and in-repo examples
├── docs/             # Canonical source material and deeper references
├── eval/             # Promptfoo-based eval harness
└── scripts/          # Shared tooling and release helpers
```

## Documentation

The public docs site is available at <https://docs.sero-ai.dev/>. The source for
that site lives in [`apps/docs-site/`](./apps/docs-site/).

Start here:

- [`apps/docs-site/docs/guide/overview.md`](./apps/docs-site/docs/guide/overview.md)
  — product overview
- [`apps/docs-site/docs/guide/getting-started.md`](./apps/docs-site/docs/guide/getting-started.md)
  — first-run guide
- [`apps/docs-site/docs/reference/environment-doctor.md`](./apps/docs-site/docs/reference/environment-doctor.md)
  — built-in diagnostics, safe-mode CLI, and the bundled `sero-doctor` shim


## Plugins and ecosystem

Sero supports built-in and external plugins. A plugin can provide:

- React UI loaded via Module Federation
- Pi extension tools, slash commands, and hooks
- Dashboard widgets
- Optional runtime/background behavior
- Optional model/provider metadata

**External plugin disclaimer:** the current external plugins are beta-era experiments.
They exist to prove out the plugin system, Pi tool bridging, Module Federation
loading, and local development workflow. Treat them as experiments, not
production-quality apps. More realistic real-world apps are planned as the beta
hardens.

See [`docs/plugins/guide.md`](./docs/plugins/guide.md) and
[`docs/plugins/quickstart.md`](./docs/plugins/quickstart.md) for packaging,
installation, and local development workflows.

## Security and privacy

Sero is local-first, but it still manages local auth state, logs, runtime
artifacts, optional provider credentials, and optional remote/gateway features.
Please review:

- [`SECURITY.md`](./SECURITY.md)
- [`docs/security/gateway.md`](./docs/security/gateway.md)
- [`apps/docs-site/docs/reference/security-privacy.md`](./apps/docs-site/docs/reference/security-privacy.md)

## Contributing

Contributions, issues, docs improvements, and plugin experiments are welcome,
with the caveat that Sero is still beta software.

Please read:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- [`CHANGELOG.md`](./CHANGELOG.md)
- [`SECURITY.md`](./SECURITY.md)

Useful links:

- [Open an issue](https://github.com/sero-labs/sero/issues/new/choose)
- [Browse pull requests](https://github.com/sero-labs/sero/pulls)

## License

Sero is licensed under the [Apache License 2.0](./LICENSE).
