# Test Rationalization Review

Date: 2026-04-22
Branch: `feat/release-prep`

## Scope

Close the remaining Phase 3 release-readiness gaps around:
- stale / redundant / flaky / low-value test identification
- `turbo test` task appropriateness
- eval-risk alignment

## Inputs reviewed

- `.pi/plans/2026-04-22-oss-release/slices/02-test-ci-eval-audit.md`
- `package.json`
- `turbo.json`
- `apps/docs-site/docs/reference/testing-evals.md`
- `docs/testing/eval-guide.md`
- workspace `package.json` test scripts under `apps/*` and `plugins/*`
- repo test file inventory excluding `node_modules`

## Findings

### 1. The biggest current "stale/low-value" issue is audit noise, not source tests

No source-owned test suite was identified as obvious deletion-worthy stale junk
in this wave.

The clearest low-value/noisy surface is:
- copied test files inside build/package artifacts such as:
  - `apps/desktop/dist/**`
  - `apps/desktop/release/**`

These files should be ignored during release-readiness audits because they do
not represent additional maintained test coverage.

### 2. Some valuable suites are PR-unsuitable, not low-value

These remain useful, but are not good alpha PR blockers today:
- local/full-render Playwright coverage
- container-dependent Playwright coverage
- full promptfoo evals
- package/plugin test suites outside the current repo gate

The right classification is:
- **valuable but manual/nightly/release-oriented**
not:
- **worthless**

### 3. Do not add a monorepo `turbo run test` task yet

Current decision: **not appropriate for the alpha public command surface yet**.

Reasons:
- `@sero/desktop` still uses a watch-first `test` script
- several workspaces intentionally have no dedicated `test` script
- package test commands are inconsistent enough that a turbo-wide task would be
  a surprising contract
- the current alpha gate is intentionally narrower than “run every workspace
  test script”

Canonical public root commands remain:
- `pnpm test`
- `pnpm test:ci`

### 4. Eval coverage does match its intended risk areas

Current eval coverage is appropriately aligned for the risks it is supposed to
catch:
- `pnpm eval:snapshot` → prompt assembly / cache stability risk
- `pnpm eval` → agent file-editing, coding-task, and CLI-usage behavior

It does **not** attempt to cover:
- desktop startup correctness
- full plugin/runtime bridge compatibility
- full-render UI behavior
- container lifecycle reliability

Those risks are better handled by unit tests, Playwright, and release smoke.

## Public doc updates landed

- `apps/docs-site/docs/reference/testing-evals.md`
- `docs/testing/eval-guide.md`

## Checklist impact

The following checklist items can now be treated as complete:
- `Identify stale, redundant, flaky, or low-value tests`
- `Add turbo test task if appropriate`
  - current answer: **not appropriate yet**
- `Ensure eval coverage still matches actual risk areas`

## Validation

- `pnpm --filter @sero/docs-site build` ✅
- `pnpm typecheck` ✅
