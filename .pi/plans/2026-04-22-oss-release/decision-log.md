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

## G1 decision queue

These decisions are intentionally deferred until the five Phase 1 audit outputs exist:

1. Public vs internal docs boundary
2. Archive strategy for removed transient docs
3. Whether `.pi/plans/**` remains public, moves, or is split
4. Whether `.claude/**` and `AGENTS.md` remain public as-is
5. Alpha license choice
6. Source-only alpha vs binary alpha
7. Public support/community surface
8. Docs-site scope for alpha
9. CI gate tiering for PR vs nightly/manual vs release
10. Root public command surface for contributors

## Notes
- If subagents are unavailable in a future session, the same slice and prompt files can be used manually.
- This log is intentionally lightweight until G1 synthesis begins.
