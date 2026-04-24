# Alpha Support Scope Review

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `apps/docs-site/docs/reference/support-scope.md`
- `apps/docs-site/docs/reference/known-limitations.md`
- `README.md`
- `docs/sero.md`

## Goal

Close the remaining ambiguity around the public alpha support contract by making
one canonical support matrix public and aligning the most visible entry points.

## Problem found

Before this wave, support posture was public but still distributed across
multiple pages:
- `README.md`
- `apps/docs-site/docs/reference/known-limitations.md`
- `docs/sero.md`

That left two problems:
1. there was no single canonical supported / not-supported matrix
2. platform wording varied between broad `macOS on Apple Silicon` messaging and
   the more specific `macOS 26 Tahoe+` maintainer baseline

## Resolution

Added a dedicated public support matrix:
- `apps/docs-site/docs/reference/support-scope.md`

Aligned the main public entry points to point at that canonical page:
- `README.md`
- `apps/docs-site/docs/index.md`
- `apps/docs-site/docs/guide/getting-started.md`
- `apps/docs-site/docs/reference/known-limitations.md`
- `docs/sero.md`
- `apps/docs-site/rspress.config.ts`

## Current assessment

The public alpha now has an explicit support contract covering:
- supported platform
- maintainer-validated baseline
- source-only distribution posture
- preferred runtime vs supported host-mode fallback
- explicit non-supports
- alpha contract caveats for plugin/runtime API stability

This is sufficient to mark these checklist items complete:
- known limitations list is explicit and public
- maintainer knows exactly what is supported in alpha

## Still not implied

This wave does **not** mean all docs are fully current/non-contradictory in the
strongest sense, or that screenshots / launch copy are finished. It only closes
the specific support-scope ambiguity.
