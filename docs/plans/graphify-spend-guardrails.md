# Graphify — spend guardrails, cost control, and transparency

**Date:** 2026-08-20
**Status:** implemented — Phases 1, 2, 2b, 3, 3b and 4. See "What shipped" below.
**Trigger:** Graphify was enabled on several local repos and used the Anthropic
credits two times. The repos were small. The cause was not visible in the UI.

---

## 1. Summary

Graphify spends money in one place only: `graphify extract` (and the
`cluster-only` pass that follows it). Everything else — `update`,
`merge-graphs`, all queries — is local.

The investigation found **eleven defects that can waste or repeat a paid
build**
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

Sero also sends `model: ''` — "use whatever graphify defaults to". §6 replaces
that with a **required** model choice, persisted to state and portable into a
copied profile.

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

### 3.11 The naming pass chooses its own provider from inherited environment variables — `runtime/graphify-runner.ts:111`

Sero calls `graphify cluster-only <dir> --no-viz` and passes **no backend and
no model**. Read the pinned code (`v0.8.36:graphify/__main__.py:3113` and
`llm.py:1918`): with no `--backend=`, the labeller calls `detect_backend()`,
which scans **environment variables** in this fixed order:

```
gemini → kimi → claude → openai → deepseek → azure → bedrock → ollama
```

Sero builds the child environment from `uvEnv()`, which spreads the **whole
Electron process environment** (`runtime/provisioner.ts:42`), and then adds the
configured backend's key. So a `GEMINI_API_KEY` or `GOOGLE_API_KEY` that exists
on the machine for any other reason **wins over the Anthropic key Sero
injected**. Community naming then bills Google while the Graphify panel says
the backend is Claude.

Two more details from the same code:

* At **0.8.36** `cluster-only` parses only the `--backend=claude` form, never
  `--backend claude` (`__main__.py:3121`). At **0.9.47** — the version this
  work ships — both forms are parsed, and `--model` is accepted and passed
  through to the labeller. The implementation uses the `=` form for both, which
  is correct on either version.
* Labels are cached in `graphify-out/.graphify_labels.json` and reused unless
  the `label` sub-command forces a refresh, so a rebuild does not pay for
  naming twice.

**Fix:** pass `--backend=<configured>` and the resolved `--model` to
`cluster-only`, and give the child a clean environment that carries only the
selected provider's key.

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
* **`azure` and `bedrock` backends** also exist upstream. Both were considered
  and **rejected**: neither maps to a Sero provider credential, so each would
  depend on `AZURE_*`/`AWS_*` variables happening to be in the environment. A
  backend a user can pick but cannot configure in the app is not a feature, and
  Bedrock also costs a boto3 install for every user to carry.
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

### 5.4 Which model actually runs (verified against the pinned tag)

Read from `v0.8.36:graphify/llm.py` — the exact code Sero installs:

| Backend | Default model in 0.8.36 | Pricing table |
|---|---|---|
| `claude` ← **Sero uses this** | `claude-sonnet-4-6` (hard-coded string) | $3 / $15 per 1M |
| `claude-cli` | Claude Code's own default, which is **Opus** | $0 / $0 (billed to the plan) |
| `gemini` | `gemini-3-flash-preview` | — |
| `openai` | `gpt-4.1-mini` | — |

So on Sero's configured path the model is **Sonnet 4.6, not Opus**. Sero sends
`model: ''`, sets no model environment variable, and 0.8.36 hard-codes the
default (the `ANTHROPIC_MODEL` override arrived later, in 0.9.x).

Upstream issue **#2861** reports the Opus default for community naming, and it
does not reach Sero. The reporter ran `graphify label . --backend=claude-cli`,
an explicit choice. Sero passes no backend there, so the labeller auto-detects
— and `detect_backend()` **excludes `claude-cli` by name**
(`v0.8.36:llm.py:1768`). The `claude-cli` backend, and therefore Opus, is
unreachable on Sero's path today. It becomes reachable the moment we adopt that
backend (§5.3), which is why the plan pins its model.

The naming pass is still wrong, for a different reason — it picks its provider
from inherited environment variables and can leave Anthropic entirely (§3.11).

Two points follow, and both belong in the plan:

1. **Nobody can tell from the product.** The panel shows no model, the state
   holds an empty string, and the build result records nothing. A user reading
   graphify's own documentation reasonably concludes Opus, because the Opus
   default is real — for the **`claude-cli`** backend. This is precisely the
   transparency gap of §4.2.
2. **The Opus default becomes ours the moment we adopt `claude-cli`** (§5.3).
   That backend runs whatever Claude Code runs, which is Opus. Sero must
   therefore always send `GRAPHIFY_CLAUDE_CLI_MODEL` and never accept the
   default. Upstream issue **#2861** is exactly this complaint.

Note also that graphify prices `claude` at a fixed $3/$15 (`llm.py` pricing
table). If Sero passes `--model` for a different model, the `est. cost` line
graphify prints stays at Sonnet rates and is wrong. Sero's own estimate must
price the model it selected.

---

## 6. Required model choice and profile portability

**Decision: Graphify never spends on a default.** The user picks a backend and
a model before the first paid build. Nothing runs while that choice is unset.
This replaces `model: ''` — "whatever graphify decides" — which is the root of
§4.2 and the reason nobody could say what the money bought.

### 6.1 The state shape

`model: ''` as a sentinel for "unset" is what let a build start with nobody
knowing the model. Make the absence representable instead:

```ts
export interface ModelChoice {
  backend: GraphifyBackend;
  /** Exact model id sent to the CLI, e.g. 'gpt-5.6-luna'. Never empty. */
  modelId: string;
  chosenAt: string;
}

export interface GraphifySettings {
  /** Null until the user chooses. No paid build runs while it is null. */
  model: ModelChoice | null;
  // backend moves inside ModelChoice — the two must never disagree.
  …
}
```

The indexer refuses any paid job when `model` is null, sets the workspace to
`needs-setup`, and the panel shows the picker in place of the build controls.
`backend` moves inside the choice so the two cannot drift apart.

### 6.2 Where the choice must be applied — both passes, two mechanisms

Read from the pinned tag. The two paid passes take the model **differently**:

| Pass | Command | 0.8.36 | 0.9.47 (shipped) |
|---|---|---|---|
| Extraction | `graphify extract` | `--model <id>` | `--model <id>` |
| Community naming | `graphify cluster-only` | **`--model` ignored** — `_call_llm` resolves `_default_model_for_backend(backend)` (`v0.8.36:llm.py:1565`); only the backend's `model_env_key` works | **`--model` accepted** and passed to `label_communities`, which forwards it to `_call_llm` |

Raising the pin (§5.2) therefore fixes this too: on 0.9.47 the flag pins both
paid passes, for every backend. The implementation passes `--backend=` and
`--model=` to `cluster-only` and *also* sets the backend's model environment
variable as a second belt.

That environment map has to be verified rather than assumed. Read from the
pinned source, a backend's model variable is either its `model_env_key` or one
its `default_model` resolves through:

| Backend | Variable at 0.9.47 |
|---|---|
| `claude` | `ANTHROPIC_MODEL` (via `default_model`) |
| `claude-cli` | `GRAPHIFY_CLAUDE_CLI_MODEL` (read by `_call_claude_cli`) |
| `openai` | `GRAPHIFY_OPENAI_MODEL` |
| `gemini` | `GRAPHIFY_GEMINI_MODEL` |
| `deepseek` | `GRAPHIFY_DEEPSEEK_MODEL` |
| `ollama` | `OLLAMA_MODEL` (via `default_model`) |
| `kimi` | **none exists** — `--model` is the only lever |

There is no `GRAPHIFY_KIMI_MODEL`. Inventing one would put a control in the
code that silently does nothing.

### 6.3 Where the model list comes from

Do not hard-code a list. `ctx.host.models.list()` already exists on the app
runtime host (`capabilities/create-host.ts:246`) and returns the user's real
available model groups, so a model the user has configured — `gpt-5.6-luna`
included — appears without Sero knowing it in advance.

The panel is a plugin UI and cannot import the desktop `ModelSelector`
(`apps/desktop/src/components/layout/models/ModelSelector.tsx`), so pick one:

* the background runtime caches the groups into graphify state on start, and
  the panel renders them with a plain `Select` from `@sero-ai/ui` — smallest
  change; or
* promote a model picker into `@sero-ai/ui` so every plugin can use it —
  better if a second plugin needs one.

Offer a free-text model id as well. A model Sero does not list yet must still
be usable, and the CLI takes any string.

### 6.4 What this means for cost display

graphify prices per **backend**, not per model (`llm.py` pricing table). The
`openai` entry is $0.40 / $1.60 — the `gpt-4.1-mini` rate. Any other OpenAI
model, `gpt-5.6-luna` included, is priced wrongly by graphify's own
`est. cost` line.

Sero's estimate must therefore price the **chosen model**, from the same source
that feeds the picker, and show "cost unknown for this model" rather than a
confident wrong number when no price is known. A near-free model should read as
near-free; that is a large part of why the choice matters.

Note also that the `openai` backend needs an `OPENAI_API_KEY` and, on 0.8.36, a
hard-coded `https://api.openai.com/v1` endpoint. A subscription that is cheap
for one user is not the same as free for the next, and a custom or proxied
endpoint (`OPENAI_BASE_URL`) needs the newer library (§5.2). The picker must
state which credential pays (§4.7), not assume.

### 6.5 Carrying the choice into a new profile

Sero already has the seam: **"Copy credentials and model preferences from
current profile"** in the profile-creation flow, implemented by
`copyProfileDataSync` (`apps/desktop/electron/features/profile/copy-profile-data.ts`).
It copies an allow-list of `agent/` files plus the global model tiers. The
label already promises *model preferences*, so carrying the Graphify choice
matches what the checkbox says today.

It does not reach Graphify: a global-scope app keeps its state at
`SERO_HOME/apps/<appId>/state.json`, outside `agent/`.

**Copy the settings, never the whole state file.** `workspaces`, `stats`,
`lastBuiltAt`, `requests`, and `provisioning` are facts about *that* machine and
profile. Copying `enabled` and `lastBuiltAt` into a new profile would hand the
boot catch-up a list of workspaces to build (§3.1) — a spend bug created by a
convenience feature.

Two ways to do it:

1. **Preferred — a declared portable subtree.** Add an optional
   `sero.app.portableState` to the app manifest, listing the state keys that may
   travel:

   ```jsonc
   "sero": { "app": { "id": "graphify", "portableState": ["settings"] } }
   ```

   Profile copy then merges only those keys into the new profile's state file,
   creating it when absent. No plugin name enters the desktop profile code, and
   every future app gets the behaviour free. `SeroAppManifest`
   (`apps/desktop/src/types/sero-apps.ts:16`) gains one optional field.
2. **Fallback — hard-code the graphify settings subtree** in
   `copy-profile-data.ts`. Faster, but it puts a plugin's name in core profile
   code, which the plugin architecture exists to avoid.

Either way the copy must be **settings-only, additive, and must not enable any
workspace**. A cloned profile starts with the model chosen and nothing indexed.

---

## 7. Plan

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

# Which model and backend did the build really use? ('' means the default)
jq '.settings.backend, .settings.model' ~/.sero-ui/apps/graphify/state.json

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
   pass `--no-label` unless the user opts in to LLM community names. When it
   does name communities, pass `--backend=<configured>` (the `=` form — the
   space form is not parsed) and the resolved `--model`, so the pass cannot
   drift onto another provider (§3.11).
8. **Give the child a clean environment.** Build the extraction environment
   from an explicit allow-list plus the selected provider's key, in place of
   spreading the whole Electron environment (`provisioner.ts:42`). Today any
   provider key on the machine can capture the naming pass.
9. **Never build a workspace the host does not confirm.** The indexer must ask
   the host registry for the id before it spends. An unknown id is refused with
   a clear message, not built and then deleted (§3.8). Delete the assertion in
   `indexer.test.ts:327` and replace it with the opposite one.
10. **Enforce the `global` exclusion where the money is spent**, not only in
   discovery (§3.9). One shared `isIndexable(workspaceId)` helper, used by
   discovery **and** by `applyRequest`.
11. **Never delete a paid graph silently.** If a workspace disappears after its
    graph was built, keep a tombstone record of the cost and tell the user, or
    keep the artifacts until the user removes them.
12. **Restrict the agent tool.** `graphify_index` must resolve a workspace from
    the registry. The `workspacePath` parameter must not be free-form input
    from the model (§3.10).
13. **Correct the misleading comment** on `tokenBudget` (§4.3) so nobody treats
    it as a spend cap.
14. **Bound the retry blow-up now.** Export `GRAPHIFY_MAX_RETRIES` (and an
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

1. **A required model choice before the first paid build** (§6). The panel
   shows a picker fed by `host.models.list()`, the choice persists to state as
   a `ModelChoice`, and the indexer refuses to spend while it is null. Sero
   sends both `--model` and the backend's model environment variable (§6.2).
   There is no "backend default" option.
2. **A settings section** around it: caps, concurrency, exclude patterns, and
   "index new workspaces automatically". This removes the need to edit the
   state file.
3. **Offer the `claude-cli` backend** (§5.3) as the default choice where the
   user has Claude Code, with `GRAPHIFY_CLAUDE_CLI_MODEL` set to a cheap model.
   It moves indexing onto the subscription instead of API credits.
4. **Show the model and the paying account** on the pre-flight dialog and on
   every workspace card. Record the resolved model in the build stats, so an
   old build says which model produced it.
5. **Show money, not only tokens** on the card:
   `$0.51 est. · 45k in / 9k out · claude-…`, and include the cluster pass.
6. **Change the create-workspace switch default to `false`**
   (`package.json` → `contributes.controls`). Opting a new repo into a paid
   build must be a decision, not a default.
7. **A visible error state** with a **Try again** button, in place of the
   silent restart loop of §3.1.
8. **Prototype first** in `docs/prototypes/` — the settings section and the
   pre-flight dialog (repo rule: prototype before feature work).

### Phase 3b — Profile portability

1. Add `sero.app.portableState` to the app manifest and honour it in
   `copyProfileDataSync` (§6.5). Graphify declares `["settings"]`.
2. The copy is settings-only and additive: it must never carry `workspaces`,
   `lastBuiltAt`, `enabled`, `requests`, or `provisioning` into a new profile.
3. Test that a cloned profile keeps the model choice and indexes nothing.

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
* No paid job starts while `settings.model` is null.
* The chosen model reaches both the `--model` flag and the backend's model
  environment variable.
* A profile copy carries `settings` and no workspace state.

Documentation to update: `apps/docs-site/docs/plugins/graphify.md` (a real
"What it costs" section), `plugins/sero-graphify-plugin/README.md`, and
`GUIDE.md`.

---

## 8. Suggested issues

| Issue | Phase | Priority |
|---|---|---|
| Graphify repeats a failed paid build at every start | 1 | P0 |
| Graphify can apply one index request two times | 1 | P0 |
| `enable` must not mean `rebuild` | 1 | P0 |
| A paid build is killed by the 1 MiB output limit | 1 | P1 |
| `cluster-only` spend is unchecked and unreported | 1 | P1 |
| The naming pass picks its provider from inherited env vars | 1 | P1 |
| Measure whether the extraction cache is reused between builds | 1 | P1 |
| A build for an unconfirmed workspace is paid for, then deleted | 1 | P0 |
| `graphify_index` can index any path, including the memory store | 1 | P0 |
| Bound the retry blow-up with GRAPHIFY_MAX_RETRIES | 1 | P0 |
| Estimate and confirm before a paid build | 2 | P0 |
| Per-build and per-day spend caps with a ledger | 2 | P0 |
| Raise the graphifyy pin from 0.8.36 (six repeat-billing fixes) | 2b | P0 |
| Show the graphify version and offer an upgrade | 2b | P1 |
| Report the 18x retry blow-up and cache split upstream | 2b | P1 |
| Offer the claude-cli backend (subscription, not API credits) — must pin its model, it defaults to Opus | 3 | P1 |
| Force an explicit model choice; no graphify default | 3 | P0 |
| Apply the chosen model to the naming pass too (env var, not --model) | 3 | P0 |
| Price the estimate by the chosen model, not the backend | 3 | P1 |
| Graphify settings UI (caps, excludes, concurrency) | 3 | P1 |
| Carry app settings into a copied profile (`portableState`) | 3b | P1 |
| Show cost and model on the workspace card | 3 | P1 |
| New workspaces must not opt into indexing by default | 3 | P1 |

---

## 9. What shipped, and what did not

Phases 1, 2, 2b, 3, 3b and 4 are implemented on
`claude/graphify-credit-overspend-dmvcvb`. Every defect in §3 and every gap in
§4 is addressed, the pin is raised to 0.9.47, and the model choice of §6 is
required and portable.

Two deliberate departures from the plan:

* **`indexNewWorkspaces` was dropped.** Phase 3 listed it as a setting. A
  contribution control declares its `defaultValue` statically in the manifest,
  so the host cannot read a setting to decide it — the toggle would have
  changed nothing. The manifest default is `false` instead, which delivers the
  same intent: opting a new repository into a paid build is a decision, not a
  default.
* **`enable-all` confirms per workspace**, not once for the batch. Each
  workspace has its own estimate, and one dialog covering several different
  numbers would be approving an amount nobody was shown.

### Follow-up: a command inbox, so the runtime is the only writer

**Tracked as sero-labs/sero#385.** Proposed by @monobyte in review of #384, and
the right answer to §9's residual write race. The repo owner decided to land
#384 first and do this as a follow-up; the review thread stays open on the PR.
Recorded here so the reasoning survives, with the full spec in the issue.

1. The extension writes one immutable `inbox/<uuid>.json.tmp` and renames it to
   `inbox/<uuid>.json`. It never reads or rewrites `state.json`.
2. The runtime watches the inbox and also scans it at startup, so a missed or
   duplicated filesystem event does not matter.
3. It claims a command by renaming it into `processing/`, then records that
   UUID as accepted in runtime-owned state *before* applying it.
4. A crash before acceptance may safely retry the claimed file, because no side
   effect began. A crash after acceptance skips that UUID and waits for another
   click — deliberately at-most-once, the safer failure mode for paid work.
5. The command UUID is also the spend reservation id. After the
   `beforePaidSpawn` change the reservation is taken at the last boundary before
   the paid child spawns, so acceptance and the durable debit become the same
   write, and step 4's "no side effect began" is checkable rather than assumed.

**One host change is required first**, and the reviewer's preferred route is
the narrow one rather than a full `appCommands.enqueue` bridge: let a runtime
register additional watched paths (constrained to its own state directory),
deliver them through a separate `handleFileChange({ path, kind })` callback
that never parses the path as state JSON, and index those paths to instances in
`AppRuntimeManager`. Today `handleStateChange` filters on
`instance.stateFilePath === filePath`, so an inbox write matches no instance and
is dropped. `handleFileChange` should be optional on `AppRuntime`: four runtimes
implement it today and only graphify needs this.

Polling is not an option worth taking: this plugin's update model is push-based
with no timers, and an interval would become a spend-latency knob.

The acceptance tests the reviewer asked for are listed in #385.

### Follow-up: community naming as its own confirmed job

Naming is a second LLM pass whose cost the extraction estimate never covered,
so a build that ran it left part of the authorised work outside both caps.
`cluster-only` now always runs `--no-label` and the setting is gone; graphs read
`Community 1`, `Community 2`.

Restoring it means a separate job: priced from `stats.communities` (which the
free clustering pass produces), shown with its model and estimate, confirmed,
reserved and settled like any other paid work. A pre-flight uplift inside the
build was rejected — naming scales with community count, which is unknown until
after the extraction, so any number would have been invented.

Known and deliberate:

* **The extension/runtime write race is narrowed, not closed.** The extension
  queues requests by read-modify-write on the state file from its own process,
  while the runtime writes the same file through the host's serialised queue —
  the two share no lock. Appends now re-read and compare the file immediately
  before writing and retry when it changed, which shrinks the window from a
  read-parse-rebuild to a single rename. Closing it completely needs one shared
  write path for both processes, which is a host change rather than a plugin
  one.
* **A cap cannot hold a model Sero has no price for.** Such a build always asks
  first, and is recorded in the ledger at zero so it still appears in the day's
  record. A user who wants it inside the caps can supply the price.

Still open, tracked as sero-labs/sero#386:

* **§3.7 is unmeasured.** Whether Sero's split of `--out` from the corpus path
  keeps the extraction cache warm still needs a live two-build measurement.
  Raising the pin (§5.2) fixes the three upstream bugs most likely to cause it,
  but that is a reasoned expectation, not a measurement.
* **Nothing has been reported upstream** (Phase 2b item 5). Filing
  against Graphify-Labs/graphify is an outward-facing action on someone else's
  tracker and is left for a person to send.
* **The 0.9.47 bump is untested against a real build.** It typechecks and the
  unit tests pass, but no extraction has run on the new version in this
  environment; the first live build should be watched.
