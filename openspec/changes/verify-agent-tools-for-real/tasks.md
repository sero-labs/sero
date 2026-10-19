# Tasks

## 1. Issue scope

- [x] 1.1 Ask Dan to approve replacing the narrowed "Focused v1.0 release slice" comment on #626 with the full scope of this change, then post the edit and verify the issue shows the new comment

## 2. Core CLI subcommand maps

- [x] 2.1 Add an optional `subcommands` map (name to handler) to `CliCommand` in `electron/cli/core/types.ts`, and make the registry expose a command's subcommand names; verify with a CLI unit test that a command's names equal its map keys
- [x] 2.2 Convert the subcommand dispatch in each core command that has one (`workspace`, `session`, `git`, `vcs`, `devserver`, `terminal`, `browser`, `editor`, `app`, `appstate`, `artifacts`) to its map, keeping each unknown-subcommand message; verify the existing CLI unit tests and `cli.contract.spec.ts` pass unchanged

## 3. Inventory and coverage check

- [x] 3.1 Build the inventory module (design decision 1): platform tools from `createRuntimeTools` with browser automation available, bundled plugin tools from each plugin's `pi.extensions` entry through a recording `ExtensionAPI` (leaving out `uiOnlyTools`), the inline factories, and core command subcommands; verify a vitest lists `automation_browser` with its 14 actions, `orchestrator` with its actions and `workspace` with its subcommands, and omits `goals`
- [x] 3.2 Add the probe table format under `e2e/helpers/tool-check/` (scenario steps with `expect`, or exemptions with a reason limited to "paid outside service" or "real outside account"); verify it type-checks with one sample module
- [x] 3.3 Add the coverage check vitest that fails on a missing entry, a stale entry or an empty reason; verify each failure with a fixture table, and verify it runs in `pnpm --filter @sero/desktop test` with no model, browser or container
- [x] 3.5 Add a `test.yml` step that runs the coverage check file on every PR outside turbo; verify on the branch that a PR touching only a plugin extension file runs the step
- [x] 3.4 Write a scenario or exemption for every inventory entry, one module per tool, building local fixtures where a step needs one (bare git remote, `e2e/fixtures/test-mcp-server`, local HTTP page server, small graphify workspace); verify the coverage check passes

## 4. Scenario driver and ledger

- [x] 4.1 Extend `startProbeStub` in `e2e/helpers/session-probe.ts` with a scenario mode that emits one step, reads its result from the next request, runs `expect` and records the outcome; verify with a unit test in `e2e/helpers/__tests__/`
- [x] 4.2 Add the ledger writer and the final ledger comparison (design decision 5); verify with a unit test that a non-exempt action missing from a ledger fails and is named with its site and runtime
- [x] 4.3 Add the `tools` Playwright project (`*.tools.spec.ts`) and the `e2e:tools` script, with one host-artifacts directory per run so the browser pack installs once; verify an empty `tools` spec starts and stops the app on host
- [x] 4.4 Add the Workflow worker harness: create a one-step Orchestrator plan through `sero-cli orchestrator`, with the stub as the step model, and run it; verify the step session's tool list reaches the stub and the step finishes

## 5. Action pass

- [x] 5.1 Run every action from the Chat panel through its direct tool or `sero-cli`, on host; verify the ledger has every chat-reachable non-exempt action with a pass, and fix each fault found in its owning tool or plugin as its own commit
- [x] 5.2 Run the remaining actions at the first site in the design order that is given the tool (subagent, Workflow worker, Architect owner, Room member), answering approval cards and interactive tools through the UI, on host; verify the ledger comparison passes for host
  - Done 2026-10-19 after the #660 fix: full host run, 77 passed in 4.1 minutes, ledger comparison clean.
- [x] 5.3 Move the hang-recovery, 10 second load, host screenshot and host recording checks from `tools-browser-agent-real-browser.test.ts` into the `automation_browser` scenario, then delete that file; verify the scenario passes on host

## 6. Site pass, failures and cancellation

- [x] 6.1 At each site (Chat panel, subagent, Workflow worker, Architect owner, Room member, Code Mode script from chat and from a subagent), read the live tool and command list and run each tool once; verify the ledger comparison passes per site on host
- [x] 6.2 In each Code Mode script site, run one failing call per tool and check that it rejects and that the next script line does not run; verify the ledger records each rejection
- [x] 6.3 Add the cancellation checks: cancel a long `bash` command and a Code Mode script waiting on a nested call, at each site; verify the session accepts the next prompt each time
- [x] 6.4 Add the `sero-cli` check for a quoted argument with line breaks, quotes and non-ASCII text; verify the command receives one unchanged argument

## 7. Container runtime

- [ ] 7.1 Run the action and site passes with `SERO_E2E_RUNTIME=docker` on Linux, building the image locally when the branch changes `Dockerfile.sero-node`; verify the Docker ledger comparison passes, and fix each container-only fault in its owning code
- [ ] 7.2 Run both passes with `SERO_E2E_RUNTIME=apple-container` on a Mac; verify the Apple Container ledger comparison passes
  - Open: the fixtures now work in a container and the run gets through, but it fails in ways the host run does not: turn undo never snapshots (#662), and cancels, git status freshness, one `git_manager refresh` and one browser click fail without a proven cause (#663).

## 8. Real-model pass

- [x] 8.1 Add `deepseek/deepseek-flash` as a provider and model option in `e2e/helpers/llm.ts`, with thinking set to high for the tool check; verify a dry run resolves the model and credential key name without spending
- [ ] 8.2 Add the one-task-per-site real-model pass behind the `real_model` switch; verify one live run on host passes every site, and record its cost in the PR description

## 9. CI workflow and docs

- [ ] 9.1 Add `.github/workflows/tool-check.yml` with `workflow_dispatch` only, the target and `real_model` inputs, one job per target, `xvfb` on Linux and a browser pack cache keyed by pack version; verify `linux-host`, `linux-docker`, `macos-host` and `windows-host` each pass from a manual dispatch on the branch
- [ ] 9.2 Confirm the repository has the DeepSeek API key secret the real-model pass reads, or ask Dan to add it; verify a `real_model` dispatch reaches the model
- [ ] 9.3 Document the coverage check, how to add a scenario or exemption for a new tool, and how to start the full run locally and in CI in `apps/docs-site/docs/reference/testing-evals.md`; verify each documented command runs as written

## 10. Acceptance: the six #626 faults

- [x] 10.1 Put back each of the six faults from #626 one at a time by reverting its fix, run the target that should catch it and restore the fix. Expected catches: failed `sero-cli` in Code Mode reported as success (6.2), quoted argument split at line breaks (6.4), host screenshot and host `stop_recording` path failures (5.3), 26 second launch and navigate (5.3), stuck page with no recovery (5.3). Verify each run fails and names the fault, and record the six results in the PR description

## 11. Follow-up issues

- [x] 11.1 Open GitHub issues for the out-of-scope defects in the proposal: cron sessions use Pi built-in tools that bypass the workspace runtime, and `tools-host.ts` is used only by tests so those tests skip the production tools; verify both issues exist and link to this change

## Workflow follow-up

- Run `pnpm typecheck` from the root before each commit, and once with `--force` before the final report.
- Open the pull request as a draft.
- Archive the change after review and merge.
