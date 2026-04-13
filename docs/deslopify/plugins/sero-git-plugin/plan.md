# Refactoring Plan — plugins/sero-git-plugin

_Plan drafted: 2026-04-13_

## Executive Summary
`plugins/sero-git-plugin/` is structurally solid as a Sero plugin: the manifest is clean, AD-020 tool registration is correct, the remote build uses `base: './'`, and the extension/service tests cover a lot of the Git parsing surface. The debt is in runtime truthfulness around the host-integrated bridge. The Git action contract is duplicated and already drifting across app-runtime/preload/UI layers, state-file reads fail open in a way that can silently overwrite real snapshots, and two read-only tool actions answer from cached JSON instead of the repository itself. The right outcome is a canonical shared bridge contract, fail-loud state I/O, live query semantics that still work in Pi CLI, and smaller/tested modules before the plugin grows past the 500-LOC guardrail.

## Issues Found (prioritized)
- **High** — Git action contract drift across the UI/preload/IPC stack — the plugin’s canonical request type in `plugins/sero-git-plugin/shared/types.ts:119-129` includes `worktreePath` and `force`, and the UI really uses them in `plugins/sero-git-plugin/ui/components/BranchPanel.tsx:91-99`, but the mirrored bridge types in `packages/app-runtime/src/sero-bridge.ts:28-45` and `apps/desktop/src/types/electron-apps.d.ts:91-100` omit both fields. The preload layer then erases the result type entirely in `apps/desktop/electron/preload/apps/app-domain.ts:95-97`, forcing the UI to re-declare and cast it in `plugins/sero-git-plugin/ui/GitApp.tsx:34-37,85-86`. This violates Sero’s “update all four layers together” rule for cross-process contracts and hides breakage in one of the most host-integrated plugins. Effort: **M**.
- **High** — State-file reads fail open and can silently replace a real snapshot with defaults — `plugins/sero-git-plugin/extension/state-io.ts:17-23` returns `createDefaultGitState()` on every read or parse failure. Mutation-adjacent paths then consume that fallback and write it back out (`plugins/sero-git-plugin/extension/git-service.ts:216-246,438-444`). A malformed or partially-written `.sero/apps/git/state.json` is therefore treated the same as “first run,” which is the exact silent-data-loss pattern the team has already been cleaning up in other plugins. Effort: **S**.
- **Medium** — `log` and `branches` are snapshot-backed, not repo-backed, so they can return stale or empty answers outside the watched desktop path — `plugins/sero-git-plugin/extension/git-service.ts:216-237` reads `.sero/apps/git/state.json` instead of refreshing or querying Git directly. In Sero desktop this is often masked by the watcher/poller in `apps/desktop/electron/features/apps/git-app/manager.ts:115-205`, but the package is also a Pi extension, and in Pi CLI the tool description says “list branches” / “recent commits,” not “read the last saved snapshot.” Effort: **S**.
- **Medium** — Core service/parsing modules are already near the 500-LOC cap and mix too many responsibilities — `plugins/sero-git-plugin/extension/git-service.ts:173-457` owns refresh policy, mutation orchestration, user-facing messages, and error shaping; `plugins/sero-git-plugin/extension/git-commands.ts:1-457` owns repo queries, diff parsing, untracked-file synthesis, hunk parsing, and ref parsing; `plugins/sero-git-plugin/ui/components/BranchPanel.tsx:26-421` mixes local/remote/stash sections, branch creation, destructive-action wiring, and date formatting. None violate the cap yet, but each is already expensive to review and one more feature wave will push them over the repo limit. Effort: **M**.
- **Medium** — The largest interactive UI paths still have no direct component coverage — `plugins/sero-git-plugin/vitest.config.ts:4-10` only includes `extension/**`, `shared/**`, and `ui/lib/**`. That leaves `plugins/sero-git-plugin/ui/GitApp.tsx:39-225`, `plugins/sero-git-plugin/ui/components/BranchPanel.tsx:26-421`, `plugins/sero-git-plugin/ui/components/CommitDetail.tsx:15-143`, and `plugins/sero-git-plugin/ui/components/StagingArea.tsx:13-121` untested even though they drive destructive actions, diff-request timing, stash confirmation, and notice/error behavior. Effort: **M**.
- **Low** — Small duplication seams are already appearing in low-level helpers and presentation constants — `plugins/sero-git-plugin/extension/git-default-branch.ts:1-39` bypasses the shared `git-exec.ts` helper with its own silent `execFileSync` wrapper, branch colors are defined in both `plugins/sero-git-plugin/shared/types.ts:214-228` and `plugins/sero-git-plugin/ui/lib/graph-layout.ts:31-35`, and relative-date formatting is duplicated between `plugins/sero-git-plugin/ui/components/BranchPanel.tsx:410-420` and `plugins/sero-git-plugin/ui/components/CommitGraph.tsx:269-287`. None are individually severe, but they are the kind of copy-paste drift that turns a clean plugin into an awkward one. Effort: **S**.

## Proposed Refactoring
1. **Make the Git action bridge contract canonical and shared.**
   - Promote the full UI↔host contract into the plugin’s shared layer: export both `GitManagerRequest` and a new shared `GitActionResult` (or similarly named) type from `plugins/sero-git-plugin/shared/types.ts`.
   - Update every consumer to import the same type instead of re-declaring it:
     - `packages/app-runtime/src/sero-bridge.ts`
     - `apps/desktop/src/types/electron-apps.d.ts`
     - `apps/desktop/electron/preload/apps/app-domain.ts`
     - `plugins/sero-git-plugin/ui/GitApp.tsx`
   - The preload bridge should return typed request/result values, not `unknown`, so the UI can stop casting.
   - This aligns with the repo’s IPC rule and with the “canonical shared contract” guidance used elsewhere in `@sero/common` / app-runtime.

2. **Harden state I/O so malformed files fail loudly and preserve data.**
   - Replace the current `readState()` catch-all with a split path:
     - missing file (`ENOENT`) → return `createDefaultGitState()`
     - malformed JSON / permission / short-read → throw a descriptive error that includes the file path
   - Add a narrow helper if needed, for example:
     - `readExistingState()` for mutation paths that must fail loud
     - `readStateOrDefault()` only for true first-run bootstrap
   - Ensure `diff`/`show_commit` do not overwrite a malformed snapshot with defaults.
   - Keep atomic writes exactly as they are; the fix is about truthful reads, not changing the write path.

3. **Make read-only query actions answer from the repository, not from cached JSON.**
   - `status` already does the right thing by refreshing first. Apply the same truthfulness rule to `log` and `branches`.
   - Preferred shape:
     - either call `refresh('auto')` and then render from the refreshed state
     - or derive the response directly from Git queries and treat the persisted state as UI cache only
   - Validate this path in both environments:
     - Sero desktop with watcher/poller
     - Pi CLI / extension-only usage where the state file is not being refreshed in the background
   - This is a semantic cleanup, not just a structural one, so keep it conservative.

4. **Split the near-cap modules before more Git features land.**
   - `extension/git-service.ts`
     - extract read/query actions (`status`, `log`, `branches`, `diff`, `show_commit`)
     - extract mutation actions (`stage`, `unstage`, `commit`, `stash`, `stash_apply`, `stash_pop`)
     - extract branch/worktree actions (`checkout`, `create_branch`, `delete_branch`, `remove_worktree`, `merge`, `cherry_pick`, `push`) and keep `runGitAction()` as a thin dispatcher
   - `extension/git-commands.ts`
     - split commit-log/ref parsing, status/stash parsing, and diff parsing into focused modules under `extension/parsers/` or `extension/queries/`
   - `ui/components/BranchPanel.tsx`
     - extract local branch list + create-branch form
     - extract remote groups section
     - extract stash section and confirmation logic
   - Keep public entrypoints stable so the Electron host does not need broad rewiring.

5. **Add direct UI and bridge-ownership tests.**
   - Extend the test surface beyond `ui/lib/**` so the actual interactive seams are protected.
   - Target coverage:
     - `GitApp` notice/error behavior when `gitApp` is unavailable or returns `{ ok: false }`
     - `BranchPanel` wiring for `force` / `worktreePath` actions
     - `CommitDetail` auto-stash confirmation flow
     - `StagingArea` commit gating and staged/unstaged action dispatch
   - Add at least one contract-focused test that fails if the shared bridge type loses `force`/`worktreePath` again.
   - If jsdom is needed, add it deliberately rather than forcing component behavior through node-only unit tests.

6. **Clean up the small duplication seams.**
   - Reuse the shared `git-exec.ts` wrapper inside `git-default-branch.ts` so Git command behavior is centralized.
   - Export one branch-color palette and one relative-date formatter from a shared UI utility module.
   - Keep these as follow-up cleanup after the contract/state-truthfulness work; do not bury the more important runtime fixes inside a broad cosmetic rewrite.

## Benefits & Trade-offs
- Benefits:
  - Restores one truthful Git action contract across React, app-runtime, preload, IPC, and host execution.
  - Prevents silent snapshot loss when `.sero/apps/git/state.json` is malformed.
  - Makes the plugin’s agent/tool behavior dependable outside the desktop watcher path.
  - Reduces review load on the heaviest service/UI files before they breach the 500-LOC cap.
  - Gives future Git features a safer place to land.
- Trade-offs:
  - The canonical-contract fix touches code outside the plugin folder, so review scope is wider than a purely local cleanup.
  - Failing loud on malformed state will surface errors users do not see today; that is the correct behavior, but the UX needs to be explicit.
  - Adding component tests likely means introducing a jsdom/browser-style test path for this package.

## Dependencies & Risks
- The bridge-contract cleanup depends on coordinated changes across the plugin, app-runtime, preload, and desktop type declarations. Land that as one pass; partial updates will just create a new form of drift.
- Hardening `readState()` is a runtime-sensitive behavioral change. The success path should remain identical, but malformed-file behavior will intentionally become noisier.
- Refreshing `log`/`branches` before rendering results changes tool semantics from “cached snapshot” to “current repo.” That is the right direction, but it should be verified in both desktop and Pi CLI usage so latency and messaging stay acceptable.
- Splitting `git-service.ts` / `git-commands.ts` must preserve success-path behavior for worktree deletion, upstream push fallback, stash apply/pop, and cherry-pick auto-stash.
- No Docker/container image rebuild is needed for this plan, but desktop verification should include container-backed workspaces because the host Git action bridge is used there too.

## Next Steps
1. Export a canonical shared Git action result type and replace the duplicated `SeroGitAppActionParams` / `SeroGitAppActionResult` copies plus the preload `unknown` bridge.
2. Harden `state-io.ts` so malformed JSON fails loud while missing files still bootstrap cleanly.
3. Change `log` and `branches` to refresh/query the repo instead of trusting the persisted snapshot.
4. Split `git-service.ts` first, then `git-commands.ts`, then `BranchPanel.tsx`.
5. Add direct UI/bridge tests before expanding the Git feature surface again.

Verification checklist:
- From the Git UI, force-delete branch and force-remove worktree actions still traverse the typed bridge end-to-end.
- A deliberately malformed `.sero/apps/git/state.json` now surfaces a recoverable error and is not silently replaced with defaults on the next diff/show-commit action.
- In Pi CLI or a minimal extension-only harness, `git_manager branches` and `git_manager log` reflect repo changes without requiring a manual `refresh` first.
- Desktop smoke test still covers refresh/fetch/pull/push, stash apply/pop, cherry-pick with auto-stash, and worktree removal on a real workspace.
