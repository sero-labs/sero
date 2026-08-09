# Proof moment miner

Local draft loop for the Sero growth campaign (see
[`docs/marketing/sero-growth-strategy.md`](../../sero-growth-strategy.md),
"Sero Growth Loop Catalog"). This is **not** an official catalog entry — it
lives here as a reviewable draft until it is proven, then moves to the
planned `sero-growth-catalog` repo.

## What it does

When pull requests merge into the repository's default branch, the loop:

1. Resolves which PRs the push merged (read-only `gh` / `git`), and always
   adds a catch-up scan of the 10 most recently merged PRs, skipping any PR
   already recorded in the `docs/marketing/proof-moments/judged.jsonl`
   verdict ledger. The catch-up covers debounced batches, merges that happen
   while the loop is off, and manual runs (which carry no event payload and
   simply mine the backlog).
2. Reads each PR's diff, description, and linked issues, and judges it
   against the campaign's proof bar for developers who use coding agents:
   would a viewer think *"that is not just a chat UI"*, *"the agent can
   actually see the app"*, or *"the workspace extends itself"* — in a demo
   of about 60 seconds?
3. For each PR that clears the bar, writes one draft file at
   `docs/marketing/proof-moments/pr-<number>-<slug>.md` containing:
   - the proof-moment description (what's on screen, which bar statement it hits),
   - a draft X post in the campaign format (hook, one-sentence context,
     `[video]` slot, three concrete claims, GitHub link, low-pressure star ask),
   - a 60-second demo script / shot list.

Most merged PRs are **not** demoable — refactors, type fixes, plumbing,
tests, docs. The loop is built to conclude "nothing here" and write nothing;
that counts as a successful run. It never stretches a weak idea into a post.

## Trigger

`event` on **`github:main-updated`**, debounced 15 minutes.

There is no `github:pr-merged` event kind (the supported kinds live in
`plugins/sero-orchestrator-plugin/runtime/events/github-kinds.ts`).
`github:main-updated` fires on every push to the default branch — which is
exactly what merging a PR produces — so the first step resolves the merged
PRs from the push's commit range and ignores direct pushes with no
associated PR. No `eventFilter` is needed: the adapter only emits this kind
for the default branch.

## Outputs

- Markdown draft files under `docs/marketing/proof-moments/`, one per
  demoable PR.
- One appended line per judged PR in `docs/marketing/proof-moments/judged.jsonl`
  (the ledger that stops re-judging). Nothing else.

## No external side effects

- `gh` and `git` are used strictly read-only.
- The loop never posts, comments, pushes, sends, or schedules anything.
- Delivery destination is `workspace-files` (internal); the final step
  inspects `git status` and refuses to complete quietly if anything outside
  `docs/marketing/proof-moments/` changed.
- Drafts are for a human to review, record, and post.

## Validating the definition

The definition passes the exact validation a catalog install performs. From
`plugins/sero-orchestrator-plugin/`, with this directory staged into a
catalog-shaped folder (index `catalog.json` + `loops/proof-moment-miner/`):

```bash
SERO_CATALOG_DIR=/path/to/staged-catalog npx vitest run runtime/__tests__/catalog-content.test.ts
```
