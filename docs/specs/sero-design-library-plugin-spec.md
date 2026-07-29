# Sero Design Library Plugin Specification

**Status:** Approved for implementation
**Package:** `@sero-ai/plugin-design-library`
**Directory:** `plugins/sero-design-library-plugin`
**App ID:** `design-library`
**Scope:** Global
**Supersedes:** the 2026-07-25 draft of this file
**Companion documents:** `docs/decisions/sero-design-library-first-release-decisions.md` (why), `docs/plans/sero-design-library-plugin-implementation-plan.md` (build order), `docs/prototypes/sero-design-library-plugin.html` (visual truth)

---

## 1. What this is

A private visual memory and creative workbench. You collect visual references, Sero learns their design language, and you turn that language into original runnable work.

Three surfaces, one loop:

| Surface | Question it answers |
|---|---|
| **Library** | What visual references do I want to draw from? |
| **Design** | What am I creating, refining or tuning right now? |
| **Gallery** | What have I intentionally kept, and what can I build on? |

A fourth surface, **Settings**, holds model choices, generation defaults and media provider configuration.

## 2. Principles

**Feel, not content.** Generation inherits rhythm, density, contrast, typography, geometry, material and mood. It never reproduces logos, brand names, copy, proprietary imagery or recognisable composition. Reference pixels never reach the generating model or the output.

**Visual first.** This is a gallery and a studio. Imagery leads; analysis appears exactly where it helps selection, generation or reuse. The prototype is the authority on that balance.

**Concise intelligence.** The Librarian speaks in chips, short groups and one focused prompt — never a long critique.

**User authority.** Every user-facing Librarian field is editable. An edit overrides one whole field and has its own reset. Reanalysis refreshes untouched fields without touching manual work.

**Durable and reversible.** Interruption, revision and normal deletion never destroy work. Permanent deletion is explicit and never cascades.

**Provider-neutral.** The application talks in *capabilities* and opaque model ids. Exactly one file in the codebase knows which vendor is behind them.

**Portable.** No bespoke preload APIs, no new desktop IPC, no Design Library-specific host changes, no imports from desktop source. Only existing generic plugin, runtime, state and tool contracts.

## 3. First-release scope

**In**

- Image import: file picker, drag-and-drop, clipboard paste
- Automatic Librarian analysis, editable with per-field reset
- Uniform Library grid, keyword search, filters, favourites, manual collections, derived style groups
- Media generation: new inspiration, restyle/vary, upscale, video — from the agent or from explicit actions
- Designs from one to six ordered references
- Two output targets: self-contained HTML/CSS/JS, and React/TypeScript/Tailwind
- One to five variants, default three; blend or per-reference variation; inspiration strength
- Prompt recipes
- Isolated previews with blocked-capability warnings
- AI-authored, design-specific Tweaks with live CSS editing
- Continuous autosave and restart recovery
- Immutable Gallery families and versions
- Exact export to Downloads or the active workspace
- Librarian and Design model selection
- Main-agent access from Sero chat

**Out (deferred)**

- Importing your own video files (generated video is supported)
- URL and webpage capture; clipboard HTML
- Semantic/embedding search and embedding-derived smart groups
- Generating Sero plugins as an output target
- Arbitrary npm dependencies in generated code
- Two output targets within one Design
- Pinning and archiving

---

## 4. Vocabulary

**Library item** — an image or generated video used as inspiration. Owns an original asset, a preview, generated Librarian analysis, user overrides and provenance.

**Librarian analysis** — structured generated design-language analysis for one item.

**Design** — a continuously saved working document: request, ordered references, one output target, generation runs, variants, revisions and Design-owned media.

**Variant** — one independently generated direction within a Design.

**Revision** — a recoverable state in a variant's history. Replacing what is visible moves a pointer; it never destroys history.

**Tweak manifest** — a versioned, AI-authored declaration of the useful CSS controls for one variant revision, binding generic control types to custom properties that revision actually emits.

**Media asset** — an image or video produced through the capability contract, owned by a Design until explicitly copied to Library.

**Gallery family** — one managed group of immutable versions. New families come only from explicit Duplicate or Remix.

**Gallery version** — an immutable snapshot of exact code, assets, preview and provenance.

**Featured version** — the version a family card previews. Defaults to the newest; changeable without losing history.

**Tombstoned provenance** — stable identity a dependant keeps after its source is permanently deleted, explaining what is missing without retaining the deleted asset.

---

## 5. Library

### 5.1 Layout

A responsive uniform grid of equal-width cards with consistent metadata alignment. Each card shows preview, title, primary style, a small tag set, analysis status and selection state. Selecting references reveals one focused action bar (see the prototype, state 1).

Clicking a card selects it. Opening one is an explicit edit button in the card's top corner, drawn on its own surface so it stays legible over any image. Opening is a navigation, not a side panel: the reference takes the whole surface, with the image at size on the left and the Librarian's reading beside it (prototype, state 2). Importing a new reference never navigates — it appears in the grid and analyses behind you. Importing an exact duplicate does open the item you already have.

The left rail carries: All inspiration, Favourites, Awaiting analysis, Recently added; **Collections** (manual, user-created, coloured); **Style groups**.

Style groups are derived, not learned. They group items by the Librarian's own `primaryStyle` and high-frequency vocabulary terms — the prototype's "Dark luxury", "High density", "Editorial", "Retro-futurist" are exactly these values. No embeddings, no extra model calls.

### 5.2 Getting items in

Three import methods converge on one bounded ingestion pipeline: file picker, drag-and-drop, clipboard paste. The item appears immediately with local progress while analysis runs behind it.

Exact duplicates are detected by content checksum; importing one opens the existing item rather than creating a second.

Two further routes create items through the media contract (§8):

- **Generate inspiration** — a prompt produces a new image or video item.
- **Restyle / vary** — an existing item produces a derived item, linked to its parent.

Generated items are ordinary Library items: they analyse automatically and carry generation provenance alongside their Librarian profile.

### 5.3 The Librarian

Analysis starts automatically after a successful import or generation, using the configured **Librarian model**.

The inspector presents editable title, tags and notes; primary style and design types; a one-sentence summary and a short intent; aesthetic vocabulary; colour, typography, layout, density, shape, surface, imagery and motion observations; a palette; editable Always/Never guardrails; and an editable generation prompt. Source, checksum, model and analysis provenance are immutable.

```ts
interface LibrarianVisualProfile {
  colour: string[];
  typography: string[];
  layout: string[];
  spacingAndDensity: string[];
  shapeLanguage: string[];
  surfaces: string[];
  imagery: string[];
  motion: string[];
}

interface LibrarianUserFacingAnalysis {
  title: string;
  notes: string;
  designTypes: string[];
  primaryStyle: string;
  tags: string[];
  summary: string;
  designIntent: string;
  aestheticVocabulary: Array<{ term: string; meaning?: string }>;
  visualProfile: LibrarianVisualProfile;
  palette?: Array<{ hex: string; role: string }>;
  always: string[];
  never: string[];
  generationPrompt: string;
}

interface LibrarianAnalysis extends LibrarianUserFacingAnalysis {
  schemaVersion: number;
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

Content limits: summary one sentence; intent one to two; design types ≤ 3; tags 6–12; vocabulary ≤ 8; each visual group ≤ 4 observations; Always and Never ≤ 5 each; generation prompt 80–150 words.

For a generated video item, the Librarian analyses extracted frames plus timing, and the `motion` group carries the motion language.

### 5.4 Override contract

Generated analysis and user overrides are stored independently. **Presence** of an override — not truthiness — marks a field manual.

```ts
type LibrarianField = keyof LibrarianUserFacingAnalysis;

interface FieldOverride<TField extends LibrarianField> {
  field: TField;
  value: LibrarianUserFacingAnalysis[TField];
  updatedAt: number;
}

type LibrarianOverrides = {
  [TField in LibrarianField]?: FieldOverride<TField>;
};

interface EditableLibrarianProfile {
  generated: LibrarianAnalysis;
  overrides: LibrarianOverrides;
}
```

The generated profile supplies a baseline for every editable field; the Librarian may propose the title, and generated notes default to an empty string so user notes use the same explicit mechanism. Reset removes one override. Reanalysis replaces `generated` only.

### 5.5 Finding things

Keyword search covers title, tags, notes and all user-visible analysis. Filters: media type, style, colour, tags, source, analysis status and date.

### 5.6 Deletion

Normal deletion hides an item until restore or permanent deletion. Permanent deletion removes the original and its owned asset; dependent Designs and Gallery versions stay intact and swap the reference for tombstoned provenance. Deletion never cascades.

---

## 6. Design

### 6.1 References and synthesis

A Design takes one to six Library references and **order matters**: the first is primary and leads the visual direction; the rest contribute compatible traits. Style differences may be blended. Only genuinely incompatible guardrails block generation, and blocking conflicts must be resolved explicitly before work starts — surfaced in the create dialog's synthesis panel (prototype, state 3).

Imported reference images are supplied for *understanding* only, and only to the Librarian. The design-generation run receives their structured language, never their pixels.

Images made by Design Library are different: they are original work owned by the plugin. When one is selected as a reference, the new Design receives its own local copy as reusable artwork. The run still receives the Librarian's language, but it may also place that artwork through the supplied `assets/...` reference. Derived images follow the same rule; imported images never do.

### 6.2 The create dialog

One focused decision. Left: the request, prompt recipe, output target, variation mode, variant count, inspiration strength and applied guardrails. Right: the selected references and the Librarian's synthesis, including any conflict.

**Prompt recipe** — a named, reusable instruction template applied on top of the request. Seeded with defaults; user-editable; persisted in plugin state.

**Variation mode** — `blend` produces variants from the combined language of all references; `per-reference` produces one variant per reference in its own language.

**Inspiration strength** — `light | balanced | strong`, controlling how tightly output adheres to the reference language versus the request.

### 6.3 Output targets

One target per Design:

1. **HTML** — self-contained HTML, CSS and minimal JavaScript.
2. **React** — React, TypeScript and Tailwind.

Both run entirely from what the plugin bundles. Generated code may not import anything outside the approved bundled set. Fonts are limited to the Sero theme sans/mono stacks or font files bundled locally with the Design, because previews have no network.

A Design does not maintain both targets.

### 6.4 Variants and revisions

One to five variants (default three), each a separately persisted, independently cancellable job. Successes survive partial failure or cancellation; failures retry independently. The model chooses an appropriate diversity strategy from the request and the variation mode.

Revising asks whether to replace the visible result or keep it as a separate visible revision. The choice can be saved as a default and changed later. Replacement is always recoverable; revisions persist until manually deleted.

### 6.5 Tweaks

Every successful variant revision emits CSS custom properties **and** a versioned manifest describing the high-value controls for that exact page. The model chooses the groups, labels, ranges and options from what it actually generated. It must not emit a standard set of controls mechanically.

```ts
type TweakValue = string | number | boolean;

type TweakControl =
  | { type: 'range'; min: number; max: number; step: number; unit?: string }
  | { type: 'toggle'; offValue: TweakValue; onValue: TweakValue }
  | { type: 'colour' }
  | { type: 'choice'; options: Array<{ label: string; value: TweakValue }> };

interface TweakDefinition {
  id: string;
  group: string;
  label: string;
  cssVariable: `--${string}`;
  control: TweakControl;
  defaultValue: TweakValue;
}

interface TweakManifest {
  schemaVersion: number;
  variantRevisionId: string;
  controls: TweakDefinition[];
}

interface VariantTweakState {
  manifest: TweakManifest;
  overrides: Record<string, TweakValue>;
}
```

A manifest may cover typography, colour, spacing, geometry, layout, imagery treatment, motion or any other design-specific CSS concern. Font options are limited to fonts already available to the Design.

Every definition must bind to a declared custom property and visibly change the page. A validator drops invalid, duplicate or inert controls and reports them, without preventing the valid page from rendering.

Changing a control validates and normalises the value, stores it as an override and applies it immediately. **The message sent to the preview carries only a manifest id and a value** — never a selector, arbitrary CSS or JavaScript.

Each control has Reset; the panel has Reset all; Copy CSS yields the effective scoped custom-property block. Omitted controls are reported as one compact line that expands on demand, never a persistent block of warning text.

**Placement.** Tweaks is a fourth tab in the variant inspector, alongside Design, Files and History. The inspector is drag-resizable using `ResizablePanel` from `@sero-ai/ui`, and its width persists in plugin state, so a control-heavy design can be given room and narrowed again afterwards. The sessions rail collapses to icons, which is what makes a widened inspector affordable.

**Files.** The Files tab lists the authored files for the visible revision and can open that revision's folder in Finder. The action resolves the folder from the validated Design record and uses Sero's generic shell bridge. It does not give the UI filesystem access, and the action can later open the same files in the Editor instead.

Tweak state autosaves continuously, but one *editing session* checkpoints as **one** recoverable revision — when the panel closes, the active variant changes, a new revision starts, Gallery saves, or Sero shuts down. Slider input must never create revision spam.

### 6.6 Media in a Design

The design-generation run is given the media tools (§8). It decides when illustrative artwork is worth generating. You can also generate directly from the Design asset tray.

Media is for illustrative artwork — hero imagery, textures, abstract graphics. Routine interface icons come from the bundled icon set.

Results are downloaded and stored locally; no remote URL ever reaches a preview or an export. Failure inserts a local placeholder with asset-only retry; a successful retry replaces the placeholder and preserves history. Assets are reusable across variants in the same Design and stay in the tray until deleted.

**Copy to Library** creates an independent Library item with full generation provenance and automatic analysis.

### 6.7 Persistence

Designs autosave continuously. Navigating away does not stop work while Sero runs. Quitting persists durable job state, and resumable work continues after restart, returning you to your previous working position.

---

## 7. Preview

Generated output runs in an isolated frame built locally, with no workspace, no install and no network.

- **HTML** renders directly.
- **React** is transpiled and bundled in the plugin runtime; React and Tailwind come from the plugin's own dependencies and are inlined into the document.

The boundary blocks network access, Sero UI/APIs/state/secrets, the filesystem, Node.js and Electron, cookies and persistent storage, main-window navigation and uncontrolled pop-ups, and any dependency outside the approved bundle.

The only live-edit input the frame accepts is a validated value update for a control declared by that revision's own manifest.

When generated code attempts something restricted, the preview blocks that capability, still renders the remaining safe output, and shows a clear warning outside the frame. **A warning never means the capability was allowed.**

Isolation must be proven with hostile fixtures before production preview work.

---

## 8. Media generation

### 8.1 Capability contract

The application speaks in capabilities and opaque model ids. Vendor specifics live behind one adapter.

```ts
type MediaCapability =
  | 'text-to-image'
  | 'image-to-image'
  | 'upscale'
  | 'text-to-video';

interface MediaRequest {
  capability: MediaCapability;
  prompt: string;
  /** Opaque provider model id. Defaults come from settings. */
  model?: string;
  /** Local source assets for image-to-image and upscale. */
  sourceAssetIds?: string[];
  aspectRatio?: string;
  seed?: number;
  durationSeconds?: number;
  /** Adapter-owned passthrough. Never read by domain code. */
  extra?: Record<string, unknown>;
}

interface MediaFile {
  path: string;
  mediaType: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

interface MediaProvenance {
  providerId: string;
  capability: MediaCapability;
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
  seed?: number;
  costUsd?: number;
  startedAt: number;
  completedAt: number;
}

interface MediaResult {
  files: MediaFile[];
  provenance: MediaProvenance;
}

interface MediaError {
  code: 'auth' | 'rate-limit' | 'invalid-request' | 'provider' | 'network' | 'cancelled';
  message: string;
  retryable: boolean;
}

interface MediaContext {
  signal: AbortSignal;
  /** Writes provider output into plugin-owned storage and returns the local path. */
  store(name: string, bytes: Uint8Array | ReadableStream): Promise<string>;
  /** Resolves a local source asset for upload. */
  readAsset(assetId: string): Promise<{ path: string; bytes: Uint8Array; mediaType: string }>;
  onProgress?(message: string): void;
}

interface MediaProvider {
  id: string;
  displayName: string;
  capabilities(): MediaCapability[];
  defaultModel(capability: MediaCapability): string;
  generate(request: MediaRequest, context: MediaContext): Promise<MediaResult>;
}
```

No vendor type appears in this contract, in UI code, in Design or Gallery domain code, or in persisted records. Provider-specific provenance goes in an adapter-owned extension object.

### 8.2 Adapters

**fal** is the shipped adapter and the only module permitted to import `@fal-ai/client`. It:

- configures credentials at call time and never persists them;
- maps each capability to a configured endpoint id and runs it through the client's queue-subscribe API, forwarding the `AbortSignal` and reporting queue progress through `onProgress`;
- uploads local source assets through the client's storage API for image-to-image and upscale;
- downloads every result into plugin-owned storage via `context.store` before returning, so no remote URL escapes the adapter;
- normalises failures into `MediaError` with an honest `retryable`.

**fake** is a deterministic in-repo adapter used by tests, so the contract can be exercised without network or spend. It is a test double, not a product feature.

### 8.3 Credentials

Resolved by the runtime in this order:

1. `FAL_KEY` from the process environment (the Sero home environment already provides this).
2. A key stored by the user, written to a `0600` file in the plugin's global state directory.

The key is never placed in reactive state and never returned to the UI. The UI sees only `env | stored | missing`. There is no encrypted store available to plugins — `AppRuntimeCredentialsApi.getProviderApiKey` resolves *model* providers only — so a stored key sits at the same protection level as `auth.json`. The environment path is preferred and labelled as such in Settings.

### 8.4 Invocation and spend

Two entry points, one implementation:

- **Agent tools.** Media tools are passed as `customTools` into the design-generation run and bridged to the main Sero agent. The model decides when to call them.
- **Explicit actions.** Generate inspiration and Restyle/vary in Library; Generate asset in the Design asset tray.

Spend protection, all configurable:

- A maximum number of media calls per generation run (small by default). Exceeding it stops further calls and reports it; it does not fail the run.
- Video generation always requires explicit confirmation, including when the agent requests it.
- Every asset displays its reported cost, and each Design shows a running total in the tray.

Each asset records tool, provider, capability, model, prompt, parameters, seed, reported cost and timestamps.

---

## 9. Gallery

### 9.1 Saving

Saving creates an immutable version containing exact source files with effective tweak values resolved, the tweak manifest and saved overrides, bundled local assets, a deterministic preview, the prompt and guardrail snapshot, source and model provenance, and the output target and dependency manifest.

Subsequent saves add versions to the same family. A family shows as one card using its featured version; older versions are reachable through a revision selector. The newest save becomes featured by default, and changing that pointer never mutates a version.

New families come only from explicit Duplicate or Remix into a linked Design family.

### 9.2 Previews

A Gallery version never changes, so its preview is a re-render of its own snapshot rather than a raster capture: a script-free, animation-free document rendered in a scaled `sandbox=""` iframe, mounted only when scrolled into view. The same bytes always paint the same picture, no headless browser is involved, and a large Gallery stays practical.

### 9.3 Reopening, deletion, export

Reopening restores the source Design at that exact revision; later edits create new Design revisions and the snapshot is never edited.

Deletion hides versions or families until restore or permanent deletion, and affects only the selected snapshot or family. Every version owns its own asset copies, so deleting Library or Design assets cannot alter it.

Export reproduces the exact saved code, effective tweak values and bundled assets, plus a small metadata manifest carrying the saved tweak manifest and values. Exported output is standalone — it does not depend on Sero's Tweaks panel or runtime. You choose Downloads or the active workspace each time. Export never regenerates.

---

## 10. Settings

All settings persist to plugin state.

**Models**

- **Librarian model** — used for analysis. `AvailableModelPicker` fed by `useAvailableModels()`, empty meaning "use Sero's configured model".
- **Design model** — used for generation, revision and tweak authoring. Same control and default.

**Media**

- Active provider and its credential status (`env | stored | missing`).
- One editable model id per capability, pre-filled with a sensible default.
- Maximum media calls per generation run.
- Video confirmation (on by default).

**Layout** (persisted, not user-editable in a settings form)

- Inspector panel width.
- Sessions rail collapsed or expanded.

**Generation**

- Default variant count, 1–5.
- Default revision behaviour: replace or retain.
- Prompt recipes: create, edit, delete, reorder.

---

## 11. Agent access

The plugin exposes its tools to the main Sero agent via `sero.plugin.bridgeTools`, so you can work from any chat: search the library, read analysis, create a Design from named references, and open results in the Design tab. Media tools carry the same caps and confirmations as in-app use.

---

## 12. Storage and ownership

Reactive state holds lightweight summaries only — item, Design, family, version and job summaries; search, filter and page preferences; generation defaults; schema version and state revision. Full records and binaries are plugin-owned files under the resolved global app state directory.

Ownership rules:

- One authoritative serialisation path per mutable record and per index.
- The background runtime is the single authoritative writer. Extension tools submit intent; they never write records.
- Gallery versions own immutable copies of everything they need.
- Designs own their media until promotion; Library promotion creates a new independent asset.
- Permanent deletion of a source leaves tombstoned provenance behind.

Atomic file replacement is required but is **not** sufficient concurrency control: Pi tool calls run in a separate process from the host runtime, so writes need a cross-process lock plus a revision compare-and-swap. The index is a pure projection of the records, which is what makes an interrupted index write recoverable.

---

## 13. Acceptance criteria

The first release is complete when:

1. All three image import methods work through one bounded pipeline, and an exact duplicate opens the existing item.
2. The Librarian runs automatically; reanalysis preserves manual fields; every field resets independently.
3. Search, filters, favourites, collections and derived style groups operate over the uniform grid.
4. A Design accepts up to six ordered references with primary-reference semantics, and only incompatible guardrails block.
5. Both HTML and React targets generate runnable output previewed from a self-contained frame with no workspace, install or network.
6. One to five variants survive failure, cancellation and restart independently.
7. Every generated page exposes relevant, validated, design-specific Tweaks that update the preview live; overrides reset, autosave, survive restart and coalesce into one revision per editing session.
8. Media generation works for all four capabilities from both the agent and explicit actions; results are local; failure yields a placeholder with asset-only retry.
9. No vendor type appears outside the adapter, and the fake adapter satisfies the same contract.
10. Media call caps hold, video is confirmed, and costs are visible.
11. Restricted preview behaviour is blocked, reported, and does not prevent safe output rendering.
12. Librarian and Design model selections persist and are honoured.
13. The main Sero agent can search the library and create a Design.
14. Gallery versions remain byte-identical after source deletion; export reproduces a snapshot exactly and runs standalone.
15. Deletion and revision stay recoverable until explicit permanent deletion.
16. The plugin installs as an external plugin with no host changes.

---

## 14. Authority

Where documents disagree: this specification and the decision log govern product behaviour; the prototype governs layout, hierarchy and visual language; the implementation plan governs build order only.
