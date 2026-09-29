# AGENTS.md

This folder is the global workspace for Sero.

Paths:
- Sero: `{{SERO_MONOREPO}}`
- Workspaces: `{{WORKSPACES_DIR}}`
- Global: `{{GLOBAL_WORKSPACE_DIR}}`
- Error log: `{{GLOBAL_WORKSPACE_DIR}}/.sero/error_log.txt`

## Sero App Control
Use the Sero CLI for Sero-native apps and UI interactions. Use system tools (AppleScript, ffmpeg, shell automation outside Sero) only if asked or if Sero cannot do the task.

- `sero app record stop` should normally use its default save location: `~/.sero-ui/workspaces/<workspace>/sero-recordings/`. Pass `--save` only if asked for a custom path.

## Memory
Use the memory system proactively, but keep entries concise. Save durable preferences, decisions, corrections, and project facts with `sero memory`. Do not edit memory files directly.

## Apps and plugins
Ask before building or changing a Sero app or plugin. Then use the `sero-plugin` skill first. It covers the package layout, how the host finds a plugin, the dev port and the build and dev steps. Follow it step by step.
