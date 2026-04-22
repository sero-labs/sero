# Support / Triage Review

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `apps/docs-site/docs/reference/support-scope.md`
- `README.md`
- `CONTRIBUTING.md`
- `.github/ISSUE_TEMPLATE/support-question.yml`

## Goal

Close the OSS alpha checklist item for documenting the early support / triage
plan without inventing a heavyweight process.

## Gap before this wave

The repo already documented support surfaces, issue templates, security
reporting, and bug-report inputs. What was still missing was a single canonical
statement of how early alpha issues should be routed and what maintainers will
triage first.

## Resolution

Added an `Early alpha support / triage plan` section to:
- `apps/docs-site/docs/reference/support-scope.md`

That section now documents:
- when to file bug reports vs support questions vs PRs
- that security issues must stay private
- what maintainers prioritize first during alpha
- that support is best-effort with no SLA yet
- when issues may be redirected or closed as out of scope / needs-more-detail
- what a good first triage signal looks like

Also added discoverability pointers in:
- `README.md`
- `CONTRIBUTING.md`
- `.github/ISSUE_TEMPLATE/support-question.yml`

## Current assessment

This is sufficient to mark the checklist item complete:
- support / triage plan for early issues is documented

It does **not** imply a formal staffed support program or strict response-time
commitments. The documented posture remains lightweight and honest for OSS
alpha.
