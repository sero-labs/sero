# Public Launch Final Checklist

This checklist tracks the remaining work before announcing Sero publicly.

Related plan/status docs:

- `docs/plans/github-permissions-public-launch-plan.md`
- `docs/plans/github-permissions-public-launch-status.md`

## Already Completed

- `sero-labs` organisation baseline governance configured.
- Organisation 2FA confirmed enabled in the GitHub web UI.
- External plugin repositories moved under `sero-labs`.
- Human access audited; only `monobyte` has repository access.
- `main` protected across the main repo and external plugin repos.
- Force pushes disabled across protected branches.
- Branch deletion disabled across protected branches.
- GitHub Actions workflow token permissions set to read-only.
- Repository-level Actions secrets checked; none currently present.
- `security@sero-ai.dev` configured in Proton Mail and tested for inbound delivery.
- Main repo `SECURITY.md` points to `security@sero-ai.dev`.
- Gitleaks history scan completed with no leaks found.
- TruffleHog verified-secret scan completed with no verified/unverified secrets found.
- Public-facing project files checked/updated in the main repo.
- Standard public files added to external plugin repositories.
- Plugin CI workflows added to all external plugin repositories.
- Plugin CI workflows verified successfully on all external plugin repositories.
- Required `Plugin CI` checks enabled on all external plugin repositories.

## Final GitHub Launch Tasks

Complete these when the rest of go-live work is ready.

- [ ] Make `sero-labs/sero` public.
- [ ] After `sero-labs/sero` is public, enable private vulnerability reporting for it.
- [ ] After visibility changes, confirm `sero-labs/sero` branch protection still has:
  - [ ] protected `main`
  - [ ] required `PR Gate` status check
  - [ ] strict required status checks
  - [ ] force pushes disabled
  - [ ] branch deletion disabled
  - [ ] admin bypass remains intentionally configured for solo-maintainer mode
- [ ] Confirm external plugin branch protection still has:
  - [ ] protected `main`
  - [ ] required `Plugin CI` status check
  - [ ] strict required status checks
  - [ ] force pushes disabled
  - [ ] branch deletion disabled
- [ ] Confirm `security@sero-ai.dev` receives inbound mail from at least one external provider immediately before announcement.
- [ ] Confirm `SECURITY.md`, `CONTRIBUTING.md`, and README links render correctly on GitHub after public visibility changes.

## Pre-Announcement Product / Documentation Tasks

Use this section for additional go-live work before making the announcement.

- [ ] Review the main `README.md` for public positioning, setup instructions, and support expectations.
- [ ] Review `CONTRIBUTING.md` for contributor workflow accuracy.
- [ ] Review `SECURITY.md` for the final security-reporting process.
- [ ] Review plugin README files for accuracy and support status.
- [ ] Confirm any alpha/beta/source-only language is intentional and consistent.
- [ ] Confirm installation/build instructions work on a clean machine or clean checkout.
- [ ] Confirm screenshots, diagrams, and docs do not expose private paths, tokens, or internal-only details.
- [ ] Confirm issue templates are suitable for public bug reports, feature requests, and support questions.
- [ ] Confirm PR template matches the expected contributor process.

## Optional Hardening After More Maintainers Join

These are intentionally deferred while Sero is solo-maintainer operated.

- [ ] Grant repository access through `sero-labs` teams instead of direct user access.
- [ ] Replace `@monobyte` CODEOWNERS entries with the appropriate `sero-labs` team handles.
- [ ] Increase required PR approvals from `0` to `1` or `2` where appropriate.
- [ ] Enable required code owner review.
- [ ] Reconsider admin bypass settings once there is more than one trusted maintainer.
- [ ] Add release/publish environments with required reviewers if publishing secrets are introduced.

## Announcement Readiness

Sero is ready for public announcement when:

- [ ] All final GitHub launch tasks above are complete.
- [ ] All required product/documentation go-live tasks are complete.
- [ ] The main repository is public and still protected.
- [ ] Security reporting is available and tested.
- [ ] External plugins are public, protected, and passing required CI.
- [ ] The maintainer is comfortable with current alpha/support expectations.
