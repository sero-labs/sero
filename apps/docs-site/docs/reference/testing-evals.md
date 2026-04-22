# Testing / Evals

## Alpha quality model

Sero currently uses a tiered quality model:
- **PR gate** for fast required checks
- **nightly/manual** for broader or more expensive coverage
- **release smoke** for final confidence checks

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

### Explicitly outside the PR gate today

These test suites exist, but are **not** part of repo-level CI today:
- `pnpm --filter @sero/web-remote test`
- `pnpm --filter @sero-ai/plugin-admin test`
- `pnpm --filter @sero-ai/plugin-cron test`
- `pnpm --filter @sero-ai/plugin-git test`
- `pnpm --filter @sero-ai/plugin-mcp test`
- `pnpm --filter @sero-ai/plugin-memory test`
- `pnpm --filter @sero-ai/plugin-user-feedback test`
- `pnpm --filter @sero-ai/plugin-web test`
- `pnpm --filter @sero/desktop test:e2e:local`
- `pnpm eval:snapshot` / `pnpm eval`

Also note:
- `packages/app-runtime`, `packages/common`, and `packages/ui` currently rely on
  typecheck/build coverage rather than dedicated package-local test scripts
- `apps/docs-site` currently has typecheck/build coverage, not a separate test
  script

### Release smoke

Release confidence should include:
- clean clone install/run smoke
- docs build
- secret scanning
- a small manual smoke path through app launch, workspace action, agent/tool
  round trip, and plugin load

## See also

Detailed source material:
- [`docs/testing/eval-guide.md`](https://github.com/monobyte/sero/blob/main/docs/testing/eval-guide.md)
- [`.github/workflows/test.yml`](https://github.com/monobyte/sero/blob/main/.github/workflows/test.yml)
