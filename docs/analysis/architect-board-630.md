# Architect board completion slice — #630

2026-10-27, based on `0167883af29dcaaaa43e5a1c4619f5c8769ad6b0`.

This is a bounded integration fix, not full acceptance of #630. The single permitted running-app pass failed before its first checkpoint. **Required running-app proof remains UNPROVED.** No paid model, second app pass, new task system, or result-summary/receipt changes were used.

## Requirement-to-evidence

Paths below are relative to the repository root. Passing unit coverage proves the stated seam, not the whole running experience.

| # | Outcome and current implementation | Evidence and limits |
| --- | --- | --- |
| 1 | Owner decisions remain on the existing board. `plugins/sero-architect-plugin/ui/components/BoardRequests.tsx` adds host requests; `BoardLinkedWork.tsx` reads existing child indexes for Room attention, Workflow questions, failures and progress. `shared/activity.ts` surfaces an expired unconsumed wait. | Architect suite: 865 passed, including board request and existing decision/wait coverage. Desktop attention: 7 passed. Real host/child blocking scenarios were not reached. Room native requests are represented by count and an exact Room link; the question is answered in the Room. |
| 2 | Host answers use existing `window.sero.userFeedback.answer` IPC. `packages/app-runtime/src/use-pending-questions.ts` and `apps/desktop/src/stores/user-feedback-store.ts` subscribe to answer/cancel events and hydrate pending requests. | Board request test hydrates, answers the request ID and removes the card on host cancellation. Producer bridge: 4 passed. Aggregate attention test clears when no request remains. Actual simultaneous board/aggregate resolution is **UNPROVED**. |
| 3 | Existing `ui/lib/board.ts` keeps Room research results under Made. New linked work shows Workflow totals/current step titles. `ui/lib/page-helpers.ts`, Orchestrator `ui/lib/orchestrator-navigation.ts`, and `AttemptHistory.tsx` carry and reveal the exact run ID. | Orchestrator navigation/history: 25 passed, including first mount preservation and an older run outside the first history page. App pass instead exposed an Architect launch remaining on its list. Architect's sibling navigation guard was fixed afterward; its delayed-ack test subsequently passed in the review-fix batch below. First-click running-app proof remains **UNPROVED**. |
| 4 | `runtime/research-room.ts` does not turn a project-owned pause into a stopped research failure. Existing saved reasons retain precedence; no restart relabeling is introduced. | Four new cases in `runtime/__tests__/reconcile.test.ts` passed: pause, user stop, owner failure and spend limit through persisted reconciliation. These exercise saved causes, not four real interrupted sessions. The planned real pause/restart was not reached. |
| 5 | Existing direct-work → evidence → delivery path remains intact in `runtime/owner-direct.ts`, `services.ts` and `delivery.ts`. Reports remain claims until evidence passes. | Reused accepted small-fix runs and their raw records from `openspec/changes/archive/2026-10-19-improve-architect-orchestrator-autonomy/evidence/results.md` (2026-10-19 pilot/replays). Current owner-direct/delivery tests passed in the Architect suite. Seven unrelated preview-server cases were sandbox-blocked; no new paid delivery experiment. |
| 6 | `apps/desktop/e2e/architect-board.workflow.spec.ts` uses the actual management tool, persistent-session grant request, answer IPC, owner decide tool and Room finish-room tool with a local scripted model, then relaunches the disposable profile. | **UNPROVED.** One run, zero retries, failed after 14.4 seconds waiting for `.bd-hero`. The app displayed the project list. No grant/question/result/restart checkpoints completed. See [failure screenshot](evidence/630/00-launch-failed.png). No rerun after the navigation fix. |
| 7 | Existing `runtime/owner-wait.ts`, `wait-reconciler.ts`, `shared/waits.ts` and `ui/lib/wait-status.ts` keep source IDs, observed outcomes, deadlines and explicit manual-resume fallback. Expired waits now also feed board/profile activity. | Existing process/CI/wait tests passed in the Architect suite. Reused live process and CI records in the archived autonomy evidence: `continuity-trial-2026-10-19b/` and `ci-wait-2026-10-19/`. The former records a 125-minute process exit; the latter records a commit-specific CI wait with a 40-minute deadline. No new long-running trial. |

## Existing profile aggregate and authority

The aggregate is `apps/desktop/src/stores/agent-board.ts` (`workspaceAttention`, `useWorkspaceAttention`), rendered by `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx` through its attention indicator. It reads the existing Architect, Workflow and Room indexes. Pending host feedback is added to this same aggregate.

`apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/question-origin.ts` derives display provenance from the host-bound app ID, workspace and grant owner. `host.ts` registers it only for a session the host created/opened; `live-sessions.ts` removes it. The feedback producer looks it up using the SDK session file. It does not accept a renderer-supplied project target to grant authority. Existing grant validation and amendment approvals remain in place. The common registry is display routing, not authorization.

The existing common feedback contract and preload answer/getPending/event handlers are reused. App-runtime exposes that canonical bridge to federated UI; no new IPC method or second queue is introduced.

## Validation record

All commands below used `PATH="/private/tmp/sero-v1-tools/bin:$PATH"` to select verified native pnpm 12.5.1. The machine's default pnpm was a Vite+ wrapper that attempted an install; parent restored a frozen install before checks. The lockfile is unchanged.

| Command | Result |
| --- | --- |
| `pnpm --filter @sero-ai/plugin-architect test` | 79 files passed, 1 failed; 865 tests passed, 7 failed. All failures are existing HTTP-preview tests unable to listen on 127.0.0.1 (`EPERM`); no suite rerun. |
| `pnpm --dir apps/desktop exec vitest run src/stores/agent-board-attention.test.ts` | 7 passed. |
| `pnpm --dir plugins/sero-orchestrator-plugin exec vitest run ui/__tests__/orchestrator-navigation.test.ts ui/__tests__/orchestrator-navigation-hook.test.tsx ui/__tests__/attempt-history.test.tsx` | 25 passed. |
| `pnpm --dir plugins/sero-user-feedback-plugin exec vitest run extension/__tests__/ipc-bridge.test.ts` | 4 passed. |
| `pnpm typecheck` | Initial run found a linked-work flatMap inference error; fixed. Second run passed 28/29 tasks and all production types, then found the E2E phase Map narrowed to one literal. Fixed with explicit Phase type. |
| Final `pnpm typecheck` on the complete source tree | Passed: 29/29 tasks. Required root compile gate is green; no test or runtime rerun. |
| `pnpm --dir apps/desktop typecheck:tests` | Passed after the Phase fix. Together with the root run, covers renderer/main production and test types. |
| `pnpm --filter @sero-ai/app-runtime --filter @sero-ai/plugin-architect --filter @sero-ai/plugin-orchestrator typecheck` | Passed after the post-runtime navigation/hydration fixes. |
| `pnpm --dir apps/desktop build`; affected Architect and Orchestrator plugin builds; `pnpm --dir apps/desktop build:electron` | Passed. Electron was restaged after the plugin UI builds. These precede the post-runtime navigation fix. |
| `npx react-doctor@latest --verbose --scope changed` | 92/100, two advisory performance warnings: returning lookup inside the attention loop, and hydration's post-await guard. Network-enabled run completed after sandbox DNS failure. Predates final navigation delta; no repeat scan. |
| `pnpm --dir apps/desktop exec playwright test e2e/architect-board.workflow.spec.ts --project=workflow --retries=0` | One failed app pass, described above. Disposable profile/local stub only. |
| `git diff --check` | Passed. |

Raw logs are retained locally at `docs/analysis/evidence/630/`: `architect-unit.log`, `attention-unit.log`, `navigation-unit.log`, `feedback-unit.log`, `typecheck.log`, `typecheck-fixed.log`, `typecheck-desktop-tests-fixed.log`, `typecheck-final-delta.log`, `typecheck-final-root.log`, `build.log`, `build-architect.log`, `build-orchestrator.log`, `restage-electron.log`, `react-doctor-network.log`, `runtime.log`, and `app.log`. Verbose generated logs are not committed. The failed wrapper log is `focused-architect.log`; dependency restoration is `/private/tmp/sero-v1-tools/install-630.log`.

## Scope and release impact

Published versions: `@sero-ai/common` 0.24.0 → 0.24.1; `@sero-ai/app-runtime` 0.8.0 → 0.8.1. No other publishable package changed. `apps/docs-site/docs/guide/architect.md` documents requests, linked work and saved stop reasons.

All changed production source files are at most 500 lines. Largest: persistent-session `host.ts` 488; Architect `ProjectPage.tsx` 488; common `index.ts` 456; persistent-session `wiring.ts` 413; feedback extension `index.ts` 407; aggregate `agent-board.ts` 396. The existing admin type exports moved unchanged to `packages/common/src/admin-exports.ts` to keep the common barrel below the limit.

Do not mark #630 complete on this evidence. The code slice can be reviewed independently, but acceptance 6 and the integrated portions of 1–4 still require successful running-app proof authorized separately.

## Changed production source inventory

| File | LOC |
| --- | ---: |
| `apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/amendment-runner.ts` | 62 |
| `apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/host.ts` | 488 |
| `apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/live-sessions.ts` | 262 |
| `apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/question-origin.ts` | 12 |
| `apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/wiring.ts` | 413 |
| `apps/desktop/src/stores/agent-board.ts` | 396 |
| `apps/desktop/src/stores/user-feedback-store.ts` | 193 |
| `packages/app-runtime/src/index.ts` | 58 |
| `packages/app-runtime/src/sero-bridge.ts` | 196 |
| `packages/app-runtime/src/use-pending-questions.ts` | 42 |
| `packages/common/src/admin-exports.ts` | 58 |
| `packages/common/src/index.ts` | 456 |
| `packages/common/src/user-feedback-origin.ts` | 21 |
| `plugins/sero-architect-plugin/runtime/research-room.ts` | 188 |
| `plugins/sero-architect-plugin/shared/activity.ts` | 391 |
| `plugins/sero-architect-plugin/ui/ProjectPage.tsx` | 488 |
| `plugins/sero-architect-plugin/ui/components/BoardLinkedWork.tsx` | 27 |
| `plugins/sero-architect-plugin/ui/components/BoardRequests.tsx` | 44 |
| `plugins/sero-architect-plugin/ui/lib/navigation.ts` | 109 |
| `plugins/sero-architect-plugin/ui/lib/page-helpers.ts` | 79 |
| `plugins/sero-architect-plugin/ui/lib/use-linked-indexes.ts` | 25 |
| `plugins/sero-architect-plugin/ui/lib/view-model.ts` | 277 |
| `plugins/sero-architect-plugin/ui/lib/work-groups.ts` | 52 |
| `plugins/sero-orchestrator-plugin/ui/OrchestratorRoutes.tsx` | 180 |
| `plugins/sero-orchestrator-plugin/ui/components/AttemptHistory.tsx` | 147 |
| `plugins/sero-orchestrator-plugin/ui/components/LoopDetail.tsx` | 274 |
| `plugins/sero-orchestrator-plugin/ui/components/WorkflowPage.tsx` | 55 |
| `plugins/sero-orchestrator-plugin/ui/lib/orchestrator-navigation.ts` | 180 |
| `plugins/sero-user-feedback-plugin/extension/index.ts` | 407 |
| `plugins/sero-user-feedback-plugin/extension/interview-tool.ts` | 186 |
| `plugins/sero-user-feedback-plugin/extension/ipc-bridge.ts` | 90 |
| `plugins/sero-user-feedback-plugin/extension/permission-gate.ts` | 256 |

## Review round 1 fixes

Both P2 findings are fixed in a bounded follow-up; this does not replace the failed running-app proof above.

- **Same-route navigation:** Architect and Orchestrator only retain a pending route when it differs from the host's acknowledged view. Selecting the current route leaves shell Back/Forward usable. Different-route launch requests still wait for acknowledgement. Both hooks have functional same-route/history coverage; delayed acknowledgement coverage also passes.
- **Obsolete expired waits:** activity and wait cards reuse the wait engine's existing control-revision predicate, now exported as `isCurrentWait`. Current card selection also excludes obsolete open/consumed waits. The engine's registration, cancellation, waking policy, historical outcomes, counts and timing remain unchanged. The pause → deadline → stop → resume case proves that a current expiry still produces attention, while the invalidated expiry permits Working, clears aggregate attention and removes the On hold card without deleting history.

One focused batch ran after all fixes, using the same native pnpm PATH prefix:

| Command | Result |
| --- | --- |
| `pnpm --dir plugins/sero-architect-plugin exec vitest run ui/__tests__/navigation-launch.test.tsx ui/__tests__/wait-status.test.ts shared/__tests__/activity.test.ts shared/__tests__/waits.test.ts` | 4 files, 58 tests passed. |
| `pnpm --dir plugins/sero-orchestrator-plugin exec vitest run ui/__tests__/orchestrator-navigation-hook.test.tsx` | 1 file, 3 tests passed. |
| `pnpm typecheck` | 29/29 tasks passed; 27 cached. |
| `git diff --check` | Passed. |

Logs: `docs/analysis/evidence/630/review1-architect.log`, `review1-orchestrator.log`, and `review1-typecheck.log`. No app scenario, paid model or full package suite was rerun.

This follow-up touches five production files, three test files and this report. Production LOC: Architect `shared/activity.ts` 392, `shared/waits.ts` 243, `ui/lib/navigation.ts` 109, `ui/lib/wait-status.ts` 132; Orchestrator `ui/lib/orchestrator-navigation.ts` 180. Only private plugins changed; no additional published-package bump or end-user documentation change is needed.

React Doctor was also rerun for the React hook changes: `npx react-doctor@latest --verbose --scope changed` reported **69/100**, the two previous performance advisories, and `effect-needs-cleanup` on unchanged `ui/lib/use-linked-indexes.ts:8`. The effect explicitly returns cleanup at line 22, calling `off()` and `unwatch()` for both paths; inspection identifies this as a scanner false positive, not a missing cleanup introduced by the review delta. No suppression or unrelated source refactor was added. Raw output: `review1-react-doctor-network.log`; the initial offline attempt could not find cached package metadata (`review1-react-doctor.log`).
