# TOOLS.md - Project Tooling & Workflow Notes

## Sero Monorepo

**Location:** `{{SERO_MONOREPO}}`

### Creating a Sero App

**Read [docs/apps-tutorial.md]({{SERO_MONOREPO}}/docs/apps-tutorial.md) first.** It covers the full process: package structure, shared state types, Pi extension, web UI, module federation setup, and dev workflow. Don't improvise — follow the tutorial step by step.

**App registration is fully automatic.** The host auto-discovers all `packages/pi-*/` directories that have a `sero.app` manifest in their `package.json`. No manual edits to any `apps/desktop/` file are needed.

To add a new app:

1. Create `packages/pi-<name>/` following the tutorial structure
2. Include `devPort` in the `sero.app` manifest (unique port, 5174+)
3. Ensure `server.port` in the package's `vite.config.ts` matches `devPort`
4. From the monorepo root, run: `pnpm install && pnpm --filter @sero/<name> build`
5. Restart the dev server (`cd apps/desktop && bash scripts/dev.sh`)

### Dev Servers

**Whenever starting a dev server**, register it with the host using the `register_dev_server` tool.
**IMPORTANT** Whenever asked to start a dev server, always check if it's running. Sometimes dev servers can be stopped in the background. Always verify before responding.
