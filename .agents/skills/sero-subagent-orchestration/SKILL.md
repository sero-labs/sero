---
name: sero-subagent-orchestration
description: Orchestrate parallel implementation and fresh validation agents safely in the Sero repository. Use when a task asks for pi-subagents, parallel workers, isolated worktrees, review-and-fix loops, or several independent fixes that must be integrated and reviewed without Claude Code.
---

# Sero Subagent Orchestration

Use the `pi-subagents` skill as the canonical API guide. Apply this project workflow for reliable Sero implementation.

## 1. Preflight one worker

Do not launch the full fleet first.

1. Call `subagent({ action: "list", capabilities: true })`. Use only an executable, non-disabled agent, and read the tool list it resolves to.
2. Call `subagent({ action: "models" })` and select an exact model ID from the active registry.
3. Run one read-only smoke task with the exact agent, model, context, **launch mode**, and tools planned for the real job. The mode is part of the contract: an agent whose allowlist names extension tools fails a foreground launch before it starts, so smoke-test it the way it will actually run.
4. Require the smoke task to do the job's **hardest** step, not its easiest. A writer must read a file, run a shell command such as `git status`, read one target source symbol, and apply a patch. A read-only reviewer must read a Markdown file and read a whole source file. Reading one TypeScript symbol alone proves almost nothing — it is the one thing a symbol reader can do without a shell.
5. Start the real work only after the smoke task proves every capability the job needs.

An agent can start successfully and still be unable to do the job. A configured model can also differ from the model shown by inherited defaults. Test both.

### A tool name is not a capability

`tools` is a strict allowlist. **An allowlisted name does not load the extension that registers it** (`pi-subagents` `docs/agents.md:440`). A child listed with `exec` has a tool called `exec` only if something also loads the provider that registers it; otherwise the name resolves to nothing usable and the child runs with supervisor contact and little else.

**An allowlisted name that is not registered also fails the step.** One review round was lost to this: several agents named a diagnostics tool that `pi-lens` does not register at all — the name appeared in pi-lens's own comments but never in its tool registry (`dist/clients/tool-config.js:39`), and the correct name sat beside it on the same line. A name that is merely *discussed* somewhere is not a name you can allowlist.

Copy every `tools` entry from the resolved list — `subagent({ action: "list", capabilities: true })` — never from prose, a README, or a comment, and spell it exactly. Guessing a plausible tool name is the failure mode, so do not carry a wrong name into a definition or into a task prompt either.

A step rejected this way is reported as **failed with exit code 1 even when the child ran and produced a correct report**. Read the error before discarding the output: the work may be good and only the allowlist wrong.

Check every name in the allowlist against `subagent({ action: "list", capabilities: true })` — its resolved list is the authority, not the prose in an extension's README or comments.

A sandboxed tool can also exist but come up empty. Observed in this repository: an agent whose own prompt told it to use `exec` for `tools.exec_command` reported `exec is restricted JS (Deno undefined, tools {}, ALL_TOOLS [])`. The tool was present and its capability object was not. An agent that depends on it cannot read files, run `git`, or run tests.

### Where a child's extension tools come from

| The child is | Ambient extensions | What reaches it |
| --- | --- | --- |
| Foreground (`async: false`) | never loaded | only extensions named in `extensions`, `subagentOnlyExtensions`, or a path-like `tools` entry |
| Background (`async: true`) | loaded | ambient extensions, unless `extensions` is set — an explicit `extensions` disables normal discovery |

Foreground children never load the parent's ambient extensions, because they share the parent process and would start a second copy of every ambient extension (`docs/agents.md:442`, `docs/extension-api.md:413`). MCP tools and provider-extension models therefore require `async: true`.

To make a named extension tool work in a child, load its provider **as well as** naming the tool:

```yaml
tools: read, fixture_search
subagentOnlyExtensions: ./tools/fixture-search.ts
```

A path-like `tools` entry or `extensions` also loads a provider (`docs/agents.md:459`).

### Match the launch mode to the allowlist

A strict allowlist is resolved **before the child starts**, so the launch mode decides which of its names can resolve. Foreground children never load ambient extensions:

```text
Agent '<name>' ran as a foreground child, which never loads the parent's ambient
  extensions, and these child tools were unavailable: exec, lens_diagnostics, ...
The `tools` field is a strict allowlist; it does not load extension code.
```

So an agent whose allowlist names extension tools **cannot be smoke-tested in the foreground at all**, and cannot be launched foreground for real work either. It must run as a background child (`async: true`); or have the provider loaded through `extensions`, `subagentOnlyExtensions`, or a path-like `tools` entry; or stop naming tools the job does not need.

Adding native builtins does **not** rescue a foreground launch while extension names remain in the allowlist. Builtins fix a child that would otherwise run without an extension; they do not fix one that cannot start.

### Prefer builtins for the work

`read`, `bash`, `grep`, `find` and `ls` are Pi builtins and need no extension wiring. `tools: "inherit"` receives Pi's normal builtins too (`docs/agents.md:454`).

Give every agent a native fallback for the work it must do, so a missing extension degrades the run instead of ending it. The Sero agents in `~/.agents/` are the worked example: four of them listed no native tools at all, so with the extension absent they had no way to read a file — no `read`, so no Markdown and no whole source file; no `bash`, so no diff and no test run. `sero-test-value-reviewer` already carried `read, bash` and was the one that worked. All five now carry the builtins they need, and because they still name extension tools they must still run as **background** children.

A read-only reviewer is deliberately given `read, grep, find, ls` and **not** `bash`, matching the builtin `reviewer` role: it must read source and the rules unaided, while the parent keeps the mutation risk and runs the suites.

### Fit the agent to the job

Agents are configuration, not fixtures. **Edit or create one for the job.** Run `subagent({ action: "guide", topic: "management-authoring-rpc" })` for the management actions. Before launching, check the definition against the job:

- `tools` — does every name have a provider loaded, and is there a native fallback for the job's core work?
- `extensions` / `subagentOnlyExtensions` — is the provider actually loaded?
- `inheritProjectContext: false` with `inheritSkills: false` strips `AGENTS.md` and the `.agents/skills/*` catalogue (`docs/agents.md:276-279`). A child with both false cannot read the review skill or the repository rules, so **the task must inline them**, or set the flags true.
- `systemPromptMode: replace` means the child does not receive Pi's base prompt.
- The agent's own prompt may forbid what the job needs. `sero-fresh-reviewer` and `sero-fix-worker` both say "do not comment on GitHub", while `sero-code-review` requires each round to be posted. The orchestrator posts it, or the child is not asked to.

If the model fails, pass an exact model ID returned by the active registry. If tools fail, correct the agent or create a purpose-made one, then re-run the smoke test before spending a real job on it. Run `list` again after any agent change. Do not use the `claude-code` agent.

### Do not press on with a crippled child

A child that stalls asking for things it cannot fetch is an infrastructure problem, not a research task for the orchestrator. Stop at the first signal, report the exact failure, and fix the capability or replace the agent. Fetching diffs and file contents by hand for a child that has no shell is the orchestrator doing the child's job and paying for both.

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

For an implementation request, supervise workers through integration and
validation unless the user explicitly requests background launch only. Handle
pending supervisor requests before waiting. Use the available wait mechanism
rather than polling. This does not grant additional push, publish, release,
or PR authority.

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

A reviewer earns "independent" only if it can do the job unaided. Check its resolved tool list before launch (§1): it must be able to read the Markdown rules it is asked to apply and read whole source files. A reviewer that can only read symbols stalls asking the parent for `AGENTS.md`, the review skill, the diff and the file list, and the parent ends up doing the child's job and paying for both. Running the suites may stay with the parent — read-only reviewers have no shell — but then the round must state that the checks were the parent's.

Reconcile all reports in the parent. If a real blocker remains, use one fix worker, integrate it, and repeat with new fresh context. Use a bounded review loop, normally three rounds. Stop when no correctness, data-loss, or security blocker remains. Treat transient aggregate-test failures as evidence to investigate: rerun the affected package and exact test, then report the result without hiding the unstable aggregate run.

## 6. Report and update the PR

Follow the `sero-code-review` skill. Give a green or red code verdict, list the status of every earlier finding, state exact validation, and separate non-code merge blockers. Post the result as a new PR review comment with:

```bash
gh pr comment <pr> --body-file <file>
```

The **orchestrator posts**, because the Sero worker and reviewer agents are configured to refuse GitHub comments. If a round's inputs were supplied by the parent, or the checks were run by the parent rather than the child, say so in the comment. A review that reads as independent when it was not is worse than one that names its limits.

Post a new comment for each review round so PR watchers receive the update and the review history stays visible. Use `--edit-last` only to correct the current round's comment. Push the validated integrated commits before posting so the PR head matches the reviewed SHA. Confirm the remote head, draft checks, and clean local status. Keep the PR a draft unless the user explicitly asks otherwise.
