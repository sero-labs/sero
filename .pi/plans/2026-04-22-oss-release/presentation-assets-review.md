# Presentation Assets Review

Date: 2026-04-22
Branch: `feat/release-prep`

## Scope

Add a small, truthful screenshot set to the public alpha surfaces without
changing the support contract or implying unsupported distribution/runtime
claims.

## Assets added

Stored in the curated docs-site surface:

- `apps/docs-site/docs/assets/desktop-shell-overview.png`
- `apps/docs-site/docs/assets/memory-workflow.png`

## Public surfaces updated

- `README.md`
- `apps/docs-site/docs/index.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`

## Screenshot intent

1. **Desktop shell overview**
   - shows the main Sero shell layout
   - left sidebar for apps/workspaces
   - central active app panel
   - right-side global agent chat panel

2. **Example workflow**
   - shows a live session in the chat panel
   - demonstrates a direct `sero memory` command inside the session
   - keeps the example local-first and alpha-safe

## Truth / safety notes

- Screenshots were captured from a local source build, not from a packaged
  public binary.
- Copy near the screenshots keeps the canonical support contract anchored to
  `Support Scope`.
- Captured data was seeded with generic demo content only.
- The visible workspace path was normalized to a generic `/tmp/sero-docs-*`
  location to avoid leaking machine-specific private paths.

## Validation

- `pnpm --filter @sero/docs-site build` ✅
- `pnpm typecheck` ✅
