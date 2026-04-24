# Development Setup

## Start from the repo root

```bash
pnpm install
pnpm dev
```

`pnpm dev` is the public first-run command surface for the OSS alpha.

## Common contributor checks

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
```

## What those commands mean today

- `pnpm typecheck` — workspace typecheck across packages and desktop Electron TS
- `pnpm build` — workspace build
- `pnpm test` — desktop Vitest suite
- `pnpm test:ci` — current alpha PR-gate shape: typecheck, build, desktop tests, desktop CI e2e (`pnpm --filter @sero/desktop test:e2e:ci`)

## Runtime notes

- Apple containers are the preferred runtime for the full feature set.
- Host mode remains supported as a reduced fallback.
- If native terminal support breaks, use the node-pty troubleshooting guidance
  from the repo docs.

## Contributor guidance

For contribution workflow, PR expectations, and security reporting, see the
root OSS files in the repository:
- [`CONTRIBUTING.md`](https://github.com/monobyte/sero/blob/main/CONTRIBUTING.md)
- [`SECURITY.md`](https://github.com/monobyte/sero/blob/main/SECURITY.md)
- [`CODE_OF_CONDUCT.md`](https://github.com/monobyte/sero/blob/main/CODE_OF_CONDUCT.md)
