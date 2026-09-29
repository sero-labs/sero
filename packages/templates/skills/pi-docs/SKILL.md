---
name: pi-docs
description: >
  Read the bundled pi (pi-coding-agent) documentation and examples. Use ONLY
  when the user asks about pi itself: its SDK, extensions, themes, skills,
  prompt templates, TUI components, keybindings, custom providers, adding
  models, or pi packages. Trigger on questions about how pi works internally,
  not on general Sero feature work.
---

# Pi documentation

The system prompt names the docs root. In a workspace session it is on the
`Pi docs:` line of the environment section. A session that has no such line has
Pi's own section instead, where `Main documentation` gives the path of
`README.md`, and the docs root is the folder that holds it. Use that path as
given. Do not look for the docs in `node_modules`.

- **Main documentation:** `<docs root>/README.md`
- **Additional docs:** `<docs root>/docs`
- **Examples:** `<docs root>/examples` (extensions, custom tools, SDK)

When reading, resolve `docs/...` under the docs root and `examples/...` under
the examples folder, not the current working directory.

## Topic to file map

- extensions: `docs/extensions.md`, `examples/extensions/`
- themes: `docs/themes.md`
- skills: `docs/skills.md`
- prompt templates: `docs/prompt-templates.md`
- TUI components: `docs/tui.md`
- keybindings: `docs/keybindings.md`
- SDK integrations: `docs/sdk.md`
- custom providers: `docs/custom-provider.md`
- adding models: `docs/models.md`
- pi packages: `docs/packages.md`

Read the sections that establish the API or runtime behavior needed for the
task. Follow relevant references until material uncertainty is resolved.
