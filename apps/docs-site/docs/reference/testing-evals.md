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
- `pnpm test`
- desktop Playwright CI e2e

### Nightly/manual

Representative manual or broader coverage includes:
- `pnpm eval:snapshot`
- selected package/plugin tests not yet in the PR gate
- `pnpm --filter @sero/desktop test:e2e:local`
- full `pnpm eval` when credentials and budget are available

### Release smoke

Release confidence should include:
- clean clone install/run smoke
- docs build
- secret scanning
- a small manual smoke path through app launch, workspace action, agent/tool
  round trip, and plugin load

## See also

Detailed source material:
- `docs/testing/eval-guide.md`
- `.github/workflows/test.yml`
