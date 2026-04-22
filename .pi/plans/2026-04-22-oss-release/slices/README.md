# Phase 0 + Phase 1 Execution Pack

Status: Ready
Date: 2026-04-22
Related: `../decision-log.md`

## How to use this pack

1. Keep the preserve-before-prune freeze in place.
2. Launch any or all five Phase 1 audit lanes in parallel.
3. Give each lane its matching prompt file.
4. Each lane writes findings to its assigned slice file only.
5. After all five slices are filled, the lead integrator synthesizes G1 decisions in `../decision-log.md`.

## Concurrent execution rules

- Phase 1 is discovery-only.
- No lane may edit repo source, CI, public docs, or shared plan files.
- No lane may edit another lane's slice.
- One lane = one output file.
- Prefer path-specific tables and concrete recommendations.
- Preserve before prune: recommend only; do not delete or move docs yet.

## Lane matrix

These filenames are the authoritative Phase 1 artifact paths for execution, even where they are slightly more specific than the draft labels in `../plan.md`.


| Lane | Scope | Output slice | Prompt |
| --- | --- | --- | --- |
| OSS-0101 | Docs / plans audit | `01-docs-plans-audit.md` | `prompts/01-docs-plans-audit.md` |
| OSS-0102 | Test / CI / eval audit | `02-test-ci-eval-audit.md` | `prompts/02-test-ci-eval-audit.md` |
| OSS-0103 | Scripts / devflow audit | `03-scripts-devflow-audit.md` | `prompts/03-scripts-devflow-audit.md` |
| OSS-0104 | Security / public audit | `04-security-public-audit.md` | `prompts/04-security-public-audit.md` |
| OSS-0105 | Legal / license / distribution audit | `05-legal-license-distribution-audit.md` | `prompts/05-legal-license-distribution-audit.md` |

## Ownership summary

- Lead integrator only:
  - `../decision-log.md`
  - `../spec.md`
  - `../checklist.md`
  - `../plan.md`
  - `prompts/**`
- Parallel lanes:
  - exactly one assigned slice file each

## Output quality bar

Each completed slice should make later implementation easier by including:
- concise executive summary
- exact paths reviewed
- findings tied to paths/scripts/workflows
- what should happen later vs what must not happen yet
- the specific decisions the integrator must make at G1
