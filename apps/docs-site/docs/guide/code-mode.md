# Code Mode

Code Mode lets the agent write a short JavaScript or TypeScript program that
calls its available tools and processes their results. You give Sero a task in
chat. The agent uses `run_code` to read data, combine tool calls, and return the
answer. You review the answer and any changes it made.

For example, an agent can read several JSON files, count records by status, and
return a small table. The full contents of each file stay inside that run unless
the program returns them. This can reduce the tool output sent back to the model
and the number of model turns needed to complete the task. The saving depends
on the task and what the program returns.

## Use Code Mode in chat

`run_code` is built in to workspace chat sessions in both Host and container
runtimes. Subagent sessions also receive it, subject to their tool settings.
There is no separate Code Mode app or provider-specific setting to enable.

Open a workspace session and ask for a task that needs several tool calls or
data processing. The agent chooses how to use its tools. To request Code Mode
explicitly, name `run_code` in your prompt:

```text
Use run_code to read the package.json files under packages/ and plugins/.
Return a table of package names, versions, and whether each package is private.
Do not change files.
```

If `run_code` is unavailable, check the session's tool selection in the
[context editor](/guide/agent-sessions-and-context#context-editor-and-presets).
It can be disabled like other tools. Tools disabled for that session are also
unavailable inside a program.

## When it helps

Use Code Mode when the agent needs to filter, sort, group, or compare data from
several sources. It supports loops, conditions, helper functions, regular
expressions, JSON parsing, and promises. Independent calls can run together
with `Promise.all`; calls that depend on an earlier result run in sequence.

Useful tasks include comparing configuration files, summarising tool results,
checking records against a rule, and making several related file edits. Plugin
tools can participate when they are active in the session.

A direct tool call is sufficient for one simple operation, such as reading one
file. Project commands such as builds, tests, and Git operations still use
`bash`. A Code Mode program can call that tool if it is available.

Code Mode runs within the calling agent's session. Use
[Subagents](/guide/subagents) when a task needs separate agents to investigate
or review it. Use a [Workflow](/guide/workflows) when you need a saved sequence
of steps that can run again.

## How a program calls tools

The `code` argument to `run_code` is a function body. It supports top-level
`await` and `return`. TypeScript annotations are stripped before execution;
the program is not type-checked.

Tools are asynchronous functions on the global `tools` object. Each takes the
same object argument as a direct tool call. Returned text is available as
`result.text`. A result can also include `details` and `images` when the tool
provides them.

This is an example of code the agent could pass to `run_code`. It assumes that
`data/orders.json` exists in the workspace and contains an array of objects with
`status` fields:

```js
const result = await tools.read({ path: 'data/orders.json' });
const orders = JSON.parse(result.text);
const counts = {};

for (const order of orders) {
  counts[order.status] = (counts[order.status] ?? 0) + 1;
}

return counts;
```

Relative file paths resolve from the active workspace. The agent does not need
to look up access roots before reading a known workspace file.

For a tool name that cannot be used as a JavaScript identifier, such as
`sero-cli`, the program uses `tools.call({ name: 'sero-cli', args: { ... } })`.
The `args` object must match that tool's input schema. Sero validates each
nested call before it runs.

The conversation receives the program's final value and a short summary of
nested calls. It does not receive every full nested tool result. Return the
fields needed for the answer to keep the result useful and small.

## Access and file changes

The isolated JavaScript runtime has no direct Node.js APIs, filesystem access,
environment variables, network APIs, or arbitrary package imports. External
operations go through the session's tools. `run_code` cannot call itself or
grant access to an inactive tool.

Nested calls use the same workspace, permissions, and runtime context as direct
calls. Existing tool checks still apply. Isolation of the program does not
make tool actions read-only: an available `write`, `edit`, or `bash` tool can
change files or run commands.

Mutations of the same file run in sequence against current content. An `edit` must match
the content at the time it runs. A conflicting edit fails; a later whole-file
`write` replaces earlier content. These calls are not a transaction. If a
later call fails or you stop the run, earlier changes are not automatically
rolled back. Review the diff and use
[Checkpoints and Undo](/guide/checkpoints-and-undo) when you need to recover.

## Limits and failed runs

Each program runs with fixed limits:

| Limit | Current value |
| --- | --- |
| Execution timeout | 30 seconds |
| Runtime memory | 64 MiB |
| Source size | 256 KiB |
| Final result size | 1 MiB |
| Arguments per nested call | 1 MiB |
| Output per nested call | 4 MiB |
| Nested tool requests | 256 |
| In-flight nested tool requests | 32 |

When a program exceeds a limit, the run fails with an error. The runtime does
not automatically retry it. For larger tasks, ask the agent to work in smaller
batches and return only the required data. Use normal project commands for
long-running builds and tests.

An unhandled nested-tool error fails the program. A program can catch errors
when partial results are useful. Stopping a turn sends cancellation to the
program and its active nested calls; it does not undo completed actions.

## Related docs

- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Subagents](/guide/subagents)
- [Workflows](/guide/workflows)
- [Checkpoints and Undo](/guide/checkpoints-and-undo)
- [Security / Privacy](/reference/security-privacy)
