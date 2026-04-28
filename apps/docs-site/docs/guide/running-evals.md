# Running Evals

Use Sero evals when you need a structured signal about prompt assembly or agent behavior. Snapshot evals are fast and local. Real LLM evals call providers and can cost money.

Source checked: `docs/testing/eval-guide.md`, `package.json`, `promptfooconfig.yaml`, `eval/promptfoo-snapshot.yaml`, and `eval/scenarios/**`.

## Pick the right command

| Command | When to use | Cost/auth |
| --- | --- | --- |
| `pnpm eval:snapshot` | Prompt assembly/cache drift checks | No live LLM calls; low/no provider cost. |
| `pnpm eval` | Full promptfoo eval against real providers | Requires credentials and may cost money. |
| `pnpm eval:view` | Inspect saved promptfoo results | No new model calls. |

Run commands from the monorepo root.

## Snapshot eval workflow

```bash
pnpm eval:snapshot
```

Snapshot evals assemble Sero prompt blocks and check presence, ordering, size, and metadata. Run them before committing changes to agent prompts, CLI prompt blocks, container prompt blocks, subagent prompt guidance, or session setup.

If a snapshot fails after an intentional prompt change, inspect the failure reason and update the relevant baseline in `eval/scenarios/prompt-stability.yaml` only with the code change that caused it.

## Real LLM eval workflow

```bash
ANTHROPIC_API_KEY=... pnpm eval
```

Real evals use promptfoo plus Sero's eval provider. They create isolated temp workspaces under `/tmp/sero-eval-*`, initialize a clean Git repo, expose file tools, and use an eval-only `sero-cli` shim for deterministic platform checks.

Run them before releases, after model/SDK upgrades, or when changing agent behavior. They are not currently claimed as a required PR gate for every change.

## Inspect results

```bash
pnpm eval:view
```

This opens Promptfoo's local result viewer so you can compare pass/fail history, scores, model output, tool metadata, and scenario details.

## Scenario matrix

| Scenario file | Mode | Coverage |
| --- | --- | --- |
| `eval/scenarios/prompt-stability.yaml` | Snapshot | Prompt blocks, ordering, prompt size, cache-stability metadata. |
| `eval/scenarios/file-ops.yaml` | Real LLM | Read/write/edit behavior and latency guards in temp workspaces. |
| `eval/scenarios/coding-tasks.yaml` | Real LLM | React/TypeScript generation, null-safety fixes, utility generation. |
| `eval/scenarios/cli-ops.yaml` | Real LLM | Agent preference for `sero-cli`, workspace info, batch commands, VCS status. |

## Interpreting failures

- **Snapshot block missing** — inspect the prompt-building source that should add that block.
- **Snapshot ordering changed** — confirm whether prompt cache behavior intentionally changed.
- **Prompt grew too much** — remove accidental verbosity or update the baseline only for intentional growth.
- **Real eval tool sequence failed** — inspect tool metadata; the agent may have used raw tools instead of the expected platform tool.
- **LLM rubric failed** — read the output before assuming product code is broken; rubrics can be noisy.
- **Auth/provider failure** — check `ANTHROPIC_API_KEY` or profile auth state.

## Related docs

- [Testing / Evals Reference](/reference/testing-evals)
- [Development Setup](/guide/development-setup)
- [Sero CLI](/reference/sero-cli)
