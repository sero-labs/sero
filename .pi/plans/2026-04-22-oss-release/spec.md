# Sero OSS Alpha Readiness Spec

Status: Draft
Date: 2026-04-22
Owner: Daniel Carter
Scope: Prepare the Sero monorepo, docs, workflows, and release artifacts for a professional public open-source alpha release.

## 1. Objective

Prepare Sero for a public OSS alpha release that is:

- safe to publish
- credible to contributors and early adopters
- professionally documented
- honest about platform constraints and maturity
- maintainable after launch

This spec covers repo hygiene, information preservation, documentation, test strategy, CI/release readiness, legal/security/compliance, contributor experience, and launch presentation.

## 2. Core Problem Statement

Sero is approaching alpha quality, but the repository currently reflects an active internal build phase rather than a curated public OSS release. The repo contains a mixture of durable docs, transient planning artifacts, internal operating conventions, and contributor workflows that are understandable to the current maintainer but not yet suitable as a polished public release surface.

The release must avoid two failure modes:

1. **Publishing too early with internal debris**
   - stale plans
   - machine-specific paths
   - unclear setup flows
   - incomplete legal/community files
   - CI that does not match the claimed quality bar

2. **Over-trimming and losing institutional knowledge**
   - deleting useful design rationale
   - losing migration history and implementation intent
   - removing documents before their durable content is captured elsewhere

## 3. Release Positioning

### 3.1 Intended audience for OSS alpha

Primary audience:
- technically strong macOS developers on Apple Silicon
- early adopters comfortable with alpha-quality local tools
- potential contributors
- plugin authors willing to work with evolving APIs

Secondary audience:
- observers evaluating project direction
- users interested in agent-first development environments

### 3.2 Supported platform statement for alpha

Sero OSS alpha will explicitly support:
- macOS on Apple Silicon
- local development from source
- container-backed workspaces where Apple Container CLI is available
- host-mode fallback where supported by current architecture

Sero OSS alpha will explicitly **not** promise at launch:
- Linux support
- Windows support
- App Store distribution
- full API stability across all plugin/runtime internals
- full backward compatibility for all internal extension/plugin contracts

### 3.3 Non-goals for this release

This effort does **not** aim to:
- finish every planned feature before alpha
- eliminate all technical debt
- make every internal doc public-facing
- freeze all architecture permanently
- build the final marketing site in full detail

## 4. Guiding Principles

1. **Preserve before prune**
   - No mass deletion of `.pi/plans/**`, `docs/plans/**`, or related internal material until content has been triaged and durable value has been extracted.

2. **Public repo != internal notebook**
   - The public tree should contain durable, current, intentional artifacts.

3. **Truthful quality bar**
   - CI, tests, docs, and support claims must reflect reality.

4. **Minimal contributor cognitive load**
   - A new contributor should be able to install, run, test, and understand the project from a small set of root commands and docs.

5. **Document constraints clearly**
   - macOS-only, Apple Silicon, container caveats, native module rebuilds, and packaging limitations must be first-class documentation.

6. **Professional OSS norms**
   - license, contribution policy, security policy, code of conduct, issue templates, changelog/versioning discipline, and support expectations must be explicit.

## 5. Information Preservation Policy

### 5.1 Decision

Current `.pi/plans/**` and `docs/**` are **not safe to trim blindly early**.

They are safe to trim only after a structured preservation pass that classifies every artifact into one of the following buckets:

1. **Durable public documentation**
   - should remain in repo and be updated
2. **Durable internal documentation**
   - should be moved to a clearly internal/private location or branch
3. **Transient planning artifact with reusable facts**
   - facts should be extracted into canonical docs, then the original can be archived or removed from the public tree
4. **Disposable/stale artifact**
   - safe to archive privately and remove from the public tree

### 5.2 Required preservation workflow

Before deleting any plan/spec/transient doc:

1. inventory the file
2. classify it into one of the four buckets above
3. extract any durable facts, rationale, or decisions into a canonical destination
4. record where the information moved
5. archive the original in a private branch, private mirror, or non-public archive if it is no longer meant for the public repo
6. only then remove it from the public-facing tree

### 5.3 Canonical destinations for harvested knowledge

Durable information should end up in one of these places:
- `README.md`
- public docs site content (RSPress source)
- `docs/architecture.md`
- `docs/decisions.md`
- feature docs under `docs/features/`
- plugin author docs under `docs/plugins/`
- security/privacy docs
- testing/eval docs
- release/process docs

## 6. Success Criteria

Sero is OSS alpha ready when all of the following are true:

### 6.1 Public repo readiness
- no known secrets in working tree or git history per agreed scanning tools
- no tracked transient planning artifacts that should clearly be private/internal-only
- no embarrassing machine-specific/private-path leakage in public-facing docs, except where intentionally shown as sanitized examples
- repo root contains standard OSS files

### 6.2 Contributor readiness
- a new contributor can follow `README.md` and get from clone to running app on a supported machine without tribal knowledge
- root command surface is simple and documented
- common failure modes have a troubleshooting path

### 6.3 Documentation readiness
- public docs explain what Sero is, who it is for, platform requirements, architecture, plugin model, security model, and how to contribute
- docs are split between durable public docs and internal/transient material
- docs ownership and freshness rules are defined

### 6.4 Quality readiness
- test taxonomy is explicit
- CI runs the required quality gates for alpha
- eval strategy is clear and maintained
- release smoke tests are defined

### 6.5 Operational readiness
- versioning/release process is documented
- known limitations are documented
- support/community channels are defined
- licensing posture is resolved

## 7. Workstreams

## WS1 — Repository Sanitation & Knowledge Preservation

### Goal
Preserve important historical knowledge while removing transient/internal debris from the public release surface.

### Deliverables
- inventory of `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, and other transient docs
- classification rubric and retention policy
- canonical destinations for extracted information
- private archive strategy for removed documents
- cleaned public docs tree with durable docs only

### Acceptance criteria
- every candidate-for-removal doc is classified before deletion
- every deleted public doc has either no remaining value or has its durable content extracted elsewhere
- `.pi/plans/**` is either removed from the public tree or explicitly justified as public
- no public-facing docs contain unnecessary absolute local paths, private scratch references, or stale implementation notes presented as current truth

## WS2 — Documentation Architecture & Public Docs Site

### Goal
Create a professional documentation system without forcing excessive inline code comments or breaking file-size discipline.

### Direction
Use **RSPress** for rich external documentation and keep inline code docs minimal and targeted.

### Documentation model
- **External docs first** for guides, architecture, concepts, workflows, and tutorials
- **Minimal TSDoc** for public/exported APIs only
- auto-generated API reference where useful
- no broad requirement to heavily annotate internal implementation files

### Deliverables
- chosen docs IA and folder structure
- RSPress app/setup
- landing docs pages:
  - Overview
  - Getting Started
  - Installation / Requirements
  - Development Setup
  - Architecture
  - Plugin Development
  - Testing / Evals
  - Security / Privacy
  - Troubleshooting
  - Known Limitations
- API reference approach for exported packages/plugins where beneficial
- docs governance note: what belongs in docs vs plans vs internal notes

### Acceptance criteria
- docs site builds cleanly
- docs reflect current supported platform and constraints
- at least one clean onboarding path exists for users and one for contributors
- no need to inflate source files with large inline prose to achieve documentation quality

## WS3 — Test, E2E, and Eval Rationalization

### Goal
Make the quality strategy intentional, current, and obviously valuable.

### Required outputs
- test taxonomy:
  - unit
  - integration
  - e2e
  - evals
  - release smoke
- ownership map: what each layer is meant to catch
- removal/fix/update list for stale or low-value tests
- CI matrix specifying what runs on PR, nightly/manual, and release
- root command surface for running test suites consistently

### Deliverables
- root `test` and `test:ci` flows
- `turbo` support for `test`
- plugin/package tests integrated into repo-level quality flow where appropriate
- documented policy for expensive evals and container-dependent tests
- release smoke checklist for clean-machine verification

### Acceptance criteria
- CI truthfully covers the alpha quality bar
- package/plugin tests are either included in CI or explicitly documented as out of scope
- evals are current and mapped to actual regression risks
- every retained test category has a clear value statement

## WS4 — Developer Workflow & Script Simplification

### Goal
Hide complexity behind a small number of well-documented root commands.

### Desired public command surface
- `pnpm setup` or documented `pnpm install`
- `pnpm dev`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm eval:snapshot`
- `pnpm build`
- optional: `pnpm doctor`

### Deliverables
- script inventory with purpose and owner
- removal/merge/rename plan for duplicate or legacy scripts
- canonical contributor workflow docs
- optional environment validation/doctor command

### Acceptance criteria
- new contributors do not need to understand `scripts/` internals to get started
- duplicate wrappers are justified or removed
- dev workflow is documented from repo root, not just tribal app-level knowledge

## WS5 — OSS Hygiene, Legal, and Governance

### Goal
Meet baseline expectations for a professional open-source project.

### Deliverables
- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/CODEOWNERS`
- issue templates
- PR template
- versioning/changelog policy
- third-party license review and `NOTICE`/`THIRD_PARTY_NOTICES` decision if needed

### Decisions required
- license choice
- maintainer/support expectations
- binary distribution scope and legal posture
- policy for external contributions and review expectations

### Acceptance criteria
- repo root and `.github/` look credible to an external contributor
- licensing choice is explicit and internally understood
- legal review is complete enough for the intended alpha distribution model

## WS6 — Security, Privacy, and Public Release Audit

### Goal
Ensure the public repo and public artifacts do not leak secrets, unsafe assumptions, or misleading security posture.

### Deliverables
- working-tree and git-history secret scanning baseline
- audit for private/local paths and internal references in docs
- policy for storing and documenting user secrets/config locally
- public security/privacy explanation for auth keys, tokens, gateway behavior, logs, and local storage
- public-safe sample configs and sanitized examples

### Acceptance criteria
- scanning tools run clean or have documented false positives
- docs do not instruct users to expose secrets unsafely
- public security docs match actual product behavior and constraints

## WS7 — CI, Release Engineering, and Distribution Readiness

### Goal
Make alpha releases repeatable, reviewable, and supportable.

### Deliverables
- repo-level CI design
- alpha release checklist and go/no-go gate
- versioning/changelog mechanism
- packaging/signing/notarization decision and docs
- release artifact policy:
  - source-only alpha
  - or source + binary alpha
- clean-machine install/run validation

### Acceptance criteria
- there is a documented path from commit to tagged alpha release
- release process is not dependent on undocumented maintainer memory
- binary distribution constraints are clearly understood before release promises are made

## WS8 — Product Presentation & Launch Surface

### Goal
Make the first public impression strong even if the final marketing site comes later.

### Deliverables
- polished `README.md` hero section
- screenshots/GIFs
- alpha positioning copy
- placeholder landing page/site
- concise explanation of why Sero exists and how it differs

### Acceptance criteria
- the repo page and landing placeholder make the value proposition obvious
- the first-time visitor can understand the product in under 2 minutes

## WS9 — Examples, Templates, and Ecosystem Onboarding

### Goal
Make extension/plugin potential tangible to contributors.

### Deliverables
- at least one example plugin or starter path
- plugin author quickstart guide
- canonical minimal example for a Sero plugin/app/tool integration

### Acceptance criteria
- a developer can build or understand a small plugin example without reverse-engineering the monorepo

## WS10 — Final Alpha Readiness Review

### Goal
Run a final structured review before making the repository publicly promoted as OSS alpha.

### Deliverables
- consolidated go/no-go review
- known issues list
- public limitations list
- day-0 support/triage plan

### Acceptance criteria
- maintainers can confidently answer: what works, what is alpha, what is unsupported, and how contributors should engage

## 8. Sequencing

### Phase A — Preserve and sanitize first
1. freeze/delete-nothing policy for transient docs until triage starts
2. inventory + classification of docs/plans/internal artifacts
3. public-repo hygiene baseline scans
4. licensing/legal decisions started

### Phase B — Make the repo truthful
5. rationalize tests and CI
6. simplify contributor command surface
7. add root OSS/community files

### Phase C — Build the public experience
8. launch docs architecture and RSPress site
9. create README, screenshots, placeholder landing page
10. add plugin/example onboarding

### Phase D — Release discipline
11. define versioning/changelog/release flow
12. run alpha smoke checklist and go/no-go review

## 9. Open Decisions

1. **License**
   - Apache-2.0 vs MIT vs stronger copyleft
2. **Public vs internal docs boundary**
   - what remains in repo vs private archive
3. **Whether `.pi/plans/**` should remain tracked publicly at all**
4. **Whether `.claude/` and `AGENTS.md` are part of the public product surface**
5. **Binary distribution scope**
   - source-only first vs signed binaries
6. **Castlabs/Widevine/Spotify legal posture for public release**
7. **Alpha plugin API stability promise**
8. **What issue/support channels will be offered at alpha**

## 10. Risks

- deleting internal documents before harvesting durable value
- shipping a public repo with stale or contradictory docs
- overpromising platform support
- under-testing plugin/package behavior in CI
- legal friction around packaged binaries
- contributor confusion caused by too many special-case setup paths
- security/privacy docs drifting from actual implementation

## 11. Exit Condition

This effort is complete when Sero can be presented as a public OSS alpha with:
- a clean and intentional public repository
- preserved institutional knowledge
- professional baseline OSS materials
- truthful documentation and CI
- a defined release path
- a credible first impression for users and contributors
