## Proof moment

Create a loop from a plain prompt and show the Orchestrator detail view with a generated plan spine, branching or parallel step state, live execution status, and a durable needs-input card that can be answered later. This hits "that is not just a chat UI" because the work is persisted, scheduled, paused, resumed, branched, and tracked outside a single conversation. It also hits "the workspace extends itself" because the loop can be saved to the library, versioned, reused, and run through Sero background agents, tools, Git worktrees, and memory-aware context. PR: https://github.com/sero-labs/sero/pull/224

## Draft X post

This is what a coding-agent workflow looks like when it outgrows the chat box.

Sero Orchestrator turns a plain request into a durable loop with a stored plan, step state, recovery, human input, and workspace isolation.

[video]

- A loop starts from a prompt, then Orchestrator stores an LLM-authored step plan and runs ready steps sequentially or in parallel through normal Sero background agents.
- The loop detail view tracks plan steps, branch routing, live status, attempts, completion signals, and recovery choices instead of relying on chat history.
- Human-input steps create durable question cards that pause the loop and resume it after the user answers, even if the chat panel was closed.

https://github.com/sero-labs/sero

If a local-first workplace for AI agents sounds useful, starring the repo genuinely helps more developers find it.

## 60-second demo script

1. Open the Orchestrator panel in Sero and click the create flow. Enter a concrete workspace task that can run safely in the current repository, such as producing a short local report or checking a small set of files. Run for about 8 seconds.
2. Show the generated plan spine after creation, including the step names, dependencies, and any parallel or branching structure that appears. Do not replace the real generated plan with a mock plan. Run for about 10 seconds.
3. Start the loop and show steps moving through queued, running, and completed states. Keep the live activity strip or step status panel visible while the background agent works. Run for about 12 seconds.
4. Show workspace management details that are visible in the product, such as the selected workspace mode, managed-worktree setting, or dirty-workspace preflight if it appears. Run for about 8 seconds.
5. Use a loop that naturally asks for user input, or create one whose plan includes a confirmation step, and show the durable needs-input card pausing the run. Answer it from the Sero UI and show the loop resuming. Run for about 16 seconds.
6. End on the loop detail page with the final step status or explicit completion state visible, plus the persisted loop still listed in Orchestrator rather than only in the chat transcript. Run for about 6 seconds.
