## Proof moment

Show an Orchestrator PR lifecycle loop receiving a GitHub PR event, displaying the queued event summary, resolving the worktree branch source to the firing PR, and running the workflow steps against that PR branch. This hits "that is not just a chat UI" because the agent is reacting to GitHub state, branch context, and event queues instead of a single prompt. It also hits "the workspace extends itself" because the shipped catalogue recipes add reusable PR maintenance workflows for CI fixes, review responses, main rebases, and issue implementation. PR: https://github.com/sero-labs/sero/pull/227

## Draft X post

Your coding agent can now wake up on the PR it needs to fix, not on a blank prompt.

Sero Orchestrator now has PR lifecycle loops that turn GitHub PR events into durable work on the correct branch.

[video]

- GitHub events such as PR approval, main updates, PR closure, and issue opening are mapped into Orchestrator event payloads with PR numbers, branches, SHAs, authors, and dedupe keys.
- Event-backed loops now use a bounded FIFO queue with visible event summaries, dedupe handling, and overflow reporting instead of overwriting one pending event.
- PR lifecycle loops can run in a managed worktree sourced from the event PR branch, so a review-response or CI-fix loop works on the PR that fired it.

https://github.com/sero-labs/sero

If a local-first workplace for AI agents sounds useful, starring the repo genuinely helps more developers find it.

## 60-second demo script

1. Open Sero to the Orchestrator panel and select a saved PR lifecycle loop such as a review-response or CI-fix loop. Keep the loop details, trigger summary, and delivery target visible. The user confirms the loop is active. Run for about 8 seconds.
2. Open the real GitHub PR that will fire the loop, then trigger a supported PR lifecycle event, such as a review approval, main update, or issue event connected to the recipe being shown. Run for about 8 seconds.
3. Return to Sero and show the loop's event queue updating with the GitHub event summary rather than a manually typed chat prompt. The agent does nothing yet except pick up the queued event. Run for about 10 seconds.
4. Open the loop metadata or run detail and show the branch source set to the event PR branch, with the PR number and source branch visible where the UI exposes them. Run for about 10 seconds.
5. Start or observe the run and show the plan steps moving from queued to running against the PR lifecycle workflow. Keep the live step status and event context on screen. Run for about 14 seconds.
6. End on the Orchestrator detail view showing the processed PR event, the running or completed step status, and the GitHub PR link/context visible enough for a reviewer to verify that the loop acted on the firing PR. Run for about 10 seconds.
