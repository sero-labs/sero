# Testing / Evals

Sero uses repository tests and promptfoo evals as separate quality signals.
Not every suite runs for each pull request. Run real LLM evals only when their
provider cost and credentials are intentional.

## Current root command surface

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
pnpm eval:snapshot
pnpm eval:search
pnpm eval
pnpm eval:view
```

`pnpm test` runs `turbo run test`. Use the root commands above as the supported
entry points.

## CI workflows

The **Test** workflow runs for pushes to `main`, pull requests to `main`, and
manual dispatch. It classifies changed paths. The affected jobs run
`pnpm typecheck`, `pnpm build`, and `pnpm test`.

The root `pnpm test:ci` command also runs `pnpm e2e:contract`, but the **Test**
workflow does not call that root command. The separate **E2E Contract** and
**E2E Agent** workflows run each day and by manual dispatch. **E2E Workflow** is
manual-only. No workflow runs `pnpm eval` or `pnpm eval:snapshot`.

## Evals command reference

| Command | Source script | When to use | Cost/auth |
| --- | --- | --- | --- |
| `pnpm eval:snapshot` | `node eval/patch-drizzle.cjs && node scripts/run-promptfoo.mjs eval --config eval/promptfoo-snapshot.yaml --no-cache` | Fast prompt assembly/cache drift check | No live LLM calls; low/no provider cost. |
| `pnpm eval:search` | `node eval/patch-drizzle.cjs && node scripts/run-promptfoo.mjs eval --config eval/promptfoo-search.yaml --no-cache` | Bash, FFF, Graphify, and combined search behavior, five runs per task and arm | Requires credentials and may cost money. |
| `pnpm eval` | `node eval/patch-drizzle.cjs && node scripts/run-promptfoo.mjs eval` | Real agent behavior checks | Requires credentials and may cost money. |
| `pnpm eval:view` | `node scripts/run-promptfoo.mjs view` | Inspect saved promptfoo results | No new model calls. |

## Snapshot evals

Snapshot evals use `eval/promptfoo-snapshot.yaml` and `eval/snapshotProvider.ts`. They assemble an approximation of the full Sero session prompt from real prompt-building functions and check:

- SDK/base prompt block presence
- CLI prompt block presence
- container/subagent prompt guidance where applicable
- prompt block ordering for cache stability
- full prompt size against baseline
- metadata completeness

Run snapshot evals before committing changes to prompt assembly, CLI instructions, container prompt blocks, subagent guidance, or session setup.

## Real LLM evals

Real evals use `promptfooconfig.yaml` and `eval/seroProvider.ts`. They run through promptfoo with actual model calls. The default config uses the Sero provider with a 120s timeout and an Anthropic grading provider for rubric assertions.

The search eval uses `eval/promptfoo-search.yaml`. Its Bash, FFF, Graphify, and
combined arms receive the same seeded repository and tasks. It covers ranked
lookup, exhaustive lookup, dependency tracing, architecture explanation, and a
profile-wide lookup in a second workspace. The provider records tool names,
arguments, result text estimates, tool latency, total token usage, and total
latency.

The Graphify arms load the real plugin hooks and query engine. The fixture
seeds known graph files and profile state, so this eval does not run the Python
indexer. Graph commands use the bridged `sero-cli` model tool. The Bash and FFF
controls must report that profile-wide search is unavailable rather than search
outside the current workspace. Promptfoo runs cases serially so temporary
profiles and native indexes do not overlap across arms.

Set `SERO_EVAL_MODEL` to use a specific model in all arms. Use a canonical
`provider/model` value, for example:

```bash
SERO_EVAL_MODEL=anthropic/claude-haiku-4-5 pnpm eval:search
```

If you do not set it, the eval uses the default model in the Sero agent settings.

Auth/cost notes:

- `pnpm eval` can consume paid provider tokens.
- It expects provider credentials such as `ANTHROPIC_API_KEY` from the shell or eval environment handling.
- The eval provider can apply env credentials as runtime API-key overrides before falling back to `~/.sero-ui/agent/auth.json`.
- Do not run live evals in CI or on PRs unless budget and credentials are explicitly intended.

## Scenario matrix

| Scenario file | Tests | Mode | Coverage |
| --- | ---: | --- | --- |
| `eval/scenarios/prompt-stability.yaml` | 7 | Snapshot | Prompt block presence, ordering, size, and metadata. |
| `eval/scenarios/file-ops.yaml` | 3 | Real LLM | Create/read/edit file behavior and latency. |
| `eval/scenarios/coding-tasks.yaml` | 3 | Real LLM | TypeScript/React generation, null-safety fixes, utility generation. |
| `eval/scenarios/cli-ops.yaml` | 4 | Real LLM | `sero-cli` use for todos, workspace info, batch commands, and VCS status. |
| `eval/scenarios/search-tools.yaml` | 6 × 4 arms × 5 repeats | Real LLM | Task completion, tool choice, cross-workspace coverage, follow-up count, result size, and latency for Bash, FFF, Graphify, and their combination. |

To add scenarios, create/edit a YAML file under `eval/scenarios/` and add it to the relevant promptfoo config.

## Failure interpretation

| Failure | Likely next step |
| --- | --- |
| Snapshot says a block is missing | Inspect prompt assembly source and confirm the block is still intentionally included. |
| Snapshot ordering fails | Treat as cache-sensitive; confirm the prompt order change was intentional. |
| Prompt size growth fails | Remove accidental verbosity or update the baseline with an intentional prompt change. |
| `pnpm eval` auth fails | Check env credentials and stale profile auth under `~/.sero-ui/agent/auth.json`. |
| Real eval times out | Inspect provider latency and scenario complexity; adjust timeout only when justified. |
| Tool-sequence assertion fails | Inspect `context.providerResponse.metadata.toolCalls` in the result viewer. |
| Search eval uses FFF for the exhaustive case | Treat it as a contract failure; the model must use `bash` with `rg` when completeness matters. |
| Graphify command appears in a Bash call | Treat it as a prompt or bridge failure; Graphify commands must use the `sero-cli` model tool. |
| LLM rubric fails | Read the output; rubrics are useful but can be noisy. |

## Relationship to other tests

| Risk area | Best current signal | Notes |
| --- | --- | --- |
| Prompt assembly / cache stability | `pnpm eval:snapshot` | Low-cost check for prompt block drift, ordering drift, and size regressions. |
| Agent file-editing behavior | `pnpm eval` | Exercises real tool use in isolated temp workspaces. |
| Agent CLI usage patterns | `pnpm eval` | Checks that the agent prefers `sero-cli` in supported scenarios. |
| Search and graph behavior | `pnpm eval:search` | Compares task completion and tool choice; use the FFF plugin benchmark for model-free latency samples. |
| Desktop startup/session wiring | desktop Vitest + Playwright CI | Not primarily an eval concern. |
| Plugin/runtime bridge regressions | package tests + focused e2e | Better covered by targeted source tests. |
| Container lifecycle/full-render UX | local/manual Playwright runs | Environment-sensitive and not a generic promptfoo check. |

## Related docs

- [Running Evals](/guide/running-evals)
- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
