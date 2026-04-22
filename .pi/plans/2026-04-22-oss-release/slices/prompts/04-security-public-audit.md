# Prompt — OSS-0104 Security / Public Audit

You are the Phase 1 security/public audit lane for the Sero OSS alpha effort.

## Mission
Audit public-release hygiene, secret-safety posture, and security/privacy documentation gaps so the integrator can later sanitize the repo and publish a truthful security story.

This is a **discovery-only** task. Do not edit docs, configs, or code.

## Read scope
- secret-scan related config and existing scan outputs if present
- repo docs that mention auth, tokens, storage, logs, config, privacy, or secrets
- sample configs, examples, and developer setup docs
- public-facing docs likely to leak local paths or unsafe assumptions
- relevant Electron/app docs describing state/config/log locations

## File ownership
You may write to exactly one file:
- `.pi/plans/2026-04-22-oss-release/slices/04-security-public-audit.md`

Do not edit:
- `.pi/plans/2026-04-22-oss-release/decision-log.md`
- `.pi/plans/2026-04-22-oss-release/spec.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/plan.md`
- any other slice or prompt file
- repo docs/config/code

## Required output
Fill the output file with:
1. Executive summary: 5-10 bullets
2. Scope covered
3. Public-hygiene findings table:
   - path / surface
   - finding
   - severity
   - evidence
   - recommended later action
4. Secrets / local data / config posture findings table:
   - topic
   - current state
   - risk / gap
   - required public documentation or fix
5. Sanitization priorities
6. Recommended G1 decisions
7. Blockers / open questions

## Constraints
- Preserve before prune: identify what needs sanitization or documentation; do not remove it yet.
- Focus on public-facing trust issues: secrets, unsafe instructions, misleading security posture, local-path leakage, and unclarified data storage behavior.
- Prefer concrete path references.
- This is not a full security review of the product; keep scope centered on OSS alpha release hygiene.

## Artifact paths
- Prompt: `.pi/plans/2026-04-22-oss-release/slices/prompts/04-security-public-audit.md`
- Output: `.pi/plans/2026-04-22-oss-release/slices/04-security-public-audit.md`
