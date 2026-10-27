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
