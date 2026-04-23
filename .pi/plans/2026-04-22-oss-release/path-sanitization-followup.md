# Path Sanitization Follow-up

Date: 2026-04-22
Branch: `feat/release-prep`

## Scope

Reduce remaining machine-specific absolute-path leakage in tracked source and
transient docs without deleting or relocating the underlying files.

## Files updated

Docs / historical plans:
- `docs/plans/2026-04-19-local-plugin-dev-sessions.md`
- `docs/superpowers/plans/2026-04-04-dynamic-model-provider.md`
- `docs/superpowers/plans/2026-04-04-google-auth-ux.md`
- `docs/superpowers/plans/2026-04-05-onboarding-polish.md` *(later archived on `private-archive/batch-d4-pre-prune-2026-04-24` and removed from this branch in Batch D step 4)*
- `docs/superpowers/plans/2026-04-06-merge-admin-resources.md` *(later archived on `private-archive/batch-d6-pre-prune-2026-04-24` and removed from this branch in Batch D step 6)*
- `docs/superpowers/plans/2026-04-06-providers-panel.md`

Test fixtures:
- `plugins/sero-admin-plugin/ui/components/plugins/PluginSections.test.tsx`
- `plugins/sero-admin-plugin/ui/components/plugins/PluginDevSessionCard.test.tsx`

## Replacements made

- replaced hardcoded monorepo root paths with `<repo-root>`
- replaced hardcoded plugin checkout examples with `<plugin-checkout-path>`
- replaced machine-specific UI test fixture paths under `/Users/daniel/...` with
  neutral `/Users/example/...` paths

## Why this wave

This does **not** complete the preserve-before-prune cleanup program.

It does, however, remove obvious machine-specific path leakage from:
- historical planning docs that still remain tracked during migration
- public-tree source tests that previously embedded maintainer-specific home
  paths in rendered output expectations

## Validation

- `rg -n '/Users/danielcarter|/Users/daniel/' . -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/release/**' -g '!**/.git/**'` → no matches
- `cd plugins/sero-admin-plugin && pnpm exec vitest run ui/components/plugins/PluginSections.test.tsx ui/components/plugins/PluginDevSessionCard.test.tsx` ✅
- `pnpm typecheck` ✅
