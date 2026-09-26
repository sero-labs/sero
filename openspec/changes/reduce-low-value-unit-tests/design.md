## Context

See `proposal.md` for the problem and baseline. The inventory counts tracked `.test.*` files, not executed cases: parameterized tests can expand at runtime, and a few `.test.*` files are benchmarks or end-to-end helpers. The 64 `.spec.*` files are outside this unit-test inventory. About four-fifths of test declarations lie in desktop Electron, desktop renderer, Orchestrator, Design Library, and Architect.

Existing `AGENTS.md` and `.agents/repository-reference.md` already discourage tautologies and change-detector tests. `.agents/skills/prune-tests/SKILL.md` requires deep evidence for each reviewed test; it is useful for hard cases but too costly as the bulk sweep's default. Product specs still govern behavior: `openspec/specs/orchestrator-ui/spec.md`, for example, explicitly requires some wording. A DOM, copy, source-read, or mock-call match cannot by itself justify deletion. Root `pnpm typecheck` is required before commits that change source, including a scan script or skill examples that execute.

## Goals / Non-Goals

**Goals:**
- Spend model time on likely weak tests rather than reviewing all ~7,500 declarations.
- Give each candidate a test-level judgment; remove an entire file only after all of its tests have a disposition.
- Keep the work reviewable as test-only batches, with the user checking removals in the draft PR before merge.
- Keep reusable lessons for the short global rules and the more detailed skill.

**Non-goals:**
- A test-count target, automatic deletion, a new CI coverage/count gate, or a promise that every test will be reviewed.
- Changing production behavior to satisfy or replace a weak test.
- Removing a meaningful access, persistence, safety, accessibility, or explicitly approved wording contract because it happens to use text, DOM, or a mock.
- Running eight test suites or installs at once, or building a general-purpose test-quality service.

## Decisions

### 1. Inventory and candidate scan are deterministic and read-only

Use the repository's existing TypeScript parser in a small script under `scripts/`. Enumerate tracked `.test.ts`, `.test.tsx`, and other tracked `.test.*` files; distinguish unit suites from known benchmark and end-to-end helper paths. Report file counts, static test declarations, and test lines by owning area. Parse test callbacks to flag *leads* such as copy-only expectations, DOM shape/class/markup checks, source/config text scans, snapshots, and assertions only about mock call shape. Emit a stable, machine-readable candidate list with path, line, test name, signal, and short excerpt or location, plus a human summary. Do not score an entire file as deletable; do not write or change test files. The report is not a CI gate.

Why: regex-only counts are useful as a baseline but lose test boundaries; an AST makes independent, repeatable work packets without requiring production-source tracing. A full source/dependency crawler would cost more and produce misleading judgments.

### 2. Review only flagged cases, in bounded parallel lanes

Before launch, check available agents and exact model IDs; smoke-test one read-only child against `AGENTS.md`, `git status`, and a target test file. Use `deepseek-flash` at high effort only if the runtime confirms that combination. Keep the parent responsible for assignments and decisions. Pilot four distinct review lanes, including Orchestrator UI, another UI area, and a non-UI/control sample. For later waves allow **at most eight concurrent children total**. Assign non-overlapping file sets, up to about 30–50 candidate tests or 1,000 test lines per child, whichever is smaller. Target about ten minutes per read-only lane; retain partial findings on timeout and reassign only unreviewed items. Do not ask children to fan out.

Each child reads candidate test bodies and reports `DELETE`, `KEEP`, or `UNSURE` with file, line, name, one-sentence reason, and any risk tag. It should open production code or a relevant spec only for an unresolved contract or protected boundary, not as a blanket requirement. A test that checks exact prose may be worth one focused check if a product spec requires the wording or a misleading access statement would matter. Use managed run artifacts for child reports, not eight repo scratch files. The parent checks a sample of proposed deletions, all `UNSURE` cases, and all flagged safety/contract cases. Disagreements stay unresolved until a human or stronger review settles them. Scale or stop based on pilot false alarms and accepted removals, not a quota.

Why: one expensive agent reviewing the whole repo will be slow; unbounded cheap agents will still spend time on the wrong tests. Avoid asking a second agent to re-review all work: sample ordinary cases and fully review risky ones.

### 3. Separate judgments from edits

After the pilot shows useful yield, group accepted removals by file and owning package. Prefer one parent writer for small test-only batches. If concurrent cleanup writers save time, give each an exclusive file set and an isolated worktree. Keep writer batches smaller than review waves and avoid hard interruption mid-edit; request a safe checkpoint if a writer runs long. Each committing writer runs the closest tests and the required root `pnpm typecheck` before its commit. A single parent/integration owner cherry-picks each batch, resolves conflicts, removes unused helpers/snapshots, and checks that no meaningful behavior lost its only proof. Writers must not edit product code to preserve a bad test. If an accepted removal reveals a real uncovered contract, add only the smallest independently justified behavior test; otherwise delete without a replacement.

After integration, run each full affected package suite and root `pnpm typecheck` before any parent commit or PR update. Record before/after files, declarations, test lines, and, if measured, package test runtime. Do not claim a speed gain from counts alone. The user reviews the test removals in the draft PR before merge. Further waves stop when returns fall or judgments grow uncertain.

Why: read-only review is cheap to parallelize; edits in a shared checkout are not. Isolated writers and one integration owner keep the final diff understandable. If worktree setup costs more than the batch, the parent can make a single serial test-only edit instead.

### 4. Preserve lessons without turning them into new bureaucracy

Keep `test-lessons.md` in this change as a short, parent-owned scratchpad: representative path/line, signal, disposition, reason, false alarm or exception, and candidate authoring rule. Record useful examples rather than thousands of verdicts. At the end, distill only recurring lessons into a few global bullets in `AGENTS.md` and specific good/bad examples in `.agents/skills/sero-unit-test/SKILL.md`. The new skill guides future test authoring and quick triage; the existing `prune-tests` skill remains available for deep audit of difficult cases. Avoid contradictory absolute bans on text or DOM assertions.

Why: rules written before seeing false alarms would repeat the same overfitting that caused the test problem.

## Risks / Trade-offs

- **A flagged test protects a real contract** -> protect high-risk areas, consult the governing spec when needed, audit samples and all uncertain cases, and leave doubtful tests in place.
- **Small agents disagree or fail to finish** -> smoke-test the exact model/tool setup, timebox read-only lanes, keep partial reports, and retry only unreviewed cases; the parent makes the call.
- **Parallel edits overlap or make validation slow** -> file ownership per worktree, one integration owner, and serial package-level validation after integration.
- **A large diff defeats human review** -> deliver small, test-only batches with a count/line summary and the reason for each removed test or closely related group; keep the PR as a draft.
- **A scan matches legitimate file or mock tests** -> record false alarms in the scratchpad and improve ranking before scaling; never delete from syntax alone.

## Migration Plan

1. Build and inspect the baseline/candidate report, then run the one-child preflight and four-lane pilot.
2. Compare pilot judgments with direct review; revise signals or stop if they are not useful.
3. Clean accepted cases in bounded batches, integrate and validate; let the user inspect the draft PR before merge.
4. Distill the scratchpad into `AGENTS.md` and the new skill after the cleanup has produced evidence.

Rollback is a revert of the affected test-only batch. The scan and guidance introduce no runtime migration.
