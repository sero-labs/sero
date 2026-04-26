# GitHub Permissions & Public Launch Status

This document tracks implementation of `docs/plans/github-permissions-public-launch-plan.md`.

## Phase 1 — Organisation-Level Governance

Status: Complete

Implemented for `sero-labs`:

- Confirmed active GitHub account: `monobyte`.
- Confirmed `sero-labs` is currently solo-maintainer/owner-operated.
- Set default repository permission for future organisation members to `none`.
- Disabled repository creation for non-owner members.
- Created placeholder governance teams:
  - `core`
  - `plugin-maintainers`
  - `security`
  - `release-managers`

Notes:

- Organisation two-factor authentication was confirmed enabled in the GitHub web UI.
- Because the organisation currently has only one owner/member, the main benefit of this phase is future-proofing before collaborators are invited.

## Phase 2 — Classify Repositories by Risk

Status: Complete

Repository tiers for launch implementation:

### Tier 1 — Core Platform

- `sero-labs/sero`

Policy target:

- Solo-maintainer-friendly protected `main`.
- PRs and CI encouraged/required where compatible with current workflows.
- Owner/admin bypass allowed during solo-maintainer phase to avoid lockout.
- Strongest attention on secret history, release workflows, and public-facing governance docs.

### Tier 2 — Official Product Plugins

- `sero-labs/sero-google-plugin`
- `sero-labs/sero-kanban-plugin`
- `sero-labs/sero-spotify-plugin`
- `sero-labs/sero-imagegen-plugin`
- `sero-labs/sero-notes-plugin`
- `sero-labs/sero-research-plugin`
- `sero-labs/sero-starling-plugin`

Policy target:

- Protected `main`.
- At least one PR approval when there is more than one maintainer.
- Build/typecheck required where workflows exist and check names are stable.
- Actions/secrets hardened for public fork PRs.

### Tier 3 — Utility, Demo, or Experimental Plugins

- `sero-labs/sero-plan-mode-tracker`
- `sero-labs/sero-weight-tracker`
- `sero-labs/sero-humanizer-plugin`
- `sero-labs/sero-slopzilla-plugin`
- `sero-labs/sero-tetris-plugin`
- `sero-labs/sero-calculator-plugin`
- `sero-labs/sero-daily-quote-plugin`
- `sero-labs/sero-todo-plugin`

Policy target:

- Protected `main`.
- Solo-maintainer-friendly bypass while there is only one maintainer.
- README should clearly indicate experimental/demo status where applicable.

## Phase 3 — Audit Human Access

Status: Complete

Audited human/team access across all repositories in scope.

Findings:

- Only `monobyte` appears as a collaborator/admin on the repositories in scope.
- No unexpected outside collaborators were found.
- No repository teams currently have access to the repositories in scope.
- This matches the current solo-maintainer ownership model.

Implementation notes:

- The placeholder `sero-labs` teams created in Phase 1 are not yet granted repository permissions. This is intentional while the project is owner-operated.
- When collaborators are added later, grant access through teams rather than direct per-user repository permissions.

## Phase 4 — Protect the Default Branch

Status: Complete

Applied classic branch protection to the default branch of every repository in scope.

Applied settings:

- Default branch protected: `main` for all repositories in scope.
- Pull request review protection enabled.
- Stale reviews are dismissed after new commits.
- Required approving review count is `0` for the solo-maintainer phase.
- Required conversation resolution is enabled.
- Force pushes are disabled.
- Branch deletion is disabled.
- Admin enforcement is disabled so the owner can bypass during the solo-maintainer phase if necessary.

Rationale:

- This is intentionally solo-maintainer friendly. It establishes the protected-branch structure now without locking the sole maintainer out of emergency fixes.
- When additional maintainers join, increase required approvals to `1` or `2` and consider enabling code owner review.

## Phase 5 — Define Required Checks

Status: Complete for current available CI

Implemented:

- Updated the main repo PR workflow trigger to include `synchronize`, so the PR gate reruns when new commits are pushed to an open PR.
- Required the `PR Gate` status check on `sero-labs/sero:main`.
- Enabled strict required status checks on `sero-labs/sero:main`, requiring branches to be up to date before merge.

Plugin repository findings:

- The external plugin repositories currently do not expose `.github/workflows` files through the GitHub API.
- Because there are no stable CI check names to require yet, plugin branch protection remains without required status checks for now.

Follow-up:

- Add a standard plugin CI workflow to each plugin repository.
- After those workflows have run at least once and check names are stable, require the plugin check on each protected `main` branch.

## Phase 6 — Add Ownership Metadata

Status: Complete

Implemented:

- Replaced the main repo placeholder CODEOWNERS file with a solo-maintainer ownership map using `@monobyte`.
- Added ownership entries for repository governance files, security-sensitive desktop/runtime areas, shared packages, built-in plugins, and public project policy docs.
- Added `.github/CODEOWNERS` to every external plugin repository in scope.

Rationale:

- `@monobyte` is the valid current code owner while the organisation is solo-maintainer operated.
- The placeholder `sero-labs` teams do not yet have repository access, so they should not be used as active CODEOWNERS until future maintainers are added and team permissions are granted.

Follow-up:

- When collaborators join, grant access through `sero-labs` teams and replace relevant `@monobyte` CODEOWNERS entries with team handles.
- After team ownership is valid, enable required code owner review on protected branches.

## Phase 7 — Lock Down GitHub Actions and Secrets

Status: Complete for current repository state

Implemented:

- Confirmed repository workflow token defaults are read-only across all repositories in scope.
- Explicitly set repository workflow token defaults to read-only across all repositories in scope.
- Confirmed GitHub Actions cannot approve pull request reviews across all repositories in scope.
- Added explicit `permissions: contents: read` to the main repo PR gate workflow.
- Confirmed there are currently no repository-level GitHub Actions secrets in any repository in scope.

Notes:

- Actions remain enabled.
- Allowed actions are currently set to `all`. This avoids breaking the existing `pnpm/action-setup` and other third-party workflow actions during the solo-maintainer phase.
- If/when release workflows or publish secrets are added, protect them with GitHub Environments and reviewer approval.

## Phase 8 — Perform a Secret and History Audit

Status: Complete for the local main repository

Implemented:

- Ran `gitleaks detect --source . --redact` against the local repository history.
- Gitleaks scanned 1028 commits and reported no leaks.
- Ran `trufflehog git file://$PWD --only-verified --json` against the local repository history.
- TruffleHog scanned 26,345 chunks / 27,327,246 bytes and reported 0 verified secrets and 0 unverified secrets.
- Saved scan artifacts under `docs/plans/artifacts/`:
  - `gitleaks-public-launch-report.json`
  - `trufflehog-public-launch-report.json`

Notes:

- The gitleaks report is empty because no leaks were found.
- Both gitleaks and TruffleHog completed without finding secrets.

## Phase 9 — Prepare Public-Facing Project Files

Status: Complete for the main repository

Verified main repo public-facing files exist:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/`
- `.github/CODEOWNERS`

Implemented:

- Updated `SECURITY.md` to use the public security contact: `security@sero-ai.dev`.
- Configured and activated `security@sero-ai.dev` in Proton Mail for the `sero-ai.dev` domain.
- Expanded the PR template with a safety checklist for secrets, unsafe TypeScript suppressions/casts, and the 500 LOC source-file guideline.
- Enabled private vulnerability reporting on all public external plugin repositories.

Notes:

- Enabling private vulnerability reporting for `sero-labs/sero` returned `404`, likely because the repository is still private. Revisit this immediately after making the main repository public.

## Phase 10 — Standardise Plugin Repository Settings

Status: Complete for baseline repository settings and public files

Implemented across all external plugin repositories in scope:

- Confirmed visibility is public.
- Confirmed default branch is `main`.
- Protected `main` in Phase 4.
- Confirmed workflow token permissions are read-only in Phase 7.
- Added `.github/CODEOWNERS` in Phase 6.
- Enabled private vulnerability reporting in Phase 9.
- Added standard public repository files:
  - `LICENSE`
  - `SECURITY.md`
  - `CONTRIBUTING.md`
  - `.github/pull_request_template.md`
- Added `.github/workflows/ci.yml` to each plugin repository.

Plugin CI workflow policy:

- Runs on pull requests targeting `main`.
- Runs manually via `workflow_dispatch`.
- Does not run on every push.
- Skips draft pull requests.
- Cancels superseded in-progress runs for the same PR/ref.
- Uses read-only workflow token permissions.
- Runs `npm ci`, then `npm run typecheck` and `npm run build` when those scripts exist.

Notes:

- Plugin CI workflows were manually dispatched once for every external plugin repository.
- All 15 plugin CI workflow runs completed successfully.
- Required `Plugin CI` status checks are now enabled on every external plugin repository's protected `main` branch.
- Required status checks are strict, so protected branches must be up to date before merge.
- The main repo remains private. Do not flip it public until the final manual launch checks are complete.

## Final Manual Launch Checks

The remaining public announcement tasks have been moved into:

- `docs/plans/public-launch-final-checklist.md`

Use that checklist for go-live tracking from this point forward.
