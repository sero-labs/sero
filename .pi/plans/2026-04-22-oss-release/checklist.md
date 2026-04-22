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
- [ ] Complete the 5 Phase 1 audit slices
  - [x] OSS-0101 docs / plans audit
  - [x] OSS-0102 test / CI / eval audit
  - [ ] OSS-0103 scripts / devflow audit
  - [x] OSS-0104 security / public audit
  - [ ] OSS-0105 legal / license / distribution audit

## Phase 0 — Preservation First

- [x] Freeze blind deletion of `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, and similar transient folders until triage starts
- [ ] Create an inventory of transient/internal docs
- [ ] Classify each candidate-for-removal item as:
  - [ ] durable public
  - [ ] durable internal
  - [ ] transient with reusable facts
  - [ ] disposable/stale
- [ ] Define canonical destinations for harvested information
- [ ] Choose archive strategy for removed docs (private branch, private mirror, tarball, or equivalent)
- [ ] Remove only those public docs whose durable information has already been extracted or intentionally discarded

## Phase 1 — Public Repo Hygiene

- [ ] Run working-tree secret scan
- [ ] Run git-history secret scan
- [ ] Audit repo for absolute local paths and machine-specific references
- [ ] Audit public docs for stale internal references, scratch notes, and internal-only assumptions
- [ ] Decide whether `.pi/plans/**` remains in the public repo
- [ ] Decide whether `.claude/`, `AGENTS.md`, and similar maintainer-facing files stay public as-is
- [ ] Remove or relocate non-public artifacts from the public tree

## Phase 2 — OSS Project Basics

- [ ] Add `README.md`
- [ ] Add `LICENSE`
- [ ] Add `CONTRIBUTING.md`
- [ ] Add `SECURITY.md`
- [ ] Add `CODE_OF_CONDUCT.md`
- [ ] Add `.github/CODEOWNERS`
- [ ] Add issue templates
- [ ] Add PR template
- [ ] Decide on changelog/versioning workflow
- [ ] Review whether `NOTICE` or `THIRD_PARTY_NOTICES` is needed

## Phase 3 — Testing, E2E, and Evals

- [ ] Define test taxonomy: unit / integration / e2e / eval / release smoke
- [ ] Inventory all existing test suites and map them to the taxonomy
- [ ] Identify stale, redundant, flaky, or low-value tests
- [ ] Define PR quality gates
- [ ] Define nightly/manual quality gates
- [ ] Define release-only smoke tests
- [ ] Add root `pnpm test`
- [ ] Add root `pnpm test:ci`
- [ ] Add `turbo` `test` task if appropriate
- [ ] Integrate package/plugin tests into repo-level CI or explicitly document exclusions
- [ ] Ensure eval coverage still matches actual risk areas

## Phase 4 — Developer Workflow & Scripts

- [ ] Inventory root and app-level scripts
- [ ] Identify duplicate wrapper scripts
- [ ] Define minimal public command surface
- [ ] Document setup from the repo root
- [ ] Document the canonical dev flow
- [ ] Document the canonical test flow
- [ ] Document common troubleshooting flows
- [ ] Consider adding `pnpm doctor`

## Phase 5 — Documentation Architecture

- [ ] Decide on RSPress as the public docs stack
- [ ] Define docs information architecture
- [ ] Separate durable public docs from internal/transient docs
- [ ] Decide where architecture decisions live
- [ ] Decide where process/release docs live
- [ ] Define minimal inline API doc standard (public/exported APIs only)
- [ ] Avoid broad inline-doc requirements that pressure the 500 LOC rule
- [ ] Publish core docs pages:
  - [ ] Overview
  - [ ] Getting Started
  - [ ] Installation / Requirements
  - [ ] Development Setup
  - [ ] Architecture
  - [ ] Plugins
  - [ ] Testing / Evals
  - [ ] Security / Privacy
  - [ ] Troubleshooting
  - [ ] Known Limitations

## Phase 6 — Security, Privacy, and Local Data Posture

- [ ] Document where auth/config/state/logs live
- [ ] Document what is local vs remote
- [ ] Document how secrets are stored and what risks remain
- [ ] Document gateway/token behavior if publicly exposed
- [ ] Ensure examples/config samples are sanitized
- [ ] Ensure public docs do not encourage unsafe handling of secrets

## Phase 7 — Legal and Distribution Readiness

- [ ] Choose license
- [ ] Review third-party dependency licenses
- [ ] Review castlabs/Widevine/Spotify-related distribution constraints
- [ ] Decide whether alpha is source-only or includes binaries
- [ ] Define packaging/signing/notarization expectations
- [ ] Define release artifact policy

## Phase 8 — Product Presentation

- [ ] Write README hero section and value proposition
- [ ] Add screenshots and/or GIFs
- [ ] Add supported-platform statement
- [ ] Add alpha limitations statement
- [ ] Add placeholder landing page
- [ ] Add “Why Sero?” / differentiation summary

## Phase 9 — Ecosystem Onboarding

- [ ] Create at least one plugin example or starter path
- [ ] Publish a plugin author quickstart
- [ ] Publish a minimal end-to-end example for UI + extension + runtime if relevant

## Phase 10 — Release Engineering

- [ ] Define alpha versioning scheme
- [ ] Define release checklist owner/responsibilities
- [ ] Define tagged release process
- [ ] Define changelog process
- [ ] Validate clean clone -> install -> run on a supported machine
- [ ] Validate clean clone -> test on a supported machine
- [ ] Validate packaging flow if binaries are shipped

## Phase 11 — Final Go/No-Go Review

- [ ] Known limitations list is explicit and public
- [ ] Public docs are current and non-contradictory
- [ ] CI is green on required gates
- [ ] Maintainer knows exactly what is supported in alpha
- [ ] Support/triage plan for early issues is documented
- [ ] Launch copy and links are ready
- [ ] Final go/no-go review completed
