---
pageType: home

hero:
  name: Sero
  text: Agent-first local development for macOS
  tagline: One desktop shell for workspaces, agent chat, plugins, terminals, and previews.
  image:
    src: /assets/phoenix.svg
    alt: Sero phoenix mark
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /reference/architecture

features:
  - title: Agent-first local development
    details: 'Sero is built around agent-driven workflows for local projects: chat, terminals, previews, plugins, and workspace context in one desktop shell.'
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15v9h-15z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 19h6M12 15.5V19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  - title: Container-backed when available
    details: Apple container-backed workspaces are the preferred runtime for isolation, tooling, and Linux parity, with host mode available as a reduced fallback.
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.75 7 3.7v9.1l-7 3.7-7-3.7v-9.1z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m5.4 7.65 6.6 3.5 6.6-3.5M12 11.25v8.45" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  - title: Plugin-first extension model
    details: Built-in and external plugins can add UI, Pi tools, runtime hooks, and provider integrations without changing the core app.
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.75h8v4.5h3.25v5.5H16v4.5H8v-4.5H4.75v-5.5H8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
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
