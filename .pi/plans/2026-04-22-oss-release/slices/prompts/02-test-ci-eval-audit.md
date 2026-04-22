# Prompt — OSS-0102 Test / CI / Eval Audit

You are the Phase 1 test/CI/eval audit lane for the Sero OSS alpha effort.

## Mission
Map the current quality surface, identify gaps between existing tests and enforced CI, and recommend a truthful alpha gate model.

This is a **discovery-only** task. Do not edit CI, scripts, or tests.

## Read scope
- `.github/workflows/**`
- root `package.json`
- `turbo.json`
- `apps/desktop/e2e/**`
- `apps/desktop/playwright.config.ts`
- `eval/**`
- package and plugin `package.json` files with `test` scripts
- test directories under `apps/**`, `packages/**`, and `plugins/**` as needed

## File ownership
You may write to exactly one file:
- `.pi/plans/2026-04-22-oss-release/slices/02-test-ci-eval-audit.md`

Do not edit:
- `.pi/plans/2026-04-22-oss-release/decision-log.md`
- `.pi/plans/2026-04-22-oss-release/spec.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/plan.md`
- any other slice or prompt file
- repo source/config/CI files

## Required output
Fill the output file with:
1. Executive summary: 5-10 bullets
2. Scope covered: workflows, commands, major test trees reviewed
3. Current test surface map table:
   - surface
   - location / command
   - category (`unit`, `integration`, `e2e`, `eval`, `release smoke`, `other`)
   - runs in CI today?
   - notes
4. Coverage gaps and pain points table:
   - gap / issue
   - evidence
   - impact
   - recommended later action
5. Proposed gate tiers:
   - PR
   - nightly/manual
   - release
6. Recommended G1 decisions
7. Blockers / open questions

## Constraints
- Recommend; do not implement.
- Be explicit about what is already covered vs merely present in the repo.
- Flag flaky, skipped, container-dependent, or unusually expensive suites when visible.
- Prefer concise tables.
- Optimize for later single-owner implementation of root test commands and CI changes.

## Artifact paths
- Prompt: `.pi/plans/2026-04-22-oss-release/slices/prompts/02-test-ci-eval-audit.md`
- Output: `.pi/plans/2026-04-22-oss-release/slices/02-test-ci-eval-audit.md`
