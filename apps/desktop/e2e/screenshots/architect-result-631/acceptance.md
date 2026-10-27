# Architect result assessment — #631

2026-10-27. Base: `9738eb268900fc0cc3733ec326b63a9ae2398ed1`.

This slice extends the existing project result tile. It reads existing project,
evidence, requirement, receipt and budget records. No persisted shape, tool,
IPC, verification engine, budget policy or published package changed.

## Acceptance evidence

Paths below are relative to `plugins/sero-architect-plugin/` unless noted.

| # | Implementation | Evidence and limits |
| --- | --- | --- |
| 1 | `ui/components/BoardResult.tsx` keeps the original request, current objective and saved Architect account together. Direct-work claims remain labelled as reports. | [Repair screenshot](01-repair-result.png) and `observations.json` show the actual request and delivered account from project `proj_c5pfhu7d`. |
| 2 | The tile opens the registered result workspace or a saved HTTP(S) receipt, the workspace's Git app, available preview and existing evidence. Branch/destination text stays attached to its milestone. Opaque receipts stay text rather than being guessed into URLs. | [Opened result](02-open-result.png) verifies actual workspace navigation. The repair had workspace output and Git changes, no PR or preview. Existing preview-unavailable contract passes. URL protocol behavior is covered by `ui/__tests__/result.test.ts`; no external PR was created or opened. |
| 3 | `BoardResult` distinguishes reported, checked, acceptance recorded and delivery recorded. It reuses `Evidence` for actual command outcomes/output and commit, and includes the saved requirement revision and check timestamp. | The repair record has a direct claim, `verification: delivered`, command `node --test repair.test.cjs`, exit 0, commit `be3a384c7671368d7a2d07ea2f2fa920e9b1e6ac`, requirement revision 1. Its output is 1 passed, 0 failed. The commit is the recorded HEAD; the content fingerprint also identifies the uncommitted repair. |
| 4 | `ui/lib/result.ts` uses `provenBy` and explicit criterion gaps. Uncovered criteria and missing coverage remain review items. | Behavior coverage checks changed criteria, explicit manual-review gaps and absent coverage. The actual subsequent directive adds c2 at revision 2 without proof for it. No claim is made that the second repair was delivered. |
| 5 | The result labels project-total elapsed time through the last update and cost. Missing usage gets a visible lower-bound label. | Repair screenshot and saved budget show $0 from the local stub, `incomplete: true`, and the visible incomplete-accounting explanation. This is project lifetime accounting, not a guessed per-result share. |
| 6 | Open-result navigation uses `openSeroApp`; request changes/continue focuses the existing composer. Submission retains `actions.directive` and, when eligible, the existing OpenSpec request action. | Real app opened the result, returned to the board, focused the composer and sent the subsequent directive. Component coverage proves focus does not submit a request and preserves the target workspace. |
| 7 | `evidenceProblem` checks missing/failed/stale evidence, pending checks, missing commit and `supersededBy`. `resultNeedsReview` also requires accepted evidence and criterion coverage. `boardOf` removes the successful completion presentation when those facts are absent. Saved receipts and screenshots remain historical. | `result.test.ts` covers missing, stale, failed, unknown-revision, reported-only, changed-criterion and missing-coverage records. Existing preview-unavailable test passes. No receipt was revalidated and no new engine claim is made about live destination availability. |
| 8 | `apps/desktop/e2e/architect-result.workflow.spec.ts` drives the real app, host grant, owner tools, write tool, verification service, record storage, renderer and directive action with a local scripted provider. | The repair was checked and delivered, its Result rendered and opened, then the new request and owner acknowledgement persisted and the working revision advanced 1 → 2. See `observations.json` and [subsequent request state](03-change-request-recorded.png). The overall test failed at an extra second-delivery assertion, described below. |

## One app pass, preserved failure

Exactly one Electron run executed, with zero retries and no paid provider calls.
The first repair's saved evidence and delivery are real runtime records. The
subsequent request was sent at `2026-10-27T19:07:16.201Z`, acknowledged at
`19:07:16.238Z`, and added criterion c2 at revision 2.

The test then incorrectly addressed `m2`. The runtime had added a maintenance
entry and correctly assigned the new milestone `m3`. The script's begin/report/
evidence calls therefore failed; its extra assertion for second delivery timed
out after 120 seconds. The full scenario ended **FAILED** after 2.2 minutes.
Second delivery is **UNPROVED**, and is not part of criterion 8's subsequent
change-request requirement.

The fixture now reads the change milestone's actual recorded identity. Its
assertions end at the requested change and acknowledgement, rather than adding
second delivery as a release requirement. It was **not rerun**. `stages.json`
retains only the checkpoints completed by the original run. The final screenshot
was copied from that same run, not recaptured.

This pass also observed #630's repaired project launch, host-request answer,
real small repair delivery and subsequent directive. It does not establish
#630's Room-result navigation or pause/restart scenario; those remain unproved.

## Validation

All pnpm commands used `PATH="/private/tmp/sero-v1-tools/bin:$PATH"`.
Logs are in `/private/tmp/sero-v1-tools/631-logs/`.

| Command | Result / log |
| --- | --- |
| `node scripts/check-repository-layout.mjs`, `git diff --check` | Passed. |
| `pnpm --dir plugins/sero-architect-plugin test` | 882 passed, 1 failed across 81 files. Existing no-preview contract caught a screenshot control that bypassed availability. `architect-tests.log`. |
| `pnpm --dir plugins/sero-architect-plugin exec vitest run ui/__tests__/project-controls.test.tsx ui/__tests__/result.test.ts ui/__tests__/board.test.ts` | After fixing preview availability: 63/63 passed. `fix-tests.log`. No second full suite. |
| `pnpm typecheck` | Final tree: 29/29 tasks passed. `typecheck-final.log`. |
| `npx react-doctor@latest --verbose --scope changed` | 100/100, no issues. `react-doctor-final.log`. |
| `pnpm --dir plugins/sero-architect-plugin build` | Passed. `architect-build-final.log`. |
| `pnpm --dir apps/desktop build` and final `build:electron` staging | Passed. `desktop-build.log`, `desktop-stage-final.log`. Existing bundle-size warnings only. |
| `SERO_E2E_RUNTIME=host SERO_E2E_LLM_MODE=off SERO_TOOL_CHECK_KEEP_HOME=1 pnpm --dir apps/desktop exec playwright test e2e/architect-result.workflow.spec.ts --project=workflow --retries=0 --workers=1` | One failed pass with the observed milestones above. `app-scenario.log`, `app.log`, complete before/after records and final screenshot. |

The guide update is `apps/docs-site/docs/guide/architect.md`. No dependency,
lockfile, npm version, source contract or runtime engine change is included.
Touched production LOC: `ProjectPage.tsx` 483, `board.ts` 254, `result.ts` 51,
`Board.tsx` 177, `BoardResult.tsx` 85, `Evidence.tsx` 104. CSS and tests are exempt.
