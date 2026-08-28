# Search A/B benchmark

Compares the two search paths a Sero agent can take on the same task:

- **rg arm** — the `bash` pipeline an agent writes today (`rg --files`, or
  `rg --no-heading --line-number <pattern> .`).
- **fff arm** — the same question asked through this plugin's engine
  (`find`, `grep`, or `multi_grep`) with the tools' own default limit.

## Run it

```bash
pnpm --filter @sero-ai/plugin-fff bench -- --repo /path/to/repo --json out.json
```

Both arms run in one process against one checkout, after an untimed `rg` pass
so the shell arm is not charged for a cold page cache the indexed arm never
pays. Add or change tasks in `tasks.mjs`; each names the file that answers the
question, which is how the harness scores recall and rank.

## What it measures

| Metric | How |
|---|---|
| Search-result tokens | Characters of tool output ÷ 4, per arm |
| Search calls | One per task per arm, by construction |
| Time to the first relevant file | Rank of the answering file in the result list |
| Wall time | Per-search elapsed time, summed |
| Initial indexing time | `FileFinder.create` → `waitForIndexReady` |
| Peak memory | Process RSS before indexing, after indexing, after all searches |
| Successful completion | Proxy: the answering file appears in the results |

## What it cannot measure

Task completion and follow-up-search count are **model** behaviour: whether the
agent recognised the answer, and whether it searched again. This harness holds
the model constant by removing it, so a change to the search path is comparable
run to run. Put a model in the loop with the repository's promptfoo eval when
you need the behavioural half.

Rank is also not a like-for-like comparison. `rg` output is not ranked at all —
its "rank" here is just position in traversal order, which is stable for a given
checkout but carries no signal. FFF's rank is frecency-ordered, and on a fresh
profile it has no frecency history to order by, so these numbers are a floor
rather than what a working session sees.

## Recorded run

`results/sero-repo.json` is a run over this repository (3,621 indexed files) on
Linux x64. Headline numbers from that run:

| | rg arm | fff arm |
|---|---|---|
| Search-result tokens (8 tasks) | 4,655 | 3,157 |
| Search wall time (8 tasks) | 132 ms | 21 ms |
| Answering file present | 8/8 | 8/8 |
| Initial indexing | — | 57 ms |
| Peak RSS | — | 85 MB (73 MB after indexing, from a 59 MB baseline) |

Read it as: same recall, about a third fewer result tokens, and searches that
cost roughly a sixth of the wall time — for a one-off index that costs tens of
milliseconds and ~15 MB on a repository this size. It is not evidence that the
tools find things `rg` cannot; on completeness `rg` is still the correct tool,
which is what the tool descriptions tell the model.
