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
| 4 | UI: Catalog tab, repo management, docs | ⬜ Not started | Catalog tab beside My Library with cards/detail/install/badges; repo add-confirm; slash commands; docs-site updated |
| 5 | Official catalog content: example loops | ⬜ Not started | A simple → very-complex range of curated loops ships in the official catalog, together exercising every major feature |
| 6 | End-to-end verification | ⬜ Not started | Agent e2e in the real app: browse → install → adapt → update-available → fail-soft paths |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR Traceability Matrix

| FR | Requirement | Phase | Status |
| --- | --- | --- | --- |
| FR-C1 | Official repo works out of the box; add/remove repos; private repos via ambient git/`gh` auth | 1 (store) / 4 (UI) | 🟡 store done |
| FR-C2 | Fetch on demand only (tab open / refresh); local cache works offline; no background timers | 1 | ✅ |
| FR-C3 | Install validates, creates a provenance-linked library entry/version, instantiates a draft — never auto-activates | 2 | ✅ |
| FR-C4 | Planner clarify flow adapts installed loops; model-authored, code-validated, no template DSL | 2 | ✅ |
| FR-C5 | Newer catalog versions append library versions; updates surface via the existing "vN available" push machinery | 3 | ✅ |
| FR-C6 | Verified badge only on official entries; third-party entries show their source repo; add-repo needs one confirmation | 4 | ⬜ |
| FR-C7 | Missing `requiredTools` at install warn fail-soft; install proceeds, warning rides the draft | 2 | ✅ (cleared if a later re-plan recomputes warnings — noted) |
| FR-C8 | Removing or failing to reach a repo never breaks installed loops or library entries | 1 (cache) / 3 (verified) | ✅ |
| FR-C9 | Official catalog ships a range of example loops from simple to very complex, together showing off triggers, placement, delivery, guards, per-step config, and human input *(added by Dan, 2026-07-02)* | 5 | ⬜ |

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

- [ ] Tab structure: `LibraryBrowser` gains a two-tab header (My Library /
  Catalog) — net-new structure (no existing tab primitive in this view);
  keep `LibraryBrowser.tsx` focused by adding `ui/components/CatalogBrowser.tsx`
  + `ui/components/CatalogEntryCard.tsx` (and a detail view) as siblings.
- [ ] Catalog list: house pattern (pinned search + refresh row, 10 at a
  time, Load more) over all repos' entries — card shows name, description,
  connectors, cost band, trigger/delivery summary, verified badge
  (official) or source-repo label (third-party), Install. Entry detail
  shows example output + limitations.
- [ ] Installed marker: entries whose `(repoKey, slug)` matches a library
  entry's provenance show the library link and jump to it instead of a
  duplicate Install.
- [ ] Repo management row: official baked in; Add repo (URL input + the
  FR-C6 one-time confirmation dialog showing the URL and trust text);
  per-repo refresh/remove; stale/offline notices from Phase 3 data.
- [ ] On-demand fetch trigger: opening the Catalog tab dispatches a refresh
  for stale/never-fetched repos (renderer-initiated on open — still no
  timers); manual refresh buttons besides.
- [ ] Dispatch wiring: `catalog_*` param mapping in
  `ui/OrchestratorApp.tsx` `onAction`; install navigates to the new draft's
  detail (same shape as `onLoadFromLibrary`).
- [ ] Docs: `apps/docs-site` reference (catalog tab, actions/commands,
  trust model in plain terms, repo layout for authors + "publish = open a
  PR against the catalog repo") and a short guide walkthrough (install →
  review → activate).
- [ ] UI-lib pure helpers (`ui/lib/catalog-summary.ts`) unit-tested; keep
  every new component under 200 LOC.

**Exit gate.** Full flow works by hand in the dev app: browse → install →
adapted draft opens → activate; add/remove/refresh a fixture repo from the
UI.

## Phase 5 — Official catalog content: example loops (FR-C9)

**Goal.** The official catalog repo
(`sero-labs/orchestrator-catalog`) ships a curated range of example loops,
simple → very complex, that together demonstrate every major orchestrator
feature. Each is a real, runnable `SharedLoopDefinition` with honest
metadata — authored via the product itself (create → refine → save →
export from the library), not hand-written JSON — validated locally, then
pushed to the catalog repo.

**Planned lineup** (adjust during authoring; complexity ascending):

- [ ] **Daily note** *(simple)* — one step, cron trigger, workspace-files
  delivery, LOW model. The "hello world": shows a plan, a schedule, and an
  artifact appearing.
- [ ] **Weekly research digest** *(moderate)* — cron, 2–3 dependent steps
  (gather → synthesize → write), saved-artifact delivery with a stable
  path, per-step model tiers (LOW gather / MED write), `costBand: medium`.
- [ ] **Repo hygiene monitor** *(moderate, events)* — filesystem event
  trigger, guard steps ("nothing to do this pass" legally skips), limits
  tuned, workspace-files delivery. Shows event triggers + guards +
  recurring passes that often no-op.
- [ ] **CI fixer** *(complex)* — `github:ci-failed` event trigger, managed
  worktree placement, `pr` delivery with verify-back, requiredTools/
  connectors metadata ("GitHub (gh login)"), step-level tool allowlists.
- [ ] **Issue triage & report** *(complex, external)* — `github:
  issue-labelled` trigger, multi-step with a human-input clarify step,
  webhook-post delivery gated on approval (`gate: 'approval'` pre-final
  step), attachment-bearing approval question. Shows the full external-send
  safety story.
- [ ] **Inbox-to-brief** *(very complex)* — hybrid trigger (cadence +
  event), email-draft delivery (Gmail connector metadata), context
  overrides, per-step agent/model/tool picks, human-input mid-plan,
  limits + log policy tuned, `costBand: high`, honest `limitations` text.
- [ ] Each entry: `definition.json` (exported real definition),
  `catalog.json` metadata (all display fields exercised across the set —
  costBand low/med/high all present, connectors, recommendedTrigger,
  delivery, modelTier, limitations), `example-output.md` where it helps
  the card sell the loop.
- [ ] Validation harness: a script/test that runs every entry in a local
  checkout of the catalog repo through the real install validation
  (schema + plan) — run before every content push so shipped content can
  never rot silently; a network-gated live check rides the Phase 6 e2e.
- [ ] Authoring doc for future entries (repo layout, metadata fields, the
  PR-review bar) — lands in the catalog repo's README.

**Exit gate.** Every official entry passes the validation harness; each
installs to a draft in the dev app and reads sensibly after adaptation;
content pushed to `sero-labs/orchestrator-catalog`.

## Phase 6 — End-to-end verification

**Goal.** Agent e2e in the real app (`SERO_E2E_REAL_HOME=1`, `pnpm build`
from repo ROOT first — plugin UI is its own build), following the
living-loops/delivery e2e mechanics (scratch workspace register-and-reuse,
cleanup via `window.sero.appAgent.invokeTool`).

**Tasks**

- [ ] `apps/desktop/e2e/catalog.agent.spec.ts`: official entries visible in
  the Catalog tab out of the box; add a local `file://` fixture repo
  (confirmation dialog exercised); install a fixture entry → draft appears
  with provenance link + adapted plan → never active; bump the fixture repo
  → refresh → "vN available" on the linked loop → switch version; remove
  the repo → installed loop still opens and runs; invalid fixture entry is
  hidden with a reason and installing a broken definition blocks with
  errors.
- [ ] Live official-repo pass (network-gated like the GitHub live e2e):
  fetch `sero-labs/orchestrator-catalog`, install-and-activate the simple
  entry and let it produce its artifact — proves shipped content actually
  runs.
- [ ] Real findings get their own `fix(orchestrator):` commits; findings
  recorded here in a "Live-pass findings" section.

**Exit gate.** e2e green against the real app; findings section filled in.

---

## Out of scope (v1) — restating the spec

Install counts/ratings/telemetry; a publishing pipeline beyond PR-to-repo;
auto-updating installed entries; cross-profile sync beyond shared git;
entries that bundle plugins/tools (entries may *require* connectors, never
install them).
