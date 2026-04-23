# Sero Docs Site

This app is the curated **public docs platform** for the Sero OSS alpha.

## Scope

Keep this site limited to the approved alpha IA:
- Overview
- Getting Started
- Installation / Requirements
- Development Setup
- Architecture
- Plugins
- Plugin End-to-End Example
- Testing / Evals
- Security / Privacy
- Troubleshooting
- Known Limitations

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
