# Subagents

Subagents let the main Sero agent delegate bounded work to specialist child
sessions. Use them when one task can be split into independent research,
review, testing, or implementation tracks.

## Quick path

1. Start in a normal workspace chat session.
2. Ask for delegation explicitly, for example: “Use the scout subagent to map this folder before editing.”
3. Keep each delegated task narrow and file-scoped.
4. Watch subagent activity/results in the chat or orchestration panel when visible.
5. Review the final main-agent answer before accepting file changes.

Subagents are helpful for parallel investigation, but they are not a replacement for reviewing diffs, tests, or source-control state.

![Subagent delegation model](../assets/generated/img12.jpg)

## Built-in and custom agents

Sero can discover named agent definitions from the active profile:

```text
<SERO_HOME>/agent/agents/
```

The default profile path is usually:

```text
~/.sero-ui/agent/agents/
```

Built-in templates may be copied there on first launch. Common specialist roles include scout/research, review, test-writing, and analysis. You can add custom Markdown definitions; see [Agent Definitions](/reference/agent-definitions) for the exact frontmatter format.

## Delegation patterns

| Pattern | Use it for | Caveats |
| --- | --- | --- |
| Single specialist | A focused scan, review, or implementation task | Best when one agent owns the whole subtask. |
| Parallel/fan-out | Independent files, modules, or hypotheses | Parallel agents share the workspace/container, so avoid overlapping writes. |
| Chain | Sequential steps where later work depends on earlier output | Slower; inspect intermediate assumptions. |
| Ad-hoc specialist | One-off system prompt without saving a definition | Useful for experiments; less reusable than named agents. |

Ask for clear boundaries:

```text
Use parallel subagents to review these three files independently. Each subagent should only inspect its assigned file and report risks; do not edit files yet.
```

## Visible results and controls

Subagent runs can emit lifecycle state such as queued, running, completed, failed, aborted, and timed out. Result cards may show the specialist name, task preview, live output, tool activity, duration, model, usage, and final response preview.

Current controls include aborting active subagents and clearing completed entries from the visible activity list. Clearing completed entries does not mean the main session forgot the answer it already received.

## Limits and no-recursion rule

Important limits:

- Child sessions do **not** receive `subagent` or `create_agent` tools.
- Subagents cannot recursively spawn more subagents.
- Child sessions do not load external extension packages in the current v1 design.
- The `tools` field in agent definitions is parsed but not enforced in v1; do not use it as a security boundary.
- Parallel subagents share the same workspace runtime/container.
- Costs and latency can grow quickly with fan-out.

The default pool allows eight active child sessions in total. One delegation
call can run four children at the same time. Profile settings can change these
limits with `maxTotal` and `maxConcurrent`. Extra runs wait for capacity in
first-in, first-out order.

## Choose the correct Sero feature

Use subagents for short, delegated tasks within a chat session. Use a
[Room](/guide/rooms) when persistent members must work as a team. Use a
[Workflow](/guide/workflows) for a saved sequence of steps. Scheduler starts
work at a specified time. Memory supplies selected context across sessions.

## Good prompts

```text
Use the reviewer subagent to inspect apps/docs-site/docs/guide/web.md for stale provider claims. Report findings only.
```

```text
Use three subagents to review this architecture choice independently. Return
the risks, tradeoffs, and one final recommendation. Do not change code.
```

## Related docs

- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Agent Definitions](/reference/agent-definitions)
- [Models and Providers](/guide/models-and-providers)
- [Settings and Admin](/guide/settings-models-admin)
- [State and Folders](/reference/state-and-folders)
