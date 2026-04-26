# Overview

Sero is a **local-first, agent-first desktop workspace for macOS**.

It brings together:
- project workspaces
- agent chat backed by Pi
- plugin apps and tool integrations
- terminals, previews, and runtime orchestration
- local development workflows inside a single desktop shell

## What Sero is trying to solve

Sero is built for users who want fewer context switches between editor,
terminals, AI tooling, app-specific workflows, and project coordination.

The project goal is not just “AI in an editor.” It is a workspace layer where:
- Pi is the intelligence layer
- workspaces are first-class
- runtime mode can be container-backed or host-based
- plugins can extend both UI and agent capabilities

## Core guides

- [Workspace and Chat](/guide/workspace-and-chat) explains the shell, sidebar,
  workspaces, sessions, and global chat panel.
- [Explorer Workspace](/guide/explorer-workspace) maps files, editor previews,
  browser tabs, terminals, and dev-server surfaces.
- [Memory](/guide/memory) explains durable local context, scratchpad workflows,
  storage, and recall limits.
- [Web Access](/guide/web-access) explains web search, content fetching,
  bookmarks, provider prerequisites, and workspace-scoped web state.
- [Web Remote](/guide/web-remote) explains the optional, security-sensitive
  gateway pairing surface.
- [Scheduler and Reminders](/guide/scheduler-reminders) explains recurring
  agent jobs, reminders, notification caveats, and conservative recovery.
- [Git Manager](/guide/git-manager) explains repository status, changes, branch
  context, and conservative agent/Git workflows.
- [Plugins and Apps](/guide/plugins-and-apps) explains core apps, bundled
  plugins, installed plugins, and app-runtime concepts.
- [App Store and Favorites](/guide/app-store-favorites) explains plugin
  discovery, sidebar favorites, compatibility, install/uninstall, and retained
  state.

## Current alpha scope

The current OSS alpha is intentionally narrow:
- **platform:** macOS on Apple Silicon
- **distribution:** source-only
- **preferred runtime:** Apple container-backed workspaces
- **fallback runtime:** host mode with reduced capabilities

Sero does **not** currently promise official binaries, Linux support, Windows
support, or fully stable internal runtime/plugin contracts.

## Canonical source material

This docs site is the curated public surface for alpha. The current source
material it draws from includes:
- [`docs/sero.md`](https://github.com/sero-labs/sero/blob/main/docs/sero.md)
- [`docs/architecture.md`](https://github.com/sero-labs/sero/blob/main/docs/architecture.md)
- [`docs/plugins/guide.md`](https://github.com/sero-labs/sero/blob/main/docs/plugins/guide.md)
- [`docs/testing/eval-guide.md`](https://github.com/sero-labs/sero/blob/main/docs/testing/eval-guide.md)
- [`docs/security/gateway.md`](https://github.com/sero-labs/sero/blob/main/docs/security/gateway.md)
