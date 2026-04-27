# Getting Started

## Who this alpha is for

Sero OSS alpha is aimed at:
- technically comfortable macOS developers
- early adopters who are okay with alpha-quality workflows
- contributors interested in agent-first tooling
- plugin authors working with evolving APIs

## Fast path

From the repo root:

```bash
pnpm install
pnpm dev
```

That is the canonical first-run path for contributors.

## Core root commands

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
pnpm eval:snapshot
```

## Learn the workspace

After the repo boots, these guides explain the main product surfaces:

- [Workspace and Chat](/guide/workspace-and-chat) — shell layout, apps,
  workspaces, sessions, and the global chat panel
- [Explorer Workspace](/guide/explorer-workspace) — files, editor previews,
  browser tabs, terminals, and dev-server surfaces
- [Memory](/guide/memory) — durable context, scratchpad, memory tools, and
  privacy limits
- [Web](/guide/web) — web search, fetch, bookmarks, provider
  prerequisites, and workspace-scoped web state
- [Remote Control](/guide/remote-control) — optional gateway pairing and remote-access
  caveats
- [Scheduler and Reminders](/guide/scheduler-reminders) — recurring agent jobs,
  reminders, notifications, and missed-run caveats
- [Git Integration](/guide/git-integration) — repository status, changes, branch
  context, and agent/Git workflows
- [Plugins and Apps](/guide/plugins-and-apps) — using trusted plugins and
  building plugin apps during alpha
- [App Store and Favorites](/guide/app-store-favorites) — plugin discovery,
  sidebar favorites, install/uninstall, compatibility, and retained state

## What to read next

- [Installation / Requirements](/guide/installation-requirements)
- [Development Setup](/guide/development-setup)
- [Support Scope](/reference/support-scope)
- [Architecture](/reference/architecture)
- [Troubleshooting](/reference/troubleshooting)

## Before filing issues

Please redact tokens, auth files, and private local paths from logs,
screenshots, and reproduction notes.
