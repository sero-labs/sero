# 14 — Loop Catalog

Status: **draft — direction approved, decisions confirmed 2026-07-01**.

The Loop Library ([08-loop-library.md](08-loop-library.md)) solves save/reuse
for loops the user already built. New users still face a blank prompt box. The
Catalog gives them curated, proven loops — "CI fixer", "inbox triage", "weekly
research digest" — to install, adapt, and switch on. Spec 08 deliberately made
`SharedLoopDefinition` a clean portable payload and deferred remote sources as
a "later layer"; this is that layer.

## Decisions (confirmed)

1. **A catalog is a git repository.** The official Sero catalog repo ships as
   the default, and users can add more repos — public or private, using their
   existing ambient git/`gh` auth. A private company repo is therefore a
   shared **team catalog** for free (the team-sharing layer 08 deferred).
   Curation happens through normal PR review on the repo.
2. **Fetch = shallow clone to a local cache, pulled on demand** (opening the
   catalog tab or pressing refresh). No background polling, no timers —
   consistent with the no-polling rule. Works offline after first fetch.
3. **Install links into the existing library versioning.** Installing creates
   a provenance-linked library entry; a newer catalog version lands as a new
   library version, so the existing "vN available" badge, update/downgrade
   picker, and divergence handling all apply unchanged to catalog loops.
4. **UI is a Catalog tab beside "My Library"** in the library view — richer
   metadata cards with an Install button; personal saves stay uncluttered.
5. **Verified badge = the official repo.** Third-party repo entries show
   their origin instead. Install counts and ratings are deferred — they need
   a backend that doesn't exist, and v1 ships without telemetry.
6. **Install never auto-activates.** Every install lands as a draft the user
   reviews (the existing load → validate → review → activate path). This is
   also the trust gate: a catalog definition is a prompt+plan that will run
   with the user's normal agent permissions, so the user sees exactly what it
   does before it can run.

## Catalog repo layout

```text
catalog.json                    # index: { version: 1, name, entries: [slug…] }
loops/<slug>/
  definition.json               # SharedLoopDefinition (the 08 payload, verbatim)
  catalog.json                  # curated metadata (below)
  example-output.md             # optional, shown on the entry card
```

Curated metadata — display + install-check data, all optional except
`slug`/`name`/`description`/`version`:

```ts
interface CatalogEntryMeta {
  slug: string;
  name: string;
  /** What it does, in plain language. */
  description: string;
  /** Tool names checked against the live catalog at install (fail-soft). */
  requiredTools?: string[];
  /** Human-readable connector needs: "GitHub (gh login)", "Gmail (Google plugin)". */
  connectors?: string[];
  /** Display text: "fires on github:ci-failed" / "weekdays 8am". */
  recommendedTrigger?: string;
  delivery?: DeliveryDestinationId;          // from 13-pluggable-delivery.md
  costBand?: 'low' | 'medium' | 'high';
  modelTier?: 'LOW' | 'MED' | 'HIGH';
  limitations?: string;
  /** Monotonic per-entry version; maps onto library versions on install. */
  version: number;
}
```

Fields the engine doesn't model (cost band, connectors) are honest display
metadata, not enforcement. `requiredTools` reuses the delivery/tool
availability warning machinery at install time.

## Host seam

Clones live under the profile —
`$SERO_HOME/apps/orchestrator-catalog/<repoKey>/` — resolved desktop-side and
injected, like the library root (the plugin never imports `SERO_HOME`). Git
operations run desktop-side via `execFile('git' | 'gh')`, the established
`pull-request.ts` pattern:

```ts
interface CatalogRepoRef { key: string; url: string; official: boolean }

interface CatalogStore {
  listRepos(): Promise<CatalogRepoRef[]>;
  addRepo(url: string): Promise<CatalogRepoRef>;
  removeRepo(key: string): Promise<void>;
  /** Shallow clone on first call, `git pull` after; returns the cache root. */
  refresh(key: string): Promise<{ root: string; updatedAt: string }>;
  readIndex(key: string): Promise<CatalogIndex | null>;
  readEntry(key: string, slug: string): Promise<CatalogEntry | null>;
}

interface OrchestratorHost {
  // …existing…
  catalog: CatalogStore;
}
```

Fail-soft: an unreachable repo shows its last-fetched cache with a stale
notice; a repo that was never fetched shows a clear offline message. Removing
a repo never touches installed loops (they own their library copies).

## Install flow

1. User picks an entry in the Catalog tab → `catalog_install`.
2. The definition is validated exactly like a library load (schema version,
   plan validation) — an invalid definition blocks with errors, never a crash.
3. A library entry is created (or updated) with provenance
   `{ repoKey, slug, catalogVersion }` carried on the `LibraryVersion` —
   `putVersion` appends it via the normal immutable path. Reinstalling the
   same catalog version is a no-op pointing at the existing library version.
4. The existing `library_load` path instantiates a draft loop in the current
   workspace (new ids, fresh runtime, link set).
5. **Adaptation is the model's job:** catalog prompts are generic ("your
   repo", "your team channel"). The existing planner clarify flow runs on the
   installed draft so the model adapts prompt, trigger filters, and delivery
   params to this workspace, asking the user where genuinely ambiguous. No
   placeholder-substitution DSL, no template rails — the definition is a
   starting point the LLM specializes and code validates.
6. User reviews the adapted plan and activates — the standard D3 review step.

## Updates

Refresh pulls the repo(s). For each installed entry whose catalog `version` is
newer than the latest provenance-carrying library version, a new library
version is appended. Linked loops then surface "vN available" through the
watched library index — push, no polling, zero new update UI. Update and
downgrade use the existing version-switch machinery (including the
step-override replay and divergence confirmation).

## Trust model (stated plainly)

- Official repo entries are PR-reviewed by the Sero team and badge as
  verified.
- Third-party repos are the user's choice: adding one shows the repo URL and
  a one-time confirmation; entries display their source repo, never the
  verified badge.
- The real gate is structural: installs are drafts, plans are reviewed before
  activation, external delivery is approval-gated (13), and loops run under
  the user's normal agent permissions — the catalog adds no new execution
  authority.

## UI

- **Catalog tab** in the library view: searchable cards (name, description,
  connectors, cost band, trigger/delivery summary, verified badge or source
  repo, Install). Entry detail shows the example output and limitations.
  Pagination follows the house list rule (pinned controls, load-more).
- **Repo management:** a compact row in the catalog tab — official repo baked
  in, "Add repo" for more, per-repo refresh/remove.
- **Installed marker:** entries already installed show their library link and
  jump to it instead of duplicating.

## Actions

```ts
| { kind: 'catalog_add_repo'; url: string }
| { kind: 'catalog_remove_repo'; repoKey: string }
| { kind: 'catalog_refresh'; repoKey?: string }        // omitted = all
| { kind: 'catalog_install'; repoKey: string; slug: string; workspaceLoad?: boolean }
```

## Functional requirements

- **FR-C1** The official catalog repo works out of the box; users can add and
  remove additional repos; private repos authenticate through ambient
  git/`gh` credentials.
- **FR-C2** Fetching is on-demand only (tab open / manual refresh) with a
  local clone cache that works offline; no background timers.
- **FR-C3** Install validates the definition, creates a provenance-linked
  library entry/version, and instantiates a draft through the existing load
  path — never auto-activates.
- **FR-C4** The planner clarify flow adapts installed loops to the workspace;
  adaptation is model-authored and code-validated (no template DSL).
- **FR-C5** Newer catalog versions append library versions; installed loops
  see updates via the existing "vN available" push machinery, with the
  existing switch/divergence semantics.
- **FR-C6** Verified badge appears only on official-repo entries; third-party
  entries show their source; adding a third-party repo requires one explicit
  confirmation.
- **FR-C7** Missing `requiredTools` at install warn fail-soft (same pattern
  as model/delivery availability) — install proceeds, the warning rides the
  draft.
- **FR-C8** Removing or failing to reach a repo never breaks installed loops
  or their library entries.

## Out of scope (v1)

- Install counts, ratings, and any usage telemetry (needs a backend).
- A submission/publishing pipeline beyond "open a PR against the catalog
  repo" and docs for it.
- Auto-updating installed entries (manual, by design — nothing changes on its
  own).
- Cross-profile/team sync beyond what a shared git repo already provides.
- Catalog entries that bundle plugins/tools — entries may *require*
  connectors, never install them.
