# Plugins

Sero supports both built-in and external plugins.

A plugin can provide:
- a React UI loaded via Module Federation
- a Pi extension with tools, commands, and hooks
- optional runtime/background behavior
- optional provider metadata for model integration

## Distribution modes

Plugins can be installed from:
- npm
- git repositories
- local paths

For source-based installs, Sero may run local build steps. Only install source
plugins from repositories you trust.

## Local plugin development

Sero also supports running a plugin checkout directly in production Sero through
its local plugin development flow. That is distinct from both installed plugins
and attached folders.

## Alpha guidance

During alpha:
- treat third-party plugins as trusted-source only
- expect plugin/runtime contracts to continue evolving
- keep packaging metadata and compatibility requirements explicit

## Starter author path

The canonical starter example is the external **Daily Quote** plugin:
- `https://github.com/monobyte/sero-daily-quote-plugin`

Treat it as a **small complete reference plugin**, not a visually minimal one.
Its structure is the main thing to copy: manifest shape, extension entry,
shared types, UI entry, and Vite federation config.

For the published quickstart walkthrough, see
[Plugin Quickstart](/reference/plugin-quickstart).

## See also

Current detailed source material:
- [`docs/plugins/quickstart.md`](https://github.com/monobyte/sero/blob/main/docs/plugins/quickstart.md)
- [`docs/plugins/guide.md`](https://github.com/monobyte/sero/blob/main/docs/plugins/guide.md)
- [`docs/plugins/host-compatibility.md`](https://github.com/monobyte/sero/blob/main/docs/plugins/host-compatibility.md)
- [`docs/features/local-plugin-development.md`](https://github.com/monobyte/sero/blob/main/docs/features/local-plugin-development.md)
