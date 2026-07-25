# Sero Design Library Plugin Implementation Plan

**Status:** Ready for PR 1; persistence and AI blocked by required spikes
**Target branch:** `feat/design-library-plugin`
**Plugin:** `@sero-ai/plugin-design-library`
**App ID:** `design-library`
**Scope:** Global

## 1. Purpose

This plan delivers the approved image-only Library to Design to Gallery loop while preserving external-plugin portability.

PR 1 may begin because it is fixture-backed. PR 2 and later production infrastructure must not begin until the pre-PR-2 spikes resolve state ownership, asset transport, multimodal input, preview isolation, Gallery preview capture and provider-neutral asset generation.

## 2. Governing constraints

- Reuse Sero's public plugin and runtime contracts.
- No custom preload APIs.
- No new desktop IPC.
- No Design Library-specific host changes.
- No imports from desktop source or `sero-web-plugin`.
- No direct UI filesystem access.
- No binary payloads in reactive state.
- No provider-specific fal.ai types outside its adapter.
- No source reference pixels in generated output.
- No mutable Gallery snapshots.

## 3. First-release vertical slice

1. Import an image with file picker, drag-and-drop or clipboard paste.
2. Detect exact duplicates by checksum.
3. Display it immediately in the uniform Library grid.
4. Run Librarian automatically.
5. Edit whole user-facing fields with per-field reset.
6. Search and filter the Library.
7. Select up to six ordered references.
8. Choose HTML or React output for the Design.
9. Generate one to five variants, default three.
10. Preview safely, including warnings for blocked behaviour.
11. Revise with recoverable replace or retain behaviour.
12. Generate local illustrative assets through provider-neutral LLM tools when the model chooses.
13. Save an immutable version into a Gallery family.
14. Export exact saved code, assets and metadata.
15. Restart Sero and recover durable state and resumable jobs.

## 4. Reuse map

| Requirement | Sero capability or precedent | Plan |
|---|---|---|
| Plugin structure | Canonical plugin template and notes example | Copy canonical structure and remove unused surfaces. |
| Discovery | `sero.app` manifest | Use global app auto-discovery. |
| UI state | `useAppState()` | Subscribe to lightweight summaries only. |
| UI actions | `useAppTools()` | Route all domain mutation through grouped plugin tools. |
| Background work | `createAppRuntime()` | Use one global runtime coordinator. |
| Structured AI | `host.subagents.runStructured()` | Use configured models, structured schemas, repair and cancellation. |
| Theme | `@sero-ai/ui` and theme CSS tokens | Use Sero colour, typography, spacing and radius contracts. |
| Secrets | Existing per-profile secret mechanism | Resolve provider credentials without plugin-owned plaintext settings. |
| Preview pattern | Existing opaque-origin iframe and CSP precedents | Adapt patterns inside the plugin after the isolation spike. |
| Files | Resolved global app directory | Store plugin-owned records and assets without new host IPC. |

## 5. Domain shape

```text
LibraryItem
  generated analysis
  field overrides
  source provenance
  owned original and preview

Design
  ordered references
  chosen output target
  generation runs
  variants and revision histories
  provider-neutral generated assets

GalleryFamily
  featured version pointer
  immutable GalleryVersion snapshots
  optional linked source/remix family
```

Each reference can resolve to:

- A live source.
- Tombstoned provenance after permanent source deletion.

## 6. Plugin shape

```text
plugins/sero-design-library-plugin/
├── package.json
├── vite.config.ts
├── shared/
│   ├── defaults.ts
│   ├── schemas.ts
│   └── types.ts
├── extension/
│   ├── index.ts
│   ├── paths.ts
│   └── tools/
├── runtime/
│   ├── index.ts
│   ├── coordinator.ts
│   ├── jobs/
│   ├── librarian/
│   ├── generation/
│   ├── asset-generation/
│   │   ├── contract.ts
│   │   ├── registry.ts
│   │   └── adapters/fal.ts
│   └── preview/
└── ui/
    ├── DesignLibraryApp.tsx
    ├── pages/
    │   ├── LibraryPage.tsx
    │   ├── DesignPage.tsx
    │   └── GalleryPage.tsx
    └── components/
```

Keep files focused and below 500 lines where practical.

## 7. Tool surface

Use grouped tools with validated action enums:

| Tool | First-release actions |
|---|---|
| `design_library_assets` | Upload lifecycle, preview read, original read, delete, copy to Library |
| `design_library_items` | Get, update field, reset field, soft delete, restore, permanent delete |
| `design_library_analysis` | Analyse, reanalyse, cancel, retry |
| `design_library_designs` | Create, open, revise, retry variant, cancel variant, delete, restore |
| `design_library_design_assets` | List, retry, delete, promote |
| `design_library_gallery` | Save version, feature, open, duplicate, remix, delete, restore, purge |
| `design_library_export` | Export exact Gallery version to Downloads or Workspace |

Asset generation tools exposed to the LLM use a separate provider-neutral contract and do not expose the grouped UI administration surface.

## 8. State and storage

### Reactive index

Store only:

- Item summaries.
- Design summaries.
- Gallery family and version summaries.
- Job summaries.
- Search/filter and page preferences.
- Profile generation defaults.
- Schema version and state revision.

### Full records

```text
items/<item-id>/record.json
items/<item-id>/original.<ext>
items/<item-id>/preview.webp
designs/<design-id>/record.json
designs/<design-id>/variants/<variant-id>/
designs/<design-id>/assets/<asset-id>/
gallery/<family-id>/family.json
gallery/<family-id>/versions/<version-id>/
jobs/<job-id>.json
uploads/<upload-id>/
trash/
```

### Mutation ownership

Production storage waits for the state-ownership spike.

The accepted solution must provide:

- One authoritative serialisation path per record and index.
- No extension/runtime read-modify-write races.
- A revision or compare-and-swap guard where multiple callers can mutate.
- Atomic publish of complete records.
- Recovery for interrupted index/record updates.
- Tests proving stale writers cannot overwrite newer state.

## 9. Job contract

- One persisted job per variant.
- Separate persisted jobs for Librarian and generated-asset calls.
- Successful siblings do not roll back on failure or cancellation.
- Cancellation uses `AbortSignal`.
- Restart reconciles running jobs into resumable states.
- Runtime continues work while the plugin UI is closed.
- Sero shutdown persists state and resumes eligible jobs on restart.

Do not implement a generic scheduler.

## 10. Librarian

Use Sero's configured model through structured subagent execution.

Persist:

- Generated profile.
- Explicit field overrides.
- Model and provider.
- Prompt and schema versions.
- Duration, usage and cost when available.
- Analysis status and retry history.

Reanalysis updates only the generated profile. Resolution applies overrides field by field.

## 11. Generated asset architecture

Define before implementing fal.ai:

```ts
interface AssetGenerationProvider {
  id: string;
  capabilities(): AssetCapability[];
  generate(
    request: AssetGenerationRequest,
    context: AssetGenerationContext,
  ): Promise<AssetGenerationResult>;
}
```

Required common types:

- Capability.
- Request.
- Local result.
- Normalised error and retryability.
- Provenance.
- Cancellation context.

The fal.ai adapter:

- Uses the JavaScript client.
- Resolves credentials from Sero secrets.
- Maps common requests into fal.ai calls.
- Downloads results into Design storage.
- Normalises errors and provenance.
- Never leaks remote asset URLs into preview or export.

Failure inserts a local placeholder. Asset-only retry updates the visible revision and preserves history.

## 12. Output construction

### HTML target

- Self-contained HTML, CSS and minimal JavaScript.
- Local assets only.
- No remote imports.

### React target

- React, TypeScript and Tailwind.
- Approved bundled dependency allow-list.
- Approved bundled interface icons.
- Sero-supported sans and mono stacks.
- Local font files where a non-system font is required.
- A deterministic local build step selected by the preview spike.

Each Design has one target.

## 13. Preview and validation

Required behaviour:

- Opaque isolated origin.
- Scripts allowed only inside the frame.
- No same-origin privilege.
- Restrictive CSP.
- No network.
- No host navigation or uncontrolled pop-ups.
- No Sero, Node, Electron, filesystem, secret or persistent-storage access.
- Approved dependencies only.
- Block capability violations.
- Render safe remaining output.
- Display actionable warnings outside the frame.

The isolation spike must include hostile fixtures and React bundle fixtures.

## 14. Gallery

Saving a version performs an immutable snapshot transaction:

1. Validate the current Design revision.
2. Copy exact code.
3. Copy all used local assets.
4. Record dependency and provenance manifests.
5. Capture a deterministic preview.
6. Publish the immutable version.
7. Add it to the existing family.
8. Feature it by default.

Changing the featured pointer never mutates a version.

Reopen restores the source Design at the saved revision. Duplicate or Remix explicitly starts a new linked family.

## 15. Deletion and retention

- Soft-deleted items remain until manual purge.
- All Design revisions remain until manual deletion.
- Gallery deletion is recoverable until manual purge.
- Purging a Library source never cascades.
- Dependants receive tombstoned provenance.
- Gallery snapshots own all required assets.
- Purging a Design asset cannot damage Gallery.
- Cleanup removes an owned binary only when no retained owner still requires it.

## 16. Implementation sequence

### PR 1: Approved shell and schemas

Build:

- Canonical plugin scaffold.
- Library, Design and Gallery navigation.
- Uniform Library grid with fixture data.
- Approved terminology.
- Shared schema drafts for overrides, ordered references, jobs, revisions, generated assets, Gallery families and tombstones.
- Dark and light theme support.
- Empty, loading, warning and error states.

Acceptance:

- Global app discovery works.
- The approved mockup structure is preserved.
- Build, typecheck and component tests pass.
- No persistence, AI, preview execution or provider integration exists.

### Gate A: Required spikes

Complete and document:

1. Authoritative state mutation.
2. Bounded upload and preview delivery.
3. Multimodal structured Librarian input.
4. HTML and React preview isolation.
5. Deterministic Gallery preview capture.
6. Provider-neutral asset contract with fal.ai proof.

PR 2 is blocked until Gate A passes.

### PR 2: Durable image Library

Build:

- Unified file picker, drag/drop and clipboard ingestion.
- Bounded upload protocol.
- Checksum duplicate detection.
- Original and preview storage.
- Uniform grid backed by summaries.
- Inspector editing with whole-field override/reset.
- Keyword search and approved filters.
- Soft deletion, restore, purge and tombstone behaviour.

Acceptance:

- All import methods converge on one pipeline.
- Duplicate import opens the existing item.
- Restart preserves items.
- UI never reads plugin files directly.
- Stale-writer tests pass.

### PR 3: Librarian and durable jobs

Build:

- Runtime coordinator and persisted per-operation jobs.
- Automatic analysis.
- Structured schema and repair.
- Reanalysis and override resolution.
- Cancellation, retry and restart recovery.

Acceptance:

- Analysis continues when the page is closed.
- Manual fields survive reanalysis.
- Invalid output repairs or fails clearly.
- Restart resumes eligible work.

### PR 4: Design generation

Build:

- Ordered selection of up to six references.
- Primary reference semantics.
- Guardrail conflict resolution.
- HTML and React target choice.
- One to five independently persisted variants.
- Partial success, cancellation and retry.
- Continuous autosave.
- Recoverable revision replace/retain workflow.

Acceptance:

- Only incompatible guardrails block.
- Reference pixels never enter output.
- Sibling variants survive failure and cancellation.
- Work restores to the previous position.

### PR 5: Asset generation adapter

Build:

- Provider-neutral LLM asset tools.
- fal.ai adapter using Sero secrets.
- Local result storage and full provenance.
- Placeholder and asset-only retry.
- Design asset tray.
- Same-Design reuse.
- Copy to Library with automatic analysis.

Acceptance:

- Domain code has no fal.ai types.
- No remote asset URL is required by preview.
- Provider failure does not fail the whole variant.
- A fake second adapter passes the contract tests.

### PR 6: Isolated workbench

Build:

- HTML and React local preview construction.
- Isolation and dependency enforcement.
- Warning presentation.
- Responsive viewport controls.
- Hostile fixture regression tests.

Acceptance:

- Restricted calls are blocked.
- Safe output still renders.
- No network or host privilege is available.
- Preview resources are cleaned up.

### PR 7: Gallery and export

Build:

- Immutable version snapshot.
- Deterministic preview capture.
- One family card with revision selector.
- Featured version pointer.
- Reopen exact Design revision.
- Explicit Duplicate and Remix family branching.
- Recoverable deletion and purge.
- Exact export with metadata manifest.

Acceptance:

- Source deletion cannot damage Gallery.
- Old versions never mutate.
- Export matches the snapshot.
- Downloads and Workspace destinations work.

### PR 8: Alpha hardening

Build:

- Keyboard navigation and accessibility.
- Screen-reader job announcements.
- Reduced motion.
- Incremental grid rendering or virtualisation.
- Bounded preview cache.
- Fault injection for recovery and cleanup.
- External package installation tests.

## 17. Verification

```bash
pnpm --filter @sero-ai/plugin-design-library build
pnpm --filter @sero-ai/plugin-design-library typecheck
pnpm --filter @sero-ai/plugin-design-library test
bash scripts/build-plugin.sh plugins/sero-design-library-plugin
```

Manual verification covers:

- Global discovery.
- All three image import paths.
- Duplicate handling.
- Search and filters.
- Analysis and override reset.
- Variant failure, cancellation and restart.
- fal.ai failure and asset-only retry.
- Hostile previews.
- Gallery source deletion.
- Downloads and Workspace export.
- External plugin installation.

## 18. Implementation readiness

PR 1 is ready.

PR 2 is not ready until Gate A is complete and its outcomes are reflected in the shared schemas and this plan. A spike may select a mechanism, but it must preserve the approved behaviour in the decision document.

