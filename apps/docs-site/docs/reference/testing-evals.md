# Testing / Evals

Sero uses repository tests and promptfoo evals as separate quality signals. The current alpha model is truthful rather than exhaustive: not every suite is a PR gate, and real LLM evals are usually manual/nightly/release-confidence checks.

## Current root command surface

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:ci
pnpm eval:snapshot
pnpm eval
pnpm eval:view
```

Do not describe a repo-wide `turbo run test` public contract for the alpha; the root public test commands are the ones above.

## PR gate

GitHub Actions currently uses the root command:

```bash
pnpm test:ci
```

That expands to:

1. `pnpm typecheck`
2. `pnpm build`
3. `pnpm test` (desktop Vitest, non-watch)
4. `pnpm --filter @sero/desktop test:e2e:ci`

This is the current alpha PR-gate shape. It does not run every package/plugin suite or every eval.

## Evals command reference

| Command | Source script | When to use | Cost/auth |
| --- | --- | --- | --- |
| `pnpm eval:snapshot` | `node eval/patch-drizzle.cjs && node scripts/run-promptfoo.mjs eval --config eval/promptfoo-snapshot.yaml --no-cache` | Fast prompt assembly/cache drift check | No live LLM calls; low/no provider cost. |
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
| LLM rubric fails | Read the output; rubrics are useful but can be noisy. |

## Relationship to other tests

| Risk area | Best current signal | Notes |
| --- | --- | --- |
| Prompt assembly / cache stability | `pnpm eval:snapshot` | Low-cost check for prompt block drift, ordering drift, and size regressions. |
| Agent file-editing behavior | `pnpm eval` | Exercises real tool use in isolated temp workspaces. |
| Agent CLI usage patterns | `pnpm eval` | Checks that the agent prefers `sero-cli` in supported scenarios. |
| Desktop startup/session wiring | desktop Vitest + Playwright CI | Not primarily an eval concern. |
| Plugin/runtime bridge regressions | package tests + focused e2e | Better covered by targeted source tests. |
| Container lifecycle/full-render UX | local/manual Playwright runs | Environment-sensitive and not a generic promptfoo check. |

## Related docs

- [Running Evals](/guide/running-evals)
- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
