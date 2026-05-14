---
pageType: home

hero:
  name: Sero
  text: Agent-first local development across local runtimes
  tagline: One desktop shell for workspaces, agent chat, plugins, terminals, and previews.
  image:
    src: /assets/phoenix2.svg
    alt: Sero phoenix mark
  actions:
    - theme: brand
      text: Start Here
      link: /guide/overview
    - theme: alt
      text: Plugin Catalog
      link: /plugins/catalog

features:
  - title: Agent-first local development
    details: 'Sero is built around agent-driven workflows for local projects: chat, terminals, previews, plugins, and workspace context in one desktop shell.'
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15v9h-15z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 19h6M12 15.5V19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  - title: Container-backed when available
    details: Apple Container and Docker-backed workspaces are the preferred runtime for isolation, tooling, and Linux parity, with Host available as an explicit reduced-capability runtime where supported.
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.75 7 3.7v9.1l-7 3.7-7-3.7v-9.1z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m5.4 7.65 6.6 3.5 6.6-3.5M12 11.25v8.45" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  - title: Plugin-first extension model
    details: Built-in and external plugins can add UI, Pi tools, runtime hooks, and provider integrations without changing the core app.
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.75h8v4.5h3.25v5.5H16v4.5H8v-4.5H4.75v-5.5H8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
---

## Current alpha preview

These screenshots were captured from the current **source-only alpha** on the
maintainer-validated baseline: **macOS on Apple Silicon**.

### Desktop shell overview

![Desktop shell overview](./assets/desktop-shell-overview.png)

*Explorer workspace in the main panel, the app/workspace sidebar on the left,
and the global agent chat on the right. See [Workspace and Chat](/guide/workspace-and-chat),
[Architecture](/reference/architecture), and [Support Scope](/reference/support-scope).*

### Example workflow

![Memory workflow in the chat panel](./assets/memory-workflow.png)

*Direct `sero memory` commands running inside a live session via the chat
panel. See [Memory](/guide/memory), [Start Here](/guide/overview), and
[Support Scope](/reference/support-scope).*

## OSS alpha status

Sero is currently a **source-only OSS alpha** for macOS, Linux, and Windows.

Current alpha posture:
- build from source
- use Apple Container or Docker-backed workspaces for the full experience when available
- choose Host explicitly on macOS/Linux when you want non-container execution; selected container runtimes fail closed when unavailable
- expect some plugin and runtime contracts to evolve during alpha

For the canonical current support contract, see
[Support Scope](/reference/support-scope).

## Start here

- [Overview](/guide/overview) — product shape, alpha scope, and first reading path.
- [Installation / Requirements](/guide/installation-requirements) — supported platforms, local dependencies, and runtime setup.
- [Profiles and Onboarding](/guide/profiles-and-onboarding) — first-run setup, profile state, and deletion caveats.
- [Models and Providers](/guide/models-and-providers) — provider auth, tiers, local models, and recovery.
- [Workspace and Chat](/guide/workspace-and-chat) — shell layout, sessions, chat, and the command menu.
- [Explorer Workspace](/guide/explorer-workspace) — files, editor, terminal, previews, and source control.
- [Agent Sessions and Context](/guide/agent-sessions-and-context) — composer controls, context, voice, steering, and queues.
- [Containers and Dev Servers](/guide/containers-dev-servers) — workspace runtime, container previews, and Host mode.
- [Plugins and Apps](/guide/plugins-and-apps) — installed apps, local development sessions, widgets, and plugin concepts.
- [Plugin Catalog](/plugins/catalog) — built-in and external/local plugins at a glance.
- [Reference](/reference/) — architecture, CLI, state, plugin authoring, evals, security, and troubleshooting.
- [Support Scope](/reference/support-scope) — current alpha support contract.
- [Contributing](https://github.com/sero-labs/sero/blob/main/CONTRIBUTING.md)
- [Security Policy](https://github.com/sero-labs/sero/blob/main/SECURITY.md)
- [Open an Issue](https://github.com/sero-labs/sero/issues/new/choose)

Use the guide pages for workflows and the reference pages for exact behavior,
state paths, plugin authoring, testing, security, troubleshooting, and known
limitations.
