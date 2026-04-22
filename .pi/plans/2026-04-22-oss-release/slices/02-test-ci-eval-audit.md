# OSS-0102 Test / CI / Eval Audit

## Executive summary
- Current enforced CI is narrow: one macOS workflow runs `pnpm typecheck`, `pnpm build`, desktop unit tests, and a Playwright e2e pass in CI mode.
- The CI e2e job intentionally skips the heaviest / least reliable desktop specs: `container.spec.ts`, `layout.spec.ts`, `file-tree.spec.ts`, and `scroll-fix.spec.ts`.
- There is a substantial local test surface outside CI, especially under `apps/desktop/electron/__tests__` and plugin/unit test folders, but it is not individually invoked by the workflow; it is only indirectly covered by `pnpm --filter @sero/desktop test -- --run`.
- Eval coverage exists via `pnpm eval` / `pnpm eval:snapshot`, but no workflow currently runs either eval path.
- The snapshot eval is explicitly designed to be fast and CI-safe, while the main promptfoo eval requires `ANTHROPIC_API_KEY` and is clearly more expensive/manual.
- Several package-level `test` scripts exist in plugins and `apps/web-remote`, but they are not referenced by the current GitHub Actions workflow.
- The repo has a large number of test files, but the “what runs in CI today” surface is much smaller than the “what exists in the repo” surface.
- For an alpha gate, the truthful model is tiered: PR gate for fast deterministic checks, nightly/manual for expensive desktop/container/eval coverage, release gate for the broadest smoke set.

## Scope covered
- Workflow reviewed: `.github/workflows/test.yml`
- Root commands reviewed: `package.json`, `turbo.json`
- Desktop e2e config reviewed: `apps/desktop/playwright.config.ts`
- Desktop e2e tree reviewed: `apps/desktop/e2e/**`
- Eval surface reviewed: `eval/**` (`run.sh`, `promptfoo-snapshot.yaml`, scenarios, providers)
- Package test scripts reviewed:
  - `apps/desktop/package.json`
  - `apps/web-remote/package.json`
  - `plugins/sero-admin-plugin/package.json`
  - `plugins/sero-cron-plugin/package.json`
  - `plugins/sero-git-plugin/package.json`
  - `plugins/sero-memory-plugin/package.json`
  - `plugins/sero-mcp-plugin/package.json`
  - `plugins/sero-web-plugin/package.json`
  - `plugins/sero-user-feedback-plugin/package.json`
- Test directories reviewed broadly under `apps/**` and `plugins/**` via file listing

## Current test surface map
| surface | location / command | category | runs in CI today? | notes |
|---|---|---:|---:|---|
| Monorepo typecheck | `pnpm typecheck` (`turbo run typecheck`) | other | yes | Workflow runs this before build/tests; depends on package build tasks.
| Monorepo build | `pnpm build` (`turbo run build`) | other | yes | Used both in unit job and e2e job; likely the main breadth check for packages.
| Desktop unit tests | `pnpm --filter @sero/desktop test -- --run` | unit | yes | Workflow only targets desktop package, not all package-level `test` scripts.
| Desktop Playwright CI e2e | `pnpm --filter @sero/desktop test:e2e` → `npx playwright test --project=ci` | e2e | yes | CI project excludes container / full-render specs.
| Desktop Playwright local e2e | `pnpm --filter @sero/desktop test:e2e:local` → `npx playwright test --project=local` | e2e | no | Includes container lifecycle and UI-rendering specs; expensive and environment-sensitive.
| Desktop Playwright headed e2e | `pnpm --filter @sero/desktop test:e2e:headed` | e2e | no | Manual debugging path only.
| Container e2e | `apps/desktop/e2e/container.spec.ts` | integration | no | Explicitly skipped in CI by Playwright config; container-dependent.
| UI-rendering e2e | `apps/desktop/e2e/layout.spec.ts`, `file-tree.spec.ts`, `scroll-fix.spec.ts` | e2e | no | Playwright config comments say Electron window does not fully render in headless CI.
| Agent / IPC e2e | `apps/desktop/e2e/agent.spec.ts`, `memory*.spec.ts`, `vcs.spec.ts`, `app-launch.spec.ts` | e2e | yes | These are the tests that remain in CI project.
| Desktop internal unit/integration tests | `apps/desktop/electron/__tests__/**` | unit/integration | no direct job | Large surface; likely included only if `@sero/desktop test` discovers them.
| Desktop React/UI tests | `apps/desktop/src/**/*.test.tsx?` | unit | no direct job | Present in repo and likely included by Vitest discovery.
| Web remote tests | `apps/web-remote/src/**/*.test.ts` | unit | no | Package has `test: vitest run`, but workflow does not call it.
| Plugin tests: admin | `plugins/sero-admin-plugin/**/test` + `ui/**/*.test.tsx` | unit | no | Package has `test`, not invoked in workflow.
| Plugin tests: cron | `plugins/sero-cron-plugin/**/test` + `ui/**/*.test.tsx` | unit | no | Package has `test`, not invoked in workflow.
| Plugin tests: git | `plugins/sero-git-plugin/**/test` + `ui/**/*.test.tsx` | unit | no | Package has `test`, not invoked in workflow.
| Plugin tests: mcp | `plugins/sero-mcp-plugin/**/test` + `ui/**/*.test.tsx` | unit | no | Package has `test`, not invoked in workflow.
| Plugin tests: web | `plugins/sero-web-plugin/**/test` | unit | no | Package has `test`, not invoked in workflow.
| Plugin tests: user-feedback | `plugins/sero-user-feedback-plugin/**/test` | unit | no | Package has `test`, not invoked in workflow.
| Plugin tests: memory | `plugins/sero-memory-plugin/extension/__tests__/**` | unit | no | Has a test script, but the script path is a direct vitest binary path.
| Eval prompt caching snapshot | `pnpm eval:snapshot` → `node scripts/run-promptfoo.mjs eval --config eval/promptfoo-snapshot.yaml --no-cache` | eval | no | Fast, no API key, explicitly intended for stability; not wired into CI.
| Full promptfoo eval | `pnpm eval` / `eval/run.sh` | eval | no | Requires `ANTHROPIC_API_KEY`; expensive/manual by design.

## Coverage gaps and pain points
| gap / issue | evidence | impact | recommended later action |
|---|---|---|---|
| CI only exercises one package’s Vitest suite explicitly | Workflow runs `pnpm --filter @sero/desktop test -- --run`; other package test scripts are not called | Plugin and web-remote regressions can slip through unless caught indirectly by build/typecheck | Add a root test orchestrator that targets all changed packages or all workspace test scripts.
| Eval is completely outside CI | Root scripts include `eval` and `eval:snapshot`; no workflow references them | Prompt/caching regressions are invisible to PR checks | Add snapshot eval to PR or a lightweight nightly lane; keep full eval manual/nightly.
| E2E CI excludes known-important interaction paths | Playwright config excludes `container.spec.ts`, `layout.spec.ts`, `file-tree.spec.ts`, `scroll-fix.spec.ts` from CI project | Core UX/container regressions are not caught in PR CI | Create a separate gated local/nightly container suite and a release smoke subset.
| Container-dependent tests are expensive and environment-specific | Comments in Playwright config note container disablement in CI; `container.spec.ts` skipped | Can’t truthfully promise “full e2e” in PR | Document as nightly/manual only unless dedicated container runners are provisioned.
| Monorepo build/typecheck may miss runtime/test behavior | `pnpm typecheck` + `pnpm build` are necessary but not sufficient | Build success can mask broken test logic or e2e issues | Keep them as PR gate, but do not treat them as release confidence by themselves.
| Package test commands are inconsistent | Examples: `vitest`, `vitest run`, `pnpm exec vitest run --root .`, direct binary path for memory plugin | Hard to automate a stable root command across workspace packages | Normalize package scripts later so a single root command can enumerate and run tests safely.
| No explicit release smoke command is defined | Root package lacks a release-smoke script; e2e CI is the closest thing | Release confidence is fuzzy and may rely on ad hoc manual checks | Define a small release smoke lane (launch app, basic navigation, one agent/tool path, one plugin load path).
| Some test surfaces appear duplicated in built artifacts | `apps/desktop/dist/...` and `apps/desktop/release/...` contain `__tests__` files from packaged dependencies | Noise in tree scans; easy to misread as source coverage | Exclude build artifacts from future audits and from root test globbing if they are not intentional.
| Eval snapshot baseline is hard-coded | `eval/promptfoo-snapshot.yaml` contains a numeric baseline and cache-sensitive ordering assertions | Intentional prompt changes can cause noisy failures | Keep snapshot eval separate from functional release gates; update baseline only with intentional prompt changes.

## Proposed gate tiers

### PR
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @sero/desktop test -- --run`
- `pnpm --filter @sero/desktop test:e2e` (`project=ci` only)
- Optional fast eval: `pnpm eval:snapshot` if the team wants prompt-cache drift caught on every PR

### Nightly/manual
- `pnpm --filter @sero/desktop test:e2e:local` for container + full-render coverage
- Selected plugin package test suites (`admin`, `git`, `mcp`, `web`, `cron`, `user-feedback`, `memory`, `web-remote`)
- `pnpm eval:snapshot`
- Full `pnpm eval` when API budget/availability allows

### Release
- PR gate plus a small release smoke command that exercises:
  - app startup
  - one workspace action
  - one agent/tool round trip
  - one plugin load path
  - one basic e2e interaction
- Keep container-heavy and promptfoo-full runs outside the blocking release path unless dedicated infra is available

## Recommended G1 decisions
- Treat the current workflow as a **PR-quality baseline**, not a full alpha guarantee.
- Make the alpha gate explicit and tiered rather than pretending all repo tests run in CI.
- Add a minimal release-smoke definition that is small enough to be repeatable and does not depend on container runners.
- Decide whether `eval:snapshot` is PR-blocking or nightly; it is the strongest low-cost eval candidate.
- Decide whether to normalize all package `test` scripts before adding a root “run all tests” command.
- Keep container/full-render Playwright coverage out of the default PR gate unless CI infrastructure changes.

## Blockers / open questions
- Should snapshot eval be required on PRs, or only nightly/manual?
- Is the intended OSS alpha gate allowed to exclude containerized e2e from blocking CI?
- Should plugin package tests be promoted into a root command, or remain package-local?
- What constitutes the minimum release smoke for Sero OSS: app launch only, or launch + one agent/tool + one plugin interaction?
- Are the tests under `apps/desktop/dist/...` and `apps/desktop/release/...` intentional artifacts we should ignore in future audits?
