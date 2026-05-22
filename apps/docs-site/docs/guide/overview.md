# Start Here

Sero is a desktop app for working on local software projects with an AI coding
agent. It brings project workspaces, chat, terminals, previews, files, source
control, and plugins into one local shell.

The current alpha is for people who are comfortable building from source. If you
want a packaged installer or a fully stable product, wait for a later release.

## What Sero helps you do

Sero is designed for agent-assisted development work where the agent needs more
than a chat box.

Use Sero when you want to:

- open a project workspace and keep the agent near the files, terminals, and
  previews it needs
- ask an AI coding agent to work with local project context
- inspect app previews and browser-like workflows in the same desktop shell
- add workflow-specific tools through plugins
- keep project state local unless you choose to connect external services

Sero is built on Pi, an open-source coding agent platform. You do not need to
understand Pi internals to start using Sero.

## Who the alpha is for

The source-only alpha is a good fit if you are:

- a developer or contributor comfortable using a terminal
- willing to install Node.js, pnpm, and source dependencies
- testing Sero on a platform listed in [Support Scope](/reference/support-scope)
- okay with alpha-quality workflows and changing plugin/runtime contracts

It is probably not the right fit yet if you need:

- a one-click installer
- production-stable workflows
- a hosted cloud IDE
- fully stable plugin APIs
- identical capabilities on every operating system

## What to do first

1. Check [Support Scope](/reference/support-scope) for the current platform and
   workspace runtime support contract.
2. Follow [Get Sero Running](/guide/getting-started) to start the desktop app
   from source.
3. When you open or configure a workspace, use the default runtime if you are
   unsure. Read [Choose a Workspace Runtime](/guide/choose-workspace-runtime) if
   you need container behavior or want to switch later.
4. Set up your profile and providers with [Profiles and Onboarding](/guide/profiles-and-onboarding)
   and [Models and Providers](/guide/models-and-providers).

## Learn the workspace after first launch

After Sero opens, these pages explain the main surfaces:

- [Workspace and Chat](/guide/workspace-and-chat) — the shell, sidebar,
  workspaces, sessions, and global chat panel.
- [Explorer Workspace](/guide/explorer-workspace) — files, editor previews,
  browser tabs, terminals, and source control.
- [Agent Sessions and Context](/guide/agent-sessions-and-context) — composer
  controls, context, voice, steering, and queues.
- [Plugins and Apps](/guide/plugins-and-apps) — bundled apps, installed plugins,
  widgets, and plugin concepts.
- [Plugin Catalog](/plugins/catalog) — built-in and external/local plugins at a
  glance.

## Look up exact facts

Use reference pages when you need a precise answer:

- [Support Scope](/reference/support-scope) — canonical platform, runtime, and
  issue-reporting support facts.
- [Troubleshooting](/reference/troubleshooting) — what to try when setup or a
  workspace fails.
- [Environment Doctor](/reference/environment-doctor) — diagnostics, safe mode,
  output states, and redaction behavior.
- [Security / Privacy](/reference/security-privacy) — local state, credentials,
  logs, and remote-access cautions.

Before filing issues, redact tokens, auth files, private paths, and sensitive
project details from logs, screenshots, and reproduction notes.
