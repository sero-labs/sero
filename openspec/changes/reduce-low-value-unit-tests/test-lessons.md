# Test lessons scratchpad

Working notes for the cleanup. Starting scan examples are leads, not automatic removals. The parent adds short examples after each review batch; child verdict lists stay in managed run artifacts. Use confirmed examples, not guesses, when writing `AGENTS.md` and `sero-unit-test`.

## Starting inventory

Run `node scripts/inventory-unit-tests.mjs` for the summary and `node scripts/inventory-unit-tests.mjs --candidates` for the ordered JSON review queue. The repeatable scan found 1,044 tracked `.test.*` files, 7,440 static test declarations and 159,875 test-file lines (1,038 unit files / 7,404 declarations; one benchmark file / one declaration; five end-to-end helper files / 35 declarations). It separately counted 64 `.spec.*` files. These are not executed-test or runtime counts. The earlier 7,512 figure came from a different exploratory count and is not comparable case-for-case to this repeatable parser.

| Area | Files | Static declarations in repeatable scan |
| --- | ---: | ---: |
| Desktop Electron | 368 | 2,469 |
| Orchestrator plugin | 175 | 1,605 |
| Desktop renderer | 129 | 548 |
| Design Library plugin | 96 | 786 |
| Architect plugin | 56 | 540 |
| Other areas | 220 | 1,492 |

The repeatable scan flagged 2,120 candidate test declarations. Its JSON queue had identical SHA-256 hashes on two runs (`d4867400b2973706e3a303c5632cebbbcc57463f15f67837e5ce3021e47031ba`), and it changed no tracked test files. Candidates can have more than one signal and include good tests. They are **not** estimates of safe deletions. No package runtime was measured.

## Leads to test in the pilot

- `plugins/sero-orchestrator-plugin/ui/__tests__/access-tile.test.ts`: many cases compare exact phrase formatting; check whether one concise semantic access/approved-wording case is worth keeping and whether the rest only pins copy. Do not treat the whole file as one decision.
- `plugins/sero-orchestrator-plugin/ui/__tests__/loop-settings-line.test.tsx`: some tests pin ordered `dt`/`dd` nodes and text, while others click through to the right project. `openspec/specs/orchestrator-ui/spec.md` explicitly requires some labelled settings and actions. Distinguish brittle element order from the real interaction contract.
- `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.test.tsx`: many text fragments are checked, but choosing a backend and its pending state also have behavioral checks. A text match is not enough to remove the file.
- `apps/agent-node/test/static.test.ts`: several checks read source or docs as strings; some concern security configuration, so classify each one rather than deleting all source-read tests.
- `apps/desktop/electron/__tests__/features/profile/roots.test.ts`: a useful negative control. It verifies that a test runner cannot resolve the real profile root without an override. Preserve the safety behavior.
- `apps/desktop/electron/__tests__/features/workspace/runtime/toolchains/image-pin.test.ts`: another negative control. It reads a Dockerfile but protects a cross-artifact pinned-version rule. A source-file read is not automatically a change detector.

## Confirmed pilot lessons

- `plugins/sero-orchestrator-plugin/ui/__tests__/access-tile.test.ts:42` | KEEP after parent review | the standalone `Run commands` access phrase may be important enough to keep even though a mixed-access test also exercises it; the smoke agent misnamed the line | possible rule: confirm exact name and line before accepting a proposed removal.
- `plugins/sero-orchestrator-plugin/ui/__tests__/access-tile.test.ts:46` | DELETE complete | the two-target `and` join is already tested by `:33`, the two-line tile at `:5`, and the proposal diff test | possible rule: remove a repeated formatting combination when its join and access semantics remain covered.
- `plugins/sero-orchestrator-plugin/ui/__tests__/loop-settings-line.test.tsx:81,140` | DELETE complete | `:81` repeats the full set of visible labels at `:68` and asserts its own fixture; `:140` repeats the missing-`From` render case at `:133` and the no-project lib test in `loop-settings.test.ts` | possible rule: a negative UI assertion or fixture echo is weak when a positive contract test already excludes that state. Keep `:68,90,98` for spec-required labels and detail controls.
- `apps/agent-node/test/state.test.ts:8,41,52` and `apps/desktop/electron/__tests__/features/profile/agent-config-migration.test.ts:24,39,52,68` | KEEP (scan false alarms) | `readFile` reads generated state in temp folders to prove permissions, atomic writes, and migration/no data loss; it does not scan production source | possible rule: distinguish reading test output from reading source text.
- `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.test.tsx:134,156,173` | :156 and :173 DELETE; :134 trimmed | the pure support-matrix tests already cover Intel/Windows choices, but kept one macOS render case to prove default/optional badges reach the UI | possible rule: trim repeated platform render copy without deleting every integration check.
- `apps/desktop/electron/__tests__/features/workspace/runtime/toolchains/image-pin.test.ts:39,59` | KEEP/UNSURE | source read checks a cross-artifact RTK pin; a literal version in :59 makes the drift test brittle, but dropping it would lose the image-side mismatch guard | prefer testing the invariant without duplicating its pinned value.
- `apps/desktop/electron/__tests__/features/profile/roots.test.ts` | KEEP (unflagged negative control) | rejects use of the developer's real profile root under a test runner | never infer value from scan syntax alone.
- `plugins/sero-design-library-plugin/ui/components/GenerateDialog.test.tsx:45` | trimmed, not deleted | without a reference, Restyle and Upscale must stay unavailable; the tab class, textarea rows, and obsolete-copy checks added no behavior | possible rule: keep the small negative capability check, remove presentation assertions.
- `plugins/sero-design-library-plugin/ui/components/MediaSettings.test.tsx:211` | DELETE | one static tooltip sentence adds no behavior beyond the six covered capability help controls | possible rule: exact optional help text needs a specific contract before it becomes a unit-test invariant.
- `plugins/sero-architect-plugin/ui/__tests__/project-controls.test.tsx:142,180,662` | DELETE | a second pause-refusal alert, subset of the scroll/composer test, and a second empty Needs-you render repeat better tests | possible rule: check fixture and surviving paths before removing duplicate page-level assertions.
- `apps/desktop/src/components/layout/ToolCallGroup.test.tsx:471` | KEEP against agent's DELETE recommendation | sibling `group-messages.test.ts` covers `user + thinking` while this case covers `tool group + trailing streaming thinking`; the adjacent kind changes the behavior | possible rule: apparent cross-file duplicates need the same input shape, not just the same test title.

## Pilot and review record

- Model: `deepseek/deepseek-flash:high`, confirmed by run `c6eb8821-afa8-499c-8ded-2401132f2769` (thinking high). The configured `sero-test-value-reviewer` lacked required exec/read tools; a fresh read-only `scout` preflight succeeded. It read `AGENTS.md`, checked `git status`, and found an access sentence case, but misnamed its line.
- Four-lane read-only pilot `4d69ceb9-0d73-432a-97f6-f9fb32608b59`: 94/94 flagged tests reviewed; 86 KEEP, 7 UNSURE, 1 proposed DELETE. The reports live in managed `pilot/` outputs, not this repo. The parent read all seven uncertain test bodies and the proposed deletion, and checked protected access, state, migration, accessibility, and approved-wording cases against the named tests and governing spec.
- Corrected the custom `sero-test-value-reviewer` tools, default to `deepseek/deepseek-flash` (thinking high), and objective to find safe removals rather than catalogue tests; smoke run `1cef2730-3447-4e0b-90be-3f99aaeb4ad8` and calibration run `aa3143d4-e40f-4874-934d-c26f317d4a7c` succeeded with the verified model and tools. Re-review of 28 Orchestrator UI candidates: 3 proposed DELETE, 24 KEEP, 1 UNSURE. The parent checked proposed deletions against test bodies, `loop-settings.test.ts`, and the approved Orchestrator spec; it accepts the three above and keeps uncertain access and roster cases.
- Further read-only wave `e4c4f6b5-125c-4973-bf64-d094ef71e101`: four file-exclusive `sero-test-value-reviewer` lanes reviewed 97/97 additional flags at `deepseek/deepseek-flash:high`; 9 proposed DELETE, 88 KEEP. Parent inspected each proposed deletion and directly checked surviving test bodies. Accepted 6 removals (2 desktop renderer, 1 Design Library, 3 Architect), kept the ToolCallGroup trailing-stream case, and trimmed the source-free Generate and macOS runtime-picker tests instead of deleting their only useful behavior. Focused Vitest passed in all three affected packages.
- Scale decision: **stop further waves**. Six accepted removals among 97 additional flags is a lower yield than the calibrated pilot, and several signals still flag protected behavior. Do not send the full ~2,100-candidate queue to agents by default.
- Integrated cleanup: 9 reviewed test declarations removed (3 Orchestrator, 2 desktop renderer, 1 Design Library, 3 Architect), plus two tests simplified. Test files stayed at 1,044; static declarations fell from 7,440 to 7,431 and test-file lines from 159,875 to 159,770. The read-only scan now reports 2,110 candidate leads. These counts are not a runtime measurement.
- Validation: full Orchestrator suite 174 passed/1 skipped files (1,660 passed/1 skipped tests); Design Library 96 passed files (804 tests); Architect 56 passed files (583 tests); desktop 495 passed/2 skipped files (3,092 passed/5 skipped tests). Root `pnpm typecheck` passed 29/29 tasks; React Doctor changed-scope scored 100/100. Desktop Vitest emitted warnings about existing nested `vi.unmock` calls, not failures. No pre-cleanup package runtime was measured, so do not claim a speed improvement.
- No PR has been made yet; user reviews removals in the draft PR before merge.
