# Sero Design Library Plugin Specification

**Status:** Approved for first-release implementation
**Package:** `@sero-ai/plugin-design-library`
**Directory:** `plugins/sero-design-library-plugin`
**App ID:** `design-library`
**Display name:** Design Library
**Scope:** Global
**Category:** Design / Creative Tools

## 1. Product vision

The Sero Design Library is a private, AI-assisted workspace for collecting visual inspiration, understanding its design language and creating original runnable implementations.

It has three connected surfaces:

- **Library** stores and analyses inspiration.
- **Design** is the active generation and revision workbench.
- **Gallery** stores immutable, intentionally saved outputs.

The product captures the design DNA of a reference, not its content or exact composition.

## 2. Product principles

### Feel, not content

Generation may inherit rhythm, density, contrast, typography, geometry, material treatment and mood. It must not reproduce logos, brand names, copy, proprietary imagery, distinctive illustrations or recognisable composition.

Reference image pixels never enter generated output.

### Visual first

The interface should feel like a gallery and creative studio. Metadata supports the visuals without turning the product into a dense database UI.

### Concise intelligence

Librarian output uses tags, vocabulary chips, compact token groups, short sentences, editable guardrails and a focused generation prompt.

### User authority

All user-facing Librarian fields are editable. Each manual edit overrides one whole field and has its own reset action. Reanalysis refreshes untouched generated values without overwriting manual work.

### Durable and reversible

Interruption, revision and normal deletion must not destroy work. Permanent deletion is explicit and does not cascade into dependent content.

### External-plugin portability

The plugin must remain suitable for external distribution:

- No bespoke preload APIs.
- No new desktop IPC.
- No direct imports from `sero-web-plugin`.
- No Design Library-specific host changes.
- Use existing generic plugin, runtime, state and tool contracts.

## 3. First-release scope

The first usable release is an image-only end-to-end loop.

Included:

- File picker, drag-and-drop and clipboard image paste.
- Automatic Librarian analysis.
- Uniform Library grid.
- Keyword search, tags and filters.
- Design creation from up to six references.
- HTML/CSS/JavaScript output.
- React/TypeScript/Tailwind output.
- One chosen output target per Design.
- One to five variants, default three.
- Isolated previews with blocked capabilities and warnings.
- Continuous Design autosave and restart recovery.
- Tool-backed generated artwork through a provider-neutral interface.
- Immutable Gallery versions and families.
- Exact export to Downloads or the active Workspace.

Deferred:

- Video, URL and clipboard HTML ingestion.
- Collections and smart groups.
- Pinning and archiving.
- Semantic search.
- Arbitrary generated dependencies.

## 4. Canonical terminology

### Library item

An imported or deliberately promoted image used as inspiration. It owns an original asset, preview, generated Librarian analysis, user overrides and provenance.

### Librarian analysis

Structured generated design-language analysis for a Library item.

### Design

A continuously saved working document containing the user request, selected references, one output target, generation runs, variants, revisions and Design-owned assets.

### Variant

One independently generated direction within a Design.

### Revision

A recoverable state in a variant's history. Replacing visible content moves the current pointer but does not destroy history.

### Generated asset

An image created through a provider-neutral LLM tool and owned by a Design until explicitly copied to Library.

### Gallery family

One intentionally managed group of immutable Gallery versions. A new family is created only through an explicit Duplicate or Remix action.

### Gallery version

An immutable snapshot of exact code, assets, preview and provenance.

### Featured version

The Gallery version used for a family card's main preview. It defaults to the latest saved version and can be changed without deleting history.

### Tombstoned provenance

Stable provenance retained by a dependant after its original source has been permanently deleted. It identifies the former source without retaining the deleted original asset.

## 5. Information architecture

Primary navigation is:

```text
Library    Design    Gallery
```

The plugin remembers the last active page and enough Design UI state to reopen where the user left off.

### Library

Answers: What visual references do I want to draw from?

### Design

Answers: What am I currently creating or refining?

### Gallery

Answers: What have I intentionally saved, and what can I reuse or build upon?

## 6. Library experience

### Layout

The canonical browser is a responsive uniform grid with equal-width cards and consistent metadata alignment.

Each card prioritises:

- Image preview.
- Title.
- Primary style.
- Small tag set.
- Analysis status.
- Selection state.

### Import

All first-release methods use one ingestion pipeline:

- File picker.
- Drag-and-drop.
- Clipboard image paste while the plugin has focus.

The item appears immediately with local progress. Content checksum is used for exact duplicate detection. Importing a duplicate opens the existing item.

### Analysis

Librarian analysis starts automatically after successful import.

The inspector presents:

- Editable title, tags and notes.
- Primary style and design types.
- Concise summary and intent.
- Aesthetic vocabulary.
- Colour, typography, layout, density, shape, surface, imagery and motion observations.
- Editable prompt.
- Editable Always and Never guardrails.
- Immutable source, checksum, model and analysis provenance.

### Override contract

Generated analysis and overrides are stored independently:

```ts
type LibrarianField = keyof LibrarianUserFacingAnalysis;

interface FieldOverride<TValue = unknown> {
  field: LibrarianField;
  value: TValue;
  updatedAt: number;
}

interface EditableLibrarianProfile {
  generated: LibrarianAnalysis;
  overrides: Partial<Record<LibrarianField, FieldOverride>>;
}
```

Override presence, rather than truthiness, determines whether a field is manual. Reset removes that field's override.

### Search and filters

Keyword search covers title, tags, notes and user-visible analysis.

Filters are:

- Tags.
- Colours.
- Source.
- Analysis status.
- Date.

### Deletion

Normal deletion hides the item until restore or permanent deletion.

Permanent deletion removes the original and owned asset. Dependent Designs and Gallery versions remain intact and replace the reference with tombstoned provenance. Deletion never cascades.

## 7. Librarian contract

```ts
interface LibrarianAnalysis {
  schemaVersion: number;
  designTypes: string[];
  primaryStyle: string;
  tags: string[];
  summary: string;
  designIntent: string;
  aestheticVocabulary: Array<{ term: string; meaning?: string }>;
  visualProfile: {
    colour: string[];
    typography: string[];
    layout: string[];
    spacingAndDensity: string[];
    shapeLanguage: string[];
    surfaces: string[];
    imagery: string[];
    motion: string[];
  };
  palette?: Array<{ hex: string; role: string }>;
  always: string[];
  never: string[];
  generationPrompt: string;
  confidence: number;
  provenance: {
    providerId?: string;
    modelId?: string;
    analysedAt: number;
    durationMs?: number;
    tokenUsage?: unknown;
    cost?: number;
    promptVersion: number;
  };
}
```

Normal content limits:

- Summary: one sentence.
- Intent: one or two sentences.
- Design types: maximum three.
- Tags: six to twelve.
- Vocabulary: maximum eight.
- Visual groups: maximum four observations each.
- Always and Never: maximum five each.
- Generation prompt: approximately 80 to 150 words.

## 8. Design creation

### References

A Design accepts one to six Library references. Selection order matters:

- The first selected item is primary and leads the visual direction.
- Secondary items contribute compatible traits.
- Style differences may be blended.
- Incompatible guardrails block generation until explicitly resolved.

Reference images are supplied for understanding only. They cannot be embedded, copied or transformed into generated output.

### Output target

The user chooses one target per Design:

1. Self-contained HTML, CSS and minimal JavaScript.
2. React, TypeScript and Tailwind.

React output is limited to the approved bundled dependency set. Interface icons use approved bundled icon libraries.

Generated code may use the sans-serif and monospace font stacks supported by Sero themes. Non-system fonts must be bundled locally for the Design.

### Variants

- Profile setting range: one to five.
- Default: three.
- The model chooses an appropriate diversity strategy from the request.
- Each variant is a separate persisted, independently cancellable job.
- Successes survive partial failure or cancellation.
- Failed or cancelled variants retry independently.

### Revisions

Revision asks whether to replace the visible result or retain a separate visible result. The choice can be saved as a profile default and changed later.

Replacement is recoverable. All revisions remain until manually deleted.

### Persistence

Designs autosave continuously. Navigating away does not stop work while Sero runs. Quit persists recoverable job state, and resumable work continues after restart.

## 9. Generated asset tools

### Provider-neutral contract

The LLM receives provider-neutral asset tools. fal.ai is the first adapter.

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

Common request, result, error and provenance types must not expose fal.ai client types. Provider-specific fields belong in adapter-owned extension metadata.

### Behaviour

- The plugin never inserts a mandatory fal.ai step.
- The configured model decides when to call an asset tool.
- Credentials come from Sero's per-profile secret mechanism.
- Account controls own spending limits.
- fal.ai is for illustrative artwork.
- Routine interface icons use bundled icon libraries.
- Results are downloaded and stored locally.
- Failures produce a local placeholder with asset-only retry.
- Successful retry replaces the placeholder and preserves history.
- Assets can be shared across variants in the same Design.
- Unused assets stay in the Design asset tray until deleted.

Copy to Library creates an independent item with full provenance and automatic Librarian analysis.

Each asset records tool, provider, model, prompt, parameters, seed, cost when available and timestamps.

## 10. Preview contract

Generated output runs inside an isolated preview frame.

The boundary blocks:

- Network access.
- Sero UI and APIs.
- Sero state and secrets.
- Filesystem access.
- Node.js and Electron.
- Normal browser cookies and persistent storage.
- Main-window navigation and uncontrolled pop-ups.
- Dependencies outside the approved bundle.

When generated code attempts restricted behaviour, the preview blocks that capability, renders the remaining safe output and shows clear warnings.

Warnings never mean the restricted capability is allowed.

The plugin must prove isolation with hostile fixtures before production preview work.

## 11. Gallery

### Save and families

Saving creates an immutable Gallery version containing:

- Exact source files.
- Bundled local assets.
- Deterministic preview image.
- Prompt and guardrail snapshot.
- Source and model provenance.
- Output target and dependency manifest.

Saving subsequent revisions adds immutable versions to the same family.

One family card is shown. It uses the featured version, which defaults to the latest save. Older versions are available through a revision selector.

A new family is created only through explicit Duplicate or Remix into a linked Design family.

### Reopen

Reopening a Gallery version restores its source Design at that exact revision. Edits create new recoverable Design revisions. Gallery content never mutates.

### Assets

Every Gallery version contains its own bundled copies. Deleting Library or Design assets cannot alter a saved version.

### Deletion

Normal deletion hides versions or families until restore or permanent deletion. Permanent Gallery deletion affects only the selected snapshot or family and never cascades.

### Export

Export reproduces exact saved code, assets and a small metadata manifest. The user chooses Downloads or the active Workspace each time.

## 12. Settings

First-release profile settings:

- Variant count from one to five.
- Default revision result behaviour: replace or retain.

Librarian and Design generation use Sero's configured models automatically.

## 13. Storage and ownership

Reactive state contains lightweight summaries only. Full records and binaries are plugin-owned files under Sero's resolved global app state directory.

Required ownership rules:

- One authoritative serialisation path per mutable record and index.
- The runtime owns job transitions.
- Gallery versions own immutable snapshot copies.
- Designs own generated assets until promotion.
- Library promotion creates a new independent asset.
- Permanent source deletion leaves tombstoned provenance.

Atomic file replacement is required but is not sufficient concurrency control.

## 14. Required spikes

Complete before persistence and AI implementation:

1. Authoritative state mutation across extension and runtime.
2. Bounded import upload and preview delivery.
3. Structured multimodal Librarian execution.
4. HTML and React preview isolation with hostile fixtures.
5. Deterministic Gallery preview capture.
6. Provider-neutral asset contract and fal.ai adapter.

No spike may introduce a Design Library-specific host API.

## 15. Acceptance criteria

The first release is complete when:

- All three image import methods work through one bounded pipeline.
- Exact duplicate import opens the existing item.
- Librarian runs automatically and reanalysis preserves manual fields.
- Search and approved filters operate across the uniform grid.
- A Design accepts up to six ordered references.
- HTML and React targets both generate runnable local output.
- One to five variants survive failure, cancellation and restart independently.
- fal.ai-generated assets are local, auditable and provider-neutral at the domain boundary.
- Restricted preview behaviour is blocked and reported.
- Gallery versions remain unchanged after source deletion.
- Deletion and revision remain recoverable until explicit permanent deletion.
- Export reproduces the saved snapshot exactly.
- The plugin installs externally without bespoke host changes.

## 16. Decision authority

`docs/decisions/sero-design-library-first-release-decisions.md` contains the full decision log and intentional deferrals. If older prose conflicts with it, the decision document and this approved specification take precedence.

