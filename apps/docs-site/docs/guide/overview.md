# Start Here

Sero is a **local-first, agent-first desktop workspace for macOS, Linux, and Windows**. It brings
project workspaces, Pi-backed agent chat, plugins, terminals, previews, and local
runtime orchestration into one desktop shell.

If you just want to run it, skip to [Getting started](#getting-started). If you
want the product model first, read the overview below.

## Overview

Sero is built for users who want fewer context switches between editor,
terminals, AI tooling, app-specific workflows, and project coordination.

The project goal is not just “AI in an editor.” It is a workspace layer where:

- Pi is the coding agent
- workspaces are first-class
- runtime mode can be container-backed or host-based
- plugins can extend both UI and agent capabilities

## Current alpha scope

The current OSS alpha is intentionally narrow:

- **platforms:** macOS, Linux, and Windows from source
- **maintainer-validated baseline:** macOS on Apple Silicon
- **distribution:** source-only
- **preferred runtime:** Apple Container or Docker-backed workspaces
- **fallback runtime:** host mode with reduced capabilities on macOS/Linux

Sero does **not** currently promise official binaries, identical runtime capabilities on every OS, Windows host-mode workspace execution, or fully stable internal runtime/plugin contracts.

## Getting started

### Who this alpha is for

Sero OSS alpha is aimed at:

- technically comfortable local developers on macOS, Linux, or Windows
- early adopters who are okay with alpha-quality workflows
- contributors interested in agent-first tooling
- plugin authors working with evolving APIs

### Fast path

From the repo root:

```bash
pnpm install
pnpm build
pnpm dev
```

That is the canonical first-run path for contributors.

### Core root commands

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
pnpm eval:snapshot
```

## Learn the workspace

After the repo boots, these guides explain the main product surfaces:

- [Workspace and Chat](/guide/workspace-and-chat) explains the shell, sidebar,
  workspaces, sessions, global chat panel, and onboarding flow.
- [Explorer Workspace](/guide/explorer-workspace) maps files, editor previews,
  browser tabs, terminals, and dev-server surfaces.
- [Settings and Admin](/guide/settings-models-admin) and
  [Models and Providers](/guide/models-and-providers) explain Admin,
  model/provider, prompt, skill, and context management surfaces.
- [Themes](/guide/themes) explains profile-scoped theme selection and editing.
- [MCP](/guide/mcp) explains MCP server management and sensitive server
  configuration.
- [Memory](/guide/memory) explains durable local context, scratchpad workflows,
  storage, and recall limits.
- [Web](/guide/web) explains web search, content fetching, bookmarks, provider
  prerequisites, and workspace-scoped web state.
- [Remote Control](/guide/remote-control) explains the optional,
  security-sensitive gateway pairing surface.
- [Scheduler and Reminders](/guide/scheduler-reminders) explains recurring
  agent jobs, reminders, notification caveats, and conservative recovery.
- [Git Integration](/guide/git-integration) explains repository status, changes,
  branch context, remote origins, and conservative agent/Git workflows.
- [Plugins and Apps](/guide/plugins-and-apps) explains core apps, bundled
  plugins, installed plugins, and app-runtime concepts.
- [App Store and Favorites](/guide/app-store-favorites) explains plugin
  discovery, sidebar favorites, compatibility, install/uninstall, and retained
  state.

## What to read next

- [Installation / Requirements](/guide/installation-requirements)
- [Development Setup](/guide/development-setup)
- [Support Scope](/reference/support-scope)
- [Architecture](/reference/architecture)
- [Troubleshooting](/reference/troubleshooting)

## Before filing issues

Please redact tokens, auth files, and private local paths from logs,
screenshots, and reproduction notes.

## Canonical source material

This docs site is the curated public surface for alpha. The current source
material it draws from includes:

- [`docs/sero.md`](https://github.com/sero-labs/sero/blob/main/docs/sero.md)
- [`docs/architecture.md`](https://github.com/sero-labs/sero/blob/main/docs/architecture.md)
- [`docs/plugins/guide.md`](https://github.com/sero-labs/sero/blob/main/docs/plugins/guide.md)
- [`docs/testing/eval-guide.md`](https://github.com/sero-labs/sero/blob/main/docs/testing/eval-guide.md)
- [`docs/security/gateway.md`](https://github.com/sero-labs/sero/blob/main/docs/security/gateway.md)
