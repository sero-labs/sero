## 1. Shared wiring

- [ ] 1.1 Add one module that exports the Code Mode extension factory (`mode: 'on'`, `models: false`) and a function that switches `codemode` on for a session. Verify with a unit test that a session built with it has `codemode` active.
- [ ] 1.2 Use the module in `ipc/agent/core/agent-session-open.ts` in place of `createRunCodeController`, and switch the tool on before the base tool list is read. Verify that the context editor lists `codemode` and that disabling it removes it from the next request (contract spec with the stub model).
- [ ] 1.3 Use the module in `features/subagent/runtime/runner.ts` in place of `createRunCodeController`, and change the policy name from `run_code` to `codemode`. Verify that `__tests__/features/subagent/runner.test.ts` passes with a subagent that has `codemode` and no `run_code`.

## 2. Failed shell command inside a script

- [ ] 2.1 Read how Sero's `bash` tool and Pi's `executeTool` set `isError`, and record the chosen fix in design.md if it differs from the design. Verify by a note in the pull request description.
- [ ] 2.2 Make a non-zero exit code a failed outcome for an inner call. Verify with a test: a script that runs a command which exits with 3 gets a failed nested call with the exit code, and a direct `bash` call still reports the failure.

## 3. Output optimizer

- [ ] 3.1 Change `plugins/sero-output-optimizer-plugin/extension/nested.ts` to detect an inner call by the Code Mode id shape. Verify that its `rewrite.test.ts` and `extension.test.ts` pass with ids of the form `<parent>/<n>`, and that a direct call is still rewritten.
- [ ] 3.2 Update the reserved-prefix text in `packages/common/src/plugins.ts` and bump the `@sero-ai/common` patch version. Verify that `pnpm typecheck` passes and the version in `packages/common/package.json` changed.

## 4. Inner-call rows in the chat

- [ ] 4.1 Port the main-process half from #609 (`f75004eca`): `agent-subscription.ts` forwards nested-call updates and `agent-messages.ts` rebuilds rows on reopen. Keep `src/types/ipc.ts` and `src/types/agent.ts` in step. Verify that `pnpm typecheck` passes.
- [ ] 4.2 Port the renderer half from #609: `stores/agent-nested-tools.ts` and its test, `NestedToolRows.tsx`, and the edits to `ToolCallGroup.tsx`, `ToolDetailBody.tsx` and `stores/agent-utils.ts`. Verify that `agent-nested-tools.test.ts` passes.
- [ ] 4.3 Add contract coverage with the stub model: rows appear while a script runs, a failed call shows as failed, rows are present after a reopen, and a cancel of a subagent stops its running script. Verify that the spec passes after a build.

## 5. Prompt text and gates

- [ ] 5.1 Change the `bash` prompt text in `features/container/tools/tools-host.ts` and `tools-coding.ts` to name `codemode`, and put the batching guidance in the `edit` description. Verify that `tools-system-prompt.test.ts` passes.
- [ ] 5.2 Change the remote-skill gate in `plugins/sero-mcp-plugin/extension/runtime/runtime-skills.ts` to list `codemode`, and update the plugin README. Verify that `runtime-skills.test.ts` passes.

## 6. Delete run_code

- [ ] 6.1 Delete `apps/desktop/electron/features/code-mode/` and its unit tests. Verify that `pnpm typecheck` passes.
- [ ] 6.2 Remove the `run` dependency from `apps/desktop/package.json` and update the lockfile. Verify that `pnpm install --frozen-lockfile` passes.
- [ ] 6.3 Convert `__tests__/features/container/edit-run-code.test.ts` to run its edit cases through `codemode`, or delete the cases that the contract spec now covers. Verify that the desktop unit suite passes.
- [ ] 6.4 Update `e2e/session-tools.contract.spec.ts`, `e2e/output-optimizer.agent.spec.ts` and `e2e/helpers/session-probe.ts` to the new tool name. Verify that the two contract specs pass after a build.
- [ ] 6.5 Search the repository for `run_code`, `runCode` and `code-mode`. Verify that the only results are in `openspec/changes/archive/`, changelogs, and this change.

## 7. Docs

- [ ] 7.1 Rewrite `apps/docs-site/docs/guide/code-mode.md` for `codemode`: JavaScript only, the `timeout_ms` option, the image limit, the live rows. Update the mentions in `guide/index.md` and `guide/agent-sessions-and-context.md`. Verify that the docs site builds.

## 8. Final checks

- [ ] 8.1 Run `pnpm typecheck --force` from the root. Verify no errors.
- [ ] 8.2 Run the desktop unit suite and, after a build, the full contract suite with an isolated profile and no provider keys. Verify that all pass.
- [ ] 8.3 Record in the pull request description the size of the start-up prompt with `codemode` against the number in #609. Verify that the number is in the description.
- [ ] 8.4 Open a draft pull request that closes #611, then close #609 with a comment that names this pull request. Verify that both links resolve.
