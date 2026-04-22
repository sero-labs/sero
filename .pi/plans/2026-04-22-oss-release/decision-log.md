# OSS Alpha Release — Decision Log

Status: Active
Date: 2026-04-22
Owner: Lead integrator only
Related:
- `.pi/plans/2026-04-22-oss-release/spec.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/plan.md`
- `.pi/plans/2026-04-22-oss-release/slices/README.md`

## Purpose

This file is the serial coordination log for shared execution rules, phase gates, and cross-lane decisions.

Phase 1 audit lanes must treat this file as **read-only**. Only the lead integrator should update it.

## Active Phase 0 decisions

### D-0001 — Preserve-before-prune freeze
- Status: Accepted
- Decision: No blind deletion, move, or mass rewrite of transient/internal docs before triage.
- Protected paths:
  - `.pi/plans/**`
  - `docs/plans/**`
  - `docs/superpowers/**`
  - similar transient planning or maintainer-facing docs discovered during Phase 1
- Allowed during freeze:
  - inventory
  - classification
  - extraction planning
  - creation of new coordination artifacts under `.pi/plans/2026-04-22-oss-release/**`
- Not allowed during freeze:
  - deleting or relocating protected docs
  - repo-wide cleanup passes
  - public-surface trimming before G1 synthesis

### D-0002 — Phase 1 concurrency contract
- Status: Accepted
- Decision: The five Phase 1 lanes are discovery-only and subagent-safe.
- Rules:
  - Each lane may read anywhere inside its defined scope.
  - Each lane may write to **one assigned slice file only**.
  - No Phase 1 lane may edit source files, CI/config, public docs, root OSS files, shared plan docs, or another lane's slice.
  - Recommendations are allowed; implementation is out of scope.

### D-0003 — File ownership map for Phase 1

| Surface | Owner | Allowed writes during Phase 1 |
| --- | --- | --- |
| `decision-log.md` | Lead integrator | This file only |
| `spec.md`, `checklist.md`, `plan.md` | Lead integrator | No parallel-lane edits |
| `slices/01-docs-plans-audit.md` | Docs/plans audit lane | This file only |
| `slices/02-test-ci-eval-audit.md` | Test/CI/eval audit lane | This file only |
| `slices/03-scripts-devflow-audit.md` | Scripts/devflow audit lane | This file only |
| `slices/04-security-public-audit.md` | Security/public audit lane | This file only |
| `slices/05-legal-license-distribution-audit.md` | Legal/license/distribution audit lane | This file only |
| `slices/prompts/**` | Lead integrator | Frozen after pack creation unless re-issued serially |
| Repo source/config/docs outside plan dir | No Phase 1 lane | No edits |

### D-0004 — Required Phase 1 outputs
- Status: Accepted
- Decision: Every lane must leave a concrete audit memo in its assigned slice file with:
  - executive summary
  - scope covered
  - path-specific findings
  - prioritized recommendations
  - G1 decisions needed
  - blockers/open questions
- Notes:
  - Prefer concise tables over long prose.
  - If a subtree is too large to enumerate fully, summarize the pattern and cite representative files.
  - Do not create extra scratch files unless the integrator explicitly expands ownership later.

### D-0005 — Concrete Phase 1 artifact paths are now fixed
- Status: Accepted
- Decision: The execution-pack filenames under `slices/**` are the authoritative artifact paths for Phase 1, even where they are slightly more specific than the draft placeholder names in `plan.md`.

## G1 discovery synthesis

Status: Complete
Date: 2026-04-22
Inputs:
- `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`
- `.pi/plans/2026-04-22-oss-release/slices/02-test-ci-eval-audit.md`
- `.pi/plans/2026-04-22-oss-release/slices/03-scripts-devflow-audit.md`
- `.pi/plans/2026-04-22-oss-release/slices/04-security-public-audit.md`
- `.pi/plans/2026-04-22-oss-release/slices/05-legal-license-distribution-audit.md`

### D-0101 — Public vs internal docs boundary
- Status: Accepted
- Decision:
  - Public alpha docs are limited to intentional, maintained contributor/user surfaces: `README.md`, root OSS/community files, the future docs site, and selected sanitized canonical docs under `docs/`.
  - Canonical public-doc candidates include `docs/sero.md`, `docs/architecture.md`, `docs/decisions.md`, selected `docs/features/**`, selected `docs/plugins/**`, selected `docs/security/**`, and selected `docs/reference/**`.
  - The following are **not** part of the public product surface and should be treated as internal/historical material even if still temporarily tracked during this program: `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, `docs/deslopify/**`, security hardening backlogs, maintainer tasklists, agent prompt/skill docs, `AGENTS.md`, and `.claude/**`.
  - No protected docs move yet. Phase 3/4 must harvest durable facts first.
- Rationale:
  - Phase 1 found documentation sprawl, path leakage, and many plan/spec artifacts that are useful source material but poor canonical public docs.

### D-0102 — Archive strategy for removed transient docs
- Status: Accepted
- Decision:
  - The canonical archive is a **private git mirror/branch snapshot** taken immediately before Phase 4 cleanup.
  - `migration-map.md` will record every removed or relocated artifact, its classification, harvested destination, and final action.
  - Tarballs are optional backup artifacts only; they are not the primary archive format.
- Guardrails:
  - Preserve-before-prune remains in force through G3.
  - No delete/move of protected docs before canonical public docs exist for harvested facts.

### D-0103 — `.pi/plans/**` policy
- Status: Accepted
- Decision:
  - Use a **split policy**.
  - `.pi/plans/2026-04-22-oss-release/**` remains temporarily tracked as the active coordination hub for this release effort.
  - Legacy `.pi/plans/**` is internal/transient by default and is targeted for harvest + private archive + later removal from the public tree during Phase 4.
  - Future public-facing roadmap/process material should live in canonical docs or GitHub surfaces, not ad hoc `.pi/plans/**` dumps.
- Rationale:
  - The audits showed real reusable facts inside plans, but not a repo-wide case for keeping historical plan trees as part of the curated OSS surface.

### D-0104 — `.claude/**` and `AGENTS.md` policy
- Status: Accepted
- Decision:
  - Neither surface remains public as-is.
  - `AGENTS.md` should later be split into:
    - public contributor guidance that belongs in `CONTRIBUTING.md` and/or public docs
    - private maintainer/agent operating rules that should leave the public tree before cleanup completes
  - `.claude/**` is internal-only and should not be part of the curated public alpha repo.
  - If any agent workflow examples are worth sharing publicly later, publish sanitized examples separately instead of exposing the raw internal tree.
- Rationale:
  - These files are operational instructions for maintainers/agents, not durable end-user or contributor docs.

### D-0105 — Recommended license direction
- Status: Accepted
- Decision:
  - Use **Apache-2.0** for the repo source at alpha.
  - Pair it later with a lightweight top-level `NOTICE` and a packaging-time `THIRD_PARTY_NOTICES` artifact if/when official binary distribution is enabled.
- Rationale:
  - This is the best current balance of permissive OSS posture plus explicit patent grant for a plugin/extensible tooling platform.

### D-0106 — Alpha distribution posture
- Status: Accepted
- Decision:
  - Alpha launch is **source-first and source-only by default**.
  - Do not promise official public binaries at alpha.
  - Local packaging/release scripts may remain in-tree for maintainers, but signed/notarized public binaries stay out of scope until castlabs/Widevine/Spotify redistribution obligations are confirmed.
  - Public docs should explicitly position alpha support as macOS Apple Silicon source builds, with containers recommended and host mode a documented fallback.
- Rationale:
  - The legal audit surfaced unresolved third-party binary constraints; a source-only alpha keeps the release credible without overcommitting on DRM-enabled binaries.

### D-0107 — Public support/community surface
- Status: Accepted
- Decision:
  - Public alpha support is **GitHub Issues + Pull Requests only**.
  - No GitHub Discussions, Discord, or forum commitment at alpha.
  - `SECURITY.md` will define a private security-reporting path separate from public issues.
  - `CONTRIBUTING.md` should set best-effort maintainer response expectations and explicitly scope alpha support.
- Rationale:
  - This keeps maintainer load realistic and matches the current governance maturity.

### D-0108 — Docs-site scope for alpha
- Status: Accepted
- Decision:
  - Use **RSPress** as the public docs stack.
  - Alpha docs-site scope is intentionally small:
    - Overview
    - Getting Started
    - Installation / Requirements
    - Development Setup
    - Architecture
    - Plugins
    - Testing / Evals
    - Security / Privacy
    - Troubleshooting
    - Known Limitations
  - Historical plans, superpowers docs, deslopify docs, and maintainer runbooks do not get linked from the public docs site.
- Rationale:
  - This is enough to support contributors without turning the docs site into a mirror of internal planning history.

### D-0109 — Test taxonomy and quality-gate tiering
- Status: Accepted
- Decision:
  - Adopt the following test taxonomy for alpha: **unit, integration, e2e, eval, release smoke**.
  - PR gate:
    - `pnpm typecheck`
    - `pnpm build`
    - `pnpm --filter @sero/desktop test -- --run`
    - `pnpm --filter @sero/desktop test:e2e` using the Playwright CI project
  - Nightly/manual gate:
    - `pnpm eval:snapshot`
    - selected package/plugin test suites not yet covered by the PR gate
    - full-render and container-dependent Playwright coverage via `test:e2e:local`
    - full `pnpm eval` when credentials and budget are available
  - Release gate:
    - PR gate plus working-tree secret scan, git-history secret scan, docs build, clean-clone install/run smoke, and a small manual smoke set covering app launch, one workspace action, one agent/tool round trip, and one plugin load path
  - Container-heavy tests and DRM/binary packaging checks remain non-blocking until dedicated infra and legal posture exist.
- Rationale:
  - This matches the actual current test surface without overstating CI coverage.

### D-0110 — Root public command surface
- Status: Accepted
- Decision:
  - Canonical contributor commands to expose from the repo root:
    - `pnpm install`
    - `pnpm dev`
    - `pnpm typecheck`
    - `pnpm build`
    - `pnpm test`
    - `pnpm test:ci`
  - `pnpm dev` is the only first-class “start the app” command for public docs. `apps/desktop/scripts/dev.sh` remains an implementation detail and troubleshooting fallback, not a README-level entrypoint.
  - Advanced or maintainer-only commands stay out of the quickstart: `clean`, `eval*`, `rebuild-electron`, release/signing/container helpers, `knip*`, and plugin export/build wrappers.
  - `pnpm doctor` is approved as a Phase 2 follow-up, but it is not an alpha gate.
- Rationale:
  - This gives contributors a small, honest command surface and follows the scripts/devflow audit recommendations.

## Phase 2 implementation decisions

### D-0201 — Public docs platform location and scope
- Status: Accepted
- Decision:
  - The public docs platform lives in `apps/docs-site/` as a standalone **RSPress** app.
  - The alpha docs site is intentionally limited to the approved IA only:
    - Overview
    - Getting Started
    - Installation / Requirements
    - Development Setup
    - Architecture
    - Plugins
    - Testing / Evals
    - Security / Privacy
    - Troubleshooting
    - Known Limitations
  - The public docs nav must not link historical/internal trees such as `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, `docs/deslopify/**`, `.claude/**`, or `AGENTS.md`.
- Rationale:
  - This keeps the docs platform aligned with G1 while giving later docs work a single owned app surface.

### D-0202 — Canonical docs during migration
- Status: Accepted
- Decision:
  - During Phase 2/3 migration, `apps/docs-site/docs/**` is the curated public-doc surface.
  - Existing repo `docs/**` remains the source-material pool and deeper reference set until later migration/cleanup gates.
  - Architecture decision source material remains rooted in `docs/architecture.md` and `docs/decisions.md` until selectively migrated.
  - Release/process coordination remains under `.pi/plans/2026-04-22-oss-release/**` until a later public process/release-doc destination is finalized.
- Rationale:
  - This preserves knowledge without forcing an early trim of mixed-purpose docs.

### D-0203 — Alpha changelog and versioning workflow
- Status: Accepted
- Decision:
  - Use a **single repo-wide `CHANGELOG.md`** for public alpha release notes.
  - Use manual **SemVer prerelease tags** in the form `v0.1.0-alpha.N`.
  - Treat the **repo + desktop app** as the public alpha release unit; other workspace package versions remain package metadata / compatibility markers during alpha, not an independently published release train.
  - Alpha releases are maintainer-run only, cut from `main`, and remain **source-only**.
  - Do not add Changesets, release-please, semantic-release, or npm publishing automation yet.
- Coordination artifact:
  - `.pi/plans/2026-04-22-oss-release/release-versioning.md`
- Rationale:
  - This is the smallest credible release workflow that matches the current monorepo, low-maintainer-load alpha posture, and source-only distribution decision.

## Phase 2 handoff reference
- Coordination artifact: `.pi/plans/2026-04-22-oss-release/phase-2-handoff.md`
- Cleanup remains blocked until later gates; Phase 2 may proceed only on newly owned surfaces and approved shared-file lanes.

## Notes
- If subagents are unavailable in a future session, the same slice and prompt files can be used manually.
- G1 is now closed; later work should treat the decisions above as the default unless this log is explicitly amended.
