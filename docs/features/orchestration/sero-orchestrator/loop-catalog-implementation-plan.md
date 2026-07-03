# Loop Catalog — Implementation Plan

Builds [specs/14-loop-catalog.md](specs/14-loop-catalog.md): git-repo-backed
catalogs of curated loops that install into the existing Loop Library
versioning — official repo out of the box, user-addable repos, on-demand
fetch, drafts-only installs, model-authored adaptation. Six phases, each
independently shippable and gated on `pnpm typecheck` + green tests, one
commit per phase on `feat/orchestrator-living-loops`.

## Progress Dashboard

| Phase | Title | Status | Exit gate |
| --- | --- | --- | --- |
| 1 | Catalog store: repos, cache, on-demand fetch | ✅ Done | `host.catalog` works against the official repo and a local fixture git repo; no timers anywhere |
| 2 | Install: actions, provenance versions, adaptation | ✅ Done | `catalog_install` → provenance-linked library version → draft via the existing load path → planner adaptation; reinstall is a no-op |
| 3 | Updates and fail-soft | ✅ Done | Refresh appends newer catalog versions; "vN available" lights up with zero new update UI; unreachable/removed repos never break installs |
| 4 | UI: Catalog tab, repo management, docs | ✅ Done | Catalog tab beside My Library with cards/detail/install/badges; repo add-confirm; slash commands; docs-site updated |
| 5 | Official catalog content: example loops | ✅ Done | A simple → very-complex range of curated loops ships in the official catalog, together exercising every major feature |
| 6 | End-to-end verification | ✅ Done | catalog e2e 8/8 in the real app (after the placement fix it found); live official-repo pass produced a real artifact |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR Traceability Matrix

| FR | Requirement | Phase | Status |
| --- | --- | --- | --- |
| FR-C1 | Official repo works out of the box; add/remove repos; private repos via ambient git/`gh` auth | 1 (store) / 4 (UI) | ✅ |
| FR-C2 | Fetch on demand only (tab open / refresh); local cache works offline; no background timers | 1 | ✅ |
| FR-C3 | Install validates, creates a provenance-linked library entry/version, instantiates a draft — never auto-activates | 2 | ✅ |
| FR-C4 | Planner clarify flow adapts installed loops; model-authored, code-validated, no template DSL | 2 | ✅ |
| FR-C5 | Newer catalog versions append library versions; updates surface via the existing "vN available" push machinery | 3 | ✅ |
| FR-C6 | Verified badge only on official entries; third-party entries show their source repo; add-repo needs one confirmation | 4 | ✅ |
| FR-C7 | Missing `requiredTools` at install warn fail-soft; install proceeds, warning rides the draft | 2 | ✅ (cleared if a later re-plan recomputes warnings — noted) |
| FR-C8 | Removing or failing to reach a repo never breaks installed loops or library entries | 1 (cache) / 3 (verified) | ✅ |
| FR-C9 | Official catalog ships a range of example loops from simple to very complex, together showing off triggers, placement, delivery, guards, per-step config, and human input *(added by Dan, 2026-07-02)* | 5 | ✅ |

---

## Design decisions folded in (beyond the spec text)

The spec confirms direction; these are the mechanics this plan implements.
Flag now if any should change:

1. **The catalog store lives in the plugin runtime and runs `git` itself.**
   `AppRuntimeGitApi` has no clone-arbitrary-repo method, and workspace
   `runCommand` executes in workspace (possibly container) context where the
   profile dir may not exist. The runtime already imports Node built-ins
   directly (`node:http` webhook listener, `node:fs` watcher, stores), so
   `runtime/catalog-store.ts` uses `execFile('git', …)` in the
   `pull-request.ts` shape (promisified, fail-soft, timeouts). Cache root is
   resolved via `appState.globalDir('orchestrator-catalog')` →
   `$SERO_HOME/apps/orchestrator-catalog/<repoKey>/` — the plugin never
   imports `SERO_HOME`, matching the library-store pattern
   (`runtime/library-store.ts:23`). Consumers depend only on the
   `CatalogStore` interface on `OrchestratorHost`; tests fake it.
2. **The official catalog is a real repo:
   `https://github.com/sero-labs/orchestrator-catalog.git`** (Dan created
   it, 2026-07-02; public, currently empty). The official `CatalogRepoRef`
   is baked in (non-removable) with that URL and goes through the same
   clone/pull path as user-added repos — no bundled special case. Phase 1
   seeds the repo with a minimal valid `catalog.json` index (empty entries)
   + README so the out-of-the-box fetch works; Phase 5 lands the real
   content there. First use offline shows the spec's clear
   never-fetched message; after one fetch the cache works offline. Tests
   never hit the network — they use local `file://` fixture repos; live
   coverage of the official repo is gated e2e.
3. **Repo registry is a JSON file under the catalog root** (`repos.json`,
   written with the loop-store atomic-write discipline): the official ref
   plus user-added `{ key, url, official: false, addedAt, lastFetchedAt? }`.
   `repoKey` is derived deterministically from the URL (sanitized
   host+path slug, collision-suffixed) so cache dirs are stable. The
   official ref is constructed, never stored, so it can't be edited out.
4. **Install versioning is provenance-aware, not blind `latest+1`.**
   `buildLibrarySave` (`shared/library.ts:75`) assumes `latestVersion + 1`,
   which is right for saves but wrong for reinstalls. Install logic (pure
   `shared/catalog.ts` helper): find the library entry owning this
   `(repoKey, slug)` via version provenance; if its newest
   provenance-carrying version already has `catalogVersion >= entry's
   catalog version`, the install is a **no-op pointing at that version**
   (and `catalog_install` still instantiates a draft from it when asked);
   otherwise append `latestVersion + 1` carrying
   `catalog: { repoKey, slug, catalogVersion }`. Manual saves interleave
   untouched. `LibraryVersion.catalog?` is purely additive — optional
   field beside the existing `savedFromWorkspaceId` provenance,
   `schemaVersion` stays 1.
5. **Adaptation = the existing planning flow re-run on the installed
   draft.** After instantiation, `catalog_install` invokes
   `runPlanningFlow` (`runtime/planning-flow.ts:45`) on the draft with the
   catalog prompt as input — the model specializes "your repo"/"your
   channel" to this workspace and parks clarifying questions through the
   existing human-input machinery when genuinely ambiguous. No placeholder
   DSL; code validates only the response format (house rule).
6. **Catalog metadata is validated format-only, fail-soft per entry.** A
   malformed `catalog.json`/`definition.json` hides that entry with a
   listed reason; it never breaks the tab or other entries. Definitions are
   validated at install exactly like `library_load` (`validateLoopPlan` —
   invalid plans land as blocked drafts with errors, never a crash).
7. **`coordinator.ts` (498 LOC) is at the cap.** Phase 2 first moves the
   `library_*`/input-action routing group out (e.g. `runtime/action-router.ts`
   or folding `isLibraryAction` dispatch into a shared delegate), then adds
   `catalog_*` routing to the new module. Same rule for `shared/types.ts`
   (498): all catalog types live in new `shared/catalog-types.ts`.

Known-good seams this plan reuses (verified in code):

- Library store shape + global root injection: `runtime/library-store.ts`
  (`globalDir`, ordered index writes at `:79-85`, containment check
  `:44-55`).
- Load/instantiate path: `runtime/library-actions.ts:79-107` →
  `instantiate` (`runtime/library.ts:19-52`) → `validateLoopPlan`
  (`runtime/schema.ts:266`) → blocked-draft-on-invalid.
- "vN available" derivation: `ui/lib/use-library-link.ts:44-83` — a catalog
  update is just a new library version; zero new update UI.
- Version switch + overlay replay + divergence confirm:
  `runtime/library-actions.ts:116-147`, `runtime/library-overlay.ts`,
  `ui/components/LibraryLinkSection.tsx` — apply to catalog loops unchanged.
- Tool-availability warning: `runtime/delivery/availability.ts:20-41`
  (idempotent reconcile against `host.listToolCatalog()`); generalize the
  set-difference into a shared helper rather than duplicating.
- Action plumbing template: `library_*` group routing
  (`coordinator.ts:136` → `runtime/library-actions.ts:175-190`), tool params
  in `extension/tools.ts`, UI dispatch in `ui/OrchestratorApp.tsx:75-113`.
- House list pattern: `ui/components/LibraryBrowser.tsx` (PAGE=10, pinned
  search, Load more).
- execFile git shape: `apps/desktop/electron/features/vcs/worktree/pull-request.ts`.

---

## Phase 1 — Catalog store: repos, cache, on-demand fetch

**Goal.** `host.catalog` exists and works: the bundled official catalog
lists entries out of the box; adding a repo shallow-clones it on first
refresh and `git pull`s after; everything is on-demand and fail-soft. No
actions or UI yet.

**Tasks**

- [x] `shared/catalog-types.ts`: `CatalogRepoRef { key; url; official;
  addedAt?; lastFetchedAt? }`, `CatalogIndex`, `CatalogEntryMeta` (spec
  shape: slug/name/description/version required; requiredTools, connectors,
  recommendedTrigger, delivery, costBand, modelTier, limitations optional),
  `CatalogEntry { repoKey; meta; definition; exampleOutput? }`,
  `CatalogEntryProblem` / `CatalogRefreshResult` / `CatalogRepoContents`.
  Pure helpers + guards live in `shared/catalog.ts` (`deriveRepoKey`,
  `isCatalogIndex`, `catalogEntryMetaProblems`, official constants).
  Nothing re-exported from `shared/types.ts` (it is at the LOC cap).
- [x] `runtime/catalog-store.ts`: `CatalogStore` implementation —
  `listRepos` / `addRepo(url)` / `removeRepo(key)` (registry `repos.json` +
  `fetch-state.json` via appState atomic writes, official ref constructed
  not stored, remove drops only the cache), `refresh(key)` (`clone
  --depth 1` first time, `pull --ff-only` after, `execFile` with timeout +
  `GIT_TERMINAL_PROMPT=0`, failure returns the stale cache with
  `stale: true` + reason), `readContents(key)` / `readEntry(key, slug)`
  (fail-soft per entry per decision 6; slug + repo-key path containment
  like `library-store.ts:44`).
- [x] Seed the official repo: pushed `catalog.json` `{ version: 1, name,
  entries: [] }` + authoring README (`f0fce46` on
  `sero-labs/orchestrator-catalog` main). Real content lands in Phase 5.
- [x] `OrchestratorHost.catalog: CatalogStore` (`runtime/host.ts`),
  constructed in `runtime/host-adapter.ts` beside `createLibraryStore`;
  in-memory fake on `fake-host.ts` (`catalogRepos` / `catalogContents`).
- [x] Tests (`catalog-store.test.ts`, 10): registry round-trip; repoKey
  derivation (stable, collision suffix, reserved official key); refresh
  against a local `file://` fixture repo (clone → entry visible; commit to
  fixture → pull picks it up); never-fetched vs stale-cache failures
  distinct; malformed/ghost/escaping slugs hidden with reasons, siblings
  intact; index-less repo reads as fetched-but-empty; official ref
  non-removable; meta format guard cases.

**Exit gate.** Unit tests green; `pnpm typecheck`; grep-level check: no
`setInterval`/`setTimeout` polling anywhere in catalog code.

## Phase 2 — Install: actions, provenance versions, adaptation

**Goal.** The four `catalog_*` actions exist end-to-end; install produces a
provenance-linked library version and a reviewable draft loop adapted to
the workspace; reinstall is a no-op; missing tools warn fail-soft.

**Tasks**

- [x] Pre-work (decision 7): the five `set_*` override cases moved to
  `runtime/override-actions.ts` (grouped route beside `isLibraryAction`);
  coordinator.ts now 474 LOC with the catalog route added.
- [x] `shared/actions.ts`: `catalog_list` (added beyond the spec's four —
  the UI/commands need a cache-only read), `catalog_add_repo { url }`,
  `catalog_remove_repo { repoKey }`, `catalog_refresh { repoKey? }`,
  `catalog_install { repoKey; slug; workspaceLoad? }` + result fields
  (`catalogRepos`, `catalogContents`, `catalogRefresh`).
- [x] `shared/library-types.ts`: `CatalogProvenance` on
  `LibraryVersion.catalog?` (authoritative) plus a denormalized
  `CatalogInstallMarker` (`+ libraryVersion`) on `LibraryEntry.catalog?` /
  `LibraryEntrySummary.catalog?` — owning-entry lookup and the Phase 4
  "installed" marker come straight off the watched index. `schemaVersion`
  stays 1 (all additive).
- [x] `shared/catalog.ts` `buildCatalogInstall` (pure, tested):
  reinstall of a same-or-older catalog version resolves to the existing
  library version with no write; a newer one appends `latestVersion + 1`
  with provenance; user renames survive; manual saves interleave.
- [x] `runtime/catalog-actions.ts` (mirrors `library-actions.ts`):
  `isCatalogAction` + handler. `catalog_install`: read entry → validate
  definition + delivery (invalid ⇒ error result, no library write) →
  provenance version via the pure helper → `host.library.putVersion` →
  when `workspaceLoad !== false`, `instantiate` a linked draft → planner
  adaptation → requiredTools warning appended after the flow (re-plan
  recomputes warnings, so order matters). Add/remove/refresh delegate to
  `host.catalog` (remove asks nothing here — confirmation is UI, FR-C6).
- [x] Planner adaptation seam (decision 5, FR-C4): `baseline` rides
  `PlanningFlowArgs` → `PlanRequest` → `buildPlanningTask`'s new
  `buildBaselineBlock` ("specialize, don't redesign; re-emit adapted
  triggers; batch unknowable placeholders into one clarifyingQuestions
  reply"). The `answer_input` re-plan re-derives the baseline from the
  linked library version when it carries catalog provenance
  (`input-actions.ts catalogBaseline`), so answers keep specializing the
  curated plan.
- [x] Tool + commands: five action kinds + `url`/`repoKey`/`slug`/
  `workspaceLoad` params with `buildAction`/`summarize` branches
  (`extension/tools.ts`, 394 LOC — watch toward 430); `/orchestrator
  catalog_list|catalog_refresh [repoKey]|catalog_install <repoKey>
  <slug>|catalog_add_repo <url>|catalog_remove_repo <repoKey>`.
- [x] Tool availability: `missingTools(host, required)` extracted in
  `availability.ts` (shared by delivery + catalog); new `LoopWarning` code
  `catalog-tool-missing`, fail-soft when enumeration fails.
- [x] Tests (+18): install happy path (provenance, linked draft, baseline
  block in the planner task, never active); reinstall no-op; newer
  catalogVersion appends; interleaved manual save keeps numbering
  monotonic; invalid definition writes nothing; missing-tools warning on/
  off; clarifying questions park on the draft; workspaceLoad:false;
  repo action results; `buildCatalogInstall` unit cases; baseline block
  rendering.

**Exit gate.** Install → adapted draft works through the tool action in
tests; never auto-activates (no `status: 'active'` anywhere in the path).

## Phase 3 — Updates and fail-soft

**Goal.** Refreshing repos surfaces newer catalog versions on installed
loops through the existing library machinery, and every failure path
degrades softly.

**Tasks**

- [x] `catalog_refresh` (one repo or all): after pulling,
  `appendCatalogUpdates` walks installed entries (the index's `catalog`
  install markers) and, where the cached catalog `version` is newer,
  validates the new definition and appends the next library version with
  provenance via `buildCatalogInstall` (invalid ⇒ skipped with its reason
  in the new `catalogUpdates` result field, old versions untouched).
  Linked loops light "vN available" via the watched index — no new update
  code. Tool summary reports applied/skipped updates.
- [x] Switch path confirmed by test: a refresh-appended version makes
  `latestVersion > libraryLink.version` on the watched index (the exact
  condition `deriveLibraryLink.updateAvailable` reads — derivation itself
  covered in `ui/__tests__/library-link.test.ts`), and
  `library_set_version` moves the installed draft onto it. **Phase 4
  polish note:** after a switch the plan is the new *generic* curated
  plan; the picker for catalog loops should offer "Update & re-adapt"
  chaining `library_set_version` + a Refine-style adaptation, since plain
  switch semantics (FR-L4) deliberately stay deterministic.
- [x] Fail-soft verified (FR-C8): remove a repo ⇒ installed loop + library
  entry/version fully working, later refresh has nothing to update;
  deleted upstream entry ⇒ library copy intact on refresh; unreachable /
  never-fetched repos already covered by the Phase 1 store tests.
- [x] Tests (+7): append on newer version, no-op when current, skip-on-
  invalid with reason, multi-repo refresh, uninstalled entries never
  touched, remove-repo survival, upstream-deletion survival.

**Exit gate.** A fixture-repo version bump → refresh → "vN available" on
the linked loop, proven by test; all fail-soft paths tested.

## Phase 4 — UI: Catalog tab, repo management, docs

**Goal.** The Catalog tab beside My Library, per spec UI: cards, detail,
install, badges, repo management, one-time add confirmation.

**Tasks**

- [x] Tab structure: new `LibraryView` owns the header + My Library /
  Catalog tabs (new users with an empty library land on Catalog);
  `LibraryBrowser` slimmed to the tab body (+`initialQuery` for the
  catalog's "in your library" jump); `CatalogBrowser` (216 LOC) +
  `CatalogEntryCard` (112 LOC) as siblings.
- [x] Catalog list: house pattern (pinned search + repo row, 10 at a time,
  Load more) over all repos' entries — cards show name, description, chips
  (trigger/delivery/cost/tier/connectors), Verified badge (official) or
  source-repo key (third-party), Install; expandable Details with
  limitations, required tools, example output. Hidden malformed entries
  reported with hover reasons.
- [x] Installed marker straight off the watched index (`installState` in
  `ui/lib/catalog-summary.ts`): installed ⇒ "In your library ✓" jump +
  "New draft"; newer catalog version ⇒ "Install update".
- [x] Repo management row: official baked in (non-removable); Add repo
  dialog = the FR-C6 one-time confirmation (URL + trust text); per-repo
  stale/unreachable notices; refresh/remove.
- [x] On-demand fetch: opening the tab shows the cache instantly then runs
  one refresh (the spec's "opening the catalog tab pulls"); manual Refresh
  besides; still zero timers.
- [x] Dispatch wiring: the inline `onAction` param mapping extracted to
  pure, unit-tested `ui/lib/action-params.ts`. **Found & fixed in the
  process:** `set_delivery` and `set_step_agent` payloads were never
  mapped to tool params, so the Delivery dialog errored and a picked step
  agent silently reverted — regression-tested now.
- [x] "Update & re-adapt" (Phase 3 polish note): catalog-linked loops
  (`LibraryLinkStatus.fromCatalog` off the index marker) get a primary
  update button chaining `library_set_version` + `revise` with
  `readaptPrompt(loop)` — the refine carries the user's original install
  answers so the new curated version re-specializes without re-asking.
- [x] Docs: reference gets a Loop Catalog section (trust model in plain
  terms, on-demand fetch, update flow, storage layout) + catalog commands;
  guide gets "Install a ready-made loop from the Catalog". Repo layout for
  authors lives in the catalog repo's README (Phase 1).
- [x] UI-lib helpers unit-tested (+11 tests: chips, install states,
  re-adapt prompt, action-params regressions).

**Exit gate.** Deferred to Phase 6 by design: the by-hand dev-app pass is
subsumed by the agent e2e in the real app (Dan: e2e confirms the feature
when complete).

## Phase 5 — Official catalog content: example loops (FR-C9)

**Goal.** The official catalog repo
(`sero-labs/orchestrator-catalog`) ships a curated range of example loops,
simple → very complex, that together demonstrate every major orchestrator
feature. Each is a real, runnable `SharedLoopDefinition` with honest
metadata — authored via the product itself (create → refine → save →
export from the library), not hand-written JSON — validated locally, then
pushed to the catalog repo.

**Shipped lineup** (catalog repo commit `2b5c888`; authored via
`apps/desktop/e2e/catalog-author.agent.spec.ts` — a gated Playwright
harness that drives create → tweaks → library_save in the REAL app and
exports the saved definitions; idempotent, skips already-exported slugs):

- [x] **Daily note** *(simple)* — `0 8 * * 1-5` cron, two LOW steps,
  workspace-files delivery.
- [x] **Weekly research digest** *(moderate)* — Monday cron, gather (LOW) →
  write (MED), saved-artifact delivery (`name: weekly-digest`),
  `costBand: medium`.
- [x] **Repo hygiene monitor** *(moderate, events)* — `fs:changed` trigger,
  silent-when-clean passes, workspace-files delivery.
- [x] **CI fixer** *(complex)* — `github:ci-failed` (+`conclusion: failure`
  filter), worktree placement, `pr` delivery, planner-authored
  check-existing-PRs dedup step, per-step tiers, "GitHub (gh login)"
  connector, `costBand: high`.
- [x] **Issue triage & report** *(complex, external)* —
  `github:issue-labelled` with a `label: triage` filter, webhook-post
  delivery with the planner-authored `gate: 'approval'` step pre-final.
  Webhook URL deliberately ships unset — the installer's adaptation asks /
  the Delivery dialog sets it (delivery params are user-level; the planner
  never touches them). Noted in `limitations`.
- [x] **Inbox-to-brief** *(very complex)* — hybrid trigger (`30 7 * * *` +
  `fs:changed` with a plain-language `eventCondition` for requests/),
  email-draft delivery, `contextOverrides.systemPrompt` carried,
  `requiredTools: ["gmail"]`, `costBand: high`, honest limitations.
  (Human-input mid-plan arises at runtime via the normal machinery rather
  than as a hardcoded step — deviation from the sketch, truer to the
  product.)
- [x] Each entry ships `definition.json` (product-authored), curated
  `catalog.json` (cost bands low/medium/high all present across the set,
  connectors, recommendedTrigger, delivery, modelTier, limitations), and
  an `example-output.md`.
- [x] Validation harness:
  `runtime/__tests__/catalog-content.test.ts` (gated on
  `SERO_CATALOG_DIR`) runs every entry through the real install validation
  (meta format, plan, delivery, trigger sanity incl. no `maxFires`
  lifetime caps, index↔dirs exact match) — 19 checks green before the
  push; the live official-repo check rides the Phase 6 e2e.
- [x] Authoring doc for future entries: the catalog repo's README
  (Phase 1) covers layout, metadata fields, and publish-by-PR.

**Content finding (Dan, review of the shipped set).** As authored,
`repo-hygiene-monitor` was too hot: a 1s trigger debounce meant a full
3-step pass per save-burst all day, plus one echo pass after each real one
(its own HYGIENE.md append re-fires `fs:changed`). Fixed in catalog commit
`1fcf8ac`: 15-minute debounce (an editing session collapses to one pass)
and an `eventCondition` that drops own-output echoes for the cost of one
small fire-time judgement; `inbox-to-brief`'s fs arm cooled 30s → 10min.
Curation bar recorded for future entries: **every `fs:changed` entry must
state its worst-case fire rate, and defaults must assume an actively-edited
workspace.** Deeper product note (not built — would be rails): scoped
`fs:changed` conditions cost one model judgement per event batch even when
they skip; if catalog usage makes that add up, consider a mechanical
pre-filter option on the trigger itself, decided in the LLM-authoring
layer, never hardcoded.

**Exit gate.** Every official entry passes the validation harness; each
installs to a draft in the dev app and reads sensibly after adaptation;
content pushed to `sero-labs/orchestrator-catalog`.

## Phase 6 — End-to-end verification

**Goal.** Agent e2e in the real app (`SERO_E2E_REAL_HOME=1`, `pnpm build`
from repo ROOT first — plugin UI is its own build), following the
living-loops/delivery e2e mechanics (scratch workspace register-and-reuse,
cleanup via `window.sero.appAgent.invokeTool`).

**Tasks**

- [x] `apps/desktop/e2e/catalog.agent.spec.ts` — 8/8 PASSED (1.1m final
  run): official entries visible with the Verified badge out of the box;
  local `file://` fixture repo added through the confirmation dialog,
  origin chip shown, malformed/ghost entries hidden with reasons; install
  → planner-adapted provenance-linked draft, never active; broken
  definition blocks with errors and writes nothing; fixture bump → opening
  the Catalog tab (the on-demand pull) appends library v2, "Update &
  re-adapt" offered, plain switch lands v2; repo removal leaves the loop
  and library copy intact.
- [x] Live official-repo pass: fetched `sero-labs/orchestrator-catalog`,
  installed + activated Daily note; the run completed and the REAL note
  (`notes/daily/2026-07-03.md`, content citing the workspace's actual git
  history) landed at the workspace root — shipped content runs.
- [x] Findings fixed in their own commits (`7ddd0feba` placement) and
  recorded below.

**Live-pass findings**

1. **Installed file-delivering loops vanished into worktrees (REAL BUG,
   fixed).** The live Daily-note pass "completed" perfectly — and wrote its
   note into `.sero/worktrees/<loop>-r1/notes/daily/…`, a branch no user
   ever looks at. Cause: definitions deliberately don't carry placement
   (spec 08), so `instantiate` started every installed loop on the
   workspace default (managed worktree) even when the definition's
   *declared* delivery is files-in-the-workspace. Fix (runtime/library.ts):
   a definition explicitly delivering `workspace-files` / `saved-artifact`
   instantiates at the workspace root — the reverse of the existing
   placement⇒delivery derivation, applied at load/install. Deviation from
   spec 08's "always workspace defaults" recorded here.
2. **Root placement resurfaces the dirty-workspace choice.** With the
   placement fix, activating the installed Daily note in a dirty git
   workspace parks on the "how should this loop run?" question (correct
   product behavior; on its 30s timeout the default falls back to a
   managed worktree — which would quietly re-hide the notes). The e2e now
   commits the workspace pre-activation AND answers the choice itself if
   it still parks. Watch item for the PR review: whether that timeout
   default should differ for file-delivering loops.
3. **Harness lessons:** the update-flow test must navigate back to the
   Catalog tab (opening it IS the fetch — asserting that replaced a
   Refresh-button click that didn't exist on the detail view); loop detail
   has several "Library"-named buttons (use the header button's title);
   `describe.skipIf` still executes its callback at collection, so the
   gated content harness keeps file reads behind the gate itself; pipe
   long runs unbuffered (`--reporter=line`, no `tail`) so progress is
   visible.

**Exit gate.** e2e green against the real app; findings section filled in.

---

## Out of scope (v1) — restating the spec

Install counts/ratings/telemetry; a publishing pipeline beyond PR-to-repo;
auto-updating installed entries; cross-profile sync beyond shared git;
entries that bundle plugins/tools (entries may *require* connectors, never
install them).

## PR #226 review response (2026-07-03)

Dan's review raised three runtime/safety findings; all three were real and are
fixed on the branch:

1. **Approval gate too broad** (`bedf3fa5c`) — `hasOpenApproval` accepted any
   unconsumed approve answer, so a stale approval could authorize a different
   send, and every open approval was consumed per send. Now the receipt must
   carry `approvalId` naming an open approval that was asked by a current
   gate step and records the approved content (`attachment`); exactly that
   token is consumed, and `set_delivery` voids open approvals. Docs state the
   scope honestly: the gate governs completion acceptance — a background
   agent's shell can still physically POST, so an unapproved webhook send is
   refused completion and lands in recovery, never blessed (true prevention =
   runtime-mediated sending, out of scope v1).
2. **Version switch was plan-only** (`eebb6455d`) — `library_set_version` now
   applies the whole `SharedLoopDefinition` (title/prompt/summary/plan/
   triggers/limits/logPolicy/contextOverrides/delivery). Explicit local set:
   history, answered inputs, warnings, placement (except the file-delivery
   root rule), step-override overlay (replayed). Triggers rematerialize with
   fresh ids/zeroed counters; event demand resyncs via the state tap.
3. **Triggers never validated on load/install** (`d60e9cbdd`) — new
   `runtime/definition-validation.ts`: `validateSharedDefinition` = plan +
   delivery + external gate shape + every trigger (cron validity, known event
   source, flat filter, bounded condition, sane debounce, positive maxFires).
   Used by catalog install/update, `library_load` (invalid ⇒ blocked draft),
   version switch, and the content harness. All six official entries pass
   (verified against a fresh clone).
