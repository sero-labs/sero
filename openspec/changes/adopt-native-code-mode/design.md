## Context

See proposal.md for the reason. `main` is on Pi SDK 1.0.2. Two places create `run_code` today: `ipc/agent/core/agent-session-open.ts` for chat sessions and `features/subagent/runtime/runner.ts` for subagent sessions. Both build a controller from `features/code-mode/`, add its tool to the session's custom tools, and bind it to the agent after the session exists.

Pull request #609 replaced the chat one with `createCodemodeExtension` from `@earendil-works/pi-coding-agent` and added live rows for inner calls to the chat card. Its measurements found the gaps this design closes. #609 does not merge. This change takes its code from commit `f75004eca`.

Facts from the Pi 1.0.2 source that shape the design:

- `createCodemodeExtension({ mode, inlineBudget, models })` has no option for a default time limit. A script sets `timeout_ms` in its first line. With no value the limit is infinite.
- Pi registers `codemode` inactive. A session must switch it on.
- An inner call runs through `ctx.executeTool`. It does not pass through `agent.afterToolCall`, so `preserveBashFailureStatus` does not run for it.
- The id of an inner call is `<parent call id>/<n>`.
- Code Mode refuses TypeScript source, and an image result reaches the script as text.

## Goals / Non-Goals

**Goals:**

- One tool for programmatic tool calls in every session type, and it is Pi's.
- No Sero layer between the model and `codemode`: no source rewrite, no wrapper tool.
- `features/code-mode/` and the `run` dependency are deleted in the same change.

**Non-Goals:**

- Code Mode's `only` mode, where `codemode` is the single tool the model sees.
- The `models` namespace inside scripts.
- Pi's in-place prompt changes and named prompt sections.
- A conversion of saved `run_code` calls in old sessions.
- The branch-aware context override lookup from #609. Issue #612 is closed as not planned.

## Decisions

### One helper creates the extension for both session types

A small module exports the extension factory and the function that switches the tool on. `agent-session-open.ts` and `runner.ts` both call it. The options are `mode: 'on'` and `models: false`.

Alternative: configure it in each file. Rejected, because the two would drift and the user asked for one code path.

### The tool is a base tool the context editor can turn off

After the session is created, the helper adds `codemode` to the active tools before Sero reads the base tool list. The context editor then lists it and a user can disable it, as with `run_code`. A subagent's tool policy decides it the same way it decided `run_code`: the policy name changes from `run_code` to `codemode`.

### No Sero time limit

`run_code` had a fixed limit of 30 seconds. Pi has no setting for a default, so a Sero default means a hook that rewrites each script's options line. That is the kind of layer this change removes. A fixed 30 seconds also stops a valid script that runs a build through `bash`. The user's cancel stops a script through the abort signal.

Alternative: inject `timeout_ms` when the script has none. Rejected for the reason above.

### TypeScript and image results: accept Pi's behaviour

Both were niceties of `run_code`. The model writes JavaScript when the tool description says so, and it can call `read` directly for an image. No Sero code is added for either.

### A failed shell command is a failed inner call

The exit code is known where the `bash` tool produces its result. The fix puts the failure status in the tool's own outcome, so a direct call and an inner call both report it, and no path depends on `agent.afterToolCall`. The first task reads how Sero's `bash` tool and Pi's `executeTool` set `isError`, then picks the smallest change that makes `outcome.isError` true for a non-zero exit. `preserveBashFailureStatus` stays for direct calls if a result hook can still drop the status there.

Alternative: patch Pi's inner-call path. Rejected: it is Pi's code.

### The output optimizer detects an inner call by its id shape

`plugins/sero-output-optimizer-plugin/extension/nested.ts` checks the `run_code_` prefix. It changes to the Code Mode shape, `<parent>/<n>`. The comment in `packages/common/src/plugins.ts` that documents the reserved prefix changes with it, and `@sero-ai/common` gets a patch version bump.

### Inner-call rows come from #609

`agent-subscription.ts` forwards the nested-call updates of a running `codemode` call. `agent-messages.ts` rebuilds the rows from the saved result on reopen. The store module `agent-nested-tools.ts` holds them, and `NestedToolRows.tsx` draws them inside the card. All four application layers change together, as AGENTS.md requires. A reopened card has each row's name and final state. It does not have the output of a successful inner call or the duration, because Pi does not save them. That limit is accepted.

### Old sessions

A saved `run_code` call is a tool call in the history and displays through the generic card. No conversion is written. The renderer has no code that names `run_code`.

## Risks / Trade-offs

- A script with an endless loop and no `timeout_ms` runs until the user cancels → the chat card shows it as running, and cancel stops it. Accepted.
- A background subagent has no user to cancel it → the subagent's own run limits and its parent's cancel still stop the session. Task 4.3 checks that a subagent cancel stops a running script.
- The `codemode` description is Pi's and is longer than the `run_code` description → #609 measured start-up prompt size, and the numbers are in its description. Checked again in task 8.3.
- Models that learned `run_code` from Sero's prompt text → every prompt string that names it changes in this change, and a repository search in task 6.5 proves none is left.
- An external plugin that reads the `run_code_` prefix → the documented prefix was only used by the output optimizer in this repository. The `@sero-ai/common` changelog entry names the change.

## Migration Plan

One pull request, in the order of tasks.md. The deletion of `features/code-mode/` is the last code step, after both session types run on `codemode` and the checks pass. Rollback is a revert of the pull request: no data format changes.
