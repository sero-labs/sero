---
name: sero-subagent-orchestration
description: Orchestrate parallel implementation and fresh validation agents safely in the Sero repository. Use when a task asks for pi-subagents, parallel workers, isolated worktrees, review-and-fix loops, or several independent fixes that must be integrated and reviewed without Claude Code.
---

# Sero Subagent Orchestration

Use the `pi-subagents` skill as the canonical API guide. Apply this project workflow for reliable Sero implementation.

## 1. Preflight one worker

Do not launch the full fleet first.

1. Call `subagent({ action: "list" })`. Use only an executable, non-disabled agent.
2. Call `subagent({ action: "models" })` and select an exact model ID from the active registry.
3. Run one read-only smoke task with the exact agent, model, context, and tools planned for implementation.
4. Require the smoke task to read `AGENTS.md`, inspect `git status`, and read one target source symbol.
5. Start implementation only after the smoke task proves repository tools work.

An agent can start successfully but still have no repository tools. A configured model can also differ from the model shown by inherited defaults. Test both. Custom agent tool lists are strict: legacy tool names can leave the child with only supervisor contact. Include the current repository execution tool, such as `exec`, in the allowlist.

If the model fails, pass an exact model ID returned by the active registry. If tools fail, use a project worker whose strict allowlist includes `exec` and the required diagnostic tools. Run `list` and repeat the smoke test after any agent change. Do not use the `claude-code` agent.

## 2. Design independent lanes

Group findings by source seam, not by issue number. Two lanes must not edit the same production file. Give each lane:

- a distinct goal and source seam;
- exact evidence and acceptance criteria;
- authority limits: no push, merge, PR comment, publish, or release;
- functional regression tests and focused validation;
- the Sero 500 LOC check;
- a required Conventional Commit and commit SHA report.

Use `context: "fresh"` and `worktree: true` for every parallel writer. Keep one writer in each worktree. Use stable `runs.all` keys and an async workflow. Do not edit the parent worktree while writers run.

Keep producer and consumer changes in one lane when they form one runtime contract. A fix is incomplete if planning or approval accepts data that the final runtime cannot load or enforce.

## 3. Run and supervise

Use one `workflowScript` for the implementation wave:

```javascript
const results = await runs.all([
  {
    key: "validation",
    agent: "sero-fix-worker",
    model: "<verified-model-id>",
    context: "fresh",
    worktree: true,
    task: "Implement the validation lane, test it, commit it, and report the SHA."
  },
  {
    key: "lifecycle",
    agent: "sero-fix-worker",
    model: "<verified-model-id>",
    context: "fresh",
    worktree: true,
    task: "Implement the lifecycle lane, test it, commit it, and report the SHA."
  }
]);
return results.map(({ key, runId, output, handoff }) => ({ key, runId, output, handoff }));
```

Use `subagent_wait` only when the user asked for run-to-completion. Reply to supervisor requests before waiting. Never poll with sleep or repeated status calls.

If a supervisor request needs a product, authority, or security decision:

1. Pause the writer.
2. Explain the affected user-facing object in plain language before asking for a choice.
3. Record the user's exact decision.
4. Resume the same retained session. Do not launch a replacement while the original child can still be live.

If a detached child needs attention but no pending request is available, interrupt it to a safe paused state, then resume that retained run with the decision. Preserve its worktree and session instead of starting a second writer.

## 4. Integrate through the parent

Inspect each handoff and commit before integration. Cherry-pick commits one at a time into the clean parent branch. Resolve overlap centrally, then run:

- proactive diagnostics on touched files;
- focused tests for every fault class;
- root `pnpm typecheck`;
- touched source file line counts;
- React Doctor when React files changed;
- documentation and prototype checks required by `AGENTS.md`.

Run the full affected package suite after focused tests. It catches stale assertions that isolated fix tests can miss. Recheck the complete touched-file list after integration because a one-line edit can make an existing file exceed 500 LOC.

Managed worktrees can have incomplete dependency links. Do not run concurrent installs that mutate shared `node_modules`. Use the existing frozen repository install where possible. If the parent links are damaged, restore them once after all writers stop with the frozen lockfile, confirm no lockfile change, then rerun validation in the parent.

Check whether the integrated range changes `packages/*`. Record the npm republish requirement even when the last fix commit did not touch that package.

Do not push until integrated validation is green.

## 5. Validate with fresh reviewers

Launch a new read-only `runs.all` wave after integration. Use distinct angles:

- correctness, races, and security boundaries;
- regression tests, failure injection, and fault-class sweeps;
- simplicity, Sero constraints, docs, and file size.

Reviewers must read the integrated parent HEAD and exact base range, not a worker branch. Give file and line evidence and make no edits. Assign at least one reviewer to trace end-to-end contracts from discovery or planning through approval, persistence, and final runtime use. Tests of only the first half of a contract are not sufficient.

Reconcile all reports in the parent. If a real blocker remains, use one fix worker, integrate it, and repeat with new fresh context. Use a bounded review loop, normally three rounds. Stop when no correctness, data-loss, or security blocker remains. Treat transient aggregate-test failures as evidence to investigate: rerun the affected package and exact test, then report the result without hiding the unstable aggregate run.

## 6. Report and update the PR

Follow the `sero-code-review` skill. Give a green or red code verdict, list the status of every earlier finding, state exact validation, and separate non-code merge blockers. Post the result as a new PR review comment with:

```bash
gh pr comment <pr> --body-file <file>
```

Post a new comment for each review round so PR watchers receive the update and the review history stays visible. Use `--edit-last` only to correct the current round's comment. Push the validated integrated commits before posting so the PR head matches the reviewed SHA. Confirm the remote head, draft checks, and clean local status. Keep the PR a draft unless the user explicitly asks otherwise.
