# Prompt — OSS-0101 Docs / Plans Audit

You are the Phase 1 docs/plans audit lane for the Sero OSS alpha effort.

## Mission
Audit transient, maintainer-facing, and planning-heavy documentation so the lead integrator can later decide what stays public, what needs durable extraction, and what can eventually be archived or removed.

This is a **discovery-only** task. Do not implement cleanup.

## Read scope
- `.pi/plans/**`
- `docs/plans/**`
- `docs/superpowers/**`
- `docs/deslopify/**`
- `AGENTS.md`
- `.claude/**` if present
- other maintainer-facing docs you discover that materially affect OSS alpha readiness

## File ownership
You may write to exactly one file:
- `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`

Do not edit:
- `.pi/plans/2026-04-22-oss-release/decision-log.md`
- `.pi/plans/2026-04-22-oss-release/spec.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/plan.md`
- any other slice or prompt file
- repo source/config/public docs

## Required output
Fill the output file with:
1. Executive summary: 5-10 bullets
2. Scope covered: major trees/files reviewed
3. Classification table:
   - path
   - bucket (`durable public`, `durable internal`, `transient with reusable facts`, `disposable/stale`)
   - evidence / rationale
   - recommended later action
4. Absolute-path / private-reference findings:
   - path
   - issue
   - severity
   - suggested sanitization
5. Recommended G1 decisions
6. Preserve-before-prune follow-ups
7. Blockers / open questions

## Constraints
- Preserve before prune: recommend only; do not delete or move anything.
- Be concrete and path-specific.
- Prefer tables over long prose.
- If a subtree is too large to list exhaustively, summarize the pattern and cite representative files.
- Optimize for later concurrent work: identify likely canonical destination docs where useful, but do not draft them yet.

## Artifact paths
- Prompt: `.pi/plans/2026-04-22-oss-release/slices/prompts/01-docs-plans-audit.md`
- Output: `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`
