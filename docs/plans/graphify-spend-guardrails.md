# Graphify — spend guardrails, cost control, and transparency

**Date:** 2026-08-20
**Status:** investigation + plan (no code changes yet)
**Trigger:** Graphify was enabled on several local repos and used the Anthropic
credits two times. The repos were small. The cause was not visible in the UI.

---

## 1. Summary

Graphify spends money in one place only: `graphify extract` (and the
`cluster-only` pass that follows it). Everything else — `update`,
`merge-graphs`, all queries — is local.

The investigation found **ten defects that can waste or repeat a paid build**
and **seven gaps in control and transparency**.

Two defects each duplicate a full build one time per trigger, which matches the
report of paying two times:

* A build that fails is repeated in full at **every** Sero start, forever
  (§3.1).
* One user action can be applied two times, because the request list is not
  drained atomically (§3.2).

Three more explain a large bill from small repositories:

* The indexer builds any workspace a caller names, even one the host registry
  does not know, and then **deletes the graph it just paid for** (§3.8).
* The rule that keeps the global workspace out of the index exists in discovery
  only, so the **memory store** — `MEMORY.md` plus the append-only daily logs —
  can be indexed through that hole. Dense prose is the most expensive input per
  file, because graphify chunks by tokens, not by file count (§3.9).
* The `graphify_index` agent tool takes a free-form path, so an agent session
  can start a paid extraction of any directory (§3.10).

The library itself contributes. Sero pins **graphifyy 0.8.36**; upstream is
**0.9.47**. An open upstream bug (#2880) turns one rate-limited response into
up to 15 billed calls — a measured **18× token blow-up** — and the pin misses
six later fixes for work that was billed a second time because the cache or the
manifest failed (§5).

There is no confirmation, no estimate, no cost display, no daily cap, and no
setting in the UI. The plugin cannot say which model it used, and it cannot say
which library version produced a graph.

---

## 2. Where the money goes

| Step | Command | Cost |
|---|---|---|
| Full build | `graphify extract <ws> --backend claude …` | **LLM — the main cost** |
| Community names | `graphify cluster-only <dir> --no-viz` | **LLM — not measured today** |
| Incremental update | `graphify update <ws>` | none (AST only) |
| Profile merge | `graphify merge-graphs …` | none |
| Search / query / path / explain | TypeScript engine | none |

Entry points that start a **full** build today:

1. The workspace switch in the Graphify panel — `ui/GraphifyApp.tsx:79`.
2. The **Index all** button — `ui/GraphifyApp.tsx:43`.
3. The **Enable Graphify indexing** switch in the create-workspace dialog,
   which is **on by default** — `package.json` → `contributes.controls`.
4. The `graphify_index` agent tool with `enable`, `rebuild`, or `enable-all`.
5. The boot catch-up in `runtime/indexer.ts:62-65`.

Only 1–4 are user actions. Number 5 is automatic.

---

## 3. Defects that repeat paid builds

### 3.1 A failed build is repeated in full at every start — `runtime/indexer.ts:64`

```ts
this.enqueue(entry.workspaceId, entry.status === 'building' || !entry.lastBuiltAt);
```

`lastBuiltAt` is written only after a build succeeds (`indexer.ts:359`). So an
enabled workspace whose build failed — or which was interrupted — has no
`lastBuiltAt` and gets `full = true` at **every** Sero start. There is no
attempt counter, no backoff, and no message to the user.

The failure modes below (3.5, 3.6, and a bad API key) all end after the money
is spent. The loop is therefore: pay → fail → restart Sero → pay again.

The existing tests cover only the success case
(`runtime/indexer.test.ts:87`, `:102`); the error case is not tested.

### 3.2 The request list can be drained two times — `runtime/indexer.ts:69-76`

```ts
const requests = [...state.requests];
await this.host.updateState((current) => ({ ...current, requests: [] }));
for (const request of requests) await this.applyRequest(request);
```

The read of `state.requests` and the write that clears them are separate
`await`s. The state file watcher can deliver the same file content two times:
`state/manager.ts:220-234` re-establishes the watcher on `rename` (an atomic
write is a rename) and calls `handleFileChange` itself, while a `change` event
takes the other path — each with its own 50 ms debounce. If the second delivery
is read before the clear lands, the same `enable` request is applied two times.

`enqueue` (`indexer.ts:294`) removes duplicates only against jobs **still in
the queue**. The running job has already been shifted off it
(`indexer.ts:309`), so the second copy is appended and runs a second full
build when the first one ends.

**Fix:** drain inside one `updateState` callback (the state manager runs the
updater inside its serialised write queue — `state/manager.ts:104-113`), and
keep a `lastAppliedRequestId` watermark for the cross-process case.

### 3.3 `enable` always means "rebuild" — `runtime/indexer.ts:257-260`

`enable` and `rebuild` both call `enable(request, true)`. The panel switch
sends `enable`. So a user who switches a workspace off and on again pays the
full build price again, although the graph is still on disk. The
create-workspace switch sends the same request for every new workspace.

### 3.4 `Index all` has no confirmation and rebuilds what is already indexed

`GraphifyApp.tsx:43` → `enable-all` → `indexer.ts:273-279` walks **every**
workspace in state, including the disabled ones and the ones already indexed,
with `rebuild = true`. One click can start a full paid build for every repo in
the profile. There is no confirmation and no estimate.

### 3.5 A paid build is discarded when stdout passes 1 MiB — `runtime/bounded-exec.ts:63-68`

```ts
if (bytes > maxOutputBytes) { child.kill('SIGKILL'); ... }
```

`DEFAULT_MAX_OUTPUT_BYTES` is 1 MiB and `buildWorkspaceGraph`
(`graphify-runner.ts:99`) does not raise it. A chatty extract on a repo with
many files can pass 1 MiB of progress lines. The process is then killed after
the tokens are spent, the run is recorded as an error, and §3.1 repeats it at
the next start.

An output limit must protect memory, not cancel work. Keep the tail, do not
kill the build.

### 3.6 The `cluster-only` pass is unchecked and invisible — `runtime/graphify-runner.ts:111`

```ts
await deps.exec(deps.graphifyPath, ['cluster-only', options.workspaceDir, '--no-viz'], …);
```

The spike notes state that `cluster-only` **names communities with the LLM
unless `--no-label` is given**. This second paid pass:

* runs with the API key in its environment,
* has **no exit-code check** (a failure is silent),
* has **no stat parsing**, so its tokens and cost never reach the UI.

### 3.7 The extraction cache may not be reused (must be measured) — `runtime/graphify-runner.ts:55,98`

`--out` is `workspaceDir`, while `GRAPHIFY_OUT` is
`workspaceDir/graphify-out`. If graphify writes its extraction cache under one
root and looks for it under the other, **every** rebuild pays the full price,
and the assumption in the design spec that "the first build is the only large
cost" does not hold. This must be measured before any retry or rebuild
behaviour depends on it.

### 3.8 A build for an unconfirmed workspace is paid for and then deleted — `runtime/indexer.ts:213-255`, `:158-190`

`applyRequest`'s `enable` path accepts a caller-supplied `workspaceId`,
`workspaceName`, and `workspacePath`. When the host workspace registry does not
know that id, the indexer **still creates the entry** (with
`pendingHostDiscovery: true`) and **still runs the full paid build**. The entry
survives while the build is active (`indexer.ts:166-172` keeps any entry whose
status is `queued`/`building`/`updating`), and the next discovery sync then
deletes the entry **and** calls `removeWorkspaceArtifacts` on the graph that was
just paid for.

The behaviour is not accidental — the test at `runtime/indexer.test.ts:327`
asserts it: a build for `/p/building`, a path `listWorkspaces()` never returns,
runs to completion and is then removed.

The user pays, gets nothing, and the panel keeps no record, because the entry
that held `stats` and `lastError` was deleted with it.

### 3.9 The `global` workspace is excluded in discovery only — `runtime/indexer.ts:101`

```ts
const workspaces = (await this.host.listWorkspaces()).filter((ws) => ws.id !== 'global');
```

Discovery skips the global workspace, so it never appears in the panel. Nothing
enforces that rule at **build** time. Combined with §3.8, a
`graphify_index enable` request that carries `workspaceId: 'global'` plus a name
and a path builds it anyway.

That directory is the memory store — `~/.sero-ui/workspaces/global/` holds
`MEMORY.md`, `IDENTITY.md`, `USER.md`, and the append-only daily logs in
`memory/daily/YYYY-MM-DD.md` (`docs/features/memory.md:36-43`). It grows every
day, it is dense prose, and prose is the most expensive input per file for an
LLM extraction. A small number of files there can cost much more than a large
code repository, because graphify chunks by **tokens** (default 60000 per
chunk), not by file count. `.graphifyignore` does not help: it excludes
`.sero/`, not `memory/`.

This is the best explanation for a large bill from repositories that hold few
files.

### 3.10 The agent tool can point graphify at any directory — `extension/index.ts:144-186`

`graphify_index` exposes `workspaceId`, `workspaceName`, and `workspacePath` as
free-form parameters. The description says "supplied by a host contribution",
but nothing enforces it: the model can pass any values. With §3.8 there is no
registry check, so **an agent session can start a paid extraction of any path on
the machine**, and the result is then deleted by the next sync.

---

## 4. Gaps in control and transparency

| # | Gap | Evidence |
|---|---|---|
| 4.1 | **No settings UI.** No backend, model, budget, or exclude control. The state JSON is the only way to change them. | `ui/GraphifyApp.tsx`; `docs/plugins/graphify.md:16` |
| 4.2 | **The model is unknown.** `model: ''` means "the backend default". Sero never shows or records which model ran. | `shared/types.ts:91` |
| 4.3 | **`tokenBudget` is not a spend cap.** The spike notes say `--token-budget` is **per chunk** (default 60000). The type comment calls it a "per-build LLM token cap". A larger value spends more, not less. | `shared/types.ts:15`; spike notes |
| 4.4 | **No cost display.** graphify prints `est. cost (~claude): $0.51`; `parseBuildStats` reads tokens only, and the card shows tokens only. | `runtime/graphify-runner.ts:39-50`; `ui/GraphifyApp.tsx:67` |
| 4.5 | **No confirmation before spend**, although the host already supports one and another plugin already uses it. | `packages/common/src/app-runtime-notifications.ts:45`; `sero-design-library-plugin/runtime/media/budget.ts` |
| 4.6 | **No ceiling of any kind.** Each build may run 60 minutes, the queue is unbounded, and nothing counts spend per day or per profile. | `runtime/graphify-runner.ts:27` |
| 4.7 | **The paying account is not shown.** The credential resolver accepts `key`, `apiKey`, `token`, or `access` from `auth.json`, so a subscription OAuth token can be exported as `ANTHROPIC_API_KEY`. The user is never told which credential pays. | `apps/desktop/electron/features/apps/runtime/capabilities/provider-credentials.ts:13-23` |

The design spec promised most of this ("Cost & safety controls" — backend/model
settings, per-build token budget, token usage in the UI). Only the state fields
shipped; the controls did not.

---

## 5. The upstream library — https://github.com/Graphify-Labs/graphify

Sero pins **graphifyy 0.8.36** (`runtime/provisioner.ts:7`). Upstream is at
**0.9.47** (2026-08-19). The pin is hard-coded, so the user cannot update it:
`GRAPHIFY_INSTALL_SPEC` names the exact version, and only a Sero release can
change it. The panel does not even show which version is installed — it shows
`provisioning.status` only (`ui/GraphifyApp.tsx:41`), although
`provisioning.version` is already in state.

### 5.1 A live upstream bug can multiply the bill by 18

**Issue #2880 (open):** "Hollow responses are relabelled as truncation and
bisected, so one bad response costs up to 15 billed calls (measured 18x token
blow-up)".

`_response_is_hollow()` cannot tell a truncated answer from an empty one. A
rate limit, a transport error, or a refusal returns an empty HTTP 200. The
extractor reads that as "the answer was too long", splits the chunk, and
retries each half — recursively, to `max_retry_depth=3`. Bisection cannot
converge on an empty answer, so the whole sub-tree is billed. The reporter
measured **~18× the input tokens for an identical graph** during a service
disruption.

This matters for Sero specifically:

* Sero indexes workspaces **one after another** with the same key. A rate limit
  in the middle of that queue is likely, and a rate limit is exactly the
  trigger.
* Sero shows tokens only after the run, so an 18× run looks like a normal run.
* `max_retry_depth` has no CLI flag, so Sero cannot bound it today.

The bisection path already exists in 0.8.36 (the 0.8.43 note describes the
community labeller copying "the extract path"), so the pinned version is
affected — and it also lacks the **0.9.6** fix for an *infinite* chunk
bisection on the `claude-cli` backend.

### 5.2 The pin misses six upstream fixes for repeat billing

Every one of these landed after 0.8.36:

| Version | Fix |
|---|---|
| 0.9.42 | A corrupt semantic-cache entry was a silent cache miss that **re-billed the LLM every run**. |
| 0.9.41 | A warm cache hit re-anchored `source_file` to a ghost path when the working directory differed from the graph root — Sero always runs with `cwd` set to the store dir, not the workspace (`graphify-runner.ts:100`). |
| 0.9.37 | `graphify update` stamped a failed file as up-to-date forever, and the `claude-cli` backend swallowed a rate-limit error as an empty success. |
| 0.9.28 | `--update` on macOS **re-extracted everything** when a path held non-ASCII characters. |
| 0.9.27 | `cache/stat-index.json` used absolute keys, so a moved or cloned corpus **re-extracted everything** and the index grew without limit. |
| 0.9.17 | `manifest.json` dropped every freshly-extracted semantic document, which **broke the incremental baseline**; hyperedge-only documents were **re-extracted on every run**. |
| 0.9.18 | A truncated chunk was promoted to the semantic cache as complete. |

The 0.9.41, 0.9.27, and 0.9.17 items are the family that §3.7 asks about:
whether Sero's split of `--out` (the store dir) from the corpus path keeps the
cache warm. On 0.8.36 the answer is probably **no**, which means every rebuild
pays full price.

**Issue #2879 (open)** is the same shape: files classified as failed extraction
are re-queued on every incremental run.

### 5.3 Options the library already offers and Sero does not use

* **`claude-cli` backend.** graphify can call the Claude Code CLI (`claude -p`)
  instead of the Anthropic API. Work then runs against the **Claude Code
  subscription** rather than API credits. The backend has existed since 0.8.24,
  so the pinned version has it. Sero's backend list
  (`shared/types.ts:1`, `runtime/credentials.ts:10`) does not offer it. Note
  that it defaults to **Opus**, and `GRAPHIFY_CLAUDE_CLI_MODEL=haiku` makes it
  cheap (upstream issue #2861 asks for this to be documented).
* **`azure` and `bedrock` backends** also exist and are missing from Sero's
  list.
* **The model is choosable and namable.** The `claude` backend default is
  `claude-sonnet-4-6` in 0.9.47, and `ANTHROPIC_MODEL` overrides it
  (`llm.py:107`). Sero can therefore always state the exact model instead of
  sending `model: ''` and not knowing.
* **Bounding knobs:** `GRAPHIFY_MAX_RETRIES` (0 disables retries),
  `GRAPHIFY_API_TIMEOUT`, `GRAPHIFY_MAX_OUTPUT_TOKENS`, and
  `--max-concurrency`. Setting `GRAPHIFY_MAX_RETRIES` is the one lever that
  limits the §5.1 blow-up today. Each must be verified against the pinned
  version before we depend on it.
* **`estimate_cost()` prices per backend, not per model** (`llm.py:2796`), so
  the `est. cost` line graphify prints is wrong whenever a non-default model
  runs. Sero's own estimate must price the model it actually selects.

There is **no** upstream dry-run or pre-flight estimate. Sero must build that
itself (Phase 2).

---

## 6. Plan

The rule that the plan applies everywhere:

> **Money is spent only by an explicit user action, with the model, the size,
> and the estimated cost on screen before the action. A restart never spends.**

### Phase 0 — Confirm on the affected machine (do this first)

```bash
# What graphify state says about each workspace (status, lastError, tokens)
cat ~/.sero-ui/apps/graphify/state.json | jq '.settings, .workspaces'

# Every build start, failure, and orphan sweep
grep -n "\[graphify\]" ~/.sero-ui/logs/dev/sero-electron.log

# The real cost lines that graphify printed
grep -n "est. cost\|tokens:" ~/.sero-ui/logs/dev/sero-electron.log

# Did a build run for a workspace the host never confirmed? (§3.8, §3.9)
grep -n "removing undiscovered workspace\|removing orphaned graph artifacts" \
  ~/.sero-ui/logs/dev/sero-electron.log

# How large is the memory store that §3.9 would have indexed?
du -sh ~/.sero-ui/workspaces/global
find ~/.sero-ui/workspaces/global -name '*.md' | wc -l
wc -c ~/.sero-ui/workspaces/global/MEMORY.md ~/.sero-ui/workspaces/global/memory/daily/*.md | tail -1
```

This tells us which of §3.1, §3.2, §3.5, or §3.6 fired. Keep the output — it
becomes the test fixture.

### Phase 1 — Stop the repeat spend (bug fixes, no new UI)

1. **A restart never starts a paid build.** Replace the boot catch-up rule
   (`indexer.ts:62-65`): an enabled workspace with a graph on disk gets the
   free AST `update`; an enabled workspace **without** a graph gets a new
   `needs-build` status and waits for the user. Record `lastAttemptAt`,
   `lastPaidAttemptAt`, and `failureCount` on the entry.
2. **Drain requests atomically.** Read and clear inside one `updateState`
   callback, and store `lastAppliedRequestId` in state. Ignore any request id
   at or below the watermark.
3. **Deduplicate against the running job.** Hold the active job on the indexer.
   A request that targets it sets a `rerunRequested` flag instead of appending
   a second build.
4. **`enable` stops meaning `rebuild`.** `enable` on a workspace that already
   has a graph only sets `enabled: true`. Only `rebuild` spends.
5. **`enable-all` becomes safe.** It touches only workspaces with no graph, and
   it always confirms first (see Phase 2).
6. **Do not kill a paid build for being chatty.** Give the build commands a
   tail ring-buffer instead of a hard kill; keep the kill for the short probes
   (`--version`, install).
7. **Make the cluster pass honest.** Check its exit code, parse its stats, and
   pass `--no-label` unless the user opts in to LLM community names.
8. **Never build a workspace the host does not confirm.** The indexer must ask
   the host registry for the id before it spends. An unknown id is refused with
   a clear message, not built and then deleted (§3.8). Delete the assertion in
   `indexer.test.ts:327` and replace it with the opposite one.
9. **Enforce the `global` exclusion where the money is spent**, not only in
   discovery (§3.9). One shared `isIndexable(workspaceId)` helper, used by
   discovery **and** by `applyRequest`.
10. **Never delete a paid graph silently.** If a workspace disappears after its
    graph was built, keep a tombstone record of the cost and tell the user, or
    keep the artifacts until the user removes them.
11. **Restrict the agent tool.** `graphify_index` must resolve a workspace from
    the registry. The `workspacePath` parameter must not be free-form input
    from the model (§3.10).
12. **Correct the misleading comment** on `tokenBudget` (§4.3) so nobody treats
    it as a spend cap.
13. **Bound the retry blow-up now.** Export `GRAPHIFY_MAX_RETRIES` (and an
    explicit `--api-timeout`) on the extraction environment, after verifying
    both against the pinned version. This limits §5.1 without waiting for an
    upstream fix.

### Phase 2 — Real guardrails

1. **Pre-flight estimate.** Before a build, list the files graphify will read
   (after `.gitignore`, `.graphifyignore`, and `--exclude`) and measure their
   **bytes**, not only their count — graphify chunks by tokens, so 20 dense
   markdown files can cost more than 2000 small source files. Show
   "N files · M MB · ~X tokens · ~$Y with `<model>`", and log it.
2. **Confirmation before spend.** Use
   `ctx.host.notifications.requestChoice` — the same pattern as
   `sero-design-library-plugin/runtime/media/budget.ts`. Always confirm a first
   build and any `enable-all`; confirm a rebuild when the estimate is over the
   per-build cap. A dialog nobody answers is a **no**.
3. **Hard caps in settings**, enforced in the indexer:
   * `maxCostPerBuildUsd` (default: a small number, ~$2)
   * `maxCostPerDayUsd` per profile (default ~$10)
   * `maxFilesPerBuild`
   When a cap is reached, the queue stops and the user is notified. It does not
   retry.
4. **A spend ledger in graphify state** — `{ day, usd, runs: [{ workspaceId,
   model, tokens, usd, at }] }` — so the cap survives a restart and the panel
   can show the total.
5. **Pass `--max-concurrency`** from settings (it exists and is unused today).
6. **A Pause switch** in the panel that empties the queue and blocks new paid
   work.

### Phase 2b — The library version

1. **Raise the pin** from 0.8.36 towards 0.9.47 (§5.2). Do it as one deliberate
   bump with the E2E build re-run, not as a range. The 0.9.17 / 0.9.27 / 0.9.41
   cache and manifest fixes are the reason.
2. **Show the version.** Put `provisioning.version` in the panel next to the
   status badge — the state field already exists and is never displayed.
3. **Check for a newer release** and offer an update. graphifyy is a PyPI
   package installed with `uv tool install`, so a check is one query and an
   update is a re-install with a new spec. The upgrade must be a user action,
   because a new extractor version can invalidate the semantic cache (see the
   0.9.40 note: "This invalidates cached semantic chunks, which re-extract on
   the next run") — an automatic upgrade would therefore **spend money**. Say
   so in the dialog.
4. **Keep the pin as the floor**, and record the version that produced each
   graph in the workspace stats, so a rebuild after an upgrade is explainable.
5. **Report §5.1 and §3.7 upstream** with our numbers, and subscribe to #2880
   and #2879.

### Phase 3 — Control and transparency in the UI

1. **A settings section in the Graphify panel:** backend, model (a real list
   per backend, plus "backend default"), caps, concurrency, exclude patterns,
   and "index new workspaces automatically". This removes the need to edit the
   state file.
2. **Offer the `claude-cli` backend** (§5.3) as the default choice where the
   user has Claude Code, with `GRAPHIFY_CLAUDE_CLI_MODEL` set to a cheap model.
   It moves indexing onto the subscription instead of API credits. Add `azure`
   and `bedrock` to the backend list at the same time.
3. **Show the model and the paying account** on the pre-flight dialog and on
   every workspace card. Record the resolved model in the build stats, so an
   old build says which model produced it.
4. **Show money, not only tokens** on the card:
   `$0.51 est. · 45k in / 9k out · claude-…`, and include the cluster pass.
5. **Change the create-workspace switch default to `false`**
   (`package.json` → `contributes.controls`). Opting a new repo into a paid
   build must be a decision, not a default.
6. **A visible error state** with a **Try again** button, in place of the
   silent restart loop of §3.1.
7. **Prototype first** in `docs/prototypes/` — the settings section and the
   pre-flight dialog (repo rule: prototype before feature work).

### Phase 4 — Tests and documentation

Deterministic tests only (no live model):

* An enabled workspace with `status: 'error'` and no `lastBuiltAt` produces
  **no** `buildGraph` call at start.
* The same request list delivered two times produces **one** build.
* A request that arrives while its own workspace is building does not queue a
  second build.
* `enable` on a workspace that has a graph does not call `buildGraph`.
* A build whose stdout passes the output limit still completes.
* The daily cap stops the queue and reports it.
* The estimator returns the same number for the same file tree.

Documentation to update: `apps/docs-site/docs/plugins/graphify.md` (a real
"What it costs" section), `plugins/sero-graphify-plugin/README.md`, and
`GUIDE.md`.

---

## 7. Suggested issues

| Issue | Phase | Priority |
|---|---|---|
| Graphify repeats a failed paid build at every start | 1 | P0 |
| Graphify can apply one index request two times | 1 | P0 |
| `enable` must not mean `rebuild` | 1 | P0 |
| A paid build is killed by the 1 MiB output limit | 1 | P1 |
| `cluster-only` spend is unchecked and unreported | 1 | P1 |
| Measure whether the extraction cache is reused between builds | 1 | P1 |
| A build for an unconfirmed workspace is paid for, then deleted | 1 | P0 |
| `graphify_index` can index any path, including the memory store | 1 | P0 |
| Bound the retry blow-up with GRAPHIFY_MAX_RETRIES | 1 | P0 |
| Estimate and confirm before a paid build | 2 | P0 |
| Per-build and per-day spend caps with a ledger | 2 | P0 |
| Raise the graphifyy pin from 0.8.36 (six repeat-billing fixes) | 2b | P0 |
| Show the graphify version and offer an upgrade | 2b | P1 |
| Report the 18x retry blow-up and cache split upstream | 2b | P1 |
| Offer the claude-cli backend (subscription, not API credits) | 3 | P1 |
| Graphify settings UI (backend, model, caps, excludes) | 3 | P1 |
| Show cost and model on the workspace card | 3 | P1 |
| New workspaces must not opt into indexing by default | 3 | P1 |
