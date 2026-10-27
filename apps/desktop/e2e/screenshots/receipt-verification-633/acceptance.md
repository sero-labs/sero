# Receipt verification acceptance — issue 633

This is deterministic runtime evidence, not a live desktop or external-delivery
acceptance claim. Base: `587cc7e3bcae981a28b1299fa81ca335e012d9e2`.

| Requirement | Evidence | Result |
| --- | --- | --- |
| Failed/unavailable observation is unknown | Receipt observation tests exercise command failure and legacy missing binding | Pass |
| Full repository and PR identity | Stubbed read-only GitHub CLI replies exercise another repository with the same number and a different returned PR | Pass |
| Delivered PR revision | Workspace Git SHA and observed PR head must both match the receipt | Pass |
| Current invocation and plan | Old run and plan receipts are rejected; legacy records stay unverified | Pass |
| Intended artifact | Disposable real files cover declared path, content digest, old modification time and escaping symlink | Pass |
| Host/container paths | One real file verifies through both host-absolute and runtime-absolute references in a mapped worktree | Pass |
| Tool provisioning | Host resolves shared Node/Git/gh; container keeps runtime tools; file observation works with empty PATH using resolved Node | Pass |
| Uncertain outcome before retry | Engine test preserves candidate, blocks recovery and later completes by observation with one executor call total | Pass |
| Honest history | Receipt display differentiates runtime-verified and legacy/unverified receipts | Pass |

## Checks

All pnpm commands used `PATH="/private/tmp/sero-v1-tools/bin:$PATH"`, including
nested scripts. Raw logs are in `/private/tmp/sero-v1-tools/633-logs/`.

- Initial focused receipt checks: 39 passed.
- Affected Orchestrator package suite, run once: 1,851 passed, one skipped,
  five failures in existing filesystem-watcher/loopback tests under sandbox.
- Elevated rerun of that file plus receipt checks: 47 passed. No source fix was
  needed for the local-adapter failures.
- Provisioning and receipt focused checks after the prerequisite correction:
  41 passed.
- Final absolute-path mapping and tool checks: five passed.
- Final path-only rerun after correcting a readonly test-fixture assignment:
  four passed.
- Root `pnpm typecheck`: passed, including desktop renderer and Electron tests.
  An intermediate run caught that readonly fixture assignment; the fixture now
  receives its host root at construction.
- `git diff --check`: passed.

No model calls, live GitHub writes, package installs, or app session were used.
GitHub observation behavior uses a disposable executable stub; file checks run
the actual observation script against disposable files. No new UI interaction
was introduced: existing retry, destination-review and hold controls are reused.

The live runtime/external acceptance gaps recorded for issues 630 and 632 remain
open. These checks do not establish live provider delivery, real authenticated
GitHub access, or a fresh-machine download. No public package/API changed; the
new provisioning seam is private to Orchestrator. Changed source files remain
at or below 500 lines (largest: `shared/types.ts`, 499).

## Formal review round 1 delta

Round 1 found two P2 reconciliation defects: changing delivery to workspace
files could accept an old held receipt without verification, and a concurrent
user edit during observation could be overwritten by a stale loop snapshot.

Held candidates now record their destination and parameters. Acceptance requires
the same current receipt requirement; missing legacy binding stays held for
review. Destination changes still retain the candidate and require destination
review before another write, including previously unapproved external sends.

Reconciliation and review-question persistence compare the current run,
candidate, plan, delivery, approvals and stopping state inside the serialized
store update. Completion is applied to that latest state, preserving its
accounting. A concurrent change refuses the stale action without accepting a
receipt, clearing the newer hold, or starting another worker.

Focused delta checks: 77 passed across `receipt-reconciliation`,
`external-review`, `approval-gate`, `delivery-contract` and `coordinator-core`.
Cases include a destination switch for PR and unapproved webhook candidates,
changed report parameters, and deferred observation racing with disable or a
delivery edit. Existing successful re-observation still runs the worker once.
All five direct recovery callers use the same guarded review seam.

Root typecheck and `git diff --check` passed after these fixes. Logs:
`r1-focused.log` and `r1-typecheck.log` in the log directory above. No full
package, app, paid-provider or live-external run was repeated. The earlier
package sandbox result and the open 630/632 acceptance gaps remain unchanged.
