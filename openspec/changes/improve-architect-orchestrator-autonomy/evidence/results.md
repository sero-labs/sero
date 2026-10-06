# Results and evidence

Recorded on 2026-10-06. Raw records are in `pilot-phase0/` and `replay-phase1/`.

## Paid runs

All runs used the global LOW tier of a disposable profile, on throwaway workspaces seeded with the same committed files. The scenario is `small-fix`: one function returns a string longer than its limit. Acceptance is one hidden test.

| Run | Revision | Model | Hidden test | Outcome recorded | Elapsed | Active | Cost |
|---|---|---|---|---|---|---|---|
| Architect | a82856342 (before this change) | deepseek-flash, low | passed | none (hit the 8 min bound) | 481 s | 104 s | $0.022 |
| Single agent | a82856342 | deepseek-flash, low | passed | accepted | 23 s | 16 s | $0.006 |
| Architect | 7edaf65e2 (direct work, no catalogue fix) | deepseek-flash, low | passed | none (hit the 8 min bound) | 481 s | 102 s | $0.021 |
| Architect | 6581f6483 (catalogue fix, review round 1) | deepseek-flash, low | passed | milestone accepted, project not closed (hit the 8 min bound) | 482 s | 128 s | $0.036 |

Two earlier smoke runs on `openai-codex/gpt-5.6-luna` at medium thinking are in `pilot-phase0/smoke-luna-records.json`: the single agent was accepted in 36 s for $0.008, and the Architect was accepted in 4.6 min for $0.16.

Bounds: $1 and 8 minutes per run, $6 in total for the pilot and $2 for each replay.

### What the runs show

- In the first and third rows the owner changed the file correctly and could not record anything. Its approval had no `sero-cli` tool. A run from source cached `sero-cli` as a plugin's tool, and the approval step then dropped it. The fix is commit be0d682cd.
- In the last row the owner had `sero-cli` and 20 approved skills. It used direct work for real: `work begin`, an edit, `work report`, then `evidence`. The fix was accepted about 90 seconds after the start.
- In the last row the first milestone carried a preview check that the project could not pass. The owner opened a second milestone, got it accepted, then asked how to close the first. The project was still open at the time bound. The preview check predates this change.
- Owner context per turn grew from about 4,600 to about 41,000 tokens across 38 turns in the last row, and from about 4,200 to about 24,800 across 21 turns in the first.

### What the runs do not show

- No comparison is claimed. One scenario and one repeat per strategy is too few.
- The planned pilot was 5 scenarios, 2 repeats, 20 runs. It was cut to keep paid runs short. The `debugging`, `substantial-feature`, `collaborative-research` and `interruption` scenarios have no record.
- Cost coverage for Architect runs is partial: part of the spend is known only as a project total.
- Repeated work and protocol failures are not counted by the runner.
- No run exercised a Room amendment, a durable wait, tool discovery through `tool_search`, or stall recovery. Their evidence is unit and integration tests only.

## Requirement to evidence

| Area | Built | Evidence | Not met |
|---|---|---|---|
| Baseline and restriction map (1.x) | Comparison record, runner, restriction map, limit provenance | Tests in the Architect plugin, contract spec, the runs above | Full pilot matrix (1.5) |
| Direct work (2.x) | Execution identity saved first, begin/continue/report, interruption, UI row | Architect tests, the last run above | Worktree placement (2.3): the owner's approval covers the project folder only. Matched replay beyond one scenario (2.9) |
| Tool discovery (3.x) | Approved tools registered deferred, `tool_search`, reopen restore, owner skills | Desktop tests on a real Pi session, the last run above for skills | Code Mode for managed sessions stays unsupported. A member has no user-disabled list, so "disabled" is reported for workers only. Replay (3.7) |
| Grant amendments (4.x) | Host amendment, Room revisions through it, restart reconcile, Team view | Desktop and Orchestrator tests | An Architect action that asks to widen an existing owner. Interrupted amendment replay (4.8) |
| Durable waits (5.x) | Wait on linked child work with a deadline, reserved and consumed wakes, stall recovery, limit origins, wait card and limits list | Architect and Orchestrator tests | Process and CI sources (5.3): no existing seam reports them by identity. Multi-hour continuity trial (5.8) |
| Reporting and guidance (6.x) | Docs pass | Docs changes | Reporting comparison (6.1) and prompt removals (6.2) need recorded protocol failures the runner does not count. Rendered UI check (6.3) |

## Reporting action (6.1) and prompt procedures (6.2)

No recommendation is made. The decision needs counted protocol failures across matched runs, and the runner records none. The one protocol failure seen here was not a reporting-format fault: the owner had no tool to report with. No prompt procedure was removed.

## Review

Two routed rounds on gpt-6-astra at high effort are on the pull request: 17 findings, then a delta check of the fixes. One finding is tracked as issue 623.
