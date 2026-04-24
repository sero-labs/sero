# Plugin End-to-End Example Review

Date: 2026-04-22
Branch: `feat/release-prep`

## Scope

Close the remaining ecosystem-onboarding gap by publishing a canonical
runtime-enabled plugin example that shows the full plugin surface:
- UI
- Pi extension
- background runtime

## Published source material

- `docs/plugins/end-to-end-example.md`

## Published docs-site surface

- `apps/docs-site/docs/reference/plugin-end-to-end-example.md`
- nav/sidebar updates in `apps/docs-site/rspress.config.ts`

## Related doc updates

Updated existing plugin docs to point readers at the new example:
- `docs/plugins/quickstart.md`
- `docs/plugins/guide.md`
- `apps/docs-site/docs/reference/plugins.md`
- `apps/docs-site/docs/reference/plugin-quickstart.md`
- `apps/docs-site/README.md`

## Canonical example chosen

The published end-to-end example is:
- `packages/templates/skills/sero-plugin/example/sero-notes-plugin/`
- with walkthrough:
  `packages/templates/skills/sero-plugin/example/README.md`

Why this example was chosen:
- it already exists in-repo
- it is the smallest example in this repo that exercises all major plugin
  surfaces together
- it complements, rather than replaces, the Daily Quote quickstart example

## Positioning

- **Daily Quote** remains the smallest public quickstart for UI + extension
- **Notes** is now the canonical example for UI + extension + runtime together

This keeps the author story honest:
- quickstart for the common/simple path
- end-to-end example for the full-surface path

## Validation

- `pnpm --filter @sero/docs-site build` ✅
- `pnpm typecheck` ✅
