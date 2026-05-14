# Development Setup

## Start from the repo root

```bash
pnpm install
pnpm build
pnpm dev
```

`pnpm dev` will start Sero desktop

## Common contributor checks

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
pnpm eval:snapshot
```

## What those commands mean today

- `pnpm typecheck` — workspace typecheck across packages and desktop Electron TS
- `pnpm build` — workspace build
- `pnpm test` — desktop Vitest suite
- `pnpm test:ci` — current alpha PR-gate shape: typecheck, build, desktop tests, desktop CI e2e (`pnpm --filter @sero/desktop test:e2e:ci`)
- `pnpm eval:snapshot` — fast prompt assembly/cache drift check

For live provider evals, use `pnpm eval` only when credentials and budget are
available. See [Running Evals](/guide/running-evals) and
[Testing / Evals](/reference/testing-evals).

## Runtime notes

- Apple Container and Docker-backed workspaces are the preferred runtimes for the full feature set.
- Host mode remains supported as a reduced explicit runtime on macOS/Linux; Windows workspace execution uses Docker.
- If native terminal support breaks, use the node-pty troubleshooting guidance
  from the repo docs.

## Evals

Evals are a separate signal from typecheck/build/unit/e2e tests. Snapshot evals
are fast and do not make live LLM calls. Full evals use promptfoo with real
providers and may cost money.

Start with [Running Evals](/guide/running-evals) for the task flow, then use
[Testing / Evals](/reference/testing-evals) for exact commands and scenario
coverage.

## Contributor guidance

For contribution workflow, PR expectations, and security reporting, see the
root OSS files in the repository:
- [`CONTRIBUTING.md`](https://github.com/sero-labs/sero/blob/main/CONTRIBUTING.md)
- [`SECURITY.md`](https://github.com/sero-labs/sero/blob/main/SECURITY.md)
- [`CODE_OF_CONDUCT.md`](https://github.com/sero-labs/sero/blob/main/CODE_OF_CONDUCT.md)
