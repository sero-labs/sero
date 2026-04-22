# Public Docs Consistency Review

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `apps/docs-site/docs/reference/support-scope.md`
- `README.md`
- `CONTRIBUTING.md`
- `apps/docs-site/docs/guide/installation-requirements.md`
- `docs/sero.md`

## Goal

Close the checklist item for public docs being current and non-contradictory
without overclaiming full deduplication.

## Assessment

A public-docs audit found no hard factual contradictions across the current OSS
alpha surface. The remaining issues were mostly duplication and differences in
specificity, especially around:
- exact validated baseline details
- runtime wording
- repeated support/scope guidance across root docs and docs-site pages

## Resolution

Kept `apps/docs-site/docs/reference/support-scope.md` as the canonical source
for the public alpha support contract and validated baseline, then added
explicit deferral pointers from the most duplicated entry points:
- `README.md`
- `CONTRIBUTING.md`
- `apps/docs-site/docs/guide/installation-requirements.md`
- `docs/sero.md`

## Current assessment

This is sufficient to mark the checklist item complete in the intended alpha
sense:
- public docs are current and non-contradictory

What this means:
- the public surfaces no longer disagree about platform/runtime/distribution
  posture
- the exact support contract now has one obvious canonical home

What this does **not** mean:
- every duplicated explanation has been eliminated
- future drift is impossible
- screenshots, launch copy, or final go/no-go docs are finished
