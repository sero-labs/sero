# Code Mode

Code Mode lets the agent write a short JavaScript program that calls its
available tools and processes their results. You give Sero a task in chat. The
agent uses `codemode` to read data, combine tool calls, and return the answer.
You review the answer and any changes it made.

For example, an agent can read several JSON files, count records by status, and
return a small table. The full contents of each file stay inside that run unless
the program returns them. This can reduce the tool output sent back to the model
and the number of model turns needed to complete the task. The saving depends
on the task and what the program returns.

## Use Code Mode in chat

`codemode` is built in to workspace chat sessions in both Host and container
runtimes. Subagent sessions receive it too, subject to their tool settings.
There is no separate Code Mode app or provider-specific setting to enable.

Open a workspace session and ask for a task that needs several tool calls or
data processing. The agent chooses how to use its tools. To request Code Mode
explicitly, name `codemode` in your prompt:

```text
Use codemode to read the package.json files under packages/ and plugins/.
Return a table of package names, versions, and whether each package is private.
Do not change files.
```

While a script runs, its card lists each tool call the script makes, one row per
call, with the tool name and its state. The rows stay in the card after the
script finishes, so you can see what it did.

If `codemode` is unavailable, check the session's tool selection in the
[context editor](/guide/agent-sessions-and-context#context-editor-and-presets).
It can be disabled like other tools. Tools disabled for that session are also
unavailable inside a script.

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
`bash`. A script can call that tool if it is available.

Code Mode runs within the calling agent's session. Use
[Subagents](/guide/subagents) when a task needs separate agents to investigate
or review it. Use a [Workflow](/guide/workflows) when you need a saved sequence
of steps that can run again.

## How a program calls tools

The `code` argument to `codemode` is a function body written in JavaScript. It
supports top-level `await` and `return`. TypeScript source is not accepted:
annotations and other TypeScript syntax are a script error, so write plain
JavaScript.

Tools are asynchronous functions on the global `tools` object. Each takes the
same object argument as a direct tool call. What a call returns depends on the
tool:

- `read`, `edit`, and `write` return their text output as a string.
- `bash` returns an object with `output` and `exit_code`. It returns this object
  for a non-zero exit code too.
- An MCP tool returns its full result object.

A tool that returns an image gives the script its text description instead of
the image; call `read` directly when you need the image itself in the
conversation.

This is an example of code the agent could pass to `codemode`. It assumes that
`data/orders.json` exists in the workspace and contains an array of objects with
`status` fields:

```js
const text = await tools.read({ path: 'data/orders.json' });
const orders = JSON.parse(text);
const counts = {};

for (const order of orders) {
  counts[order.status] = (counts[order.status] ?? 0) + 1;
}

return counts;
```

Relative file paths resolve from the active workspace. The agent does not need
to look up access roots before reading a known workspace file.

In a tool name, each character that is not valid in a JavaScript identifier
becomes `_`. A script calls `sero-cli` as `tools.sero_cli({ ... })`. The
argument must match that tool's input schema, and each nested call is validated
before it runs.

The conversation receives the script's final value and a short summary of
nested calls. It does not receive every full nested tool result. Return the
fields needed for the answer to keep the result useful and small.

## Time and output limits

Sero sets no time limit. A script runs until it finishes or you stop the turn,
so a long build or test inside a script is not cut short. Stopping the turn
cancels the script and its running tool calls.

A script can set its own time limit on its first line:

```js
// @options: {"timeout_ms": 60000}
```

The same line also accepts an output budget, for example
`// @options: {"max_output_tokens": 10000, "timeout_ms": 60000}`. With no
`timeout_ms`, the script has none.

## Access and file changes

The isolated JavaScript runtime has no direct Node.js APIs, filesystem access,
environment variables, network APIs, or timers. External operations go through
the session's tools. `codemode` cannot call itself or grant access to an
inactive tool.

Nested calls use the same workspace, permissions, and runtime context as direct
calls. Existing tool checks still apply. Isolation of the script does not
make tool actions read-only: an available `write`, `edit`, or `bash` tool can
change files or run commands.

Mutations of the same file run in sequence against current content. An `edit` must match
the content at the time it runs. A conflicting edit fails; a later whole-file
`write` replaces earlier content. These calls are not a transaction. If a
later call fails or you stop the run, earlier changes are not automatically
rolled back. Review the diff and use
[Checkpoints and Undo](/guide/checkpoints-and-undo) when you need to recover.

## Limits and failed runs

A script runs under a fixed memory limit (currently 256 MiB) and, unless it
raises the budget, a fixed output limit (currently 10,000 tokens). A script over
either limit stops with an error, and the runtime does not automatically retry
it.

An unhandled nested-tool error fails the script. A script can catch errors when
partial results are useful. Stopping a turn sends cancellation to the script and
its active nested calls; it does not undo completed actions.

## Related docs

- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Subagents](/guide/subagents)
- [Workflows](/guide/workflows)
- [Checkpoints and Undo](/guide/checkpoints-and-undo)
- [Security / Privacy](/reference/security-privacy)
