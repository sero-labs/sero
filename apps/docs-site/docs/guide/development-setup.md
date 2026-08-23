# Development Setup

## Start from the repo root

Install Git, Node.js 22.19.0 or newer, and pnpm 10.33.4. The root manifest is
the authority for the current versions.

```bash
pnpm install
pnpm build
pnpm dev
```

`pnpm dev` starts the desktop development process. Keep it running while you
use the source build. Press `Ctrl+C` to stop it.

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
- `pnpm test` — workspace test tasks
- `pnpm test:ci` — typecheck, build, workspace tests, and the desktop contract E2E project
- `pnpm eval:snapshot` — fast prompt assembly/cache drift check

For live provider evals, use `pnpm eval` only when credentials and budget are
available. See [Running Evals](/guide/running-evals) and
[Testing / Evals](/reference/testing-evals).

## Runtime notes

- Host is the default runtime on supported platforms.
- Apple Container and Docker / Podman are explicit runtime choices when you want container-provided tools, isolation, or container networking behavior.
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
