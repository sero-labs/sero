# GitHub Permissions & Public Launch Plan

## Current Ownership Context

As of this plan, the `sero-labs` GitHub organisation is owner-operated: the only team member and organisation owner is the project maintainer. The maintainer also owns the personal GitHub account `monobyte`.

This changes the immediate priority of the plan. There is currently no large team-access problem to unwind. The near-term goal is to set safe defaults now, while the organisation is simple, so that future collaborators can be added without accidentally granting broad write/admin access.

The plan should therefore be read in two layers:

1. **Immediate solo-maintainer launch baseline** — protect branches, secrets, CI, and repository settings even though only one person currently has write access.
2. **Future multi-maintainer governance** — define teams, CODEOWNERS, and access tiers before additional collaborators are invited.

## Goal

Prepare the Sero GitHub organisation for public announcement by ensuring that:

1. The main Sero repository can be made public safely.
2. External plugin repositories are clearly owned and governed under `sero-labs`.
3. No public user can directly edit protected code.
4. All changes flow through pull requests, review, and automated checks.
5. Secrets, release credentials, and GitHub Actions workflows are protected.
6. The project looks trustworthy and maintainable to outside contributors.

The desired outcome is not to make contribution difficult, but to make contribution predictable: people should be able to fork, open issues, and submit PRs easily, while maintainers retain control over what gets merged and released.

## Repositories in Scope

### Main Repository

```text
https://github.com/sero-labs/sero
```

This is the core monorepo and should receive the strictest controls.

### External Plugin Repositories

```text
https://github.com/sero-labs/sero-google-plugin
https://github.com/sero-labs/sero-kanban-plugin
https://github.com/sero-labs/sero-spotify-plugin
https://github.com/sero-labs/sero-imagegen-plugin
https://github.com/sero-labs/sero-notes-plugin
https://github.com/sero-labs/sero-plan-mode-tracker
https://github.com/sero-labs/sero-weight-tracker
https://github.com/sero-labs/sero-research-plugin
https://github.com/sero-labs/sero-starling-plugin
https://github.com/sero-labs/sero-humanizer-plugin
https://github.com/sero-labs/sero-slopzilla-plugin
https://github.com/sero-labs/sero-tetris-plugin
https://github.com/sero-labs/sero-calculator-plugin
https://github.com/sero-labs/sero-daily-quote-plugin
https://github.com/sero-labs/sero-todo-plugin
```

These are official or semi-official Sero ecosystem plugins and should follow a consistent baseline policy.

## Guiding Principle

Making a GitHub repository public does not mean anyone can edit it.

The public can:

- View the code
- Fork the repository
- Open issues
- Submit pull requests

The public cannot:

- Push directly to `main`
- Merge code
- Change repository settings
- Access secrets
- Publish releases

Unless they have explicitly been granted permissions.

The launch work is therefore about making sure that the people who do have permissions are limited appropriately, and that GitHub rules prevent accidental or rushed changes from bypassing review.

## Plan Overview

## Phase 1 — Establish Organisation-Level Governance

### Goal

Make sure the `sero-labs` organisation itself has sensible defaults before tuning individual repositories.

### Rationale

Repository settings matter, but organisation settings are the foundation. Since `sero-labs` currently has a single owner/member, this phase is less about removing risky collaborators and more about setting the organisation up so that future collaborators are added deliberately.

### Actions

At the `sero-labs` organisation level:

1. Confirm the current owner/member list is intentional.
2. Require two-factor authentication for members.
3. Set default repository permission to the minimum practical level.
4. Keep repository administration owner-only until additional maintainers are needed.
5. Prefer teams over individual collaborators when future contributors are added.
6. Create placeholder teams when useful, for example:
   - `core`
   - `plugin-maintainers`
   - `security`
   - `release-managers`
7. Limit admin access to the smallest possible group.
8. Decide who can create repositories, invite collaborators, and manage settings before adding anyone else.

### Desired Result

The organisation has a clean permission model where access is intentional, auditable, and ready for future collaborators without creating accidental write/admin paths.

## Phase 2 — Classify Repositories by Risk

### Goal

Apply the right level of strictness to each repository.

### Rationale

The main Sero repo is more sensitive than a simple toy plugin. The same security model does not need to be equally heavy everywhere, but there should still be a consistent baseline.

### Proposed Classification

### Tier 1 — Core Platform

```text
sero-labs/sero
```

This should have the strictest rules.

Recommended controls:

- Two required PR approvals if practical
- Code owner review
- Required typecheck/build checks
- Strict GitHub Actions permissions
- Protected release workflows
- Secret scanning and push protection

### Tier 2 — Official Product Plugins

Examples:

```text
sero-google-plugin
sero-kanban-plugin
sero-spotify-plugin
sero-imagegen-plugin
sero-notes-plugin
sero-research-plugin
sero-starling-plugin
```

These should be treated as official ecosystem components.

Recommended controls:

- At least one required PR approval
- Required build/typecheck checks
- Protected `main`
- Protected release/publish workflows
- Clear ownership

### Tier 3 — Utility, Demo, or Experimental Plugins

Examples:

```text
sero-tetris-plugin
sero-calculator-plugin
sero-daily-quote-plugin
sero-todo-plugin
sero-weight-tracker
sero-plan-mode-tracker
sero-humanizer-plugin
sero-slopzilla-plugin
```

These may be lower risk, but should still not allow direct public edits.

Recommended controls:

- At least one PR approval
- Protected `main`
- Required checks where available
- Clear README status if experimental, demo, or unofficial

### Desired Result

Each repo has controls proportional to its importance, without creating unnecessary friction everywhere.

## Phase 3 — Audit Human Access

### Goal

Confirm that only the right people can write, maintain, administer, or release code.

### Rationale

Branch protection protects against many mistakes, but excessive write/admin access is still the biggest source of governance risk. Because the current setup is solo-maintainer, this audit should be quick: confirm that only the owner account has access, then document the intended access model before inviting anyone else.

### Actions

For every repository:

1. Review collaborators and teams.
2. Confirm there are no unexpected outside collaborators.
3. Confirm only the owner account currently has admin access.
4. Remove stale or unnecessary access if any exists.
5. Replace individual access with team-based access when future collaborators are added.
6. Ensure future plugin maintainers do not automatically have admin access unless needed.
7. Confirm that public contributors have no direct repository permissions.

### Recommended Access Model

| Group | Suggested Permission |
| --- | --- |
| Public users | No direct access |
| General contributors | Fork + PR only |
| Plugin maintainers | Write or Maintain |
| Core maintainers | Maintain |
| Security/release owners | Admin where necessary |
| Organisation owners | Admin/Owner |

### Desired Result

There is no accidental path for an outside person or casual collaborator to directly modify protected code.

## Phase 4 — Protect the Default Branch

### Goal

Ensure all changes to important branches go through pull requests.

### Rationale

The most important practical control is preventing direct pushes to `main`. Even trusted maintainers should generally merge through PRs so that review, CI, and audit history are preserved.

### Actions

For each repository, protect:

```text
main
```

Optionally also protect:

```text
release/*
v*
```

Recommended rules for the main repo:

- Require pull request before merge
- Require approvals
- Require code owner review
- Dismiss stale approvals after new commits
- Require status checks to pass
- Require conversation resolution
- Block force pushes
- Block branch deletion
- Limit bypass permissions

Recommended rules for plugin repos:

- Require pull request before merge
- Require at least one approval
- Require status checks where available
- Block force pushes
- Block branch deletion

### Desired Result

No one casually pushes straight to `main`, and all merged work has an auditable review trail.

## Phase 5 — Define Required Checks

### Goal

Ensure that broken code cannot be merged accidentally.

### Rationale

PR review catches design and architecture issues. Automated checks catch build, type, and packaging issues. Both are needed.

### For `sero-labs/sero`

Required checks should include:

```text
pnpm typecheck
pnpm build
tests, if present
lint, if present
```

Given the Sero monorepo rules, `pnpm typecheck` should be considered mandatory.

### For Plugin Repositories

Each plugin should have a minimal CI workflow that verifies:

```text
pnpm install
pnpm typecheck
pnpm build
```

If tests exist:

```text
pnpm test
```

### Desired Result

Every protected repository has a known minimum quality gate before merge.

## Phase 6 — Add Ownership Metadata

### Goal

Make it clear who owns which parts of the codebase.

### Rationale

As the project becomes public, contributors need to know where to route changes, and GitHub needs to know who must approve sensitive files.

### Actions

Add or update:

```text
.github/CODEOWNERS
```

For the main repo, ownership should probably distinguish:

- Core platform
- Desktop app
- Electron main process
- Containers
- Built-in plugins
- GitHub Actions
- Release/signing infrastructure
- Shared packages

For plugin repos, ownership can be simpler:

```text
* @sero-labs/plugin-maintainers
/.github/ @sero-labs/core
```

### Desired Result

Sensitive changes automatically request the right reviewers.

## Phase 7 — Lock Down GitHub Actions and Secrets

### Goal

Prevent untrusted code from accessing secrets or publishing releases.

### Rationale

Public repositories commonly receive pull requests from forks. Those PRs should not be able to access signing keys, npm tokens, GitHub tokens, deployment credentials, or other sensitive secrets.

### Actions

For each repository:

1. Set GitHub Actions default token permissions to read-only.
2. Require approval before running workflows from first-time contributors.
3. Avoid broad `contents: write` permissions.
4. Scope workflow permissions explicitly.
5. Protect release and publishing jobs with GitHub Environments.
6. Require reviewer approval for environments that expose secrets.
7. Review all existing repository and organisation secrets.

### Desired Result

A malicious or careless PR cannot exfiltrate secrets or trigger a trusted release.

## Phase 8 — Perform a Secret and History Audit

### Goal

Make sure the main repo can safely become public.

### Rationale

Once a private repository becomes public, anything in its history becomes visible. Removing a secret from the current version is not enough if it exists in an older commit.

### Actions

Before making `sero-labs/sero` public:

1. Run a secret scanner over the repository history.
2. Check for committed `.env` files, API keys, tokens, private keys, signing material, certificates, and credentials.
3. Rotate any secret that was ever committed.
4. Remove sensitive files from history only if needed, but still rotate the secret.
5. Review issue templates, docs, sample config, and plugin examples for accidental secrets.

Recommended tools:

```bash
gitleaks
trufflehog
```

### Desired Result

The public launch does not expose credentials, signing material, private URLs, or internal-only configuration.

## Phase 9 — Prepare Public-Facing Project Files

### Goal

Make the project understandable and contributor-friendly.

### Rationale

Good repository governance is not just about preventing bad writes. It is also about helping good contributors understand how to participate.

### Add or verify:

```text
README.md
LICENSE
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
.github/PULL_REQUEST_TEMPLATE.md
.github/ISSUE_TEMPLATE/
.github/CODEOWNERS
```

### Important Content

`CONTRIBUTING.md` should explain:

- Fork and PR workflow
- Required checks
- Expected code style
- How to run typecheck/build
- How plugin contributions work
- That direct pushes to `main` are not used

`SECURITY.md` should explain:

- How to report vulnerabilities privately
- What not to put in public issues
- Expected response timeline

Plugin READMEs should explain:

- What the plugin does
- Whether it is official, experimental, or demo-quality
- How to install/use it
- How to contribute

### Desired Result

New contributors understand the process, and the project appears mature and safe to adopt.

## Phase 10 — Standardise Plugin Repository Settings

### Goal

Make all plugin repositories feel like part of the same ecosystem.

### Rationale

The plugins were moved into `sero-labs`, so they should now have consistent policies, templates, and expectations.

### Actions Across All Plugin Repos

For each plugin:

1. Confirm visibility is intentional.
2. Confirm default branch is `main`.
3. Protect `main`.
4. Require PR before merge.
5. Require one approval.
6. Require build/typecheck if CI exists.
7. Disable force pushes.
8. Disable branch deletion.
9. Add or update `README.md`.
10. Add or update `LICENSE`.
11. Add or update `SECURITY.md`.
12. Add or update `CONTRIBUTING.md` or link to the central one.
13. Add `CODEOWNERS`.
14. Review GitHub Actions permissions.
15. Review secrets.

### Desired Result

Every official Sero plugin has a predictable contribution and release model.

## Recommended Policy by Repository Type

### `sero-labs/sero`

Strict policy.

Recommended:

- Public after final audit
- Protected `main`
- Pull requests required
- Two approvals preferred
- Code owner review required
- Required `pnpm typecheck`
- Required `pnpm build`
- Force pushes disabled
- Branch deletion disabled
- Actions read-only by default
- Release secrets protected by environments
- Security scanning enabled
- Clear contributor and security docs

### Official Plugins

Moderate-to-strict policy.

Recommended:

- Protected `main`
- Pull requests required
- One approval required
- Build/typecheck required where available
- Force pushes disabled
- Branch deletion disabled
- Actions read-only by default
- Publishing secrets protected
- Consistent README/license/security files

### Demo or Experimental Plugins

Moderate policy.

Recommended:

- Protected `main`
- Pull requests required
- One approval required if there is more than one maintainer
- Build/typecheck if practical
- README clearly states status
- No release secrets exposed to forked PRs

## Launch Readiness Definition

The project is ready to announce publicly when:

- The main `sero` repo has been scanned for secrets
- Any exposed secrets have been rotated
- Organisation members and teams have been audited
- Admin access is limited
- `main` is protected on the main repo
- `main` is protected on all official plugin repos
- PR review is required before merge
- Required checks are configured
- GitHub Actions permissions are safe
- Release secrets are protected
- Public contribution docs exist
- Security reporting path exists
- Plugin repos clearly identify their purpose and support status

## Practical Rollout Order

To keep this manageable, do it in this order:

1. Organisation settings for the current solo-maintainer setup
2. Quick human/team access audit confirming no unexpected collaborators
3. Main repo secret scan
4. Main repo branch/ruleset protection
5. Main repo Actions/secrets hardening
6. Main repo public-facing docs
7. Plugin repo baseline settings
8. Plugin repo CI/build checks
9. Plugin repo docs standardisation
10. Create or document future maintainer teams before inviting collaborators
11. Final review, then public announcement

This avoids getting lost in every small setting at once. The main repo gets the most attention first, and the plugins are brought up to a consistent baseline afterward.

## Summary

The main objective is to move from “private or informally public” to “proper open-source project governance.”

That means:

- Public visibility is allowed.
- Public contribution is encouraged.
- Direct editing is restricted.
- Maintainers retain merge and release control.
- Every important change goes through PR review and CI.
- Secrets and release credentials are protected.
- The ecosystem looks coherent now that all plugins live under `sero-labs`.

Once these controls are in place, announcing Sero publicly should be much safer and more professional.
