# Search A/B benchmark

This harness compares exhaustive `rg` with the plugin's registered `find`,
`grep`, and `multi_grep` tools. It loads the extension through Pi, so the FFF
arm includes the same query construction, output formatting, limits, and error
handling that an agent sees.

## Run it

```bash
pnpm --filter @sero-ai/plugin-fff bench -- \
  --repo /path/to/repo \
  --iterations 10 \
  --json out.json
```

Both arms return at most 20 results. The `rg` command still finishes its full
scan before the harness caps the returned text. Runs alternate arm order and
rotate task order. The JSON records per-task median and p95 latency summaries.

## Metrics and limits

| Metric | Meaning |
| --- | --- |
| Result tokens~ | Returned characters divided by four. This is a stable estimate, not model billing usage. |
| Median / p95 search time | Repeated warm search latency for the complete tool call. |
| Answer in results | The expected file appears in the bounded returned text. This is a retrieval proxy, not task completion. |
| FFF index ready | Time from `session_start` until the plugin's warm-up completes or reaches its scan bound. |
| Process max RSS | Operating-system maximum RSS for the benchmark process. It includes Pi and FFF, but not child-process `rg` memory. |

The harness does not measure whether a model completes a task or decides to
search again. Run `pnpm eval:search` from the repository root for that layer.
The model eval compares Bash, FFF, Graphify, and FFF plus Graphify on a seeded
repository. It repeats each task five times and records tool calls, latency,
usage, and task completion. It includes an exhaustive case where all arms must
use shell search and a profile-wide case that only Graphify can answer.

`rg` remains the correctness path when completeness matters. A result cap makes
the context-cost comparison fair, but it does not turn `rg` into a ranked tool
or FFF into an exhaustive one.

## Recorded run

`results/sero-repo.json` records the latest local run. Treat it as a machine and
checkout sample, not a universal performance claim. Compare new runs on the
same machine, checkout, Node version, iteration count, and power state.

The current macOS arm64 sample used 10 runs per task. The summed per-task
medians were 318 ms for `rg` and 12 ms for FFF. Estimated returned tokens were
2,862 and 2,107. Bounded-result retrieval was 78/80 for `rg` and 70/80 for FFF.
FFF missed the naming-variants task in every run; this is evidence against a
blanket recall claim and a reason to keep the exhaustive fallback explicit.

## Recorded model run

A local Promptfoo run on 2026-08-29 used
`anthropic/claude-haiku-4-5`: six tasks, four arms, and five repeats. The eval ID
is `eval-o1D-2026-08-29T19:57:54`. This is a small seeded repository. Use the
result to compare agent behavior, not to predict production savings.

| Metric | Bash | FFF | Graphify | FFF + Graphify |
| --- | ---: | ---: | ---: | ---: |
| Contract completion | 30/30 | 30/30 | 29/30 | 30/30 |
| Behavioral assertion | 30/30 | 28/30 | 29/30 | 27/30 |
| Ranked-task preferred tool | 10/10 | 8/10 | 10/10 | 7/10 |
| Exhaustive task used Bash | 5/5 | 5/5 | 5/5 | 5/5 |
| Cross-workspace contract | 5/5 refused | 5/5 refused | 5/5 answered | 5/5 answered |
| Search calls | 66 | 50 | 40 | 38 |
| Follow-up searches | 41 | 25 | 11 | 8 |
| Estimated search-result tokens | 2,885 | 2,554 | 2,721 | 2,694 |
| Median search-tool time | 21 ms | 18 ms | 19 ms | 5 ms |
| Median task latency | 7,251 ms | 5,346 ms | 5,859 ms | 5,226 ms |
| p95 task latency | 18,650 ms | 18,194 ms | 14,579 ms | 12,116 ms |
| Model usage tokens | 708,385 | 750,555 | 529,843 | 674,793 |
| Estimated model cost | $0.379 | $0.426 | $0.339 | $0.417 |

The combined arm answered every available task, made 42% fewer search calls
than Bash, and had 28% lower median task latency. Graphify added the only path
to the second workspace. FFF reduced search-result text by 11% against Bash,
but the model ignored its ranked tools in two of ten ranked cases. It ignored
them in three of ten combined cases. All five of those tool-choice failures
still returned the correct answer through Bash.

The Graphify-only arm had one 193-second provider call that returned no model
response. Its lower usage and cost therefore cover 29 completed cases, not 30,
and are not directly comparable with the complete arms. All local graph tasks
were also solvable through source search in this small fixture. The evidence
supports using FFF and Graphify together, with Bash kept for exhaustive search;
it does not show that either plugin should replace the other.

Export a Promptfoo result and generate the same metric report with:

```bash
node eval/report-search-eval.mjs /path/to/exported-eval.json
```
