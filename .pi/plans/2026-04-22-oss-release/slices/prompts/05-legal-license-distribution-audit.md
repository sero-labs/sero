# Prompt — OSS-0105 Legal / License / Distribution Audit

You are the Phase 1 legal/license/distribution audit lane for the Sero OSS alpha effort.

## Mission
Produce a practical decision memo on OSS license choice, governance-file expectations, distribution constraints, and third-party/legal caveats relevant to a public alpha.

This is a **discovery-only** task. Do not add or edit governance files yet.

## Read scope
- root repo metadata and existing docs that imply distribution posture
- packaging/build docs and notes about castlabs, Widevine, Spotify, signing, notarization, or binaries
- dependency/license artifacts already present in the repo
- `.github/**` if present for existing governance/community surfaces
- relevant public docs that make promises about platform support or distribution

## File ownership
You may write to exactly one file:
- `.pi/plans/2026-04-22-oss-release/slices/05-legal-license-distribution-audit.md`

Do not edit:
- `.pi/plans/2026-04-22-oss-release/decision-log.md`
- `.pi/plans/2026-04-22-oss-release/spec.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/plan.md`
- any other slice or prompt file
- repo governance/docs/config files

## Required output
Fill the output file with:
1. Executive summary: 5-10 bullets
2. Scope covered
3. License and governance options table:
   - topic
   - options / findings
   - recommendation
   - notes
4. Distribution and third-party constraints table:
   - surface
   - constraint / question
   - impact on alpha
   - recommended later action
5. `NOTICE` / third-party notices recommendation
6. Recommended alpha distribution posture
7. Recommended G1 decisions
8. Blockers / open questions

## Constraints
- Provide practical OSS-alpha guidance, not formal legal advice.
- Be explicit about uncertainty and where counsel or deeper review is needed.
- Focus on decisions the integrator must make before creating public OSS materials and any binary-release promises.
- Prefer concise tables.

## Artifact paths
- Prompt: `.pi/plans/2026-04-22-oss-release/slices/prompts/05-legal-license-distribution-audit.md`
- Output: `.pi/plans/2026-04-22-oss-release/slices/05-legal-license-distribution-audit.md`
