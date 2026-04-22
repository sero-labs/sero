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

## See also

Current detailed source material:
- `docs/plugins/guide.md`
- `docs/plugins/host-compatibility.md`
- `docs/features/local-plugin-development.md`
