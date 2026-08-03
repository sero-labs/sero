# Design Library JSON state scalability plan

**Status:** Proposed
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
- Search text

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

- [ ] Add version 2 control-state types and defaults.
- [ ] Remove entity arrays from the control-state type.
- [ ] Add normalized types for item, Design, Gallery, job, and export indexes.
- [ ] Rename or separate `ItemSummary` so card display limits do not remove index values.
- [ ] Add paths for every entity index and export record.
- [ ] Keep one complete record type for each top-level entity.
- [ ] Keep all new and touched source files below 500 lines.

### Phase 2 — Shared JSON index storage

- [ ] Add shared helpers to read, normalize, and atomically write each index.
- [ ] Use the existing in-process queue and cross-process file locks.
- [ ] Define one consistent lock order: entity record, entity index, then control state.
- [ ] Add pure projection functions from each record to its index entry.
- [ ] Update an index only when its projected value changes.
- [ ] Write the record before the index so an observed index never points to a missing record.
- [ ] Update the small control-state revision after record and index writes complete.
- [ ] Keep unreadable records on disk and exclude them from rebuilt indexes.

### Phase 3 — Runtime record stores

- [ ] Change item writes and deletion to update `items/index.json` instead of the item array in `state.json`.
- [ ] Change Design writes and deletion to update `designs/index.json`.
- [ ] Keep every Design's variants and revision metadata in its single Design record.
- [ ] Change Gallery writes and deletion to update `gallery/index.json`.
- [ ] Keep every Gallery family's version metadata in its single family record.
- [ ] Change job writes, retention, dismissal, and recovery to update `jobs/index.json`.
- [ ] Persist one record per export and update `exports/index.json`.
- [ ] Remove startup work that rebuilds entity arrays inside `state.json`.
- [ ] Retain a deliberate full index-rebuild operation for migration and repair.

### Phase 4 — Extension read and request paths

- [ ] Audit every extension and runtime `readState()` call.
- [ ] Read entity lists from their indexes.
- [ ] Read full entity details from their records.
- [ ] Keep mutation tools as intent writers through the existing request queue.
- [ ] Remove assumptions that all items, Designs, Gallery families, jobs, or exports are present in control state.
- [ ] Keep duplicate detection authoritative against item records or a normalized item-index field.

### Phase 5 — UI index subscriptions

- [ ] Add a small local hook that reads and watches a JSON index through the existing app-state bridge.
- [ ] Make the Library page consume `items/index.json`.
- [ ] Make the Designs surfaces consume `designs/index.json`.
- [ ] Make the Gallery page consume `gallery/index.json`.
- [ ] Make job and export notifications consume their indexes or a bounded current notification projection.
- [ ] Keep full item and Design detail reads on demand.
- [ ] Ensure an index update does not reset local view state or selection.
- [ ] Keep large grids incrementally or window rendered.

### Phase 6 — High-level search and filters

- [ ] Remove `searchText` from the item index type and projection.
- [ ] Search title, file name, primary style, tags, and Design types directly.
- [ ] Preserve case-insensitive, partial, all-terms matching.
- [ ] Keep scope, structured filters, and sorting behavior unchanged.
- [ ] Keep every tag in the index while limiting only card presentation.
- [ ] Update the search placeholder to **Search titles, styles, tags or files**.
- [ ] Update tests that currently expect notes or analysis to be searchable.
- [ ] Add explicit tests that notes, prompts, and detailed analysis are not index search fields.

### Phase 7 — Automatic migration

- [ ] Detect a legacy state that contains entity arrays.
- [ ] Build normalized indexes from the authoritative record files.
- [ ] Create export records for legacy exports that exist only in state.
- [ ] Preserve collections and bounded settings without data loss.
- [ ] Write all record and index files before switching to version 2 control state.
- [ ] Preserve the old state as `state.json.pre-index-backup` before the final switch.
- [ ] Make migration safe to retry after interruption.
- [ ] Do not move or duplicate original media and generated assets.
- [ ] Report unreadable records without deleting them.
- [ ] Do not run a full record scan on every normal startup after migration.

### Phase 8 — Tests and documentation

- [ ] Add unit tests for every index normalizer and projection.
- [ ] Add storage tests that prove one entity change does not rewrite unrelated entity records.
- [ ] Add migration tests for items, Designs, Gallery families, jobs, exports, settings, collections, requests, and deleted records.
- [ ] Add interruption tests for record, index, and final control-state writes.
- [ ] Add restart tests for pending requests and active jobs.
- [ ] Add search tests for all supported high-level fields and all excluded detailed fields.
- [ ] Add filter and facet tests that include tags beyond the first six.
- [ ] Add a generated fixture with at least 5,000 items and 1,000 Designs.
- [ ] Verify that the large fixture does not add entity data to `state.json`.
- [ ] Update the Design Library specification and first-release storage documentation.
- [ ] Update the docs site only where user-visible search behavior is described.

### Phase 9 — Verification and delivery

- [ ] Run the Design Library focused test suite.
- [ ] Run the Design Library typecheck.
- [ ] Run the Design Library build.
- [ ] Run React Doctor after the React changes.
- [ ] Run root `pnpm typecheck` before each commit.
- [ ] Run `git diff --check`.
- [ ] Check the line count of every touched source file.
- [ ] Review the migrated example profile without changing its source data.
- [ ] Commit each coherent phase with a Conventional Commit message.
- [ ] Do not open a pull request until the specification and docs-site review are complete.

## 5. Acceptance criteria

### Storage and compatibility

- [ ] `state.json` contains no item, Design, Gallery, export, or job arrays after migration.
- [ ] Adding entities does not increase `state.json` except for bounded revision and request data.
- [ ] Every item has one complete item record.
- [ ] Every Design has one complete Design record, including its variants and revision metadata.
- [ ] Every Gallery family has one complete family record, including its version metadata.
- [ ] Every job and export has one complete JSON record.
- [ ] Original media, previews, generated files, and Gallery assets retain their current ownership and paths.
- [ ] An existing profile migrates automatically without losing records, settings, collections, requests, deletion state, or asset references.
- [ ] A failed or interrupted migration leaves the legacy state usable and can be retried.

### Index behavior

- [ ] Each entity index contains only normalized list data for that entity type.
- [ ] No index contains notes, prompts, guardrails, detailed Librarian analysis, generated source, or binary data.
- [ ] `items/index.json` contains all tags required by filters and facets.
- [ ] A record change updates its own record and relevant index without rewriting unrelated entity records.
- [ ] A corrupt record is reported and skipped without preventing other entities from loading.
- [ ] Normal startup reads the indexes and does not rebuild them from every record.

### Search and filters

- [ ] Search matches title, original file name, primary style, tags, and Design types.
- [ ] Search is case-insensitive and supports partial terms.
- [ ] Every query term must match at least one supported field.
- [ ] Search combines correctly with scopes, filters, and sorting.
- [ ] Search does not match notes, summaries, prompts, guardrails, or detailed analysis.
- [ ] The search placeholder describes the supported fields accurately.
- [ ] Existing media, style, tag, colour, source, status, date, favourite, collection, recent, awaiting, and trash filters keep their behavior.

### Scale and responsiveness

- [ ] A fixture with 5,000 items and 1,000 Designs loads from compact indexes without loading every full record into the renderer.
- [ ] Search, filters, facets, and sorting return correct results for the large fixture.
- [ ] Opening one item or Design reads only its full record and required assets.
- [ ] Updating view preferences rewrites only the small control state.
- [ ] Updating one item does not broadcast every full item or Design record.
- [ ] The rendered grid remains bounded as the index grows.

### Quality gates

- [ ] All focused tests pass.
- [ ] Plugin typecheck and build pass.
- [ ] React Doctor has no unresolved regression caused by this work.
- [ ] Root `pnpm typecheck` passes before every commit.
- [ ] Every touched source file remains below 500 lines.
- [ ] Documentation matches the implemented storage and search behavior.

## 6. Deferred decisions

Do not solve these in the first implementation:

- Index sharding
- Server-side pagination
- Deep search over full records
- Semantic search
- A collection record store

Measure the compact indexes with the 5,000-item fixture first. If one index later becomes a measured write or load bottleneck, its persistence can change without changing the one-record-per-entity contract.
