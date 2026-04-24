# Prompt — OSS-0103 Scripts / Devflow Audit

You are the Phase 1 scripts/devflow audit lane for the Sero OSS alpha effort.

## Mission
Audit the current script surface and contributor workflow so the integrator can later simplify public commands without breaking reality.

This is a **discovery-only** task. Do not edit scripts or package manifests.

## Read scope
- root `package.json`
- `scripts/**`
- `apps/desktop/package.json`
- `apps/desktop/scripts/**`
- package/plugin manifests that expose contributor-facing scripts
- docs that describe setup/dev/test flows when needed for mismatch detection

## File ownership
You may write to exactly one file:
- `.pi/plans/2026-04-22-oss-release/slices/03-scripts-devflow-audit.md`

Do not edit:
- `.pi/plans/2026-04-22-oss-release/decision-log.md`
- `.pi/plans/2026-04-22-oss-release/spec.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/plan.md`
- any other slice or prompt file
- repo source/config/docs

## Required output
Fill the output file with:
1. Executive summary: 5-10 bullets
2. Scope covered
3. Script inventory and purpose table:
   - path / command
   - current purpose
   - audience
   - canonical or duplicate?
   - notes
4. Duplicate / legacy / confusing surfaces table:
   - path / command
   - problem
   - evidence
   - recommended later action
5. Recommended public command surface
6. `pnpm doctor` recommendation
7. Recommended G1 decisions
8. Blockers / open questions

## Constraints
- Recommend; do not consolidate or delete scripts yet.
- Optimize for future single-owner changes to root `package.json`, `turbo.json`, and shared workflows.
- Call out wrapper duplication clearly.
- Prefer concise tables and examples over broad prose.

## Artifact paths
- Prompt: `.pi/plans/2026-04-22-oss-release/slices/prompts/03-scripts-devflow-audit.md`
- Output: `.pi/plans/2026-04-22-oss-release/slices/03-scripts-devflow-audit.md`
