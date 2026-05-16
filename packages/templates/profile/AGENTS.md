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

## Creating a Sero App

For a step-by-step guide to building a new app use the `sero-plugin` skill first. It covers the full process: package structure, shared state types, Pi extension, web UI, module federation setup, and dev workflow. Don't improvise — follow the tutorial step by step.

App registration is fully automatic. The host auto-discovers all `{{SERO_MONOREPO}}/plugins/sero-*/` directories that have a `sero.app` manifest in their `package.json`. No manual edits to any `{{SERO_MONOREPO}}/apps/desktop/` file are needed.

To add a new app:
1. Create `{{SERO_MONOREPO}}/plugins/sero-<name>/` following the tutorial structure
2. Include `devPort` in the `sero.app` manifest (unique port, 5174+)
3. Ensure `server.port` in the package's `vite.config.ts` matches `devPort`
4. From the monorepo root, run: `pnpm install && pnpm --filter @sero-ai/<name> build`
5. Restart the dev server (`cd {{SERO_MONOREPO}}/apps/desktop && bash {{SERO_MONOREPO}}/scripts/dev.sh`)

## Dev Servers

Whenever starting a dev server, register it with the host using the `register_dev_server` tool. Whenever asked to start a dev server, always check if it's running first — dev servers can be stopped in the background. Always verify before responding.
