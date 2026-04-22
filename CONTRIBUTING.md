# Contributing to Sero

Thanks for your interest in Sero.

Sero is currently a **source-only OSS alpha** focused on **macOS on Apple
Silicon**. The project is still evolving quickly, so contributor guidance aims
to keep the workflow honest, lightweight, and easy to follow.

## Support scope

Public alpha support is currently limited to:
- GitHub Issues
- Pull Requests

Please use issues for bug reports, regressions, feature requests, and setup
questions. For security issues, follow [`SECURITY.md`](./SECURITY.md) instead
of opening a public issue.

## Before you start

Please read these first:
- [`docs/sero.md`](./docs/sero.md) — product vision, platform constraints, runtime modes
- [`docs/architecture.md`](./docs/architecture.md) — app structure and major subsystems
- [`docs/plugins/guide.md`](./docs/plugins/guide.md) — plugin author and distribution guidance
- [`docs/node-pty-setup.md`](./docs/node-pty-setup.md) — native terminal troubleshooting

Important current constraints:
- supported alpha development target: **macOS on Apple Silicon**
- preferred runtime: **Apple Container CLI** enabled
- supported fallback: **host mode** with reduced capabilities
- current public distribution model: **build from source**

## Development setup

From the repo root:

```bash
pnpm install
pnpm dev
```

Other common commands:

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
```

Notes:
- `pnpm dev` is the canonical first-run command for contributors.
- `pnpm install` runs native-module repair hooks for `node-pty` and
  `better-sqlite3`.
- If terminals fail, follow [`docs/node-pty-setup.md`](./docs/node-pty-setup.md).
- Container-backed workflows are recommended, but host mode remains supported.

## Pull request expectations

Please keep pull requests:
- focused
- well-described
- tested to the level appropriate for the change
- aligned with existing architecture and naming conventions

For most changes, before opening or updating a PR, run:

```bash
pnpm typecheck
```

Also run any relevant targeted checks for the area you touched, for example:

```bash
pnpm test
pnpm test:ci
pnpm --filter @sero/desktop test:e2e:local
```

If your change affects docs, public commands, plugin flows, auth/storage, or
security-sensitive behavior, update the relevant docs in the same PR.

## Commit and code review guidance

- Use **Conventional Commits** where practical.
- Prefer small PRs over large mixed-purpose branches.
- Include screenshots or short recordings for visible UI changes.
- Call out breaking changes, migrations, or follow-up work explicitly.
- Do not add secrets, private tokens, machine-specific credentials, or unsafe
  local-path examples to the repository.

## Project-specific conventions

A few important repo rules:
- avoid `@ts-ignore`, `@ts-expect-error`, and unnecessary `any`
- keep shared renderer-safe contracts in `packages/common` when appropriate
- avoid `localStorage` and `sessionStorage` for persistent app state
- prefer documented root commands over ad hoc local scripts in contributor docs
- keep source files under the repo's 500 LOC guideline when possible

If you touch plugin packaging or authoring flows, keep external-plugin guidance
consistent with [`docs/plugins/guide.md`](./docs/plugins/guide.md).

## Reporting bugs

Please include:
- what you expected
- what actually happened
- steps to reproduce
- your environment details
- relevant logs or screenshots

Before sharing logs, remove secrets, tokens, personal paths, and other private
information.

## Suggesting features

Good feature requests usually explain:
- the problem or workflow gap
- why it matters
- the proposed direction
- trade-offs or alternatives considered

## Release and versioning notes

During OSS alpha:
- release notes are tracked in the repo-level [`CHANGELOG.md`](./CHANGELOG.md)
- public alpha tags are expected to use a form like `v0.1.0-alpha.1`
- releases are maintainer-run from `main`
- package versions inside the monorepo may still serve internal compatibility
  and packaging purposes, not a full independently published package train

## Contributor license expectations

By submitting a contribution, you agree that your contribution may be licensed
under the repository's Apache-2.0 license.

## Security

Please do **not** report security issues in public issues or PRs. Follow the
private reporting instructions in [`SECURITY.md`](./SECURITY.md).
