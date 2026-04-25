# Sero OSS Alpha Readiness — Execution Plan

Status: Draft
Date: 2026-04-22
Inputs:
- `.pi/plans/2026-04-22-oss-release/spec.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/scout-context.md`

## 1. Purpose

Turn the OSS alpha readiness spec into an execution plan that can use subagents **concurrently where safe**, while avoiding git conflicts and preserving important knowledge before any trimming.

## 2. Planning Assumptions

1. **Preserve before prune**
   - No bulk deletion of `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, or similar transient material until it has been inventoried and triaged.

2. **One repo, so concurrency must be bounded**
   - Read-only audits can run in parallel freely.
   - New-file drafting can run in parallel if file ownership is disjoint.
   - Root config changes (`package.json`, `turbo.json`, `.github/workflows/**`, docs-site config, repo-wide cleanup) should be owned by a single lane and merged serially.

3. **Subagents are best used in two modes**
   - **Parallel scouts/drafters** for analysis, inventories, content drafts, and proposals
   - **Guarded workers** for implementation in disjoint file areas

4. **Integration remains serial**
   - Even with parallel subagents, final merges, shared-file edits, CI fixes, and repo-wide cleanup should be handled by a lead integrator lane.

## 3. Concurrency Model

### 3.1 Safe to parallelize

- repo audits and inventories
- policy/draft documents written to `.pi/plans/2026-04-22-oss-release/slices/**`
- new root OSS/community files if each file has a single owner
- docs content drafts targeting separate pages
- example/plugin drafts in isolated new directories
- validation reports and smoke-test notes

### 3.2 Must be serialized or single-owner

- root `package.json`
- `turbo.json`
- `.github/workflows/**`
- docs site nav/config/homepage shell
- repo-wide trim/delete/move passes
- any task changing the same public doc tree index or shared config

### 3.3 Recommended ownership map

| Ownership lane | Exclusive/shared file surface |
|---|---|
| **Repo Infra** | `package.json`, `turbo.json`, `.github/workflows/**`, root test/dev commands |
| **Governance** | `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.github/CODEOWNERS`, issue templates, PR template |
| **Docs Platform** | docs-site app/config/nav/home shell |
| **Docs Migration** | content pages under agreed docs subtrees only |
| **Presentation** | `README.md`, screenshots/assets, placeholder landing page |
| **Sanitation** | final doc trims/moves/removals after harvest |
| **Release** | changelog/versioning/release process docs and automation |

## 4. Shared Artifact Layout

Use the plan directory as the coordination hub:

```text
.pi/plans/2026-04-22-oss-release/
├── scout-context.md
├── spec.md
├── checklist.md
├── plan.md
├── decision-log.md                  # serial gate decisions
├── migration-map.md                 # what moved where
├── review.md                        # final review notes
└── slices/
    ├── 01-docs-audit.md
    ├── 02-test-ci-eval-audit.md
    ├── 03-scripts-devflow-audit.md
    ├── 04-security-public-audit.md
    ├── 05-legal-release-audit.md
    ├── 06-docs-ia-rspress-proposal.md
    ├── 07-governance-files-draft.md
    ├── 08-readme-landing-brief.md
    ├── 09-release-engineering-proposal.md
    └── 10-trim-decisions.md
```

**Rule:** parallel subagents should write findings and drafts into `slices/**` first. The lead integrator then lands approved changes into the public repo.

## 5. Program Phases

## Phase 0 — Program Setup & Freeze

**Goal:** establish the rules of engagement before anyone starts deleting or rewriting.

### Tasks

#### OSS-0001 [Serial] — Freeze blind trimming
- Declare a no-blind-deletion rule for `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, and related transient areas.
- Output: note in `decision-log.md`

#### OSS-0002 [Serial] — Create coordination artifacts
- Create `slices/` layout and task index.
- Output: `decision-log.md` initial section + optional empty slice placeholders

#### OSS-0003 [Serial] — Assign lane ownership
- Decide which execution lane owns shared files.
- Output: ownership note in `decision-log.md`

### Completion gate
- No one starts trimming or restructuring public docs before Phase 1 outputs exist.

---

## Phase 1 — Parallel Discovery / Audit Wave

**Goal:** gather the facts needed to make scope and sequencing decisions.

**Execution mode:** parallel scouts or drafters. These are read-heavy and safe to run concurrently.

### Parallel lanes

#### OSS-0101 [Parallel] — Docs & Plans Audit
**Scope**
- `.pi/plans/**`
- `docs/plans/**`
- `docs/superpowers/**`
- `docs/deslopify/**`
- maintainer-facing docs that may or may not belong in the public tree

**Questions to answer**
- What is durable public documentation?
- What is durable internal documentation?
- What is transient but contains reusable facts?
- What is stale/disposable?
- Which files leak machine-specific paths or private local references?

**Output**
- `slices/01-docs-audit.md`

#### OSS-0102 [Parallel] — Test / CI / Eval Audit
**Scope**
- `.github/workflows/test.yml`
- root `package.json`
- `turbo.json`
- `apps/desktop/e2e/**`
- `eval/**`
- package/plugin `test` scripts

**Questions to answer**
- What test categories exist today?
- What is currently enforced in CI?
- What is missing from CI despite existing tests?
- Which tests are flaky/stale/duplicative/expensive?
- What should run on PR vs nightly/manual vs release?

**Output**
- `slices/02-test-ci-eval-audit.md`

#### OSS-0103 [Parallel] — Scripts & Dev Workflow Audit
**Scope**
- `scripts/**`
- `apps/desktop/scripts/**`
- root/package app-level script surfaces

**Questions to answer**
- Which scripts are canonical?
- Which are wrappers/duplicates/legacy?
- What should the public root command surface be?
- Would `pnpm doctor` materially reduce support burden?

**Output**
- `slices/03-scripts-devflow-audit.md`

#### OSS-0104 [Parallel] — Security & Public Release Audit
**Scope**
- working tree and git-history scanning posture
- docs/security/**
- auth/config/logging/storage docs
- examples and sample config safety

**Questions to answer**
- Any secrets or unsafe references?
- What public docs need sanitization?
- What should the public privacy/security posture say?
- What user data/secrets/storage locations must be documented before launch?

**Output**
- `slices/04-security-public-audit.md`

#### OSS-0105 [Parallel] — Legal / License / Distribution Audit
**Scope**
- license options
- third-party notices
- castlabs/Widevine/Spotify distribution posture
- source-only vs binary alpha decision inputs
- OSS governance file expectations

**Questions to answer**
- Recommended license and trade-offs
- Whether binary distribution is safe/wise for alpha
- What legal caveats must be stated publicly
- Whether `NOTICE` / third-party notices are needed

**Output**
- `slices/05-legal-release-audit.md`

### Gate G1 — Discovery Synthesis [Serial]

**Lead integrator task:** read all five audit outputs and write:
- `decision-log.md`

**Decisions required at G1**
1. public/private docs boundary
2. archive strategy for removed docs
3. license choice
4. source-only alpha vs binary alpha
5. whether `.pi/plans/**`, `.claude/**`, and `AGENTS.md` remain public, move, or are split
6. public support/community surface (issues only, discussions, etc.)
7. docs-site location and scope for alpha

**Nothing in later phases should proceed past draft state until G1 decisions are recorded.**

---

## Phase 2 — Foundation Implementation Wave

**Goal:** establish the repo-level structure that later content and cleanup will depend on.

**Execution mode:** mixed. Some lanes can run in parallel after G1, but shared config remains single-owner.

### Lane A — Governance Files [Parallel, disjoint new files]

#### OSS-0201
Create/land:
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/CODEOWNERS`
- `.github/ISSUE_TEMPLATE/**`
- `.github/pull_request_template.md`

**Owner:** Governance lane only

**Depends on:** G1 license + support decisions

### Lane B — Repo Infra [Serial / single owner]

#### OSS-0202
Implement root quality command surface:
- root `pnpm test`
- root `pnpm test:ci`
- `turbo` `test` task if selected
- CI workflow changes for truthful alpha gates

**Owner:** Repo Infra lane only

**Depends on:** `slices/02-test-ci-eval-audit.md`

#### OSS-0203
Simplify script surface:
- remove or justify wrappers
- document canonical root commands
- add `pnpm doctor` if approved

**Owner:** Repo Infra lane only

**Depends on:** `slices/03-scripts-devflow-audit.md`

### Lane C — Docs Platform [Parallel with A/B after G1]

#### OSS-0204
Create docs-site skeleton and IA using chosen stack (expected: RSPress)

**Includes**
- docs app/bootstrap
- nav/config shell
- stub page tree
- docs contribution convention

**Owner:** Docs Platform lane only

**Depends on:** G1 docs-site decision

### Lane D — Presentation [Parallel after G1]

#### OSS-0205
Draft and land a polished `README.md` skeleton

**Includes**
- value prop
- alpha positioning
- platform requirements
- quick start
- links to docs
- known limitations summary

**Owner:** Presentation lane only

**Depends on:** G1 positioning + license/support decisions

#### OSS-0206
Create placeholder landing page or docs homepage hero

**Owner:** Presentation lane or Docs Platform lane, but only one owner for the homepage shell

### Gate G2 — Foundation Checkpoint [Serial]

Verify:
- root OSS/governance files exist
- docs platform exists
- root quality/dev commands are coherent
- README exists and reflects reality

Only after G2 should the repo begin broad docs migration and trimming.

---

## Phase 3 — Content Migration & Public Docs Wave

**Goal:** move from internal accumulation to curated public documentation.

**Execution mode:** parallel drafting is encouraged, but landing to the public docs tree should be coordinated by the Docs Platform / Docs Migration owners.

### Recommended workflow
1. parallel drafters harvest facts into `slices/**`
2. lead docs integrator turns approved drafts into canonical docs pages
3. only then mark old sources as removable

### Parallel drafting lanes

#### OSS-0301 [Parallel] — Core Product Docs
Draft/refresh:
- Overview
- Getting Started
- Installation / Requirements
- Development Setup
- Known Limitations

**Output target:** docs drafts or direct docs pages if ownership is clear

#### OSS-0302 [Parallel] — Architecture & Technical Docs
Draft/refresh:
- Architecture
- state/runtime folders
- containers vs host mode
- native module caveats

#### OSS-0303 [Parallel] — Plugin / Ecosystem Docs
Draft/refresh:
- plugin author guide
- external plugin distribution story
- minimal plugin path

#### OSS-0304 [Parallel] — Quality / Testing / Eval Docs
Draft/refresh:
- test taxonomy
- CI policy
- eval guidance
- troubleshooting

#### OSS-0305 [Parallel] — Security / Privacy Docs
Draft/refresh:
- secret/auth storage
- gateway/token behavior
- local data posture
- threat-model caveats suitable for alpha

### Gate G3 — Canonical Docs Review [Serial]

Before trimming any old docs, confirm:
- public docs cover the required product/contributor/security/testing topics
- extracted information from transient plans has a canonical landing place
- page ownership and freshness expectations are defined

---

## Phase 4 — Preservation Harvest & Public Surface Cleanup

**Goal:** safely reduce internal debris in the public tree without losing institutional knowledge.

**Execution mode:** analysis may be parallel, but actual public-tree cleanup should be owned by a single sanitation lane.

### Parallel prep tasks

#### OSS-0401 [Parallel] — Migration map drafting
For each removable/transient file, record:
- original path
- classification
- canonical destination of harvested info
- final action: keep / move / archive / delete

**Output**
- `migration-map.md`
- `slices/10-trim-decisions.md`

### Serial cleanup tasks

#### OSS-0402 [Serial] — Land canonical docs updates
Ensure durable knowledge is already captured.

#### OSS-0403 [Serial] — Remove or relocate transient public artifacts
Expected candidates:
- tracked `.pi/plans/**` if deemed non-public
- stale plan/spec dumps
- obsolete superseded docs
- machine-specific path-heavy internal notes not meant for public consumption

#### OSS-0404 [Serial] — Sanitize remaining public references
- replace local absolute paths with sanitized examples
- remove stale “do this on Dan’s machine” style references
- update links after moves/removals

### Gate G4 — Public Surface Ready [Serial]

- no blind-deletion regrets identified
- canonical docs exist for durable knowledge
- public docs tree looks intentional

---

## Phase 5 — Quality, Release Engineering, and Validation Wave

**Goal:** make alpha release claims enforceable.

### Lane A — Release Engineering [single owner]

#### OSS-0501
Implement versioning/changelog/release process

Potential scope:
- choose/add changesets or equivalent
- document tag/release flow
- define alpha version naming

#### OSS-0502
Document artifact policy
- source-only alpha or source + binary alpha
- signing/notarization stance
- known packaging caveats

### Lane B — Validation Reports [parallel drafting safe]

#### OSS-0503 [Parallel]
Clean-machine setup/run smoke report
- clone
- install
- dev run
- test run
- common failure points

#### OSS-0504 [Parallel]
Release smoke checklist
- gitleaks
- typecheck
- test
- docs build
- packaging smoke (if applicable)

#### OSS-0505 [Parallel]
Screenshot / GIF / launch-asset capture plan

### Gate G5 — Release Readiness Review [Serial]

Confirm:
- CI matches the chosen alpha quality bar
- release flow is documented
- support/legal/packaging constraints are explicit
- launch assets exist at least at placeholder quality

---

## Phase 6 — Examples, Launch Surface, and Final Review

**Goal:** finish the first-run contributor impression and do a final go/no-go.

### Parallelizable tasks

#### OSS-0601 [Parallel]
Create at least one plugin example or starter path

#### OSS-0602 [Parallel]
Finish README polish, screenshots, and docs cross-links

#### OSS-0603 [Parallel]
Prepare known limitations / FAQ / support guidance pages

### Final serial tasks

#### OSS-0604 [Serial]
Run final validation set
- secrets scan
- docs-site build
- required tests/CI gates locally
- link check/manual doc sanity pass

#### OSS-0605 [Serial]
Write final review / go-no-go memo
- what is in scope
- what remains alpha-only
- top known issues
- release recommendation

**Output**
- `review.md`

---

## 6. Subagent-Ready Task Matrix

| ID | Task | Mode | Safe in parallel? | Depends on |
|---|---|---|---|---|
| OSS-0101 | Docs & plans audit | Scout/drafter | Yes | Phase 0 |
| OSS-0102 | Test/CI/eval audit | Scout/drafter | Yes | Phase 0 |
| OSS-0103 | Scripts/devflow audit | Scout/drafter | Yes | Phase 0 |
| OSS-0104 | Security/public audit | Scout/drafter | Yes | Phase 0 |
| OSS-0105 | Legal/release audit | Scout/drafter | Yes | Phase 0 |
| G1 | Discovery synthesis | Integrator | No | 0101-0105 |
| OSS-0201 | Governance files | Worker | Yes, with single owner | G1 |
| OSS-0202 | Root quality/CI surface | Worker | No, single owner | G1 + 0102 |
| OSS-0203 | Script simplification | Worker | No, same owner as 0202 preferred | G1 + 0103 |
| OSS-0204 | Docs platform skeleton | Worker | Yes, single owner | G1 |
| OSS-0205 | README skeleton | Worker | Yes, single owner | G1 |
| OSS-0206 | Placeholder landing/home | Worker | Only if ownership clear | G1 |
| G2 | Foundation checkpoint | Integrator | No | 0201-0206 |
| OSS-0301 | Core product docs drafts | Drafter/worker | Yes | G2 |
| OSS-0302 | Architecture docs drafts | Drafter/worker | Yes | G2 |
| OSS-0303 | Plugin docs drafts | Drafter/worker | Yes | G2 |
| OSS-0304 | Quality docs drafts | Drafter/worker | Yes | G2 |
| OSS-0305 | Security docs drafts | Drafter/worker | Yes | G2 |
| G3 | Canonical docs review | Integrator | No | 0301-0305 |
| OSS-0401 | Migration map | Drafter | Yes | G3 |
| OSS-0402-0404 | Cleanup / trim / sanitize | Worker | No, single owner | G3 + 0401 |
| OSS-0501 | Release engineering | Worker | No, single owner | G4 |
| OSS-0503-0505 | Validation reports/assets | Scout/worker | Yes | G4 |
| G5 | Release readiness review | Integrator | No | 0501-0505 |
| OSS-0601-0603 | Examples / polish / FAQ | Worker | Yes if disjoint | G5 |
| OSS-0604-0605 | Final validation + memo | Integrator | No | 0601-0603 |

## 7. Recommended Execution Order

### Wave 0 (same day)
- OSS-0001 to OSS-0003

### Wave 1 (parallel audit wave, 1-2 days)
- OSS-0101 to OSS-0105 in parallel
- then G1 serial synthesis

### Wave 2 (foundation, 2-4 days)
- OSS-0201, OSS-0204, OSS-0205 can start in parallel after G1
- OSS-0202 and OSS-0203 should stay with the same owner
- then G2 checkpoint

### Wave 3 (docs migration, 3-5 days)
- OSS-0301 to OSS-0305 in parallel as drafts or disjoint page implementations
- then G3 docs review

### Wave 4 (cleanup + release prep, 2-3 days)
- OSS-0401 parallel prep
- OSS-0402 to OSS-0404 serial cleanup
- OSS-0501 plus OSS-0503 to OSS-0505 in parallel where ownership permits
- then G5 review

### Wave 5 (polish + final review, 1-2 days)
- OSS-0601 to OSS-0603 in parallel if disjoint
- OSS-0604 to OSS-0605 serial finish

## 8. Key Risks and Mitigations

### Risk: losing important knowledge during trimming
**Mitigation:** no public cleanup without `migration-map.md` and canonical destination recorded.

### Risk: parallel workers conflict on shared config files
**Mitigation:** strict ownership map; one owner for root config and docs-site shell.

### Risk: README/docs/platform messages drift apart
**Mitigation:** G1 positioning decisions recorded once in `decision-log.md`; README/docs/landing all derive from it.

### Risk: CI claims outpace what the repo actually enforces
**Mitigation:** Phase 1 test audit before any release promises; Phase 5 validation gate before public announcement.

### Risk: legal uncertainty blocks binaries late
**Mitigation:** decide source-only vs binary alpha at G1; do not let downstream work assume binary distribution until cleared.

## 9. Definition of Done

This plan is complete when:
- the public repo is curated and free of obviously transient/private debris
- durable knowledge has been preserved before trimming
- docs, README, and community files form a professional OSS surface
- CI/test/eval/release expectations are truthful and documented
- release engineering and support posture are explicit
- a final go/no-go memo recommends public alpha with known limitations listed
