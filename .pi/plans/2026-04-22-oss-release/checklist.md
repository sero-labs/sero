# Sero OSS Alpha Readiness Checklist

Status: Active
Date: 2026-04-22
Related spec: `.pi/plans/2026-04-22-oss-release/spec.md`

## Execution tracking

- [x] Create `decision-log.md`
- [x] Create `slices/README.md`
- [x] Create Phase 1 slice placeholders
- [x] Create Phase 1 concurrent audit prompts
- [x] Launch the 5 Phase 1 audit lanes
- [x] Complete the 5 Phase 1 audit slices
  - [x] OSS-0101 docs / plans audit
  - [x] OSS-0102 test / CI / eval audit
  - [x] OSS-0103 scripts / devflow audit
  - [x] OSS-0104 security / public audit
  - [x] OSS-0105 legal / license / distribution audit
- [x] Complete G1 discovery synthesis in `decision-log.md`
- [x] Publish `phase-2-handoff.md`
- [x] Complete OSS-0201 governance file wave
- [x] Complete OSS-0204 docs platform skeleton wave
- [x] Complete OSS-0205 README skeleton wave
- [x] Complete root `pnpm test` / `pnpm test:ci` command wave
- [x] Complete PR workflow alignment wave
- [x] Complete hygiene scan wave (`gitleaks` + path audit)
- [x] Complete alpha changelog/versioning decision wave
- [x] Complete transient-doc inventory / migration-map wave
- [x] Complete docs policy / boundary wave
- [x] Complete public-surface sanitization wave
- [x] Complete state/logs/privacy posture doc wave
- [x] Complete plugin quickstart wave
- [x] Complete clean-clone baseline validation wave
- [x] Complete clean-clone desktop launch validation wave
- [x] Complete public secret-handling docs sanitization wave
- [x] Complete alpha support-scope documentation wave
- [x] Complete troubleshooting flow docs wave
- [x] Complete CI exclusion documentation wave
- [x] Complete support/triage documentation wave
- [x] Complete third-party license review wave
- [x] Complete public-docs consistency harmonization wave

## Phase 0 — Preservation First

- [x] Freeze blind deletion of `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, and similar transient folders until triage starts
- [x] Create an inventory of transient/internal docs
- [x] Classify each candidate-for-removal item as:
  - [x] durable public
  - [x] durable internal
  - [x] transient with reusable facts
  - [x] disposable/stale
- [x] Define canonical destinations for harvested information
- [x] Choose archive strategy for removed docs (private mirror/branch snapshot + migration map)
- [ ] Remove only those public docs whose durable information has already been extracted or intentionally discarded
  - Batch B (`.pi/plans/2026-04-19*` / `2026-04-20*`) completed after archive snapshot
  - Batch C step 1 completed: removed `docs/plans/2026-04-12-pr-136-followups.md` and `docs/plans/2026-04-12-pr-137-followups.md` after archive snapshot
  - Batch C step 2 completed: removed `docs/plans/2026-04-13-apps-desktop-wave-f-periphery-closeout.md` after archive snapshot
  - Batch C step 3 completed: removed `docs/plans/2026-04-17-gateway-owner-wide-qr-access.md` after archive snapshot
  - Batch C step 4 completed: removed `docs/plans/2026-04-08-agent-browser-migration-plan.md` after archive snapshot
  - Batch C step 5 completed: removed `docs/plans/2026-04-17-chat-turn-undo-and-snapshot-separation.md` after archive snapshot
  - Batch C step 6 completed: removed `docs/plans/2026-04-06-unified-model-selection.md` after archive snapshot
  - Batch C step 7 completed: removed `docs/plans/2026-04-10-multi-root-workspaces-for-plugin-dev.md` after archive snapshot
  - Batch C step 8 completed: removed `docs/plans/2026-04-19-local-plugin-dev-sessions.md` after archive snapshot
  - Batch C tail decision: keep `docs/plans/index.md` and the two deslopify tasklists as durable internal records for now
  - Batch D step 1 completed: removed `docs/superpowers/plans/2026-04-04-google-auth-ux.md` after archive snapshot
  - Batch D step 2 completed: removed `docs/superpowers/specs/2026-04-04-google-auth-ux-design.md` after archive snapshot
  - Batch D step 3 completed: removed `docs/superpowers/plans/2026-04-04-dynamic-model-provider.md` after archive snapshot
  - Batch D step 4 completed: removed `docs/superpowers/plans/2026-04-05-onboarding-polish.md` after archive snapshot
  - Batch D step 5 completed: removed `docs/superpowers/specs/2026-04-05-onboarding-polish-design.md` after archive snapshot
  - Batch D step 6 completed: removed `docs/superpowers/plans/2026-04-06-merge-admin-resources.md` after archive snapshot
  - Batch D step 7 completed: removed `docs/superpowers/plans/2026-04-06-providers-panel.md` after archive snapshot
  - Batch D step 8 completed: removed `docs/superpowers/plans/2026-04-04-onboarding-simplification-plan.md` after archive snapshot
  - Batch D step 9 completed: removed `docs/superpowers/specs/2026-04-04-dynamic-model-provider-progress.md` after archive snapshot
  - Batch D step 10 completed: removed `docs/superpowers/specs/2026-04-04-onboarding-simplification-implementation-spec.md` after archive snapshot
  - Batch D step 11 completed: removed `docs/superpowers/specs/2026-04-06-merge-admin-resources-design.md` after archive snapshot
  - Batch D step 12 completed: removed `docs/superpowers/specs/2026-04-06-providers-panel-design.md` after archive snapshot
  - broader docs-plan/superpowers pruning still pending
  - prune sequencing/preconditions recorded in `public-tree-prune-plan.md`

## Phase 1 — Public Repo Hygiene

- [x] Run working-tree secret scan
- [x] Run git-history secret scan
- [x] Audit repo for absolute local paths and machine-specific references
- [x] Audit public docs for stale internal references, scratch notes, and internal-only assumptions
- [x] Decide whether `.pi/plans/**` remains in the public repo
- [x] Decide whether `.claude/`, `AGENTS.md`, and similar maintainer-facing files stay public as-is
- [ ] Remove or relocate non-public artifacts from the public tree
  - [x] Batch A partially completed: archived on local branch `private-archive/batch-a-pre-prune-2026-04-23` and removed `.claude/**` + `CLAUDE.md`
  - [ ] `AGENTS.md` is still temporarily retained because current Pi CLI sessions rely on it; do not auto-delete it in this cleanup wave
  - [x] Batch B completed: archived on local branch `private-archive/batch-b-pre-prune-2026-04-23` and removed legacy `.pi/plans/2026-04-19*` / `2026-04-20*` folders
  - [x] Batch C step 1 completed: archived on local branch `private-archive/batch-c1-pre-prune-2026-04-23` and removed the two disposable PR follow-up docs from `docs/plans/`
  - [x] Batch C step 2 completed: archived on local branch `private-archive/batch-c2-pre-prune-2026-04-23` and removed `docs/plans/2026-04-13-apps-desktop-wave-f-periphery-closeout.md`
  - [x] Batch C step 3 completed: archived on local branch `private-archive/batch-c3-pre-prune-2026-04-23` and removed `docs/plans/2026-04-17-gateway-owner-wide-qr-access.md`
  - [x] Batch C step 4 completed: archived on local branch `private-archive/batch-c4-pre-prune-2026-04-23` and removed `docs/plans/2026-04-08-agent-browser-migration-plan.md`
  - [x] Batch C step 5 completed: archived on local branch `private-archive/batch-c5-pre-prune-2026-04-23` and removed `docs/plans/2026-04-17-chat-turn-undo-and-snapshot-separation.md`
  - [x] Batch C step 6 completed: archived on local branch `private-archive/batch-c6-pre-prune-2026-04-23` and removed `docs/plans/2026-04-06-unified-model-selection.md`
  - [x] Batch C step 7 completed: archived on local branch `private-archive/batch-c7-pre-prune-2026-04-23` and removed `docs/plans/2026-04-10-multi-root-workspaces-for-plugin-dev.md`
  - [x] Batch C step 8 completed: archived on local branch `private-archive/batch-c8-pre-prune-2026-04-24` and removed `docs/plans/2026-04-19-local-plugin-dev-sessions.md`
  - [x] Batch C tail reviewed: keep `docs/plans/index.md`, `docs/plans/apps-desktop-deslopify-tasklist.md`, and `docs/plans/desktop-packages-plugins-deslopify-tasklist.md` for now
  - [x] Batch D step 1 completed: archived on local branch `private-archive/batch-d1-pre-prune-2026-04-24` and removed `docs/superpowers/plans/2026-04-04-google-auth-ux.md`
  - [x] Batch D step 2 completed: archived on local branch `private-archive/batch-d2-pre-prune-2026-04-24` and removed `docs/superpowers/specs/2026-04-04-google-auth-ux-design.md`
  - [x] Batch D step 3 completed: archived on local branch `private-archive/batch-d3-pre-prune-2026-04-24` and removed `docs/superpowers/plans/2026-04-04-dynamic-model-provider.md`
  - [x] Batch D step 4 completed: archived on local branch `private-archive/batch-d4-pre-prune-2026-04-24` and removed `docs/superpowers/plans/2026-04-05-onboarding-polish.md`
  - [x] Batch D step 5 completed: archived on local branch `private-archive/batch-d5-pre-prune-2026-04-24` and removed `docs/superpowers/specs/2026-04-05-onboarding-polish-design.md`
  - [x] Batch D step 6 completed: archived on local branch `private-archive/batch-d6-pre-prune-2026-04-24` and removed `docs/superpowers/plans/2026-04-06-merge-admin-resources.md`
  - [x] Batch D step 7 completed: archived on local branch `private-archive/batch-d7-pre-prune-2026-04-24` and removed `docs/superpowers/plans/2026-04-06-providers-panel.md`
  - [x] Batch D step 8 completed: archived on local branch `private-archive/batch-d8-pre-prune-2026-04-24` and removed `docs/superpowers/plans/2026-04-04-onboarding-simplification-plan.md`
  - [x] Batch D step 9 completed: archived on local branch `private-archive/batch-d9-pre-prune-2026-04-24` and removed `docs/superpowers/specs/2026-04-04-dynamic-model-provider-progress.md`
  - [x] Batch D step 10 completed: archived on local branch `private-archive/batch-d10-pre-prune-2026-04-24` and removed `docs/superpowers/specs/2026-04-04-onboarding-simplification-implementation-spec.md`
  - [x] Batch D step 11 completed: archived on local branch `private-archive/batch-d11-pre-prune-2026-04-24` and removed `docs/superpowers/specs/2026-04-06-merge-admin-resources-design.md`
  - [x] Batch D step 12 completed: archived on local branch `private-archive/batch-d12-pre-prune-2026-04-24` and removed `docs/superpowers/specs/2026-04-06-providers-panel-design.md`
  - [ ] Batch D remaining steps still pending per `public-tree-prune-plan.md`

## Phase 2 — OSS Project Basics

- [x] Add `README.md`
- [x] Add `LICENSE`
- [x] Add `CONTRIBUTING.md`
- [x] Add `SECURITY.md`
- [x] Add `CODE_OF_CONDUCT.md`
- [x] Add `.github/CODEOWNERS`
- [x] Add issue templates
- [x] Add PR template
- [x] Decide on changelog/versioning workflow
- [x] Review whether `NOTICE` or `THIRD_PARTY_NOTICES` is needed

## Phase 3 — Testing, E2E, and Evals

- [x] Define test taxonomy: unit / integration / e2e / eval / release smoke
- [x] Inventory all existing test suites and map them to the taxonomy
- [x] Identify stale, redundant, flaky, or low-value tests
  - current finding: the clearest low-value surface is copied test files inside build/package artifacts rather than source-owned suites (`test-rationalization-review.md`)
- [x] Define PR quality gates
- [x] Define nightly/manual quality gates
- [x] Define release-only smoke tests
- [x] Add root `pnpm test`
- [x] Add root `pnpm test:ci`
- [x] Add `turbo` `test` task if appropriate
  - current alpha decision: do **not** add a monorepo `turbo run test` task yet; keep root `pnpm test` / `pnpm test:ci` as the canonical public surface (`test-rationalization-review.md`)
- [x] Integrate package/plugin tests into repo-level CI or explicitly document exclusions
- [x] Ensure eval coverage still matches actual risk areas
  - documented prompt/eval risk mapping and non-goals in `test-rationalization-review.md` and `docs/testing/eval-guide.md`

## Phase 4 — Developer Workflow & Scripts

- [x] Inventory root and app-level scripts
- [x] Identify duplicate wrapper scripts
- [x] Define minimal public command surface
- [x] Document setup from the repo root
- [x] Document the canonical dev flow
- [x] Document the canonical test flow
- [x] Document common troubleshooting flows
- [x] Consider adding `pnpm doctor`

## Phase 5 — Documentation Architecture

- [x] Decide on RSPress as the public docs stack
- [x] Define docs information architecture
- [x] Separate durable public docs from internal/transient docs
- [x] Decide where architecture decisions live
- [x] Decide where process/release docs live
- [x] Define minimal inline API doc standard (public/exported APIs only)
- [x] Avoid broad inline-doc requirements that pressure the 500 LOC rule
- [x] Publish core docs pages:
  - [x] Overview
  - [x] Getting Started
  - [x] Installation / Requirements
  - [x] Development Setup
  - [x] Architecture
  - [x] Plugins
  - [x] Testing / Evals
  - [x] Security / Privacy
  - [x] Troubleshooting
  - [x] Known Limitations

## Phase 6 — Security, Privacy, and Local Data Posture

- [x] Document where auth/config/state/logs live
- [x] Document what is local vs remote
- [x] Document how secrets are stored and what risks remain
- [x] Document gateway/token behavior if publicly exposed
- [x] Ensure examples/config samples are sanitized
- [x] Ensure public docs do not encourage unsafe handling of secrets

## Phase 7 — Legal and Distribution Readiness

- [x] Choose license
- [x] Review third-party dependency licenses
- [x] Review castlabs/Widevine/Spotify-related distribution constraints
- [x] Decide whether alpha is source-only or includes binaries
- [x] Define packaging/signing/notarization expectations
- [x] Define release artifact policy

## Phase 8 — Product Presentation

- [x] Write README hero section and value proposition
- [x] Add screenshots and/or GIFs
- [x] Add supported-platform statement
- [x] Add alpha limitations statement
- [x] Add placeholder landing page
- [x] Add “Why Sero?” / differentiation summary

## Phase 9 — Ecosystem Onboarding

- [x] Create at least one plugin example or starter path
- [x] Publish a plugin author quickstart
- [x] Publish a minimal end-to-end example for UI + extension + runtime if relevant

## Phase 10 — Release Engineering

- [x] Define alpha versioning scheme
- [x] Define release checklist owner/responsibilities
- [x] Define tagged release process
- [x] Define changelog process
- [x] Validate clean clone -> install -> run on a supported machine
- [x] Validate clean clone -> test on a supported machine
- [ ] Validate packaging flow if binaries are shipped

## Phase 11 — Final Go/No-Go Review

- [x] Known limitations list is explicit and public
- [x] Public docs are current and non-contradictory
- [ ] CI is green on required gates
  - [x] Local required gate revalidated: root `pnpm test:ci` passed on 2026-04-22 (`required-gate-report.md`)
  - [ ] Remote required CI run observed green
- [x] Maintainer knows exactly what is supported in alpha
- [x] Support/triage plan for early issues is documented
- [x] Launch copy and links are ready
- [x] Final go/no-go review completed
  - current verdict: conditional GO / public-promotion NO-GO until remote required CI is observed green (`go-no-go-review.md`)
