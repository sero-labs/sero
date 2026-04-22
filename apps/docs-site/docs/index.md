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

## OSS alpha status

Sero is currently a **source-only OSS alpha** focused on **macOS on Apple
Silicon**.

Current alpha posture:
- build from source
- use Apple containers for the full experience when available
- fall back to host mode when containers are unavailable
- expect some plugin and runtime contracts to evolve during alpha

See the guide pages for setup and the reference pages for architecture,
plugins, testing, security, troubleshooting, and known limitations.
