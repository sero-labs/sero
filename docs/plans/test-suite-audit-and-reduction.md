# Test suite audit and reduction plan

**Date:** 2026-08-19
**Branch:** `claude/sero-test-audit-plan-g8sgk8`
**Status:** Plan. No test changes are made yet.

## 1. Summary

The test suite has 769 files, 5,160 test cases and 117,192 lines of code.
The source it tests has 278,394 lines. The ratio is 0.42 test lines per
source line.

A survey of the suite shows that the initial diagnosis is correct in part,
but the primary cost is different from the assumption. The data changes what
you must fix first.

**What the data confirms:**

- Fragile UI tests exist. 219 assertions test literal interface text.
- Tautological tests exist. 26 files use 5 or more module mocks.
- The suite makes the typecheck slow. Tests are 49% of the desktop
  typecheck time.

**What the data does not support:**

- The suite is *not* mostly mock theatre. Mock-call assertions
  (`toHaveBeenCalled*`) are 1,194 of 20,845 total assertions, which is 5.7%.
  Most tests assert on real values.
- The tests are *not* slow to run. Desktop test execution is 40.6 seconds
  across 374 files. No single file takes more than 4.6 seconds.

**The real cost driver is file count and test lines in the typecheck graph,
not slow or worthless tests in bulk.** Deleting tests one by one gives a
small return. Two structural changes give a large return immediately.

This changes the order of work: fix the structure first, then delete by
category. Do not start with deletion.

## 2. Measured evidence

All numbers below are measured on this branch. Commands are in section 8.

### 2.1 Size and distribution

| Area | Test files | Test LOC | Source LOC | Ratio |
| --- | ---: | ---: | ---: | ---: |
| `apps/desktop` electron | 283 | 42,418 | 73,179 | 0.58 |
| `apps/desktop` renderer | 86 | 14,021 | 42,316 | 0.33 |
| `apps/desktop` e2e | 49 | 9,003 | — | — |
| `sero-orchestrator-plugin` | 119 | 19,685 | 33,997 | 0.58 |
| `sero-design-library-plugin` | 96 | 15,972 | 30,024 | 0.53 |
| All other packages/plugins | 136 | ~16,000 | ~99,000 | — |
| **Total** | **769** | **117,192** | **278,394** | **0.42** |

The electron main process and the two largest plugins carry the most test
weight. They are the correct place to start.

### 2.2 Typecheck cost (the velocity problem)

`apps/desktop/tsconfig.json` includes `src/**/*` and `e2e/**/*`.
`tsconfig.electron.json` includes `electron/**/*`. Every test file is
therefore in the typecheck graph.

Measured with `tsc --noEmit`:

| Project | With tests | Without tests | Saving |
| --- | ---: | ---: | ---: |
| Renderer (`tsconfig.json`) | 25.1s | 10.3s | **-14.8s (-59%)** |
| Electron (`tsconfig.electron.json`) | 14.4s | 9.7s | **-4.7s (-33%)** |
| **Desktop total** | **39.5s** | **20.0s** | **-19.5s (-49%)** |

Tests are half of the desktop typecheck time. This is the single largest
and cheapest win. It needs no test deletion.

### 2.3 Test run cost

Desktop suite: 374 files, 1,874 tests, 66 seconds wall clock.

The internal breakdown shows where the time goes:

| Stage | Time |
| --- | ---: |
| Import | 51.5s |
| Test execution | 40.4s |
| Environment (jsdom boot) | 28.7s |
| Transform | 14.2s |

Import and environment setup cost more than the tests themselves. This is
per-file overhead. 68 files request a `jsdom` environment, and each one pays
a boot cost. **Fewer, larger files cost less than many small files**, even
when the test count stays the same.

### 2.4 Low-value signals

| Signal | Count |
| --- | ---: |
| Assertions on literal UI text | 219 |
| `getByText` calls | 110 |
| `toBeVisible` calls | 136 |
| Raw `textContent` reads | 312 |
| Files with 5+ `vi.mock` calls | 26 |
| `vi.mock` calls total | 434 |
| `vi.fn` calls total | 2,047 |
| Files under 40 LOC | 71 |
| Files with exactly 1 test case | 61 |
| Skipped or todo tests | 55 |
| Snapshot tests | 0 |

Zero snapshot tests is good. Do not introduce them.

### 2.5 Exhibit: the tautological pattern

`apps/desktop/src/components/apps/explorer/ExplorerWorkspace.test.tsx` is
101 lines. It calls `vi.mock` 17 times. It replaces every child component
and every hook with a stub. It then runs one test with two assertions:

```ts
expect(container.textContent).toContain('git');
expect(container.textContent).not.toContain('git:explorer-view');
```

The text it checks is rendered by its own mock, declared 80 lines earlier:

```ts
vi.mock('./ExplorerViewMount', () => ({
  ExplorerViewMissing: ({ panelId }: { panelId: string }) => <div>missing:{panelId}</div>,
}));
```

The test proves the mock works. It cannot fail if the component breaks. It
costs a jsdom boot on every run and 101 lines in the typecheck graph. This
is the exact profile to delete.

### 2.6 What is already good

Do not change these. They are working.

- **The e2e architecture is sound.** 49 specs sit in three declared tiers:
  `contract` (14 files, on every PR), `workflow` (27 files, on demand),
  `agent` (8 files, nightly, skipped by default). `playwright.config.ts`
  documents the intent and the target wall clock. The tiering already
  controls cost.
- **Live-model tests are already gated.** The `agent` tier does not run
  unless it is asked for.
- **Test execution is fast.** There is no slow-test problem to solve.

The e2e suite is therefore a low priority. **The unit suite is the target.**

## 3. The value rubric

Apply one question to every test:

> **If I break the code this test covers, does this test fail?**

If the answer is no, delete the test. This one question removes tautologies,
mock assertions and dead scaffolding.

Then apply a second question:

> **If I rename a variable, reword a label or move a file, does this test
> fail even though the behaviour is correct?**

If the answer is yes, rewrite or delete the test. This one removes the
fragile interface tests that make change expensive.

### Classification

Assign every file exactly one verdict:

| Verdict | Meaning | Action |
| --- | --- | --- |
| **KEEP** | Tests a real contract. Fails on real breakage. | No change. |
| **REWRITE** | Right target, wrong assertions. | Assert on state or output, not on rendered text or mock calls. |
| **MERGE** | Correct but fragmented. | Combine into the sibling file for the same module. |
| **DELETE** | Proves nothing, or duplicates a kept test. | Remove. |

## 4. What to keep, by class

**Keep** these. They earn their cost:

- Pure logic: parsers, validators, reducers, path and token handling.
- State machines and lifecycle: session, workspace and runtime transitions.
- Contracts across a process boundary: IPC channel shapes, preload surface,
  manifest parsing, CLI registry.
- Security and safety gates: approval gates, tool policy, auth token
  handling, path escapes.
- Regression tests that record a real fixed defect, with the issue linked.

**Delete** these. They do not earn their cost:

- Component tests that mock every child and assert on the mock output.
- Assertions on user-facing copy where the copy is not the contract.
- Tests that only assert a mock was called, with no state or output check.
- Tests that restate a TypeScript guarantee, such as checking a required
  field is defined.
- Skipped and todo tests. All 55 of them. A skipped test is not coverage.
  If it matters, fix it now; if it does not, remove it.
- Any second test that covers a path a kept test already covers.

## 5. Phased plan

Phases 1 and 2 are safe and reversible. Do them first and independently. Do
not block them on the audit.

### Phase 1 — Remove tests from the hot typecheck path

**Effort: hours. Risk: very low. Return: -19.5s on every desktop typecheck.**

Do not delete any test. Split the typecheck into a fast developer path and a
complete verification path.

1. Change `apps/desktop/tsconfig.json` to include `src/**/*` only, and
   exclude `**/*.test.ts`, `**/*.test.tsx` and `e2e/**`.
2. Change `tsconfig.electron.json` to exclude `electron/**/__tests__/**`.
3. Add `tsconfig.test.json`. It extends the base config and includes the
   tests and `e2e/**`.
4. Add two scripts: `typecheck` covers source only; `typecheck:tests` covers
   the test config.
5. In CI, `test:ci` runs both. Tests stay fully typechecked. Nothing is lost.
6. Repeat the split for the orchestrator and design-library plugins.

The developer loop gets faster at once. The safety net is unchanged.

**Acceptance:** `pnpm typecheck` for desktop drops from about 40s to about
20s. `pnpm typecheck:tests` passes with zero errors.

### Phase 2 — Clear the dead weight

**Effort: hours. Risk: very low.**

1. Delete all 55 skipped and todo tests. Open an issue for any that record a
   real gap.
2. Delete files that are empty scaffolding or that only assert imports
   resolve.

This needs no judgement and no rubric. Do it as one commit.

### Phase 3 — Automated triage

**Effort: 1–2 days.**

Write `scripts/audit-tests.mjs`. It scores every test file and writes a CSV.
Do not let the script delete anything. It produces the worklist a human
approves.

Score each file on these signals:

| Signal | Weight | Meaning |
| --- | --- | --- |
| `vi.mock` count >= 5 | High | Probably a tautology. |
| Assertions that are all `toHaveBeenCalled*` | High | Tests the mock. |
| Assertions on literal UI copy | High | Fragile to copy edits. |
| Assertion count <= 2 with LOC > 60 | Medium | Poor value for cost. |
| Only 1 test case in the file | Medium | Merge candidate. |
| File under 40 LOC | Low | Merge candidate. |
| Uses `jsdom` | Low | Carries boot cost. |

Output columns: `path, loc, tests, assertions, mocks, uiCopyAsserts,
mockOnlyPct, jsdom, score, verdict`.

Sort by score. The 26 high-mock files and the 15 files with 4 or more
literal-copy assertions are the first worklist.

**Acceptance:** the CSV covers all 769 files and every file has a proposed
verdict.

### Phase 4 — Category demolition

**Effort: 3–5 days. Do this per package, one pull request each.**

Work in this order, largest weight first:

1. `apps/desktop` renderer components — the fragile interface tests.
2. `apps/desktop` electron `__tests__` — the largest block at 42,418 LOC.
3. `sero-orchestrator-plugin` — 19,685 LOC.
4. `sero-design-library-plugin` — 15,972 LOC.
5. Remaining plugins.

For each package:

- Apply the verdict from the Phase 3 CSV. A human confirms every DELETE.
- For REWRITE: replace text assertions with assertions on store state,
  returned values or emitted events. Do not assert on rendered copy unless
  the copy is the contract.
- Delete the mocks that become unnecessary. Fewer mocks means a shorter
  file and a real test.
- Run the package tests and the full typecheck after each package.

**Rule for every deletion:** record in the pull request body the property
the deleted test claimed to prove, and where that property is still proven.
If it is proven nowhere and it matters, write one deterministic test instead.

### Phase 5 — Consolidate the fragments

**Effort: 1–2 days.**

Merge the 71 files under 40 LOC and the 61 single-test files into the
sibling file for the same module. This removes import and environment boot
cost without removing a single assertion.

This phase needs the file-size rule changed first. See section 5.1.

**Acceptance:** desktop test file count falls well below 374. Wall clock
falls with it, because the saving is in per-file overhead.

### 5.1 Change the file-size rule for tests

The `AGENTS.md` rule caps every source file at 500 LOC. Change how the rule
applies to tests. Do not simply raise the number.

**The cap is not what fragmented the suite.** The size distribution shows
this. The median test file is 116 LOC and the mean is 152. Only 20 of 769
files (2.6%) sit between 450 and 500 LOC. The 71 files under 40 LOC and the
61 single-test files are nowhere near the cap. They were written small; the
rule did not split them.

| Size | Files |
| --- | ---: |
| under 40 | 71 |
| 40-100 | 243 |
| 100-200 | 260 |
| 200-400 | 152 |
| 400-450 | 19 |
| 450-500 | 20 |
| over 500 | 4 |

So relaxing the cap is **an enabler for Phase 5, not a win on its own.**
A simulation of the merge confirms this: grouping the small files by
directory absorbs 274 files into 56, and only 6 of those 56 groups would
exceed 500 LOC.

**Where the cap does bind, it binds badly.** The clearest case is
`sero-orchestrator-plugin/runtime/__tests__/room-*.test.ts`: 25 files and
7,036 LOC for one subsystem, with five files at 493-506 LOC. That module
was split by line count, not by behaviour. One of them
(`room-mailbox.test.ts`, 506 LOC) already breaks the rule.

**Why a line cap is the wrong metric for a test file.** For source, 500 LOC
is a good proxy for "this file has too many responsibilities". For tests,
line count is dominated by fixtures, setup and mock declarations, not by
responsibility count. Splitting a test file does not reduce complexity. It
duplicates the setup and adds a new import graph and a new environment boot.

That cost is measured. A fresh `jsdom` environment costs about 333ms per
file across the 86 renderer test files. That cost is close to linear,
because every file gets its own environment. Merging the renderer tests
from 86 files to about 30 saves roughly 19 seconds of pure boot time and
removes no assertion.

**Proposed rule.** Replace the LOC cap for test files with:

> One test file per module under test. Split a test file only when the
> module it covers is split. A test file over **800 LOC** is a review
> prompt, not a failure: check that it still covers one module, then leave
> it alone if it does.

Keep the 500 LOC hard cap for source files. It is doing its job there.

**Why 800 as the review trigger.** It is above every plausible merged
module file except the orchestrator room cluster, which needs a real
behavioural split regardless. It is high enough that no test is split for
line count alone, and low enough to still catch a file that has quietly
grown to cover four unrelated modules.

**Update `AGENTS.md`** in the File Size Rules section to state the source
cap and the test rule separately.

### Phase 6 — Prevent regrowth

**Effort: hours.**

The suite grew to this size because nothing resisted it. Add the resistance.

1. Extend the Test Rules in `AGENTS.md` with the rubric in section 3.
2. Add a lint rule or a CI check that fails when a test file declares more
   than 4 `vi.mock` calls without a written justification comment.
3. Require every new test to state the property it proves in one sentence.
   The existing rule already asks this for live-model tests. Widen it to all
   tests.
4. Track test file count and typecheck time in CI. A pull request that adds
   test files without adding covered behaviour must justify it.

## 6. Targets

These are hypotheses to confirm in Phase 3, not promises.

| Measure | Now | Target | Basis |
| --- | ---: | ---: | --- |
| Desktop typecheck | 39.5s | ~20s | Measured in Phase 1. |
| Test files | 769 | ~450 | Merge fragments (274 -> 56 in one simulation); delete tautologies. |
| Test LOC | 117,192 | ~70,000 | Delete and rewrite by category. |
| Desktop test wall clock | 66s | ~40s | Per-file overhead falls with file count. |
| Assertions | 20,845 | ~18,000 | Most assertions are real. Keep them. |

The assertion count falls much less than the line count. That is the point.
The plan removes cost and fragility, not coverage.

## 7. Risks

| Risk | Control |
| --- | --- |
| A deletion removes real coverage. | Every DELETE names the property it claimed and where it is still proven. A human approves each one. |
| The work stalls part way. | Phases 1 and 2 stand alone and give most of the velocity win. Phase 4 is per package, so any subset is complete on its own. |
| Rewrites introduce new fragile tests. | Assert on state and output only. The Phase 6 lint rule holds the line. |
| The e2e suite is cut by mistake. | The e2e tiers are already correct. They are out of scope. |

## 8. Commands used

```bash
# File and line counts
find . -path ./node_modules -prune -o -name "*.test.ts*" -print | grep -v node_modules | wc -l

# Typecheck, with and without tests
cd apps/desktop && time pnpm exec tsc --noEmit
cd apps/desktop && time pnpm exec tsc -p tsconfig.electron.json --noEmit

# Test run and stage breakdown
cd apps/desktop && pnpm exec vitest run

# Per-file timing
cd apps/desktop && pnpm exec vitest run --reporter=json --outputFile=/tmp/vitest.json
```

**Note on measurement.** A local run of the desktop suite reports 42 failed
files. This is an artefact of an install made with `--ignore-scripts`, which
does not download the Electron binary. It is not a defect in the suite. Use
a full `pnpm install` before you measure a baseline.

## 9. First actions

1. Do Phase 1. It is a few hours and returns half the desktop typecheck
   time. It deletes no test.
2. Do Phase 2. Delete the 55 skipped tests.
3. Write the Phase 3 script and review the CSV before any deletion in
   Phase 4.
