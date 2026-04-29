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
  <strong>Zero context switch, zero sprawl.</strong><br />
  A local-first, agent-first desktop workspace for macOS.
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

Sero is an **open-source, source-only alpha** desktop workspace for agent-assisted
software work. It combines project workspaces, agent chat, plugin apps,
terminals, previews, browser/capture workflows, and runtime integration in one
local application.

Public links:

- Website: <https://sero-ai.dev/>
- Docs: <https://docs.sero-ai.dev/>

Sero is built on [Pi](https://github.com/badlogic/pi), the open-source coding
agent platform, rather than treating the agent as a bolt-on chat box.

## Alpha status

Sero is currently intended for early adopters and contributors.

Current release posture:

- **Supported platform:** macOS on Apple Silicon
- **Distribution:** build from source only
- **Preferred runtime:** Apple container-backed workspaces
- **Fallback runtime:** host mode with reduced capabilities
- **Stability:** plugin/runtime contracts may change during alpha

Sero does **not** currently promise Linux support, Windows support, official
public binaries, stable internal APIs, or full feature parity without
containers. For the current support contract, see
[`Support Scope`](./apps/docs-site/docs/reference/support-scope.md).

## Why Sero?

Modern agent workflows often sprawl across a terminal, browser, editor, chat UI,
local scripts, MCP tools, dashboards, and half a dozen plugin surfaces. Sero is
an attempt to bring those pieces into one coherent desktop shell.

Key ideas:

- **One workspace for the whole loop** — code, chat, terminal, previews, plugins,
  and supporting tools share context.
- **Local-first execution** — project files, app state, logs, and runtime state
  stay on your machine unless you explicitly connect external services.
- **Container-backed development** — preferred workspace execution uses Apple
  containers for isolation and Linux parity where available.
- **Host-mode fallback** — core work can continue when containers are not
  available, with reduced isolation/capabilities.
- **Plugin-first extensibility** — Sero plugins can ship React UI, Pi tools,
  slash commands, background/runtime behavior, and provider integrations.
- **Pi-native agent model** — sessions, tools, skills, prompts, and extensions
  are built around Pi primitives.

## Highlights

- Electron + React desktop shell for agent-assisted development
- Workspace model with per-workspace runtime control
- Integrated Pi-backed chat sessions
- Explorer workspace with editor, terminal, browser, preview, and VCS surfaces
- Built-in plugin architecture for UI apps, tools, commands, and widgets
- Local plugin development flow for running plugin checkouts directly
- Prompt/eval and desktop test infrastructure for safer iteration
- Public docs site source under `apps/docs-site/`

## Screenshots

Captured from the current source-only alpha on macOS Apple Silicon.

**Desktop shell overview**

![Desktop shell overview](./apps/docs-site/docs/assets/images/explorer.jpg)

**Screenshots**

![Explorer browser](./apps/docs-site/docs/assets/images/explorer-browser.jpg)

![App Discovery](./apps/docs-site/docs/assets/images/app-discovery.jpg)

![VCS Management](./apps/docs-site/docs/assets/images/git-management.jpg)

![Image Generation](./apps/docs-site/docs/assets/images/imagegen.jpg)


## Quick start

### Requirements

- macOS on Apple Silicon
- Node.js 22
- pnpm 10
- Optional but strongly recommended: Apple's `container` CLI for the full
  container-backed experience

For the exact validated baseline, see
[`Support Scope`](./apps/docs-site/docs/reference/support-scope.md).

### Run from source

```bash
pnpm install
pnpm build
pnpm dev
```

This starts the desktop app from the monorepo root.

### Common commands

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
pnpm eval:snapshot
```

Notes:

- `pnpm install` runs native-module repair hooks for `node-pty` and
  `better-sqlite3`.
- `pnpm test` currently runs the desktop Vitest suite.
- `pnpm test:ci` mirrors the alpha PR gate: typecheck, build, desktop tests, and
  desktop CI e2e.
- If Apple containers are unavailable, Sero can continue in host mode with a
  reduced feature set.
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
- [`apps/docs-site/docs/reference/support-scope.md`](./apps/docs-site/docs/reference/support-scope.md)
  — current alpha support matrix
- [`docs/sero.md`](./docs/sero.md) — vision, platform constraints, runtime modes
- [`docs/architecture.md`](./docs/architecture.md) — shell and subsystem overview
- [`docs/reference/state-and-folders.md`](./docs/reference/state-and-folders.md)
  — profile/state/auth/log storage reference
- [`docs/guides/macos-containers.md`](./docs/guides/macos-containers.md)
  — Apple container setup
- [`docs/plugins/guide.md`](./docs/plugins/guide.md) — plugin author and user guide
- [`docs/plugins/quickstart.md`](./docs/plugins/quickstart.md) — minimal plugin path
- [`docs/testing/eval-guide.md`](./docs/testing/eval-guide.md) — eval framework
- [`SECURITY.md`](./SECURITY.md) — vulnerability reporting policy

The docs site is intentionally compact during alpha and is being populated from
canonical repo docs as public coverage matures.

## Plugins and ecosystem

Sero supports built-in and external plugins. A plugin can provide:

- React UI loaded via Module Federation
- Pi extension tools, slash commands, and hooks
- Dashboard widgets
- Optional runtime/background behavior
- Optional model/provider metadata

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

When sharing logs, screenshots, issues, or repro steps, redact tokens, private
local paths, auth files, and other sensitive information.

## Contributing

Contributions, issues, docs improvements, and plugin experiments are welcome,
with the caveat that Sero is still alpha software.

Please read:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- [`CHANGELOG.md`](./CHANGELOG.md)
- [`SECURITY.md`](./SECURITY.md)

Useful links:

- [Open an issue](https://github.com/sero-labs/sero/issues/new/choose)
- [Browse pull requests](https://github.com/sero-labs/sero/pulls)

## Special thanks

Sero would not exist without **Pi** and its open-source community.

Special thanks to [Mario Zechner](https://x.com/badlogicgames), creator of Pi,
for building and sharing the agent platform that Sero is built on.

Thanks also to the Pi open-source community, particularly
[Nico Bailon](https://x.com/nicopreme), for excellent extensions and ecosystem
work that helped shape what agent-native desktop workflows can feel like.

## License

Sero is licensed under the [Apache License 2.0](./LICENSE).
