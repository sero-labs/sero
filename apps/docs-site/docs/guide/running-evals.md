# Running Evals

Use Sero evals when you need a structured signal about prompt assembly or agent behavior. Snapshot evals are fast and local. Real LLM evals call providers and can cost money.

## Pick the right command

| Command | When to use | Cost/auth |
| --- | --- | --- |
| `pnpm eval:snapshot` | Prompt assembly and cache drift checks | No live model calls. |
| `pnpm eval:file-tools` | Runtime file-edit behavior and batching metrics | Requires credentials and may cost money. |
| `pnpm eval:memory-save` | Whether the agent saves the right memories in a conversation | Requires credentials and may cost money. |
| `pnpm eval:memory-search` | Memory recall hit rate and false-hit rate per threshold | No LLM calls. Hybrid mode uses the local embedding model. |
| `pnpm eval` | Full promptfoo eval against real providers | Requires credentials and may cost money. |
| `pnpm eval:view` | Inspect saved promptfoo results | No new model calls. |

Run commands from the monorepo root.

## Snapshot eval workflow

```bash
pnpm eval:snapshot
```

Snapshot evals assemble an approximation of a Sero session prompt. They check
block presence, ordering, size, and metadata. Run them before you commit changes
to agent prompts, CLI prompt blocks, container prompt blocks, subagent guidance,
or session setup.

If a snapshot fails after an intentional prompt change, inspect the failure reason and update the relevant baseline in `eval/scenarios/prompt-stability.yaml` only with the code change that caused it.

## Real LLM eval workflow

```bash
ANTHROPIC_API_KEY=... pnpm eval
```

Real evals use promptfoo plus Sero's eval provider. They create isolated temp workspaces under `/tmp/sero-eval-*`, initialize a clean Git repo, expose file tools, and use an eval-only `sero-cli` shim for deterministic platform checks.

The `pnpm eval:file-tools` command builds its session from Sero's host file-tool factory. Use it to check multi-replacement edits, same-file concurrency, and edit result feedback.

Run them before releases, after model or SDK upgrades, or when you change agent
behavior. Current GitHub workflows do not run `pnpm eval` or
`pnpm eval:snapshot`.

## Memory evals and report

The memory checks are reports, not build gates. Use them when you change the
memory instructions, the save rules, recall scoring or the recall thresholds.

```bash
DEEPSEEK_API_KEY=... pnpm eval:memory-save
pnpm eval:memory-search
node scripts/memory-metrics-report.mjs
```

- `pnpm eval:memory-save` plays fixed conversations in a real session with
  the memory plugin. Each conversation has known save-worthy moments: a
  correction, a preference, a decision with a reason, a surprise, and one
  conversation with nothing to save. The report lists the moments the agent
  saved, the moments it missed, and saves that were noise. Use DeepSeek flash
  or `openai-codex/gpt-5.6-luna` on the OpenAI subscription.
- `pnpm eval:memory-search` scores fixed queries against fixed memories with
  the plugin's own search. It reports the hit rate and false-hit rate for a
  range of thresholds, in keyword mode and in hybrid mode. The recall
  thresholds in the memory settings come from this report.
- `node scripts/memory-metrics-report.mjs` summarises the live metrics that
  the memory plugin writes during normal use: saves, recalls, empty turns,
  misses, pinned-rule breaks, tidy-up changes and restores. It reads
  `<SERO_HOME>/debug/memory/`. Add `--from` and `--to` (`YYYY-MM-DD`) for a
  date range, `--dir` for another folder, or `--json` for machine output.

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
| `eval/scenarios/file-edits.yaml` | Real LLM (runtime file tools) | Targeted edits, a block move, ambiguous text, failure recovery, and whole-file replacement. |
| `eval/promptfoo-memory-save.yaml` | Real LLM | Memory saves for a correction, a preference, a decision, a surprise, and a conversation with nothing to save. |
| `eval/promptfoo-memory-search.yaml` | Offline | Memory recall hit rate and false-hit rate at each threshold, in keyword and hybrid mode. |

## Interpreting failures

- **Snapshot block missing** — inspect the prompt-building source that should add that block.
- **Snapshot ordering changed** — confirm whether prompt cache behavior intentionally changed.
- **Prompt grew too much** — remove accidental verbosity or update the baseline only for intentional growth.
- **Real eval tool sequence failed** — inspect tool metadata; the agent may have used raw tools instead of the expected platform tool.
- **LLM rubric failed** — read the output before assuming product code is broken; rubrics can be noisy.
- **Memory save eval reports a miss or noise** — read the saved entries in the report; the save rules live in the memory plugin's instructions.
- **Memory search eval fails at the default threshold** — a scoring change moved hits below the threshold or false hits above it; re-read the report rows before you change a threshold.
- **Auth/provider failure** — check `ANTHROPIC_API_KEY` or profile auth state.

## Related docs

- [Testing / Evals Reference](/reference/testing-evals)
- [Development Setup](/guide/development-setup)
- [Sero CLI](/reference/sero-cli)
