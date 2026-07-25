# Sero Design Library: Implementation-Shaping Decisions

**Status:** Approved
**Decision date:** 2026-07-25
**Applies to:** First usable release of `@sero-ai/plugin-design-library`
**Branch:** `feat/design-library-plugin`

## 1. Purpose

This document records the product and architecture decisions made before implementation. It is the authoritative resolution of earlier ambiguities in the specification and plan.

Where a technical mechanism still requires evidence, this document marks the behaviour as decided and the implementation mechanism as a required spike. Those spikes must not change the approved product behaviour without a new decision.

## 2. Release boundary

### First usable release

The first release is an image-only vertical slice supporting:

- Image import through file picker, drag-and-drop and clipboard paste.
- Automatic Librarian analysis.
- Keyword search, tags and basic filters.
- Design creation from up to six Library references.
- A choice of one output target per Design:
  - Self-contained HTML, CSS and JavaScript.
  - React, TypeScript and Tailwind.
- Runnable, isolated previews.
- Revision and recovery.
- Explicit save to Gallery.
- Exact export to Downloads or the active Workspace.

Video, URL capture, clipboard HTML capture, collections, smart groups, pinning and archiving are deferred until after the image-only loop is proven.

### Library layout

The canonical Library layout is a uniform, equal-width visual grid. Masonry and justified layouts are not first-release alternatives.

## 3. Library decisions

### Import and duplicates

- Librarian analysis starts automatically after import.
- Exact duplicate images are detected by content checksum.
- Importing an exact duplicate opens the existing item instead of creating another item.
- Imported images appear immediately while analysis runs in the background.

### Analysis and editing

- Generated analysis and manual overrides are stored separately.
- Users may edit all user-facing fields.
- System provenance is immutable.
- A manual edit overrides the whole field.
- Every overridable field has an individual reset action.
- Reanalysis replaces generated values but preserves manual overrides.
- Untouched fields refresh from the new analysis.

The persistence model must represent field-level override presence explicitly. A generic nested `Partial<T>` is not sufficient.

### Search and filters

First-release search is keyword-based across:

- Name or title.
- Tags.
- Notes.
- User-visible Librarian analysis.

First-release filters are:

- Tags.
- Colours.
- Source.
- Analysis status.
- Date.

Semantic search is deferred.

### Deletion

- Normal deletion hides the Library item and remains recoverable until manually permanently deleted.
- Referenced assets remain available while a deleted item is recoverable.
- Permanent deletion removes the original item and its owned asset.
- Referencing Designs and Gallery versions remain intact.
- Dependants retain tombstoned provenance containing stable identity and the metadata needed to explain the missing source.
- Permanent deletion never cascades into dependent content.

## 4. Design decisions

### References and synthesis

- One Design supports up to six Library references.
- The first selected reference is always the primary reference.
- The primary reference leads the visual direction.
- Secondary references contribute compatible characteristics.
- Style differences may be blended.
- Only incompatible guardrails block generation.
- Blocking conflicts must be explicitly resolved before generation.
- Source reference images are inspiration-only and must never be copied into generated output.

### Output targets

- The plugin supports HTML/CSS/JavaScript and React/TypeScript/Tailwind in the first release.
- Each Design chooses exactly one target.
- A Design does not automatically maintain matching implementations in both formats.
- React output may use only a bundled, approved dependency set.
- Interface icons come from approved bundled icon libraries.
- Generated designs may use the Sero theme system's supported sans-serif and monospace stacks.
- Any non-system font file used by a preview or export must be bundled locally because previews have no network access.

### Variants

- The default is three variants per run.
- Profile settings allow a count from one to five variants.
- The active model decides how different the variants should be based on the request.
- Successful variants survive partial failure.
- Failed variants can be retried independently.
- Cancelling a run preserves completed variants and permits cancelled variants to retry.
- Each variant is an independently cancellable job.

### Revisions

- When revising a variant, the user may replace the visible variant or retain the result as a separate visible revision.
- The initial choice can be saved as a profile default and changed later.
- Visible replacement always retains recoverable history.
- All revision history is retained until manually deleted.
- A successful asset retry replaces the visible placeholder while retaining recoverable history.

### Persistence and recovery

- Designs autosave continuously.
- Reopening Sero restores the user to the previous working position.
- Generation continues when the user navigates away while Sero is running.
- If Sero quits, durable job state is persisted and resumable work continues after restart.

## 5. Generated asset decisions

### Provider-neutral architecture

- Asset generation is exposed to the LLM through stable, provider-neutral tools.
- fal.ai is the first adapter behind that contract.
- fal.ai types, client calls and provider-specific request shapes must not leak into Design, Gallery, preview or UI domain code.
- Changing provider should require implementing or selecting another adapter, not rewriting the generation workflow.

### Invocation and credentials

- Asset generation is not a fixed workflow step and is never directly invoked by the user.
- The active model decides whether to call the provided asset tools.
- fal.ai credentials are stored per profile through Sero's existing secret mechanism.
- The plugin adds no spending limit and relies on fal.ai account controls.

### Asset lifecycle

- fal.ai is reserved for illustrative artwork, not routine interface icons.
- Successful assets are downloaded and stored locally.
- Assets may be reused across variants in the same Design.
- Unused generated assets remain in the Design asset tray until deleted.
- Wider reuse requires an explicit Copy to Library action.
- Copy to Library creates an independent item, retains generation provenance and starts automatic Librarian analysis.
- If fal.ai is unavailable, the variant uses a local placeholder and exposes asset-only retry.
- Gallery snapshots bundle their own immutable copies of used assets.
- Deleting a Design-owned asset cannot alter an existing Gallery version.

### Provenance

Each generated asset retains:

- Tool identifier.
- Provider and model.
- Prompt.
- Parameters.
- Seed when available.
- Reported cost when available.
- Started and completed timestamps.

Provider-specific provenance may be stored in an adapter-owned extension object, while common provenance remains provider-neutral.

## 6. Preview decisions

- Generated code runs in an isolated preview frame.
- Network access is blocked.
- Access to Sero APIs, application state, secrets, filesystem, Node.js and Electron is blocked.
- Browser cookies and normal persistent storage are unavailable.
- Navigation of the main Sero window and uncontrolled pop-ups are blocked.
- Dependencies outside the approved bundle are blocked.
- Safe portions of the preview still render when restricted behaviour is detected.
- The UI shows clear warnings describing each blocked capability.
- Validation warnings do not weaken the isolation boundary.

## 7. Gallery decisions

### Snapshots and families

- A Gallery version is an immutable snapshot of exact code, assets and provenance.
- Saving a revised variant adds a version to the existing family.
- New families are created only through an explicit action.
- Duplicate or Remix creates a new linked Design family.
- A family appears as one Gallery card.
- Older versions are available through a revision selector.
- One version is featured.
- The featured version provides the family card preview.
- The latest saved version becomes featured by default.
- Changing the featured version preserves all history.

### Reopening

- Reopening a Gallery version restores its source Design at that exact revision.
- Subsequent edits create new recoverable Design revisions.
- The Gallery snapshot itself is never edited.

### Deletion

- Deleted Gallery versions and families are hidden but recoverable until manually permanently deleted.
- Permanent deletion removes the selected Gallery snapshot or family only.
- It does not cascade to the source Design, Library items or linked families.

### Export

- Export reproduces the exact saved code and bundled assets.
- Export includes a small metadata manifest.
- The user chooses Downloads or the active Workspace for each export.
- Export never regenerates the Design.

## 8. Model and settings decisions

- Librarian analysis and Design generation use Sero's configured models automatically.
- The profile settings exposed in the first release are:
  - Variant count from one to five.
  - Default revision behaviour: replace or retain.
- Other model, preview and export defaults remain fixed in the first release.

## 9. Required technical decisions delegated to spikes

The following product behaviour is settled, but the implementation mechanism requires a spike before its production PR.

### Authoritative state mutation

Requirement:

- No extension/runtime lost updates.
- One authoritative serialisation path for each mutable record and index.
- Atomic file replacement alone is not accepted as concurrency control.

Spike outcome:

- Prove a Sero-native single-writer or compare-and-swap design.
- Document record ownership and recovery behaviour.
- Block persistence implementation until this is resolved.

### Asset transfer and preview delivery

Requirement:

- File picker, drag-and-drop and clipboard images use one bounded ingestion pipeline.
- Large binaries do not live in reactive state.
- Thousands of previews remain practical.

Spike outcome:

- Prove upload, cancellation, preview reads, caching and memory limits through existing generic plugin contracts.
- No bespoke preload API, desktop IPC or Design Library host change.

### Multimodal Librarian input

Requirement:

- The Librarian can analyse bounded image input through Sero's configured model.

Spike outcome:

- Prove structured multimodal execution and retry/repair using the existing subagent contract.

### Isolated preview and preview capture

Requirement:

- Restricted capabilities are blocked while safe output still renders.
- Gallery receives a deterministic preview image for each immutable version.

Spike outcome:

- Prove CSP and frame isolation with hostile fixtures.
- Prove HTML and React preview construction from the approved local dependency set.
- Select a deterministic Gallery screenshot mechanism that requires no Design Library-specific host API.

### Provider-neutral generated assets

Requirement:

- fal.ai is replaceable through an adapter.

Spike outcome:

- Define the provider-neutral request, result, error, retry and provenance contracts.
- Prove the fal.ai JavaScript adapter, local download and placeholder retry.

## 10. Explicit deferrals

The following are intentionally deferred beyond the first release:

- Video import and analysis.
- URL and webpage capture.
- Clipboard HTML capture.
- Manual collections.
- Smart groups.
- Pinning and archiving.
- Semantic search.
- Arbitrary generated package installation.
- Multiple output targets within one Design.
- A second generated-asset provider.
- Plugin-level asset-generation budgeting.

## 11. Readiness rule

PR 1 may implement a fixture-backed shell using the approved terminology and schemas.

Persistence and AI work must not begin until the required pre-PR-2 spikes have resolved:

- Authoritative state mutation.
- Asset transfer and preview delivery.
- Multimodal Librarian input.
- Preview isolation and Gallery preview capture.
- Provider-neutral asset generation.

