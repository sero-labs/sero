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
  <strong>Sero is where AI agents come to work.</strong><br />
  A local-first desktop workspace where agents can see, act, remember,
  automate, and extend themselves across your software life.
</p>

<p align="center">
  <a href="https://github.com/sero-labs/sero/actions/workflows/test.yml"><img src="https://github.com/sero-labs/sero/actions/workflows/test.yml/badge.svg" alt="Test status" /></a>
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

Agents need more than a prompt box: browser state, terminal output, files,
memory, plugins, and long-running workflows. Sero puts those surfaces in one
desktop app. The agent can run your project, look at it in a built-in browser,
work in real terminals, remember the project between sessions, build its own
plugins, and run durable Orchestrator loops that keep working after the chat
ends — all locally, on your machine.

If you already use coding agents and wish they had a real workspace, Sero is
for you.

<!-- FLAGSHIP DEMO GIF: docs/marketing plan task 3.5 -->
> **Demo coming this week** — a 90-second clip of Sero building, reviewing,
> and running one of its own plugins.

<p align="center">
  <a href="#demo"><strong>Watch the demo</strong></a>
  · <a href="https://github.com/sero-labs/sero/releases/latest"><strong>Download the beta</strong></a>
  · <a href="https://github.com/sero-labs/sero"><strong>Star the repo</strong></a>
  · <a href="#quick-start"><strong>Read the quick start</strong></a>
</p>

## Status

Sero is an open-source public beta. Packaged desktop builds are available for
macOS (Apple Silicon), Linux (x64 and arm64), and Windows (x64), and developers
can also run from source.

Downloads are on [GitHub Releases](https://github.com/sero-labs/sero/releases/latest).
The maintainer-validated baseline is macOS on Apple Silicon; macOS Intel and
Windows arm64 are not packaged. For the exact support contract, see
[Support Scope](./apps/docs-site/docs/reference/support-scope.md).

## Demo

<!-- FLAGSHIP DEMO GIF: docs/marketing plan task 3.5 -->

The flagship demo is being recorded now: Sero receives a request, builds itself
a plugin, the human reviews and approves it, and the new UI runs inside the
workspace. Until it lands, the [screenshots](#screenshots) below show the
current beta.

## Quick start

Download the beta for your platform, connect a model (hosted API key, or a
local OpenAI-compatible server such as Ollama, LM Studio, or vLLM), and run
your first workflow — about 10 minutes end to end.

> **Before you start: you need a model.** Sero doesn't bundle one. Bring a
> hosted API key (Anthropic, OpenAI, Google, OpenRouter, and more) or a local
> OpenAI-compatible server — one-click presets for **Ollama**, **LM Studio**,
> and **vLLM**.

1. **Download** the [latest release](https://github.com/sero-labs/sero/releases/latest) for macOS (Apple Silicon), Windows (x64), or Linux (x64/arm64).
2. **Install and open** — the macOS build is signed and notarized, so it launches without warnings.
3. **Connect a model** — paste your API key during setup, or add a local server with an Ollama, LM Studio, or vLLM preset.
4. **Open a project** — point a workspace at any project folder (a git repo is ideal).
5. **Run your first workflow** — try *"Look at this repo and tell me how it's structured."* and watch the agent work with real project context.

Full walkthrough with troubleshooting:
[10-minute quick start](https://docs.sero-ai.dev/guide/quick-start). Developers
can also [run from source](#run-from-source-for-development).

## What is Sero?

Sero is built directly on [Pi](https://github.com/badlogic/pi), the open-source
coding agent. Pi gives you the minimal, stable agent loop. Sero adds the
always-on desktop workplace around it:

- **Unified desktop shell** — chat, terminals, previews, plugins, files,
  browser flows, and full workspace context in one place.
- **Built-in visual browser** — run your dev server or app inside Sero so the
  agent can inspect pages, capture screenshots/video, and reason about what is
  actually on screen.
- **Self-building plugins** — ask for a workflow, let the agent build the
  plugin, review it, use it immediately, then improve it with the agent.
- **Durable Orchestrator loops** — long-running agent workflows with step
  plans, failure recovery, and visible approval points. Loops keep working
  after the chat ends.
- **Persistent project memory** — project-level context carries across agent
  sessions instead of starting from scratch every time.
- **Runtime-backed workspaces** — Apple Container, Docker/Podman, and host
  runtimes run projects locally while preserving a shared workspace model.
- **Plugin-first Pi support** — plugins can expose Pi tools, slash commands,
  React UI, widgets, background jobs, and provider integrations.

Modern agent workflows scatter across your editor, terminal, browser,
MCP/tools, local scripts, dashboards, plugin UIs, and long-running agent
context. Sero pulls those pieces into one local, agent-native workspace where
UI, tools, runtime state, and project context work together.

Sero is not a replacement for Claude Code, Cursor, Codex, or Pi — it is the
workspace those workflows grow into when the agent needs more than a terminal.

The current pinned Pi SDK baseline is **0.78.0** (`@earendil-works/pi-*`
packages in `pnpm-workspace.yaml`).

## Screenshots

Captured from the current beta on macOS Apple Silicon.

**Desktop shell overview**

![Desktop shell overview](./apps/docs-site/docs/assets/images/explorer.jpg)

![Explorer browser](./apps/docs-site/docs/assets/images/explorer-browser.jpg)

![App Discovery](./apps/docs-site/docs/assets/images/app-discovery.jpg)

![VCS Management](./apps/docs-site/docs/assets/images/git-app.jpg)

![Image Generation](./apps/docs-site/docs/assets/images/imagegen.jpg)

## Trust and privacy

Sero gives agents real working surfaces — terminal, files, browser, plugins,
memory, loops — with local-first control and visible approval points. Short
answers to the obvious questions:

- **What runs locally?** Everything: the app, your workspaces, agent sessions,
  memory, plugin state, and logs all live in a local profile directory on your
  machine.
- **What leaves the machine?** Model API calls (your prompts and workspace
  context go to the provider you configure — or stay fully local with an
  OpenAI-compatible server like Ollama, LM Studio, or vLLM). Optional
  integrations such as GitHub, plugin installs, Discord, and Tailscale only
  talk out when you enable them. Remote control via the gateway is **off by
  default**. There is no telemetry backend collecting your sessions.
- **Where are keys stored?** In local files under your profile
  (`<SERO_HOME>/agent/`), never synced anywhere by Sero. Treat the profile
  directory as sensitive — see
  [Security & Privacy](./apps/docs-site/docs/reference/security-privacy.md).
- **What can agents read and write?** Workspace files and tools you give them.
  A permission gate prompts on dangerous shell patterns (recursive deletes,
  `sudo`, disk writes, and similar), but Sero does not prompt on every action —
  it is a power-user tool, and the docs say plainly what is and is not gated.
- **Can plugins run arbitrary code?** Yes — plugins are real software (Pi
  extension code plus optional UI). Review plugins before installing them, the
  same way you review a dependency.
- **Are loops auto-approved?** No. Loops are created as plans you review and
  explicitly activate. Outward side effects (email, chat messages, webhooks)
  show you the exact content and wait for approval. Loops that hit a decision
  point stop and ask.
- **How do I inspect, pause, or stop things?** Every session and loop is
  visible in the UI; loops block and wait rather than pushing through, and the
  built-in Admin surface exposes sessions, config, and logs.

macOS builds are code-signed with a Developer ID certificate and notarized by
Apple. Windows and Linux builds are not yet signed during the beta — Windows
will show a SmartScreen prompt on first launch.

Full details: [`SECURITY.md`](./SECURITY.md),
[Security & Privacy reference](./apps/docs-site/docs/reference/security-privacy.md),
and [`docs/security/gateway.md`](./docs/security/gateway.md). When sharing
logs, screenshots, or repro steps, redact tokens, private local paths, and
auth files.

## What Sero is not

Sero is intentionally not trying to be everything at once:

- It is **not** a replacement for your editor, terminal, browser, or Git client.
  It coordinates them around agent workflows, not fully subsumes every expert
  tool.
- It is **not** a general-purpose low-code app builder or consumer automation
  product.
- It is **not** a hosted agent platform, SaaS IDE, or cloud execution service.
  The default direction is local-first desktop software.
- It is **not** API-stable yet. Plugin, runtime, and Extension API surfaces are
  still expected to change during beta.
- It is **not** polished end-user software today. The current beta is for
  early adopters, contributors, and people interested in the direction.

## Beta details

Current release posture:

- **Packaged targets:** macOS (Apple Silicon), Linux (x64 and arm64), Windows (x64)
- **Unsupported targets:** macOS Intel/x64 and Windows arm64
- **Maintainer-validated baseline:** macOS on Apple Silicon
- **Distribution:** packaged beta installers on GitHub Releases; developers and
  contributors can build from source
- **Runtime options:** Host by default on supported targets, plus explicit
  Apple Container or Docker/Podman where supported
- **Stability:** plugin/runtime contracts may change during beta
- **Updates/support:** updates are manual unless release notes say otherwise;
  support is best effort
- **UX polish:** rough and actively changing; layout, flows, and accessibility
  need refinement
- **Theming:** CSS/theme support is patchy and will be normalized as the shell
  and plugin contracts mature
- **Spotify / Widevine:** Sero uses stock Electron and does not ship Castlabs,
  Widevine/VMP signing, or DRM-dependent Spotify playback support.

Sero does **not** currently promise stable internal APIs, a support SLA,
auto-update for every beta release, or full feature parity without containers.
Platform and runtime capabilities vary by OS. See
[Support Scope](./apps/docs-site/docs/reference/support-scope.md).

## Run from source for development

Developers and contributors can run Sero from source. You need Node.js 22,
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

The public docs site is at <https://docs.sero-ai.dev/>. Source lives in
[`apps/docs-site/`](./apps/docs-site/).

Start here:

- [`apps/docs-site/docs/guide/overview.md`](./apps/docs-site/docs/guide/overview.md)
  — product overview
- [`apps/docs-site/docs/guide/getting-started.md`](./apps/docs-site/docs/guide/getting-started.md)
  — first-run guide
- [`apps/docs-site/docs/guide/orchestrator.md`](./apps/docs-site/docs/guide/orchestrator.md)
  — durable Orchestrator loops
- [`apps/docs-site/docs/reference/support-scope.md`](./apps/docs-site/docs/reference/support-scope.md)
  — current beta support matrix
- [`apps/docs-site/docs/reference/environment-doctor.md`](./apps/docs-site/docs/reference/environment-doctor.md)
  — built-in diagnostics, safe-mode CLI, and the bundled `sero-doctor` shim
- [`docs/sero.md`](./docs/sero.md) — vision, platform constraints, runtime modes
- [`docs/architecture.md`](./docs/architecture.md) — shell and subsystem overview
- [`docs/reference/state-and-folders.md`](./docs/reference/state-and-folders.md)
  — profile/state/auth/log storage reference
- [`docs/features/docker-runtime.md`](./docs/features/docker-runtime.md)
  — Docker and runtime provider behavior
- [`docs/guides/macos-containers.md`](./docs/guides/macos-containers.md)
  — Apple Container setup on macOS
- [`docs/plugins/guide.md`](./docs/plugins/guide.md) — plugin author and user guide
- [`docs/plugins/quickstart.md`](./docs/plugins/quickstart.md) — minimal plugin path
- [`docs/testing/eval-guide.md`](./docs/testing/eval-guide.md) — eval framework
- [`SECURITY.md`](./SECURITY.md) — vulnerability reporting policy

The docs site is intentionally compact during beta and is being populated from
canonical repo docs as public coverage matures.

## Plugins and ecosystem

Sero supports built-in and external plugins. A plugin can provide:

- React UI loaded via Module Federation
- Pi extension tools, slash commands, and hooks
- Dashboard widgets
- Optional runtime/background behavior
- Optional model/provider metadata

**External plugin disclaimer:** the current external plugins are beta-era
experiments. They exist to prove out the plugin system, Pi tool bridging,
Module Federation loading, and local development workflow. Treat them as
experiments, not production-quality apps. More realistic real-world apps are
planned as the beta hardens.

See [`docs/plugins/guide.md`](./docs/plugins/guide.md) and
[`docs/plugins/quickstart.md`](./docs/plugins/quickstart.md) for packaging,
installation, and local development workflows.

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

## Special thanks

Sero would not exist without **Pi** and its open-source community.

With deep gratitude: thank you to [Mario Zechner](https://x.com/badlogicgames),
creator of Pi, for building and sharing the open-source agent platform that Sero
is built on.

Thank you also to the Pi open-source community, particularly
[Nico Bailon](https://x.com/nicopreme), for excellent extension development and
ecosystem work that helped shape what agent-native desktop workflows can feel
like.

## License

Sero is licensed under the [Apache License 2.0](./LICENSE).
