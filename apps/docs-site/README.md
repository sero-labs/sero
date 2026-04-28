# Sero Docs Site

This app is the curated **public docs platform** for the Sero OSS alpha.

## Scope

Keep this site focused on current, public Sero behavior. The docs site is the curated surface for beginner-friendly guides and exact reference material across:

- Start/setup: overview, installation, requirements, development setup, profiles, onboarding, providers, and local models.
- Workspace/runtime: workspaces, Explorer, editor, terminal, containers, dev servers, browser previews, checkpoints, and state locations.
- Agents: chat sessions, composer controls, context, voice, memory, scheduler, subagents, collaboration, and related safeguards.
- Apps/plugins: built-in apps, dashboard widgets, app store/favorites, plugin catalog, external/local plugins, and plugin-author workflows.
- Integrations and operator workflows: Git, MCP, Web, remote control, browser/app capture, CLI, and local runtime troubleshooting.
- Quality/safety/reference: architecture, testing/evals, security/privacy, support scope, known limitations, troubleshooting, and source-checked coverage audits.

The public information architecture may evolve as these categories fill in. Keep index pages and navigation curated around reader journeys instead of mirroring every implementation directory.

## Content rules

- Treat `apps/docs-site/docs/**` as the curated public-doc surface.
- Treat root `docs/**` as source material and deeper reference docs during the
  migration period.
- Do **not** link internal/historical trees from the public nav, including:
  - `.pi/plans/**`
  - `docs/plans/**`
  - `docs/superpowers/**`
  - `docs/deslopify/**`
  - `AGENTS.md` while it remains temporarily tracked for Pi CLI compatibility
- Keep maintainer-only/archive surfaces out of the public nav even if related
  historical material still exists elsewhere in the repo.
- Prefer concise public explanations over copying internal plan language.
- Preserve before prune: do not delete or move the older docs as part of docs
  site work unless the release plan explicitly calls for it.

## Commands

```bash
pnpm --filter @sero/docs-site dev
pnpm --filter @sero/docs-site build
pnpm --filter @sero/docs-site preview
```
