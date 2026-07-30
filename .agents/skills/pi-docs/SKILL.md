---
name: pi-docs
description: >
  Read the bundled pi (pi-coding-agent) documentation and examples. Use ONLY
  when the user asks about pi itself — its SDK, extensions, themes, skills,
  prompt templates, TUI components, keybindings, custom providers, adding
  models, or pi packages. Trigger on questions about how pi works internally,
  not on general Sero feature work.
---

# Pi documentation

Pi docs and examples ship inside `node_modules`. Resolve every path under the
**version-stable pnpm symlink** — never a `.pnpm/<version>_<hash>/` path, which
breaks on every pi upgrade:

    node_modules/@earendil-works/pi-coding-agent/

- **Main documentation:** `node_modules/@earendil-works/pi-coding-agent/README.md`
- **Additional docs:** `node_modules/@earendil-works/pi-coding-agent/docs`
- **Examples:** `node_modules/@earendil-works/pi-coding-agent/examples` (extensions, custom tools, SDK)

When reading, resolve `docs/...` under Additional docs and `examples/...` under
Examples — not the current working directory.

## Topic → file map

- extensions — `docs/extensions.md`, `examples/extensions/`
- themes — `docs/themes.md`
- skills — `docs/skills.md`
- prompt templates — `docs/prompt-templates.md`
- TUI components — `docs/tui.md`
- keybindings — `docs/keybindings.md`
- SDK integrations — `docs/sdk.md`
- custom providers — `docs/custom-provider.md`
- adding models — `docs/models.md`
- pi packages — `docs/packages.md`

Read pi `.md` files completely and follow their cross-references before
implementing (e.g. `tui.md` links to related TUI API details).
