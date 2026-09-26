# Test lessons scratchpad

Working notes for the cleanup. These are **leads, not approved removals**. The parent adds short examples after each review batch; child verdict lists stay in managed run artifacts. Use confirmed examples, not guesses, when writing `AGENTS.md` and `sero-unit-test`.

## Starting inventory

Tracked `.test.*` files: 1,044; static test declarations found by a TypeScript AST pass: about 7,500 (7,512 in the initial pass); test-file lines: about 161,000. These are not executed-test or runtime counts. Another 64 `.spec.*` files were counted separately. The inventory includes some benchmark and end-to-end helper tests; the repeatable scan must label those apart from unit suites.

| Area | Files | Approximate static declarations |
| --- | ---: | ---: |
| Desktop Electron | 368 | 2,496 |
| Orchestrator plugin | 175 | 1,619 |
| Desktop renderer | 124 | 519 |
| Design Library plugin | 96 | 790 |
| Architect plugin | 56 | 553 |
| Other areas | 225 | about 1,535 |

A text scan found 132 test files with DOM-detail syntax, 105 with exact-copy syntax, and 341 with mock-call-shape syntax. These groups overlap and include good tests. They are leads for the parser and pilot, **not** estimates of safe deletions. No package runtime was measured.

## Leads to test in the pilot

- `plugins/sero-orchestrator-plugin/ui/__tests__/access-tile.test.ts`: many cases compare exact phrase formatting; check whether one concise semantic access/approved-wording case is worth keeping and whether the rest only pins copy. Do not treat the whole file as one decision.
- `plugins/sero-orchestrator-plugin/ui/__tests__/loop-settings-line.test.tsx`: some tests pin ordered `dt`/`dd` nodes and text, while others click through to the right project. `openspec/specs/orchestrator-ui/spec.md` explicitly requires some labelled settings and actions. Distinguish brittle element order from the real interaction contract.
- `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.test.tsx`: many text fragments are checked, but choosing a backend and its pending state also have behavioral checks. A text match is not enough to remove the file.
- `apps/agent-node/test/static.test.ts`: several checks read source or docs as strings; some concern security configuration, so classify each one rather than deleting all source-read tests.
- `apps/desktop/electron/__tests__/features/profile/roots.test.ts`: a useful negative control. It verifies that a test runner cannot resolve the real profile root without an override. Preserve the safety behavior.
- `apps/desktop/electron/__tests__/features/workspace/runtime/toolchains/image-pin.test.ts`: another negative control. It reads a Dockerfile but protects a cross-artifact pinned-version rule. A source-file read is not automatically a change detector.

## Confirmed cleanup lessons

Fill after the pilot. For each representative example: `path:line | DELETE/KEEP/UNSURE | what the test actually proves | reason | false alarm or exception | possible authoring rule`. Do not copy every agent verdict into this file.

## Pilot and review record

- Model ID, high-effort support, smoke result: not checked yet.
- Four-lane pilot: not started.
- Proposed deletions sampled; risky or unsure cases checked: not started.
- User reviews removals in the draft PR before merge. No removals are authorized by this scratchpad.
