---
pageType: home

hero:
  name: Sero
  text: Local-first, agent-first workspace for macOS
  tagline: One desktop shell for workspaces, agent chat, plugins, terminals, and previews.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /reference/architecture

features:
  - title: Local-first by default
    details: Sero is designed around local project state, local workflows, and local control over agent-assisted development.
    icon: 🖥️
  - title: Container-backed when available
    details: Apple container-backed workspaces are the preferred runtime for isolation, tooling, and Linux parity, with host mode available as a reduced fallback.
    icon: 📦
  - title: Plugin-first extension model
    details: Built-in and external plugins can add UI, Pi tools, runtime hooks, and provider integrations without changing the core app.
    icon: 🧩
---

## Current alpha preview

These screenshots were captured from the current **source-only alpha** on the
currently supported platform baseline: **macOS on Apple Silicon**.

### Desktop shell overview

![Desktop shell overview](./assets/desktop-shell-overview.png)

*Explorer workspace in the main panel, the app/workspace sidebar on the left,
and the global agent chat on the right. See [Architecture](/reference/architecture)
and [Support Scope](/reference/support-scope).*

### Example workflow

![Memory workflow in the chat panel](./assets/memory-workflow.png)

*Direct `sero memory` commands running inside a live session via the chat
panel. See [Getting Started](/guide/getting-started) and
[Support Scope](/reference/support-scope).*

## OSS alpha status

Sero is currently a **source-only OSS alpha** focused on **macOS on Apple
Silicon**.

Current alpha posture:
- build from source
- use Apple containers for the full experience when available
- fall back to host mode when containers are unavailable
- expect some plugin and runtime contracts to evolve during alpha

For the canonical current support contract, see
[Support Scope](/reference/support-scope).

## Start here

- [Getting Started](/guide/getting-started)
- [Support Scope](/reference/support-scope)
- [Architecture](/reference/architecture)
- [Contributing](https://github.com/sero-labs/sero/blob/main/CONTRIBUTING.md)
- [Security Policy](https://github.com/sero-labs/sero/blob/main/SECURITY.md)
- [Open an Issue](https://github.com/sero-labs/sero/issues/new/choose)

See the guide pages for setup and the reference pages for architecture,
support scope, plugins, testing, security, troubleshooting, and known
limitations.
