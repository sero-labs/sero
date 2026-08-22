# Contributing to Sero

Thanks for your interest in Sero.

Sero is currently a **public beta desktop release** for macOS Apple Silicon,
Linux x64/arm64, and Windows x64. Developers and contributors can still build
from source, and contributor guidance aims to keep that workflow honest,
lightweight, and easy to follow while the project evolves quickly.

## Support scope

Public beta support is currently limited to:
- GitHub Issues
- Pull Requests

Please use issues for bug reports, regressions, feature requests, and setup
questions. For security issues, follow [`SECURITY.md`](./SECURITY.md) instead
of opening a public issue.

For the canonical beta support matrix and triage expectations, see
[`apps/docs-site/docs/reference/support-scope.md`](./apps/docs-site/docs/reference/support-scope.md).

## Before you start

Please read these first:
- [`README.md`](./README.md) - product purpose and repository overview
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - current cross-cutting boundaries
- [Plugin Quickstart](./apps/docs-site/docs/reference/plugin-quickstart.md) - plugin authoring
- [`apps/desktop/README.md`](./apps/desktop/README.md) - desktop-native recovery and host toolchains

Important current constraints:
- supported beta targets: **macOS Apple Silicon, Linux x64/arm64, and Windows x64**
- unsupported targets: **macOS Intel/x64 and Windows arm64**
- default workspace runtime: **Host** on supported beta targets
- explicit container runtimes: Apple Container on macOS arm64; Docker / Podman on macOS arm64, Linux, and Windows
- public distribution model: packaged beta installers from GitHub Releases, plus source builds for developers/contributors
- beta limits: plugin/runtime APIs may change, support is best effort, and automatic updates are not guaranteed

For the canonical current support contract and validated baseline, defer to
[`apps/docs-site/docs/reference/support-scope.md`](./apps/docs-site/docs/reference/support-scope.md).

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
- If terminals fail, follow
  [`apps/desktop/README.md`](./apps/desktop/README.md#native-module-recovery).
- Host is the default workspace runtime on supported beta targets. Install Apple
  Container, Docker, or Podman only when you need an explicit container runtime.

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
consistent with the
[Plugins reference](./apps/docs-site/docs/reference/plugins.md).

## Reporting bugs

Before filing, check the support/triage guidance in
[`apps/docs-site/docs/reference/support-scope.md`](./apps/docs-site/docs/reference/support-scope.md).

Please include:
- what you expected
- what actually happened
- steps to reproduce
- your environment details
- whether you used a packaged beta installer or a source build
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

During beta:
- release notes are tracked in the repo-level [`CHANGELOG.md`](./CHANGELOG.md)
- public beta tags use SemVer prerelease forms
- releases are maintainer-run from `main`
- exact installer filenames may change between beta releases; use GitHub Releases as the source of truth
- package versions inside the monorepo may still serve internal compatibility
  and packaging purposes, not a full independently published package train

## Contributor license expectations

By submitting a contribution, you agree that your contribution may be licensed
under the repository's Apache-2.0 license.

## Security

Please do **not** report security issues in public issues or PRs. Follow the
private reporting instructions in [`SECURITY.md`](./SECURITY.md).
