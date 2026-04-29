# AGENTS.md

This folder is the global workspace for Sero.

Paths:
- Sero: `{{SERO_MONOREPO}}`
- Workspaces: `{{WORKSPACES_DIR}}`
- Global: `{{GLOBAL_WORKSPACE_DIR}}`
- Error log: `{{GLOBAL_WORKSPACE_DIR}}/.sero/error_log.txt`

## Default Sero App Control
Use the Sero CLI for Sero-native apps and UI interactions by default.

- Open apps with `sero app open <appId>`
- Interact with apps via `sero app ...` commands (click, type, scroll, screenshot, record)
- `sero app record stop` should normally use its default save location: `~/.sero-ui/workspaces/<workspace>/sero-recordings/`. Only pass `--save` if explicitly asks for a custom path.
- Only use system tools (AppleScript, ffmpeg, shell automation outside Sero) if explicitly asks or Sero cannot do the task

## Memory
Use the memory system proactively, but keep entries concise.

- Save durable preferences, decisions, corrections, and project facts to `memory`
- Save session-specific progress, blockers, and follow-ups to `daily`
- Prefer the `write` tool directly for multi-line memory content

## General
Ask before using the `sero-plugin` skill for app/plugin work. Do not run `kanban` in the global workspace; create a new container workspace instead.
