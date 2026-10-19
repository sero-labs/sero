# Proposal

## Why

The tests for agent tools fake the runtime, so the real host path rules, the real browser and Pi's real Code Mode pipeline never run under test. One evening of manual testing on PR #624 found six broken tool behaviours, five of them older than that PR, and no test caught any of them (issue #626). The nearest existing check, `session-tools.contract.spec.ts`, proves a tool is reachable, not that it works: most tools get one call with no arguments or `help <name>`, the host browser is never launched, and the Code Mode probe is `return 1;`.

## What Changes

- Add a model-free tool inventory, built from the code, that lists every tool and every action an agent session can be given: platform tools, Code Mode, agent-management tools, every bundled plugin tool and every core Sero CLI command. A tool's actions are read from its parameter schema, so nobody keeps the list by hand.
- Add a probe table that gives each inventory entry a real scenario with expected results, or an exemption with a written reason. A vitest check fails on a missing entry, a stale entry or an exemption with no reason. It runs in the existing `pnpm test`, takes seconds and needs no model, browser or container.
- Add a `tools` Playwright project that runs every scenario for real against a fresh profile with the stub model. Every action runs once per runtime. Every call site (Chat panel, subagent, Workflow worker, Architect owner, Room member, Code Mode script) runs each tool it is given at least once. Each run writes a ledger of what ran, and the run fails if any non-exempt action is missing from it.
- Run it on host and on a container workspace. Linux covers host and Docker. macOS and Windows cover host. Apple Container runs locally on a Mac only.
- Add a manually started GitHub workflow. It does not run on PRs or on a schedule.
- Add an optional real-model pass on `deepseek/deepseek-flash` at high thinking. It runs one short task per call site to prove a real model can drive the tools.
- Give core Sero CLI commands a declared list of their subcommands, so the inventory can see them.
- Make the six #626 faults the acceptance test: with each fault put back, the run fails and names it.
- Fold the macOS-only real-browser vitest test into the browser scenario and delete it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-tool-surface`: adds requirements that every tool action works when run for real, at every call site, in both runtime modes, and that coverage cannot fall behind the tool list.

## Impact

- `apps/desktop/e2e/`: new `tools` project, scenario modules per tool, a ledger, and local fixtures (bare git remote, the existing `fixtures/test-mcp-server`, a local web page server).
- `apps/desktop/playwright.config.ts`, `apps/desktop/package.json` (`e2e:tools` script).
- `apps/desktop/electron/cli/core/types.ts` and each core command in `apps/desktop/electron/cli/commands/` for the subcommand list.
- New `.github/workflows/tool-check.yml`, manual dispatch only.
- `apps/desktop/electron/__tests__/features/container/tools-browser-agent-real-browser.test.ts` is removed.
- Faults the run finds are fixed in the owning tool or plugin as part of this change.
- Out of scope, each to get its own issue: cron sessions use Pi's built-in tools, which bypass the workspace runtime and run on the host for a container workspace; `tools-host.ts` is used only by tests, so those tests never run the production `bash`, `read`, `write` and `edit`; the separate `apps/agent-node` tool surface; MCP server tools a user installs.
