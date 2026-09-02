# Research: prior art for code-mode tool calling

Ticket: https://github.com/sero-labs/sero/issues/481
Map: https://github.com/sero-labs/sero/issues/479
Date: 2026-09-02

## Question

What prior art exists for code-mode tool calling?
Code mode means this: the agent writes a program that calls tools as functions.
The alternative is one tool call for each model turn.

## Method

All facts below come from primary sources.
Primary means the vendor documentation, the vendor engineering blog, the source code, or the paper.
Each fact gives its source.
Where a claim has no primary source, the text says "not documented".

---

## 1. Inside pi

Versions examined: `@earendil-works/pi-coding-agent` 0.84.2 and `@earendil-works/pi-agent-core` 0.84.2.

### 1.1 Pi has no code-execution tool

Pi has exactly seven built-in tools.
The list is `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.
Source: `node_modules/@earendil-works/pi-coding-agent/dist/core/tools/index.d.ts`, type `ToolName`.

Pi has no `run_code` tool, no sandbox tool, and no interpreter tool.
Pi also has no built-in MCP client.
The pi documentation says this: "It intentionally does not include built-in MCP, sub-agents,
permission popups, plan mode, to-dos, or background bash."
Source: `docs/usage.md`, line 304.

**For Sero:** `run_code` is new work. No part of pi does this job today.

### 1.2 Pi has no seam that calls one tool from another tool

`ExtensionContext` is the object that pi gives to a tool at execution time.
`ExtensionContext` has no method that runs a tool.
Source: `dist/core/extensions/types.d.ts`, lines 209-249.

No pi export uses a name such as `executeTool`, `callTool`, `runTool`, or `invokeTool`.
Source: grep of every `.d.ts` file in `dist/`.

**For Sero:** A `run_code` tool must reach the other tools through a new host-side seam.
Pi supplies no such seam.

### 1.3 The seam that does exist is the tool object

Every pi tool is an `AgentTool`.
`AgentTool` has an `execute(toolCallId, params, signal, onUpdate)` method.
Source: `pi-agent-core/dist/types.d.ts`, lines 339-357.

`createTool(toolName, cwd, options)` builds one built-in tool as a plain object.
`createAllTools(cwd, options)` builds all seven as a record keyed by name.
Source: `dist/core/tools/index.d.ts`.

The session holds the live tool array at `session.agent.state.tools`.
Code can replace that array.
Source: `docs/sdk.md`, lines 248-256.

**For Sero:** `run_code` sits BESIDE the built-in tools. It does not build on them.
It calls their `execute()` methods, because the tools are ordinary JavaScript objects.

### 1.4 Pi already supports dynamic and deferred tools

`pi.registerTool()` adds a tool after the session starts, with no reload.
Source: `docs/extensions.md`, line 1342.

`pi.getActiveTools()` and `pi.setActiveTools(names)` switch tools on and off during a session.
Source: `docs/extensions.md`, lines 1650-1667.

A tool result can carry `addedToolNames`.
That field adds tools from that point in the transcript onward.
Source: `pi-agent-core/dist/types.d.ts`, lines 323-324.

Pi ships a worked example of deferred tool loading at `examples/extensions/kimi-deferred-tools.ts`.
The example starts the session with only a `tool_search` tool active.
The search tool then calls `pi.setActiveTools()` to switch on the tool that it found.

**For Sero:** This is the nearest thing that pi has to code mode.
It cuts tool-definition tokens by hiding tools, not by joining calls.
`run_code` can reuse `setActiveTools` to hide the wrapped tools from the model.

### 1.5 Pi states that it supplies no sandbox

The pi security document says: "Pi does not include a built-in sandbox."
It also says: "Real isolation needs to come from the operating system or a
virtualization/container boundary."
Source: `docs/security.md`.

Pi sends users to containers, Docker, or the Gondolin micro-VM instead.
Source: `docs/containerization.md`.

The `BashOperations` interface lets an extension send command execution to a different machine.
Source: `dist/core/tools/bash.d.ts`.

The example extension `examples/extensions/sandbox/` uses `@anthropic-ai/sandbox-runtime` 0.0.26.
That package uses `sandbox-exec` on macOS and `bubblewrap` on Linux.

**For Sero:** Pi will not supply isolation for generated code.
Sero must supply the isolation itself.

### 1.6 Sero already has two related mechanisms

Sero registers 62 tools through `pi.registerTool()` across 11 plugins.
Source: grep of `plugins/` for `registerTool(`.

Sero puts its full command surface behind one tool, `sero-cli`.
That tool accepts many commands, one command for each line.
Source: `apps/desktop/electron/cli/core/tool.ts`.

The batch executor runs the commands in a sequential loop.
It stops the batch after the first failure.
It permits a maximum of 50 commands in one turn.
It cuts output at 50 KB or at 2000 lines.
Source: `apps/desktop/electron/cli/core/batch-executor.ts`.

The command list is fixed before the batch starts.
No command can read the output of an earlier command.
No command can branch on a result.

Sero also puts all MCP servers behind one bridged tool, `mcp`.
Source: `plugins/sero-mcp-plugin/extension/tools/proxy-tool.ts`.

**For Sero:** `sero-cli` proves that the batching half of code mode already works here.
It has no data flow, no loops, and no conditions between calls.
`run_code` adds that missing half, so measure `run_code` against `sero-cli`, not against single calls.

---

## 2. Anthropic

### 2.1 The mechanism has a product name: programmatic tool calling

Anthropic ships this feature as "programmatic tool calling".
Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling

It needs the code execution tool at version `code_execution_20260120` or later.
Same source.

The developer marks each tool with `"allowed_callers": ["code_execution_20260120"]`.
The permitted values are `["direct"]`, `["code_execution_20260120"]`, or both.
Same source.

The documentation states the mechanism: "Tools that allow a code execution caller are exposed to
Claude's code as async Python functions, so Claude can run them in parallel with `asyncio.gather`.
Each function takes a single dict of arguments and returns a string: the text of the `tool_result`
you send back."
Same source.

Programmatic tool calling needs no `anthropic-beta` header.
Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool

**For Sero:** The shipped shape matches the map. One code tool, and normal tools become functions.
The `allowed_callers` idea is worth copying, because it marks each tool as safe for code mode.

### 2.2 The measured claims

The engineering blog post is "Code execution with MCP: Building more efficient agents".
It was published on 4 November 2025.
Source: https://www.anthropic.com/engineering/code-execution-with-mcp

The headline claim is verbatim: "This reduces the token usage from 150,000 tokens to 2,000
tokens - a time and cost saving of 98.7%."
Same source.

The measured task was one workflow: attach a Google Drive meeting transcript to a Salesforce lead.
Same source.

**Caveat.** The post names no benchmark, no sample size, and no model for the 150k-to-2k figure.
It is a worked example, not a benchmark result.
Same source.

The API documentation carries stronger, benchmark-shaped numbers:

- "On a 75-tool project-management agent benchmark, enabling programmatic tool calling reduced
  billed input tokens by roughly 38% with no change in task accuracy."
- "Across production API traffic, requests whose `tools` array contains 10 to 49 tool definitions
  see typical token savings of 20% to 40% with programmatic tool calling enabled."
- "On agentic search benchmarks like BrowseComp and DeepSearchQA ... adding programmatic tool
  calling on top of basic search tools improved performance by an average of 11% while using 24%
  fewer input tokens."

Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling

**The negative result matters most.** The documentation states it: "On tau-squared-bench (airline,
retail, and telecom domains), where each turn makes one or two sequential tool calls, programmatic
tool calling left scores unchanged and cost roughly 8% more. Sequential single-call workflows do
not benefit."
Same source.

**For Sero:** Code mode pays only when a task makes many calls, or when tool definitions are large.
It costs more on short tasks. The map must pick a measurement task with many calls.

### 2.3 Tool search is the cheaper, separate lever

Anthropic ships tool search as a different feature, with `defer_loading: true` on each tool.
Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool

The documentation says: "A typical multiserver setup (GitHub, Slack, Sentry, Grafana, and Splunk)
can consume ~55k tokens in definitions before Claude does any work. Tool search typically reduces
this by over 85 percent, loading only the 3-5 tools Claude needs for a given request."
Same source.

The Claude Agent SDK turns tool search on by default.
Source: https://code.claude.com/docs/en/agent-sdk/tool-search

**For Sero:** These are two levers, not one. Tool search cuts definition tokens.
Code mode cuts intermediate result tokens. Sero can take the first without the second.

### 2.4 MCP servers are not importable modules in the Anthropic sandbox

The blog post shows MCP servers as a tree of TypeScript files that the agent imports.
Source: https://www.anthropic.com/engineering/code-execution-with-mcp

The shipped product does the opposite.
The documentation states: "The following tools cannot be called programmatically: Tools provided by
an MCP connector".
Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling

A shipped "MCP connector inside code execution" mode is **not documented**.

**For Sero:** The famous 98.7% number comes from a pattern, not from a shipped product.
Do not quote it as a product measurement.

### 2.5 Documented limits and warnings

The sandbox has no network. The documentation says: "Internet access: Completely disabled for
security" and "External connections: No outbound network requests permitted".
Resources are 5 GiB RAM, 5 GiB disk, and 1 CPU.
Each REPL cell has a 90-second wall-clock limit.
Containers expire 30 days after creation.
Container data is kept for up to 30 days, and the feature is not eligible for zero data retention.
Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool

The most important warning is verbatim: "`allowed_callers` controls how the tool is presented to
Claude and is validated against `tool_choice`, but it is not a hard API-level block on direct
invocation ... **Do not rely on `allowed_callers` as a security boundary.**"
Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling

A second warning covers injection: "Tool results are returned as strings: They can contain any
content, including code snippets or executable commands that may be processed by the execution
environment."
Same source.

Anthropic states the cost of the pattern: "Running agent-generated code requires a secure execution
environment with appropriate sandboxing, resource limits, and monitoring. These infrastructure
requirements add operational overhead and security considerations that direct tool calls avoid."
Source: https://www.anthropic.com/engineering/code-execution-with-mcp

Programmatic tool calling does not work with `strict: true` tools.
It does not work with `disable_parallel_tool_use: true`.
Recursive `$ref` input schemas fail with a 400 error that says "Circular $ref detected".
Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling

**For Sero:** Sero's plugin tool schemas must be checked for recursive `$ref` before code mode.
The "not a security boundary" warning applies directly, because Sero host functions run unsandboxed.

### 2.6 Claude Code has a second, different shape

Claude Code ships "dynamic workflows".
The documentation says: "A dynamic workflow is a JavaScript script that orchestrates many subagents
at once. Claude writes the script for the task you describe, and a runtime executes it in the
background."
The script API is `agent()`, `pipeline()`, `parallel()`, `phase()`, and `log()`.
The script has no filesystem access and no shell access.
A script that contains `import()` fails before the run starts.
`Date.now()` and `Math.random()` throw inside the script.
Source: https://code.claude.com/docs/en/workflows

**For Sero:** This shape orchestrates agents, not tools. It shows a useful rule.
Block non-determinism in the guest, so a run can be replayed or resumed.

---

## 3. Others

### 3.1 Cloudflare Code Mode

The post is "Code Mode: the better way to use MCP", 26 September 2025.
Source: https://blog.cloudflare.com/code-mode/

The argument is verbatim: "LLMs have seen a lot of code. They have not seen a lot of 'tool calls'.
In fact, the tool calls they have seen are probably limited to a contrived training set constructed
by the LLM's own developers ... Whereas they have seen real-world code from millions of open source
projects."
Same source.

The mechanism converts the MCP schema into a TypeScript API with doc comments.
The model then gets one tool that runs its TypeScript.
Same source.

The sandbox is a V8 isolate from the Dynamic Worker Loader API.
The sandbox has no internet: "The global `fetch()` and `connect()` functions throw errors".
The code reaches MCP servers only through bindings, so API keys never enter the sandbox.
Same source.

The original post gives **no measured number**. It says "striking results" only.
Same source.

A later Cloudflare post gives numbers.
The Cloudflare API has "over 2,500 endpoints".
Code Mode exposes it in "roughly 1,000 tokens of context", against an estimated 1.17 million tokens.
Cloudflare calls that a 99.9% input-token reduction.
Source: https://blog.cloudflare.com/code-mode-mcp/

Cloudflare warns about its own choice: "hardening an isolate-based sandbox is tricky", and security
bugs in V8 are "more common than security bugs in typical hypervisors".
Source: https://blog.cloudflare.com/dynamic-workers/

Cloudflare made one combination illegal.
`requiresApproval` and `replay: "reexecute"` cannot be used together.
Source: https://developers.cloudflare.com/agents/tools/codemode/api-reference/

**Lesson to copy:** Control network egress at the sandbox edge.
Pass credentials through bindings that the generated code cannot read.

**Lesson to avoid:** Do not mix a human approval gate with re-execution replay.
Replaying code that pauses for approval has no clear meaning.

**For Sero:** Sero's `run` sandbox has the same shape, and `interrupt()` is the approval seam.
The map must decide the approval semantics early, because two vendors hit this wall.

### 3.2 smolagents and the CodeAct paper

The paper is "Executable Code Actions Elicit Better LLM Agents", Wang and others, 1 February 2024.
Source: https://arxiv.org/abs/2402.01030

The abstract says: "Our extensive analysis of 17 LLMs on API-Bank and a newly curated benchmark
shows that CodeAct outperforms widely used alternatives (up to 20% higher success rate)."
Same source.

The efficiency claim is: CodeAct does this "while requiring up to 30% fewer actions".
Source: https://arxiv.org/html/2402.01030v4

The new benchmark is M3ToolEval, with 82 instances that need several tool calls.
Same source.

smolagents makes the default behaviour dangerous, and says so: "By default, the `CodeAgent` runs
LLM-generated code in your environment. This is inherently risky, LLM-generated code could be
harmful to your environment."
Source: https://huggingface.co/docs/smolagents/tutorials/secure_code_execution

Its `LocalPythonExecutor` is an AST interpreter, not CPython.
Imports are blocked unless allowlisted.
An operation cap stops infinite loops.

The documented allowlist trap is verbatim: "some seemingly innocuous packages like `random` can
give access to potentially harmful submodules, as in `random._os`."
Same source.

The plain warning is: "no local python sandbox can ever be completely secure ... The only way to run
LLM-generated code with truly robust security isolation is to use remote execution options like E2B
or Docker".
Same source.

**Lesson to copy:** An AST interpreter with an import allowlist is a cheap first layer.
Publish it as a layer, never as a boundary.

**Lesson to avoid:** Do not treat an import allowlist as a security boundary.

**For Sero:** CodeAct supplies the only accuracy evidence, and it is from 2024.
The 20% and 30% numbers apply to multi-call tasks, which agrees with Anthropic's negative result.

### 3.3 Vercel AI SDK Code Mode

Vercel ships a first-party code mode.
The documentation says: "Code mode lets a model write JavaScript or TypeScript that calls your AI
SDK tools. The generated code runs in an isolated QuickJS sandbox and returns a JSON-serializable
result."
Each tool appears "through the global `tools` object".
Source: https://ai-sdk.dev/docs/ai-sdk-core/code-mode

QuickJS denies Node globals, the filesystem, `fetch`, WebCrypto, `eval`, and dynamic `Function`.
Same source.

The critical caveat is verbatim: "Tools execute in your host application, outside the QuickJS
sandbox, and every capability exposed by a provided tool is available to the generated program."
Same source.

Vercel also blocks approval flows: "Code mode does not currently integrate with AI SDK tool approval
flows ... Do not expose tools that rely on user approval to code mode."
Same source.

Programs and tool arguments cross the boundary as JSON only.
Vercel states the posture: "Treat the sandbox as defense in depth. Generated code and tool arguments
are untrusted."
Same source.

Vercel publishes **no measured token claim** on that page.

**Lesson to copy:** Say clearly that the sandbox protects the process, not the tools.
Move authorization and input validation inside each tool.

**Lesson to avoid:** The approval collision again. Approval-gated tools have nowhere to suspend.

**For Sero:** This is the closest match to Sero's plan, because Sero also chose QuickJS.
Vercel's caveat is Sero's open question about hostile-program posture, and it is already answered
in the negative: the host functions are the real attack surface.

### 3.4 LangChain langgraph-codeact

LangChain ships a CodeAct implementation and cites the same paper.
Source: https://github.com/langchain-ai/langgraph-codeact

Its README ships an `exec()`-based evaluator with this warning: "Use a sandboxed environment in
production! The `eval` function below is just for demonstration purposes, not safe!"
Same source.

**Lesson to avoid:** Do not ship a reference implementation whose default executor is raw `exec()`.
People copy the example and skip the one-line warning.

### 3.5 OpenAI

OpenAI Code Interpreter is not code-mode tool calling.
The documentation says: "A container is a fully sandboxed virtual machine that the model can run
Python code in."
Source: https://developers.openai.com/api/docs/guides/tools-code-interpreter

A mechanism for the developer's own function tools to run inside that container is **not
documented**.

A container expires after 20 minutes of no use.
OpenAI advises: "treat containers as ephemeral and store all data related to the use of this tool on
your own systems."
Same source.

**Lesson:** A data-analysis sandbox is not a tool-composition sandbox.
The reach-back seam is the whole feature, and OpenAI does not document one.

### 3.6 Microsoft AutoGen

No primary source was verified. **Not documented** in this pass.

---

## 4. Cross-cutting patterns

Two vendors hit the same wall on their own: human approval cannot survive inside generated code.
Cloudflare made the combination illegal. Vercel told users to exclude such tools.
Design approval as a sandbox-level pause, or exclude approval-gated tools.

Every source that ships a local executor also warns that it is not a real boundary.
Only separate isolates, or separate machines, are described as isolating.

The strongest measured claims are about context, not about accuracy.
Cloudflare claims 99.9%. Anthropic's blog claims 98.7%. Anthropic's docs claim 20% to 40% typical.
The only accuracy evidence is still the 2024 CodeAct paper: 20% higher success, 30% fewer actions.

Anthropic is the only source that publishes a negative result.
Code mode costs about 8% more on tasks with one or two sequential calls.

## 5. What is not documented

- A pi code-execution tool, a pi sandbox, or a pi tool-calls-tool seam. None exist.
- A shipped Anthropic mode that exposes MCP servers to the sandbox as importable modules.
- A beta header for Anthropic programmatic tool calling. None is listed.
- A measured token claim in Cloudflare's original Code Mode post.
- A measured token claim on Vercel's code mode page.
- A way to call developer function tools from inside OpenAI Code Interpreter.
- Any head-to-head measurement of code mode against a batching tool such as `sero-cli`.
