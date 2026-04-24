# OSS Alpha Release Versioning Policy

Status: Accepted for alpha
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/decision-log.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `CHANGELOG.md`

## Goal

Define the smallest credible release/versioning workflow for the Sero OSS alpha
without introducing heavy release automation too early.

## Decisions

### 1. Public release unit
- The public alpha release unit is the **repo + desktop app**.
- The public version is anchored to the desktop app version and the repo tag.
- Other workspace package versions may continue to exist as package metadata and
  compatibility markers, but they are **not** treated as an independently
  published release train during alpha.

### 2. Versioning scheme
- Use **SemVer prerelease tags** for alpha releases.
- Tag format:
  - `v0.1.0-alpha.1`
  - `v0.1.0-alpha.2`
  - `v0.1.0-alpha.3`
- Keep the leading `v` in git tags for consistency with common OSS release
  tooling and GitHub release views.

### 3. Changelog model
- Maintain a **single repo-wide `CHANGELOG.md`** at the repo root.
- Keep it curated and human-written.
- Focus on user-visible and contributor-relevant changes.
- Default structure:
  - `## Unreleased`
  - `## 0.1.0-alpha.N - YYYY-MM-DD`
  - subsections such as `Added`, `Changed`, `Fixed`, `Docs`, `Known Limitations`

### 4. Release ownership
- Alpha releases are **maintainer-run only**.
- Owner during alpha: lead maintainer / lead integrator.
- Release cuts happen from **`main` only**.

### 5. Release cadence
- Alpha cuts happen **manually when explicitly ready**.
- Not every merge gets a release.
- No weekly or automated cadence is required yet.

### 6. Automation posture
- Do **not** add Changesets yet.
- Do **not** add release-please / semantic-release yet.
- Do **not** add npm publishing automation yet.
- Keep the workflow explicit, local, and low-maintenance until the alpha
  release shape stabilizes.

## Maintainer checklist for an alpha cut

1. Confirm the targeted release content is ready.
2. Update `CHANGELOG.md`:
   - move selected items out of `Unreleased`
   - create a new release heading like `## 0.1.0-alpha.1 - 2026-04-22`
3. Update `apps/desktop/package.json` version if the public alpha version is
   changing.
4. Run the agreed release checks:
   - `pnpm typecheck`
   - `pnpm build`
   - `pnpm test`
   - `pnpm test:ci` when the local environment supports the full PR-gate path
   - working-tree secret scan
   - git-history secret scan
   - docs-site build
5. Commit the release metadata change with a release-style commit, for example:
   - `chore(release): 0.1.0-alpha.1`
6. Create an annotated git tag:
   - `git tag -a v0.1.0-alpha.1 -m "Sero 0.1.0-alpha.1"`
7. Push the commit and tag when ready.
8. Publish GitHub release notes based on the same changelog entry.

## Out of scope for now
- multi-package publishing
- automated version bumping
- package-by-package changelogs
- binary distribution promises
- release branches
