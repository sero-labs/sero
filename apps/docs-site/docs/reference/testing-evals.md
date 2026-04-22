# Testing / Evals

## Alpha quality model

Sero currently uses a tiered quality model:
- **PR gate** for fast required checks
- **nightly/manual** for broader or more expensive coverage
- **release smoke** for final confidence checks

The important alpha truth is that **not every test in the repo runs in the PR
gate**. The public contract is the gate we actually run, plus explicit notes
about what still lives outside it.

## Current root command surface

```bash
pnpm test
pnpm test:ci
pnpm eval:snapshot
```

## What runs where

### PR gate

GitHub Actions currently uses the single root command `pnpm test:ci` as the
alpha PR gate.

That gate expands to:
- `pnpm typecheck`
- `pnpm build`
- `pnpm test` (**desktop Vitest only**)
- desktop Playwright CI e2e

### Nightly/manual

Representative manual or broader coverage includes:
- `pnpm eval:snapshot`
- package/plugin tests not yet in the PR gate
- `pnpm --filter @sero/desktop test:e2e:local`
- full `pnpm eval` when credentials and budget are available

### Release smoke

Release confidence should include:
- clean clone install/run smoke
- docs build
- secret scanning
- a small manual smoke path through app launch, workspace action, agent/tool
  round trip, and plugin load

## Current test triage for alpha

### Valuable and required in the PR gate

These are the checks we currently treat as the minimum required regression net:
- monorepo typecheck
- monorepo build
- desktop Vitest coverage
- desktop Playwright CI coverage

### Valuable but intentionally outside the PR gate

These suites are real and useful, but they are currently better treated as
nightly/manual/release coverage than required PR blockers:
- `pnpm --filter @sero/web-remote test`
- plugin package test suites under `plugins/sero-*-plugin`
- `pnpm --filter @sero/desktop test:e2e:local`
- headed/local debugging flows
- full promptfoo evals via `pnpm eval`

Why they stay outside the PR gate today:
- some are environment-sensitive
- some are expensive relative to alpha PR feedback speed
- some need credentials or local runtime capabilities
- repo-level CI is intentionally narrower than “run every workspace test”

### Noisy or low-value surfaces for release-readiness auditing

The main currently identified **low-value/noisy** surfaces are not source-owned
unit tests that need deletion. They are mostly **audit noise**:
- copied test files inside build artifacts such as `apps/desktop/dist/**`
- copied test files inside packaged output such as `apps/desktop/release/**`

Those files should be ignored when reasoning about source coverage. They do not
represent additional maintained test suites.

For current alpha planning, the more important distinction is:
- **high-value but PR-unsuitable** coverage, such as local container/full-render
  Playwright runs
- versus truly **noisy** artifact copies that should not drive decisions

## Why there is no monorepo `turbo run test` task yet

Sero does **not** currently expose a repo-wide `turbo run test` task as part of
its public alpha command surface.

That is intentional for now.

Reasons:
- `@sero/desktop` still uses a watch-first package `test` script (`vitest`)
  rather than a universally non-interactive `test` entry
- several workspace packages intentionally rely on typecheck/build coverage and
  do not have dedicated `test` scripts
- package test commands are not yet normalized enough to make a monorepo-wide
  `turbo run test` a truthful, low-surprise public contract
- the alpha PR gate is intentionally narrower than “run every test script in
  every workspace package”

For now, the canonical public commands remain:
- `pnpm test`
- `pnpm test:ci`

## Eval coverage vs actual risk areas

Evals cover a **specific subset** of Sero’s risk profile. They are not a
replacement for unit tests or desktop e2e.

| Risk area | Best current signal | Notes |
|---|---|---|
| Prompt assembly / cache stability | `pnpm eval:snapshot` | Best low-cost check for prompt block drift, ordering drift, and size regressions |
| Agent file-editing behavior | `pnpm eval` | Exercises real tool use in isolated temp workspaces |
| Agent CLI usage patterns | `pnpm eval` | Verifies the agent prefers `sero-cli` behavior in supported scenarios |
| Desktop startup and session wiring | desktop unit tests + Playwright CI e2e | Not primarily an eval concern |
| Plugin compatibility / bridge regressions | desktop unit tests + focused e2e | Covered better by repo tests than promptfoo |
| Container lifecycle / full-render UX | local Playwright runs | Valuable, but currently local/nightly/manual only |

### What evals are good at

- catching prompt-caching drift
- catching regression in agent tool-selection patterns
- checking a small set of realistic coding/file/CLI behaviors

### What evals are not meant to prove

- full desktop UI correctness
- full plugin/runtime compatibility across the repo
- container lifecycle reliability in CI
- every interaction that matters for release confidence

That is why Sero keeps evals as one layer in a broader test stack rather than
pretending they are the whole quality story.

## See also

Detailed source material:
- [`docs/testing/eval-guide.md`](https://github.com/monobyte/sero/blob/main/docs/testing/eval-guide.md)
- [`.github/workflows/test.yml`](https://github.com/monobyte/sero/blob/main/.github/workflows/test.yml)
