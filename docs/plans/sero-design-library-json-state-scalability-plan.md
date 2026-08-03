# Design Library JSON state scalability plan

**Status:** Complete
**Scope:** Profile-global Design Library persistence, indexes, migration, and Library search
**Plugin:** `plugins/sero-design-library-plugin/`
**Storage:** JSON records and asset files only

## 1. Goal

Keep `state.json` small as the Design Library grows to hundreds or thousands of items and Designs.

Use one complete JSON record for each top-level entity. Use one compact index file for each entity type. Keep filtering and high-level keyword search over item index fields. Do not add a database or split one entity across many metadata records.

## 2. Agreed design

### 2.1 Storage rules

- Each item has one `record.json`.
- Each Design has one `record.json`. It includes its variants and revision metadata.
- Each Gallery family has one `record.json`. It includes its version metadata.
- Each job has one JSON record.
- Each export has one JSON record.
- Binary assets, generated source files, built previews, and Gallery snapshot files remain separate from JSON records.
- Each entity type has one compact `index.json` for list rendering and filtering.
- `state.json` contains only bounded control state and the transient request queue.
- The runtime remains the only authoritative record and index writer.

### 2.2 Target layout

```text
design-library/
├── state.json
├── items/
│   ├── index.json
│   └── <item-id>/
│       ├── record.json
│       ├── original.<ext>
│       ├── preview.webp
│       └── frames.webp
├── designs/
│   ├── index.json
│   └── <design-id>/
│       ├── record.json
│       ├── assets/
│       └── variants/
├── gallery/
│   ├── index.json
│   └── <family-id>/
│       ├── record.json
│       └── versions/
├── jobs/
│   ├── index.json
│   └── <job-id>.json
├── exports/
│   ├── index.json
│   └── <export-id>.json
├── uploads/
├── tombstones/
└── secrets.json
```

Existing asset paths must not change unless a migration requires it. This work should move metadata, not media.

### 2.3 Bounded reactive state

The version 2 state should contain:

- Schema version
- Global revision used by detail views
- Settings
- Media model options
- View preferences
- Saved Library search query
- Collections, unless measurements show that they need their own record store
- The request queue
- The next request id
- The consumed request watermark

It must not contain:

- Item summaries
- Design summaries
- Gallery family records or summaries
- Export history
- Job history

### 2.4 Compact item index

`items/index.json` should contain the fields required by cards, scopes, filters, sorting, and high-level keyword search:

```ts
interface ItemIndexEntry {
  id: string;
  title: string;
  fileName?: string;
  primaryStyle: string;
  tags: string[];
  designTypes: string[];
  kind: MediaKind;
  previewPath: string;
  analysisStatus: AnalysisStatus;
  analysisError?: string;
  awaitingFrames?: boolean;
  favourite: boolean;
  collectionIds: string[];
  colours: string[];
  sourceKind: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  edited: boolean;
}
```

The index must keep all tags needed by filtering. The card can still display only the first six tags.

Do not persist a combined `searchText` value. Do not copy notes, summaries, prompts, guardrails, or detailed Librarian analysis into the index.

### 2.5 Search contract

The Library search box should match these fields without case sensitivity:

- Title
- Original file name
- Primary style
- Tags
- Design types

Split the query into whitespace-separated terms. Every term must match at least one field. Partial field matches remain valid.

Search combines with the existing scope and filters. It does not search notes or detailed analysis. Change the placeholder to **Search titles, styles, tags or files**.

The renderer can search and filter the compact item index in memory. Do not add a search service, persistent search cache, database, or model call.

## 3. Non-goals

- SQLite or another database
- Sharded indexes
- One record per Design variant or revision
- One record per Gallery version
- Full-text search over detailed Librarian analysis
- Semantic or embedding search
- A new host capability or Design Library-specific IPC
- Moving binary assets into JSON
- Changing media ingestion, generation, or Gallery product behavior

## 4. Implementation task list

### Phase 1 — Types and storage boundaries

- [x] Add version 2 control-state types and defaults.
- [x] Remove entity arrays from the control-state type.
- [x] Add normalized types for item, Design, Gallery, job, and export indexes.
- [x] Rename or separate `ItemSummary` so card display limits do not remove index values.
- [x] Add paths for every entity index and export record.
- [x] Keep one complete record type for each top-level entity.
- [x] Keep all new and touched source files below 500 lines.

### Phase 2 — Shared JSON index storage

- [x] Add shared helpers to read, normalize, and atomically write each index.
- [x] Use the existing in-process queue and cross-process file locks.
- [x] Define one consistent lock order: entity record, entity index, then control state.
- [x] Add pure projection functions from each record to its index entry.
- [x] Update an index only when its projected value changes.
- [x] Write the record before the index so an observed index never points to a missing record.
- [x] Update the small control-state revision after record and index writes complete.
- [x] Keep unreadable records on disk and exclude them from rebuilt indexes.

### Phase 3 — Runtime record stores

- [x] Change item writes and deletion to update `items/index.json` instead of the item array in `state.json`.
- [x] Change Design writes and deletion to update `designs/index.json`.
- [x] Keep every Design's variants and revision metadata in its single Design record.
- [x] Change Gallery writes and deletion to update `gallery/index.json`.
- [x] Keep every Gallery family's version metadata in its single family record.
- [x] Change job writes, retention, dismissal, and recovery to update `jobs/index.json`.
- [x] Prune orphan revision directories for Designs listed in `designs/index.json` at startup.
- [x] Persist one record per export and update `exports/index.json`.
- [x] Remove startup work that rebuilds entity arrays inside `state.json`.
- [x] Retain a deliberate full index-rebuild operation for migration and repair.

### Phase 4 — Extension read and request paths

- [x] Audit every extension and runtime `readState()` call.
- [x] Read entity lists from their indexes.
- [x] Read full entity details from their records.
- [x] Keep mutation tools as intent writers through the existing request queue.
- [x] Remove assumptions that all items, Designs, Gallery families, jobs, or exports are present in control state.
- [x] Keep duplicate detection authoritative against item records or a normalized item-index field.

### Phase 5 — UI index subscriptions

- [x] Add and test a small local hook that reads and watches a JSON index through the existing app-state bridge.
- [x] Make the Library page consume `items/index.json`.
- [x] Make the Designs surfaces consume `designs/index.json`.
- [x] Make the Gallery page consume `gallery/index.json`.
- [x] Make job and export notifications consume their indexes or a bounded current notification projection.
- [x] Keep full item and Design detail reads on demand.
- [x] Ensure an index update does not reset local view state or selection.
- [x] Keep large grids incrementally or window rendered.

### Phase 6 — High-level search and filters

- [x] Remove `searchText` from the item index type and projection.
- [x] Search title, file name, primary style, tags, and Design types directly.
- [x] Preserve case-insensitive, partial, all-terms matching.
- [x] Keep scope, structured filters, and sorting behavior unchanged.
- [x] Keep every tag in the index while limiting only card presentation.
- [x] Update the search placeholder to **Search titles, styles, tags or files**.
- [x] Update tests that currently expect notes or analysis to be searchable.
- [x] Add explicit tests that notes, prompts, and detailed analysis are not index search fields.
- [x] Restore the search query to saved view preferences and agent control.

### Phase 7 — Automatic migration

- [x] Detect a legacy state that contains entity arrays.
- [x] Build normalized indexes from the authoritative record files.
- [x] Create export records for legacy exports that exist only in state.
- [x] Preserve collections and bounded settings without data loss.
- [x] Write all record and index files before switching to version 2 control state.
- [x] Preserve the old state as `state.json.pre-index-backup` before the final switch.
- [x] Make migration safe to retry after interruption.
- [x] Do not move or duplicate original media and generated assets.
- [x] Report unreadable records without deleting them.
- [x] Do not run a full record scan on every normal startup after migration.

### Phase 8 — Tests and documentation

- [x] Add unit tests for every index normalizer and projection.
- [x] Add storage tests that prove one entity change does not rewrite unrelated entity records.
- [x] Add migration tests for items, Designs, Gallery families, jobs, exports, settings, collections, requests, and deleted records.
- [x] Add interruption tests for record, index, and final control-state writes.
- [x] Add restart tests for pending requests and active jobs.
- [x] Add search tests for all supported high-level fields and all excluded detailed fields.
- [x] Add filter and facet tests that include tags beyond the first six.
- [x] Add a generated fixture with at least 5,000 items and 1,000 Designs.
- [x] Verify that the large fixture does not add entity data to `state.json`.
- [x] Update the Design Library specification and first-release storage documentation.
- [x] Update the docs site only where user-visible search behavior is described.

### Phase 9 — Verification and delivery

- [x] Run the Design Library focused test suite.
- [x] Run the Design Library typecheck.
- [x] Run the Design Library build.
- [x] Run React Doctor after the React changes.
- [x] Run root `pnpm typecheck` before each commit.
- [x] Run `git diff --check`.
- [x] Check the line count of every touched source file.
- [x] Review the migrated example profile without changing its source data.
- [x] Test import, search, filters, Design detail, Gallery, and **Show more** in the running app with a copy of a real profile.
- [x] Commit each coherent phase with a Conventional Commit message.
- [x] Do not open a pull request until the specification and docs-site review are complete.

## 5. Acceptance criteria

### Storage and compatibility

- [x] `state.json` contains no item, Design, Gallery, export, or job arrays after migration.
- [x] Adding entities does not increase `state.json` except for bounded revision and request data.
- [x] Every item has one complete item record.
- [x] Every Design has one complete Design record, including its variants and revision metadata.
- [x] Every Gallery family has one complete family record, including its version metadata.
- [x] Every job and export has one complete JSON record.
- [x] Original media, previews, generated files, and Gallery assets retain their current ownership and paths.
- [x] An existing profile migrates automatically without losing records, settings, collections, requests, deletion state, or asset references.
- [x] A failed or interrupted migration leaves the legacy state usable and can be retried.

### Index behavior

- [x] Each entity index contains only normalized list data for that entity type.
- [x] No index contains notes, prompts, guardrails, detailed Librarian analysis, generated source, or binary data.
- [x] `items/index.json` contains all tags required by filters and facets.
- [x] A record change updates its own record and relevant index without rewriting unrelated entity records.
- [x] A corrupt record is reported and skipped without preventing other entities from loading.
- [x] Normal startup reads the indexes and does not rebuild them from every record.

### Search and filters

- [x] Search matches title, original file name, primary style, tags, and Design types.
- [x] Search is case-insensitive and supports partial terms.
- [x] Every query term must match at least one supported field.
- [x] Search combines correctly with scopes, filters, and sorting.
- [x] Search does not match notes, summaries, prompts, guardrails, or detailed analysis.
- [x] The search placeholder describes the supported fields accurately.
- [x] Existing media, style, tag, colour, source, status, date, favourite, collection, recent, awaiting, and trash filters keep their behavior.

### Scale and responsiveness

- [x] A fixture with 5,000 items and 1,000 Designs loads from compact indexes without loading every full record into the renderer.
- [x] Search, filters, facets, and sorting return correct results for the large fixture.
- [x] Opening one item or Design reads only its full record and required assets.
- [x] Updating view preferences rewrites only the small control state.
- [x] Updating one item does not broadcast every full item or Design record.
- [x] The rendered grid remains bounded as the index grows.

### Quality gates

- [x] All focused tests pass.
- [x] Plugin typecheck and build pass.
- [x] React Doctor has no unresolved regression caused by this work.
- [x] Root `pnpm typecheck` passes before every commit.
- [x] Every touched source file remains below 500 lines.
- [x] Documentation matches the implemented storage and search behavior.

## 6. Deferred decisions

Do not solve these in the first implementation:

- Index sharding
- Server-side pagination
- Deep search over full records
- Semantic search
- A collection record store

Measure the compact indexes with the 5,000-item fixture first. If one index later becomes a measured write or load bottleneck, its persistence can change without changing the one-record-per-entity contract.
