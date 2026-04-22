# CI Exclusions Review

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `apps/docs-site/docs/reference/testing-evals.md`
- `README.md`
- `.github/workflows/test.yml`

## Goal

Close the OSS alpha checklist item for either integrating package/plugin tests
into repo-level CI or explicitly documenting the current exclusions.

## Current CI truth

Repo-level CI currently runs only the root alpha gate:
- `.github/workflows/test.yml` → `pnpm test:ci`

That gate currently covers:
- `pnpm typecheck`
- `pnpm build`
- `pnpm test` → desktop Vitest only
- `pnpm --filter @sero/desktop test:e2e` → desktop Playwright CI e2e

## Explicitly documented exclusions after this wave

`apps/docs-site/docs/reference/testing-evals.md` now explicitly names the test
suites that exist but are still outside repo-level CI, including:
- `apps/web-remote` tests
- plugin-local Vitest suites for admin / cron / git / mcp / memory /
  user-feedback / web
- desktop local e2e
- evals

It also notes that some shared packages currently rely on typecheck/build
coverage rather than dedicated package-local tests.

## Current assessment

This is sufficient to close the checklist item truthfully **without** pretending
those suites already run in CI. A later wave can still choose to promote some of
those excluded suites into the PR gate or a nightly workflow.
