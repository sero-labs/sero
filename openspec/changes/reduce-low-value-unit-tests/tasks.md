## 1. Build a repeatable candidate list

- [ ] 1.1 Add a read-only test inventory under `scripts/` using the existing TypeScript parser; verify it reports tracked test files, static declarations, test lines, and per-area totals, with benchmarks, end-to-end helpers, and `.spec.*` files labelled separately.
- [ ] 1.2 Flag test-level copy, DOM-detail, source-scan, snapshot, and mock-call leads with path, line, name, and signal; verify sample output against `access-tile.test.ts`, `loop-settings-line.test.tsx`, `static.test.ts`, and a genuine state test, without auto-deleting or marking any file as safe to remove.
- [ ] 1.3 Run the inventory to record its initial counts and candidate list for the draft PR; verify output order is stable across two runs and the command leaves tracked files unchanged.

## 2. Calibrate cheap, parallel review

- [ ] 2.1 Check available agents and exact model IDs, then run one read-only smoke task on `deepseek-flash` with high effort if supported; verify it can read `AGENTS.md`, `git status`, and a named test and returns a useful file/line report before launching a wave.
- [ ] 2.2 Run four non-overlapping read-only pilot lanes across Orchestrator UI, another UI area, and a non-UI/control sample; cap each at about 30–50 flagged tests or 1,000 test lines and roughly ten minutes, and verify reports label each reviewed case `DELETE`, `KEEP`, or `UNSURE` with a reason. Save partial results if a lane times out.
- [ ] 2.3 Directly inspect a sample of proposed deletions, every `UNSURE`, and every risk-tagged case; record accepted removals, false alarms, and stop-or-scale decision in `test-lessons.md` and the PR description. Verify no agent judgment alone becomes an edit instruction.

## 3. Prune in bounded batches

- [ ] 3.1 Clean the approved Orchestrator UI pilot cases per test, removing dead helpers or snapshots only when unused; verify no file is removed with an unreviewed test and the focused Orchestrator tests pass.
- [ ] 3.2 If the pilot has useful yield, run further waves of at most eight concurrent read-only agents over non-overlapping candidate sets; verify each wave's accepted removals and false alarms before starting the next, and stop when returns diminish or uncertainty rises.
- [ ] 3.3 Apply further accepted removals in small, exclusive file groups, preferring one writer for small batches and isolated worktrees for concurrent writers; verify no file overlaps, each committing writer runs focused tests and root `pnpm typecheck` before its commit, and each handoff states changed files and unresolved cases.
- [ ] 3.4 Integrate each batch and run the full affected package suites and root `pnpm typecheck` before any parent commit or PR update; verify existing behavior checks still pass, note failures honestly, and compare before/after file, declaration, and line counts. Record any measured runtime separately rather than inferring it from the counts.

## 4. Turn evidence into guidance

- [ ] 4.1 Update `test-lessons.md` with representative deleted tests, protected cases, and false alarms from completed batches; verify each proposed rule has a concrete example and the scratchpad is not a full verdict log.
- [ ] 4.2 Add only short, non-duplicated global test rules to `AGENTS.md`, and create `.agents/skills/sero-unit-test/SKILL.md` with the observed decision guide and concise good/bad examples; verify both preserve approved copy, accessibility, access, safety, and state contracts and do not contradict existing test guidance.
- [ ] 4.3 Check the integrated diff, required typecheck, affected package tests, published-package version policy if any `packages/*` project was touched, and documentation impact; verify the PR is a draft with a clear removal summary and is left for the user's manual review before merge.
