# Design

## Context

See proposal.md for why. The current state this design builds on:

- **The tool code is shared across call sites.** Chat, subagent and Workflow worker sessions all build `bash`, `read`, `write`, `edit`, `sero-cli` and `automation_browser` with `createRuntimeTools` (`electron/features/container/tools/tools.ts`). Architect and Room member sessions build the same tools through `createMemberRuntimeTools`. Code Mode runs nested calls through the session's own tool pipeline (`ctx.executeTool`). What changes between sites is the wiring: the allowlist, the working directory, whether a tool is direct or bridged into `sero-cli`, and how a result is shaped for a script (`outputSchema`, `isError`).
- **No single function returns a session's tools.** They come from runtime tools passed as `customTools`, inline extension factories (`codemode`, `subagent`, `create_agent`, `tool_search`) and plugin extensions calling `pi.registerTool`. The subagent tool catalog warm-up (`warmSubagentToolCatalog`) already loads every installed plugin into a throwaway in-memory Pi session, with no model, and reads `session.getAllTools()`.
- **Actions can be read from code.** Tool parameters are TypeBox schemas, so at run time an `action` property is JSON schema: `enum` for `StringEnum`, `anyOf` of `const` for a `Type.Union` of literals (`BrowserParams` in `tool-schemas.ts`). Core Sero CLI commands are the exception. Each one dispatches its subcommands through a `switch` inside `execute` (for example `cli/commands/workspace/workspace.ts`), so nothing outside the function can see them.
- **The harness already exists.** `e2e/session-tools.contract.spec.ts` with `e2e/helpers/session-probe.ts` and `e2e/helpers/stub-model.ts` opens chat, subagent, Architect owner, Room member and cron sessions in real Electron against a scripted stub model, and answers the Allow cards through the UI. It proves each tool is reachable. Most tools get `{}` or `help <name>`, and `automation_browser` is never launched on host.
- **Runtime plumbing exists.** `SERO_E2E_RUNTIME` picks host, Docker (Linux) or Apple Container (macOS) in `e2e/helpers/runtime.ts`. `ensureDockerImage` inspects, pulls `ghcr.io/sero-labs/sero-node:latest`, or builds `Dockerfile.sero-node`. `BrowserPackInstaller` downloads and verifies the published host browser pack, and `runtime-host-release.workflow.spec.ts` already exercises it.

## Goals / Non-Goals

**Goals:**

- A coverage check whose inventory is read from the code, so the list cannot fall behind.
- One real run per runtime that executes every non-exempt action and checks its effect.
- Per-site checks that cover what differs between sites, without running every action at every site.

**Non-Goals:**

- Replacing `session-tools.contract.spec.ts`. It checks the exact tool list per session kind and keeps running nightly.
- Testing a model's judgement. The stub model drives every action. The real-model pass proves only that a real model can drive the tools.
- MCP server tools that a user installs, the `apps/agent-node` tool surface, and cron sessions' use of Pi's built-in tools. The proposal lists these as follow-up issues.

## Decisions

### 1. Inventory: load the real tools, read the schemas

A vitest module builds the inventory as a list of `(tool, action)` pairs. A tool with no `action` property is one pair, `(tool, null)`. Sources:

- Platform tools from `createRuntimeTools` against a stub `RuntimeBackend` that reports browser automation as available, so `automation_browser` is included.
- Bundled plugin tools. For each `plugins/sero-*-plugin`, the module imports the `pi.extensions` entry named in its `package.json` and calls it with a recording `ExtensionAPI` that captures each `registerTool` name and schema and treats every other API as a no-op. The Design Library and MCP plugin tests already load their extensions this way. Tools the plugin lists in `sero.plugin.uiOnlyTools` are left out, because no agent can call them.
- Inline factories: `codemode`, `subagent`, `create_agent`, `tool_search`.
- Core Sero CLI commands from the registry, one pair per subcommand (decision 2).

Actions come from `parameters.properties.action`: `enum`, or `anyOf[].const`.

Alternative considered: scan source files for `registerTool` names. Rejected because it misses schemas built at run time and cannot read action values reliably.

Alternative considered: load the plugins through Pi's real resource loader, as the catalog warm-up does. Rejected for the unit-test check because the warm-up runs inside Electron main with `ensureAiInfra`, and no existing vitest loads a real bundled plugin that way.

Alternative considered: take the inventory from the live app during the e2e run. Rejected because it runs only when a person starts the full check, so a new tool would not fail any PR.

### 2. Core CLI commands dispatch through a subcommand map

Each core command that dispatches on its first argument (`workspace`, `session`, `git`, `vcs`, `devserver`, `terminal`, `browser`, `editor`, `app`, `appstate`, `artifacts`) replaces its `switch` with a `subcommands` map from name to handler, and `execute` dispatches through it. `CliCommand` gains an optional `subcommands` field. The inventory reads the map's keys, so the declared list and the handled list are the same object. `set-title` and `help` take an argument, not a subcommand, so each is one inventory entry with no action.

Alternative considered: a separate `subcommands: string[]` next to the `switch`. Rejected because the two can drift, and drift is the failure this change exists to stop.

### 3. One probe table, shared by the coverage check and the run

The table lives under `e2e/helpers/tool-check/`, one module per tool, and the vitest `node` project already includes `e2e/helpers`. Each module exports either a scenario or exemptions:

- A **scenario** is an ordered list of steps. Each step names its action, its arguments, an optional setup, and an `expect` function that receives the result and the workspace path and checks the effect. A mutating tool runs as a sequence: create, show, change, delete.
- An **exemption** names the action and a reason. Two reasons are allowed: the action needs a paid outside service, or it needs a real outside account. "Needs setup" is not a reason. The scenario builds the setup.

The coverage check compares the table with the inventory and fails on a missing entry, a stale entry or an empty reason.

Local fixtures stand in for outside systems where they can: a bare git repository as a push and pull remote, the existing `e2e/fixtures/test-mcp-server` for `mcp` and `mcp_manager`, a local HTTP server for browser pages and `fetch_content`, and a small workspace for `graphify_*`. Interactive tools (`question`, `questionnaire`, `interview`) and approval cards are answered through the app UI, as the contract spec already does for Allow.

### 4. The run: every action at one site, every tool at every site

The specs require every action per runtime and every tool per site. The run meets both without multiplying them:

- **Action pass.** Each action runs once per runtime, at the first site in this order whose session is given the tool: Chat panel, subagent, Workflow worker, Architect owner, Room member. Most plugin actions run from chat through `sero-cli`. Member-only tools such as `room` run from a Room member.
- **Site pass.** At every site, including a Code Mode script started from chat and from a subagent, the run reads the session's live tool list and command list, then runs each tool once with its first scenario step. In Code Mode it also runs one failing call per tool, which must reject.
- **Fixed checks** for the six #626 faults and for cancellation, listed in tasks.md against the scenario that catches each one.

Shared tool code is why one action pass per runtime is enough. A defect that lives in the wiring, such as a host member's working directory or a script's result shape, shows up in the site pass.

The driver extends `startProbeStub` with a scenario mode: it emits one step's tool call, reads the tool result from the next request's message history, runs `expect`, records the outcome and emits the next step. No second stub is built.

### 5. A ledger makes skipped work fail

Every step writes `{ runtime, site, tool, action, result, ms }` to `test-results/tool-check/ledger-<runtime>.json`. A final test in the run compares the ledger with the inventory and with each site's live tool list. It fails on any non-exempt action or site tool missing from the ledger. The run report lists every exemption with its reason.

This catches a scenario that silently did not run, which a passing assertion cannot.

### 6. Where it runs

- **Coverage check:** an ordinary vitest file in the desktop package, so it runs in `pnpm test`. `test.yml` also runs that one file in its own step on every PR, outside turbo. The desktop `test` task does not depend on the plugin packages, so under `turbo run test --affected` a change to a plugin extension alone would not re-run it.
- **Full run:** a `tools` Playwright project (`*.tools.spec.ts`) and an `e2e:tools` script. Locally, `SERO_E2E_RUNTIME` picks host, `docker` or `apple-container`.
- **CI:** a new `.github/workflows/tool-check.yml` with `workflow_dispatch` only. Its inputs are a target (`all`, `linux-host`, `linux-docker`, `macos-host`, `windows-host`) and a `real_model` boolean. Linux jobs run under `xvfb`.
- **Browser pack on host:** the run sets `SERO_HOST_ARTIFACTS_ROOT_OVERRIDE` to one directory for the whole run, so the pack installs once, and CI caches that directory by pack version.
- **Docker:** `ensureDockerImage` as the app uses it. When the branch changes `Dockerfile.sero-node`, the job builds the image first, so the run tests the branch's image and not `latest`.

Alternative considered: nightly or per-PR runs. Rejected by Dan: the full run costs too much and takes too long to run without a person choosing to.

### 7. Real-model pass

When `real_model` is on, the run adds one short task per site and runtime, using `deepseek/deepseek-flash` with thinking set to high, through the existing `e2e/helpers/llm.ts` gating. The task asks the model to write a file, read it back and run one command, and the pass checks the effect. It never runs the stub's action pass with a real model, which keeps the spend to a few calls per site.

### 8. The macOS-only real-browser test is folded in

`tools-browser-agent-real-browser.test.ts` hardcodes a mac-arm64 Chromium path and revision, and no CI sets `SERO_BROWSER_PACK`. Its checks (hang recovery, the 10 second load bound, screenshot and recording on host) become steps of the `automation_browser` scenario, which runs on every OS, and the file is deleted.

## Risks / Trade-offs

- [A bundled plugin does work when it loads, such as network calls or child processes, which makes the coverage check slow or flaky] → The check stubs host capabilities the way existing plugin tests do. A plugin that cannot load without real network access gets fixed in its load path, since the catalog warm-up hits the same problem.
- [Scenarios that use Unix commands fail on Windows host] → `bash` steps call `node -e` or other cross-platform commands, and file effects are checked from the test process.
- [`latest` on GHCR lags a branch's Dockerfile] → The workflow builds the image when the branch changes the Dockerfile (decision 6).
- [The run finds many faults at once and the change grows] → Each fault is fixed in its owning tool or plugin as its own commit, and a fault that needs a product decision goes to Dan before it is fixed.
- [The subcommand map touches 11 commands across 9 files] → The change is mechanical. The existing `cli.contract.spec.ts` and the CLI unit tests cover the behaviour.
- [A long full run] → Each target runs as its own job, so a person can start one target to check one fix.
