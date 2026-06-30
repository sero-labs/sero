# Agent Issue Loops, Worktrees, and Jujutsu

## Why This Discussion Matters

When an agent is asked to monitor GitHub issues and implement them automatically, the obvious but dangerous implementation is:

```text
for each issue:
  create a branch from main
  implement the issue
  open a pull request
```

That sounds simple, but it quickly creates a merge and review nightmare.

If there are 10 open issues, the agent could create 10 independent pull requests from the same base branch:

```text
main
├─ PR-1: issue 101
├─ PR-2: issue 102
├─ PR-3: issue 103
├─ PR-4: issue 104
├─ PR-5: issue 105
...
```

This is risky because the pull requests may overlap. They may touch the same files, shared types, routes, tests, package versions, migrations, configuration, or generated files.

The result can be:

```text
merge conflicts
stale branches
duplicated work
failing CI
broken dependency order
review confusion
too many low-quality pull requests
```

The goal of this discussion is to design a safer loop.

The agent should not optimise for opening as many pull requests as possible. It should optimise for producing clean, reviewable, dependency-aware changes that can be merged safely.

A better mental model is:

```text
issues are a work queue, not independent jobs
```

The loop should therefore include planning, classification, dependency analysis, isolation, validation, and careful publishing.

## Core Problem

The core problem is not that the agent can create pull requests. The problem is that it may create pull requests with the wrong shape.

Bad shape:

```text
10 issues
→ 10 branches from main
→ 10 pull requests
→ conflicts and stale work
```

Better shape:

```text
10 issues
→ classify and group
→ create isolated workspaces
→ batch related work
→ stack dependent work
→ create fewer, cleaner pull requests
```

The agent should decide whether each issue is:

```text
independent
related to another issue
dependent on another issue
overlapping
duplicate
blocked
too broad
unclear
```

Only after that should it implement anything.

## The Basic Safe Loop

A safer issue implementation loop looks like this:

```text
discover issues
→ classify issues
→ detect dependencies and overlap
→ choose execution strategy
→ create isolated workspace
→ implement focused changes
→ validate
→ publish as PR, stack, batch, or blocked report
→ repeat
```

A more detailed version:

```text
1. Fetch candidate issues.
2. Filter to issues labelled "ready" or "agent-ready".
3. Fetch existing open agent-authored pull requests.
4. Build an overlap map based on files, directories, modules, labels, and issue text.
5. Classify issues as independent, related, dependent, blocked, or unclear.
6. Choose the safest implementation strategy:
   - serial PR
   - batch PR
   - stacked PRs
   - parallel PRs
   - no action
7. Create or reuse an isolated workspace.
8. Implement the smallest coherent change.
9. Run validation.
10. Open, update, or prepare a pull request.
11. Report what changed, what passed, what failed, and what remains.
```

## Git Worktrees

A Git worktree is an additional checkout of the same repository.

It gives the agent a separate file tree to work in without touching the developer's active working copy.

Conceptually:

```text
~/dev/my-app/                         # normal working copy
~/agent-worktrees/my-app/run-001/     # agent workspace
~/agent-worktrees/my-app/run-002/     # another agent workspace
```

A rough command equivalent is:

```bash
git worktree add --detach ~/agent-worktrees/my-app/run-001 <starting-commit>
```

The worktree can then be used for editing, testing, and preparing a branch or pull request.

## Why Worktrees Help

Worktrees help because they isolate agent changes.

Without a worktree, the agent may modify the developer's current checkout, mixing its changes with uncommitted local work.

With a worktree, the agent can:

```text
start from a known commit
work without touching the main checkout
run tests in isolation
prepare a clean diff
abandon failed work safely
keep multiple experiments separate
```

This is especially useful for scheduled or unattended loops.

## Worktree-Based Loop

A Git worktree-based loop might look like this:

```text
Every hour:
→ fetch issues labelled "agent-ready"
→ classify issues by affected area
→ check existing open agent PRs
→ select the safest next issue or batch
→ create a Git worktree from the correct base
→ implement the change
→ run validation
→ create a branch only if the change is worth keeping
→ open or update a pull request
→ clean up no-op worktrees
```

## Local Checkout vs Worktree

There are two common execution modes.

### Local Checkout Mode

The agent runs directly in the main project directory.

This is useful when:

```text
the user explicitly wants the current checkout modified
the task is interactive
the project is not Git-managed
the task is very small
```

Risks:

```text
changes may mix with local developer edits
failed attempts may leave the working copy dirty
parallel runs become unsafe
```

### Worktree Mode

The agent runs in an isolated Git worktree.

This is useful when:

```text
the automation runs unattended
the agent may edit files
multiple runs may happen over time
the user wants reviewable diffs
the main working copy should remain untouched
```

For recurring implementation loops, worktree mode should usually be the default.

## The Pull Request Shape Problem

Even with worktrees, the agent can still create a bad PR structure.

For example:

```text
main
├─ issue-101
├─ issue-102
├─ issue-103
├─ issue-104
```

This avoids local checkout contamination, but it does not solve merge order, dependency, or overlap problems.

So the agent needs a publishing policy.

## Publishing Strategies

### Strategy 1: Serial Pull Requests

The agent creates one PR at a time.

```text
main
→ implement issue 101
→ PR-101
→ wait for merge
→ update from main
→ implement issue 102
→ PR-102
```

This is the safest default.

Use it when:

```text
the repository is fragile
issues touch shared code
CI is slow or flaky
the team wants conservative automation
the agent is new or untrusted
```

Suggested policy:

```text
Only allow one active implementation PR per repository by default.
Do not start a new implementation PR if an open agent PR already touches the same area.
```

### Strategy 2: Batch Related Issues

Some issues should become one PR, not many.

Example:

```text
Issue 101: add validation to create form
Issue 102: show validation errors
Issue 103: disable submit while invalid
Issue 104: add tests for invalid form state
```

These are probably one coherent change:

```text
PR: Improve create form validation
Closes #101
Closes #102
Closes #103
Closes #104
```

Use batching when:

```text
issues affect the same feature
issues touch the same files
issues are really acceptance criteria
one issue cannot be validated properly without the others
review is clearer as one cohesive change
```

Suggested policy:

```text
If multiple issues form one coherent user-facing change, implement them as one PR.
Do not split work purely because it came from separate tickets.
```

### Strategy 3: Stacked Pull Requests

If issues depend on each other, use stacked PRs.

Instead of:

```text
main
├─ issue-101
├─ issue-102
├─ issue-103
```

Use:

```text
main
└─ issue-101
   └─ issue-102
      └─ issue-103
```

The PR targets become:

```text
PR-101: issue-101 → main
PR-102: issue-102 → issue-101
PR-103: issue-103 → issue-102
```

Use stacked PRs when:

```text
one issue depends on another
a foundation refactor must land first
a later feature builds on an earlier abstraction
reviews should be smaller but ordered
```

Suggested policy:

```text
If an issue depends on an unmerged change, branch from that change and target the PR at its parent branch.
Do not create dependent PRs independently from main.
```

### Strategy 4: Parallel Pull Requests Only When Independent

Parallel pull requests are fine when issues are genuinely independent.

Example:

```text
Issue 101: fix README typo
Issue 102: update empty-state copy
Issue 103: add unit test for formatter
```

These may be safe to run in parallel.

But the agent should prove low conflict risk first.

Independence checks:

```text
different modules
different files
no shared schema or config
no shared generated files
no shared test snapshots
no migration dependency
no common package changes
```

Suggested policy:

```text
Allow parallel PRs only when file and dependency analysis shows low conflict risk.
Limit concurrency to a small number, such as 2 or 3.
Never create 10 independent PRs from main in one run.
```

## Recommended Git Worktree Policy

A conservative default policy:

```text
max active agent PRs per repository: 1
max active agent PRs per feature area: 1
parallel PRs allowed only for proven independent low-risk changes
related issues should be batched
dependent issues should be stacked
unclear issues should be reported as blocked
```

A useful prompt:

```text
When implementing issues, treat the issue list as a managed work queue.

Before coding:
1. Fetch open issues labelled "agent-ready".
2. Fetch open agent-authored PRs.
3. Classify candidate issues by affected area, dependency, and overlap.
4. Do not start work on an issue if there is already an open agent PR touching the same area.

Execution policy:
- If issues are unrelated, implement at most 2 in parallel.
- If issues are related and small, group them into one PR.
- If issues depend on each other, create stacked PRs in dependency order.
- If an existing agent PR must land first, wait or add a note explaining the dependency.
- Always branch from the latest appropriate base.
- Never create 10 independent PRs from main in one run.

PR policy:
- Each PR must have a clear purpose.
- Each PR must pass tests independently relative to its target branch.
- Each PR must mention which issues it closes or depends on.
- If stacked, clearly state the parent PR.
- If batched, explain why the issues were grouped.
```

## Where Jujutsu Fits

Jujutsu can be a better internal change-management layer for agent loops.

Git encourages the agent to think in terms of branches:

```text
issue-101 branch
issue-102 branch
issue-103 branch
```

Jujutsu encourages the agent to think in terms of changes:

```text
change A: foundation refactor
change B: implement issue 101
change C: implement issue 102
change D: add tests
change E: docs update
```

This is a better fit for agents because the agent often needs to reshape work before publishing it.

The first implementation may not be the final reviewable structure. The agent may need to split, squash, reorder, rebase, abandon, or stack changes.

## Why Jujutsu Helps

Jujutsu helps because it makes local history manipulation a normal part of the workflow.

This is useful for agents because agent-generated work often needs cleanup before review.

The agent can:

```text
create a local change per logical unit
keep changes unpublished while organising them
split a broad change into smaller changes
squash a fix into the correct earlier change
move a change earlier or later in the stack
abandon bad work
rebase a stack more naturally
publish only clean changes
```

This avoids creating Git branches too early.

## Jujutsu Local Graph, GitHub Publishing

Jujutsu can be used locally while GitHub remains the external review system.

A practical model:

```text
Jujutsu local workflow:
  change graph, stacks, rewrites, cleanup

GitHub publishing workflow:
  bookmarks → branches → pull requests
```

The agent can create many local Jujutsu changes but publish fewer GitHub PRs.

This is the main advantage.

Instead of:

```text
10 issues → 10 Git branches → 10 PRs
```

The agent can do:

```text
10 issues
→ dependency-aware local change graph
→ 3 batches, 1 stack, 2 blocked questions
→ clean PRs in the right order
```

## Example: 10 Issues With Jujutsu

Suppose the agent finds these issues:

```text
#101 add validation rules
#102 show validation errors
#103 disable submit when invalid
#104 add tests for invalid form state
#105 refactor auth guard
#106 add role checks
#107 add auth tests
#108 fix README typo
#109 update empty-state copy
#110 clarify billing edge case
```

The agent should not create 10 branches.

It should classify:

```text
Batch A: form validation
- #101 add validation rules
- #102 show validation errors
- #103 disable submit when invalid
- #104 add tests for invalid form state

Stack B: auth improvements
- #105 refactor auth guard
- #106 add role checks
- #107 add auth tests

Independent:
- #108 fix README typo
- #109 update empty-state copy

Blocked:
- #110 clarify billing edge case
```

The local Jujutsu graph might be:

```text
main
├─ docs-readme-typo
├─ empty-state-copy
├─ form-validation-batch
└─ auth-guard-refactor
   └─ role-checks
      └─ auth-tests
```

The publishing result might be:

```text
PR 1: README typo
PR 2: empty-state copy
PR 3: form validation batch, closes #101 #102 #103 #104
PR 4: auth guard refactor, closes #105
PR 5: role checks, stacked on PR 4, closes #106
PR 6: auth tests, stacked on PR 5, closes #107
Blocked report: #110 needs clarification
```

This produces a cleaner review structure.

## Jujutsu-Based Agent Loop

A Jujutsu-based loop might look like this:

```text
Every hour:
→ fetch issues labelled "agent-ready"
→ classify issues by area, dependency, and risk
→ create or update a local change graph
→ create one change per logical unit, not one per issue
→ batch related small issues into one change
→ stack dependent issues as child changes
→ keep unrelated changes as sibling changes
→ run validation after each meaningful change
→ split, squash, reorder, or abandon changes as needed
→ create bookmarks only for changes ready to publish
→ push bookmarks and create GitHub PRs
→ report the graph, validation status, and PR relationships
```

## Jujutsu Publishing Policy

The agent should follow this policy:

```text
Use Jujutsu as the local planning and change-management layer.

Do not create a GitHub PR immediately for every issue.
First, create a local change graph.

For each issue:
- classify whether it is independent, related, dependent, duplicate, blocked, or too broad
- create a Jujutsu change only for a coherent unit of work
- batch related small issues into one change
- stack dependent issues as child changes
- keep unrelated changes as sibling changes
- validate each change or stack before publishing

Only create bookmarks and push to GitHub when:
- the change is coherent
- the diff is reviewable
- validation passes
- the PR target is correct
- the dependency relationship is clear
```

## Worktrees vs Jujutsu

Worktrees and Jujutsu solve related but different problems.

| Concern | Git Worktrees | Jujutsu |
|---|---|---|
| Isolate file changes | Good | Good, especially with workspaces |
| Avoid touching main checkout | Good | Good |
| Manage many logical changes | Manual | Strong |
| Stack dependent changes | Possible but awkward | Natural |
| Rewrite and clean up history | Possible but fragile | Normal workflow |
| Publish to GitHub | Native Git branches | Via bookmarks/branches |
| Best role | Execution isolation | Change graph management |

A strong architecture can use both ideas:

```text
GitHub Issues = source of requested work
Jujutsu = local planning and change graph
Worktrees or workspaces = isolated execution environments
CI = validation gate
GitHub PRs = review and publication layer
```

## Example Loop 1: Conservative Serial Git Worktree Loop

```text
Every hour:
1. Fetch issues labelled "agent-ready".
2. Fetch open agent-authored PRs.
3. If an open agent PR exists, check whether it is merged, blocked, or failing.
4. If it is still active, do not start a new implementation PR.
5. If no active PR exists, choose the highest-priority actionable issue.
6. Create a Git worktree from latest main.
7. Implement the issue.
8. Run validation.
9. Open a pull request if validation passes.
10. Report blocked status if validation fails or requirements are unclear.
```

Best for:

```text
safe automation
small teams
fragile codebases
early agent adoption
```

## Example Loop 2: Batched Feature Area Loop

```text
Every hour:
1. Fetch issues labelled "agent-ready".
2. Group issues by feature area.
3. Detect issues that are really parts of the same user-facing change.
4. Create one isolated workspace for the selected group.
5. Implement the group as one cohesive change.
6. Run validation.
7. Open one PR that closes all included issues.
8. Explain why the issues were batched.
```

Best for:

```text
UI feature work
form validation
small related bugs
documentation and tests around one feature
```

## Example Loop 3: Stacked Dependency Loop

```text
Every hour:
1. Fetch candidate issues.
2. Build a dependency graph.
3. Identify issues that must be implemented in order.
4. Create the foundation change first.
5. Create child changes for dependent issues.
6. Validate each layer of the stack.
7. Publish stacked PRs with clear parent relationships.
8. Update downstream branches or changes when a parent changes.
```

Best for:

```text
refactor then feature
schema then API then UI
foundation abstraction then dependent screens
multi-step migrations
```

## Example Loop 4: Jujutsu Change Graph Loop

```text
Every hour:
1. Fetch agent-ready issues.
2. Classify issues by independence, overlap, and dependency.
3. Create or update a Jujutsu change graph.
4. Keep local changes unpublished while organising the work.
5. Batch related issues into one change.
6. Stack dependent issues as child changes.
7. Keep independent low-risk issues as sibling changes.
8. Run validation for each change or stack.
9. Split, squash, reorder, or abandon changes as needed.
10. Publish only clean changes as GitHub PRs.
```

Best for:

```text
larger issue queues
active repos
agents that need to reshape their work
teams comfortable with stacked changes
```

## Example Loop 5: Review and Rebase Loop

```text
Every hour:
1. Fetch open agent-authored PRs.
2. Check CI status and review comments.
3. If main has moved, rebase or refresh the PR.
4. If conflicts occur, resolve them in an isolated workspace.
5. If review comments request changes, apply focused fixes.
6. Run validation again.
7. Update the PR.
8. If the PR is obsolete or superseded, close it with an explanation.
```

Best for:

```text
keeping agent PRs mergeable
reducing stale branches
responding to review feedback
avoiding abandoned automation work
```

## Example Loop 6: Noisy Queue Triage Loop

```text
Every hour:
1. Fetch new issues.
2. Deduplicate similar issues.
3. Identify issues that are too vague.
4. Ask clarification questions on unclear issues.
5. Label genuinely ready issues as "agent-ready".
6. Group related issues into proposed batches.
7. Do not write code in this loop.
```

Best for:

```text
large issue trackers
community projects
repos where many issues are low quality
separating triage from implementation
```

## Recommended Default

For most teams, start conservative:

```text
max active implementation PRs per repo: 1
max active implementation PRs per feature area: 1
parallel PRs only for low-risk independent changes
batch related issues
stack dependent issues
use isolated workspaces for code changes
validate before publishing
ask for clarification when requirements are unclear
```

If using Jujutsu, use this stronger model:

```text
create many local changes if useful
publish fewer GitHub PRs
use the local graph to organise work before exposing it for review
```

The goal is not maximum automation throughput.

The goal is:

```text
safe, reviewable, dependency-aware progress
```

## Final Pattern

The safest overall pattern is:

```text
scheduled trigger
→ inspect issues
→ classify and plan
→ isolate execution
→ implement coherent changes
→ validate
→ organise into batch, stack, or serial PRs
→ publish only clean review units
→ maintain and rebase open PRs
→ clean up abandoned work
```

This keeps the agent productive without flooding the repository with conflicting pull requests.

---

**Decided scope (2026-06):** The minimal high-value step from this analysis is
implemented as **PR awareness & tracking** — see
[pr-awareness-and-tracking-plan.md](../pr-awareness-and-tracking-plan.md). A
recurring worktree loop already produces the conservative serial shape (one
branch → one PR per iteration), so the gap we closed is making each loop *track*
its own open PRs and each iteration *aware* of them (the model judges coverage).
Per-step worktree isolation, stacked PRs, runtime-mediated delivery, and
**Jujutsu** are **deferred** — they solve fan-out/multi-item-per-tick problems
the orchestrator doesn't have yet (Jujutsu in particular is a machine-wide VCS
install whose value only appears with intra-iteration stacking).
