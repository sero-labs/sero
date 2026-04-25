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

- Attempted to enable the organisation two-factor-authentication requirement through the GitHub API. The API accepted the request but the organisation still reports `two_factor_requirement_enabled: false`. This likely needs verification in the GitHub web UI under organisation security settings.
- Because the organisation currently has only one owner/member, the main benefit of this phase is future-proofing before collaborators are invited.

## Remaining Phases

- Phase 2 — Classify repositories by risk
- Phase 3 — Audit human access
- Phase 4 — Protect the default branch
- Phase 5 — Define required checks
- Phase 6 — Add ownership metadata
- Phase 7 — Lock down GitHub Actions and secrets
- Phase 8 — Perform a secret and history audit
- Phase 9 — Prepare public-facing project files
- Phase 10 — Standardise plugin repository settings
