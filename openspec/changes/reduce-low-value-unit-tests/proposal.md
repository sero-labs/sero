## Why

Sero has 1,044 tracked `.test.*` files and about 7,500 static test declarations. Many tests pin copy, DOM structure, or implementation details without protecting behavior, so routine changes cost more than they should. A full manual review of every test would cost too much; a repeatable, bounded cleanup is needed.

## What Changes

- Add a read-only, repeatable scan that inventories tests by area and flags likely low-value test cases for review. Its output is evidence, never an automatic deletion list.
- Pilot a parallel review of flagged cases with up to eight timeboxed, read-only, low-cost agents; confirm the exact `deepseek-flash` model and high-effort setting before use. Scale only if the pilot finds safe removals at a useful rate.
- Delete or shorten individually reviewed weak tests in separate, test-only batches. Preserve meaningful state, access, safety, and explicitly required wording checks. Integrate and validate changes before the user's final review of a draft pull request.
- Keep a small `test-lessons.md` scratchpad of decisions, exceptions, and false alarms. Use the observed lessons to add short rules to `AGENTS.md` and create `.agents/skills/sero-unit-test/SKILL.md` for more detailed guidance.

## Capabilities

### New Capabilities

None. The change improves development tooling and test guidance, not product behavior.

### Modified Capabilities

None. Existing product requirements remain in force. This change sets `skip_specs: true` in `.openspec.yaml` because it changes no spec-level behavior.

## Impact

- Potential test-only edits across `apps/desktop/`, `plugins/`, and `packages/`, starting with `plugins/sero-orchestrator-plugin/ui/`; no planned production-code changes.
- A small repository scan under `scripts/`, `AGENTS.md`, and a new test-authoring skill under `.agents/skills/`.
- No runtime API, dependency, or product behavior change. Published packages need a version bump only if an eventual cleanup touches a published package.
