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

An agent can start successfully but still have no repository tools. A configured model can also differ from the model shown by inherited defaults. Test both.

If the model fails, pass a verified exact model such as `openai-codex/gpt-5.6-sol`. If tools fail, use a project worker whose strict allowlist includes `exec` and the required diagnostic tools. Run `list` and repeat the smoke test after any agent change. Do not use the `claude-code` agent.

## 2. Design independent lanes

Group findings by source seam, not by issue number. Two lanes must not edit the same production file. Give each lane:

- a distinct goal and source seam;
- exact evidence and acceptance criteria;
- authority limits: no push, merge, PR comment, publish, or release;
- functional regression tests and focused validation;
- the Sero 500 LOC check;
- a required Conventional Commit and commit SHA report.

Use `context: "fresh"` and `worktree: true` for every parallel writer. Keep one writer in each worktree. Use stable `runs.all` keys and an async workflow. Do not edit the parent worktree while writers run.

## 3. Run and supervise

Use one `workflowScript` for the implementation wave:

```javascript
const results = await runs.all([
  {
    key: "validation",
    agent: "sero-fix-worker",
    model: "openai-codex/gpt-5.6-sol",
    context: "fresh",
    worktree: true,
    task: "Implement the validation lane, test it, commit it, and report the SHA."
  },
  {
    key: "lifecycle",
    agent: "sero-fix-worker",
    model: "openai-codex/gpt-5.6-sol",
    context: "fresh",
    worktree: true,
    task: "Implement the lifecycle lane, test it, commit it, and report the SHA."
  }
]);
return results.map(({ key, runId, output, handoff }) => ({ key, runId, output, handoff }));
```

Use `subagent_wait` only when the user asked for run-to-completion. Reply to supervisor requests before waiting. Never poll with sleep or repeated status calls.

## 4. Integrate through the parent

Inspect each handoff and commit before integration. Cherry-pick commits one at a time into the clean parent branch. Resolve overlap centrally, then run:

- proactive diagnostics on touched files;
- focused tests for every fault class;
- root `pnpm typecheck`;
- touched source file line counts;
- React Doctor when React files changed;
- documentation and prototype checks required by `AGENTS.md`.

Do not push until integrated validation is green.

## 5. Validate with fresh reviewers

Launch a new read-only `runs.all` wave after integration. Use distinct angles:

- correctness, races, and security boundaries;
- regression tests, failure injection, and fault-class sweeps;
- simplicity, Sero constraints, docs, and file size.

Reviewers must read the integrated diff and source, give file and line evidence, and make no edits. Reconcile all reports in the parent. If a real blocker remains, use one fix worker, then repeat a fresh review wave. Stop when no correctness, data-loss, or security blocker remains.

## 6. Report and update the PR

Follow the `sero-code-review` skill. Give a green or red code verdict, list the status of every earlier finding, state exact validation, and separate non-code merge blockers. Update one existing PR review comment with:

```bash
gh pr comment <pr> --edit-last --create-if-none --body-file <file>
```

Never stack review comments. Keep the PR a draft unless the user explicitly asks otherwise.
