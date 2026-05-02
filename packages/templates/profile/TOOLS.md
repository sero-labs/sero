# TOOLS.md - Project Tooling & Workflow Notes

### Creating a Sero App

**For a step-by-step guide to building a new app use the `sero-plugin` skill first.** It covers the full process: package structure, shared state types, Pi extension, web UI, module federation setup, and dev workflow. Don't improvise — follow the tutorial step by step.

**App registration is fully automatic.** The host auto-discovers all `{{SERO_MONOREPO}}/plugins/sero-*/` directories that have a `sero.app` manifest in their `package.json`. No manual edits to any `{{SERO_MONOREPO}}/apps/desktop/` file are needed.

To add a new app:

1. Create `{{SERO_MONOREPO}}/plugins/sero-<name>/` following the tutorial structure
2. Include `devPort` in the `sero.app` manifest (unique port, 5174+)
3. Ensure `server.port` in the package's `vite.config.ts` matches `devPort`
4. From the monorepo root, run: `pnpm install && pnpm --filter @sero-ai/<name> build`
5. Restart the dev server (`cd {{SERO_MONOREPO}}/apps/desktop && bash {{SERO_MONOREPO}}/scripts/dev.sh`)

### Dev Servers

**Whenever starting a dev server**, register it with the host using the `register_dev_server` tool.
**IMPORTANT** Whenever asked to start a dev server, always check if it's running. Sometimes dev servers can be stopped in the background. Always verify before responding.
