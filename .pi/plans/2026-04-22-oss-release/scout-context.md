# OSS Alpha Release Readiness — Scout Context

Date: 2026-04-22
Repo: `/Users/danielcarter/Documents/Dev/projects/sero/sero`

## Quick findings

### Repo/documentation shape
- Root has no `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, issue templates, or PR template.
- `docs/` currently contains 154 files, including:
  - `docs/deslopify/` — 88 files
  - `docs/plans/` — 12 files
  - `docs/superpowers/` — 14 files
- Tracked `.pi/plans/**` files exist and include absolute local paths like `/Users/danielcarter/...`.
- `docs/superpowers/**` and some plan/spec files also contain machine-specific absolute paths and transient planning content.

### Tests/evals
- Desktop unit/integration tests: 152 files under `apps/desktop/electron/__tests__/`
- Plugin tests: 81 files across `plugins/**`
- Playwright e2e: 9 specs in `apps/desktop/e2e/`
- Evals: Promptfoo harness plus 4 scenario files under `eval/scenarios/`
- CI in `.github/workflows/test.yml` currently runs:
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm --filter @sero/desktop test -- --run`
  - desktop Playwright `test:e2e` in CI mode
- CI does **not** run plugin/package test suites even though many packages define `test` scripts.
- `turbo.json` has no `test` task and the root `package.json` has no `test` script.
- `apps/desktop/playwright.config.ts` explicitly skips some UI/container specs in CI.

### Scripts/dev workflow
- Root `package.json` already exposes a canonical `pnpm dev`, but the underlying script surface is still hard to understand.
- Root `scripts/` contains 8 files; `apps/desktop/scripts/` contains 9 files.
- There is obvious wrapper duplication:
  - `scripts/build-plugin.mjs` + `scripts/build-plugin.sh`
  - `scripts/export-plugin-source.mjs` + `scripts/export-plugin-source.sh`
- `apps/desktop/scripts/dev.sh` is the true orchestration entrypoint and is fairly complex.

### Security/public release hygiene
- `gitleaks dir . --config .gitleaks.toml` -> clean
- `gitleaks git . --config .gitleaks.toml` -> clean
- `.env` exists locally but is not tracked by git.
- Quick regex scan only found fake secret-like strings in tests.
- Biggest public-hygiene risk found so far is **tracked transient artifacts and absolute local paths**, not live secrets.

### Packaging/legal/platform caveats
- Product is macOS + Apple Silicon focused with Apple Container CLI strongly recommended.
- Public README/docs must state platform limitations very clearly.
- Castlabs Electron / Widevine / Spotify-related redistribution needs explicit legal review before public binaries.
- No visible release/versioning automation (`.changeset`, release-please manifest, etc.).

## Recommended planning scope
1. Define alpha audience, supported platform matrix, and non-goals.
2. Separate durable public docs from transient/internal planning artifacts.
3. Rationalize test taxonomy and CI gates.
4. Simplify contributor workflows behind a few public root commands.
5. Complete repo OSS hygiene: README/license/contributing/security/community files.
6. Perform public-content scrub: secrets, local paths, internal-only notes, legal/licensing review.
7. Add release engineering basics: versioning/changelog/artifacts/checklists.
8. Create a placeholder public landing/home page and screenshots.

## Missing items beyond the user’s initial list
- Alpha success criteria / release checklist
- CI/release pipeline design
- Versioning + changelog strategy
- Third-party license/NOTICE audit
- Security disclosure policy
- Public support/community model (issues, discussions, templates)
- Platform compatibility / known limitations docs
- Example plugin or starter for contributors
- Decision on whether `AGENTS.md`, `.claude/`, and tracked `.pi/` artifacts belong in the public repo
