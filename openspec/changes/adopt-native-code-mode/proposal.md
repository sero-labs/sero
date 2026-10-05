## Why

Sero has its own tool for programs that call tools, `run_code`: 492 lines of source, a test of its own, and the `run` dependency. Pi SDK 1.0.2, which `main` now uses, has a native tool for the same job, `codemode`. One native tool is less code for Sero to maintain, and its inner tool calls are real tool events, so the chat can show them while a script runs.

Issue #611 holds the decision to adopt. Pull request #609 holds the evidence.

## What Changes

- **BREAKING** The `run_code` tool is removed. Every session that had it gets Pi's `codemode` tool: chat sessions and subagent sessions. There is one code path.
- **BREAKING** A script is JavaScript. TypeScript source is refused. This loss is accepted.
- **BREAKING** A script has no fixed time limit. `run_code` stopped a program after 30 seconds. A `codemode` script sets its own limit with `timeout_ms` in its `// @options` line, and a cancel of the turn stops the script.
- **BREAKING** A script that reads an image through a tool receives text only. This loss is accepted: the model can call `read` directly for an image.
- The chat card of a script shows each inner tool call as a row while the script runs.
- A failed `bash` command inside a script is reported as a failure. On Pi 1.0.2 it is reported as a success today.
- The output optimizer plugin leaves the result of an inner call unchanged, as it did for `run_code`.
- The Sero source for `run_code` is deleted: `apps/desktop/electron/features/code-mode/`, its tests, and the `run` dependency.
- Prompt text, the remote-skill gate of the MCP plugin, and the user docs name `codemode`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `programmatic-tool-calling`: the tool is `codemode`, scripts are JavaScript only, the time limit is set by the script, the chat shows inner calls live, and subagent sessions use the same tool.
- `file-editing-tools`: the two requirements that name `run_code` name `codemode`. The batching guidance is in the `edit` description, because Sero does not write the `codemode` description.

## Impact

- Desktop main process: `ipc/agent/core/agent-session-open.ts`, `features/subagent/runtime/runner.ts`, `ipc/agent/core/agent-messages.ts`, `ipc/agent/core/agent-subscription.ts`, `features/container/tools/tools-host.ts`, `features/container/tools/tools-coding.ts`, `features/tool-capture/bash-result-error-status.ts`. `features/code-mode/` is deleted.
- Renderer: the tool card and the agent store gain rows for inner calls. `src/types/agent.ts` changes with them.
- Plugins in this repository: `sero-output-optimizer-plugin` (inner-call guard), `sero-mcp-plugin` (remote-skill gate and README).
- Published package: `@sero-ai/common` documents the `run_code_` call-id prefix in `src/plugins.ts`. The text changes, so the version is bumped.
- Dependencies: `run` is removed from the desktop app.
- Docs: `apps/docs-site/docs/guide/code-mode.md`, `guide/index.md`, `guide/agent-sessions-and-context.md`.
- Tests: `edit-run-code.test.ts`, `tools-system-prompt.test.ts`, the subagent `runner.test.ts`, `session-tools.contract.spec.ts`, `output-optimizer.agent.spec.ts`, `helpers/session-probe.ts`.
- A session saved before this change keeps its `run_code` calls in its history. They display as they do now. A new turn in that session uses `codemode`.
