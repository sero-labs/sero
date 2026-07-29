# Sero Design Library: Decision Log

**Status:** Current
**Latest revision:** 2026-07-27
**Applies to:** first usable release of `@sero-ai/plugin-design-library`
**Branch:** `feat/design-library-plugin-v2`

This document records *what was decided and why*. The specification records *what the product does*. Where a decision here is more recent than prose elsewhere, this document wins.

---

## Revision 2 — 2026-07-27

Eleven decisions taken in review. Several reverse revision 1; those are marked and the superseded text is kept at the bottom so the reasoning trail survives.

### D1 · The prototype is the UX authority

`docs/prototypes/sero-design-library-plugin.html` defines layout, hierarchy and visual language. Features it *shows* are in scope unless explicitly deferred below.

**Reverses R1-§2**, which told the implementer to omit collections, favourites, prompt recipes, variation mode and inspiration strength because they were deferred. That instruction would have shipped an app noticeably barer than the agreed design for no architectural benefit — these are cheap, and they are what makes the surface feel like a studio rather than a database.

Still deferred: importing your own video files, URL/webpage capture, clipboard HTML, embedding-based search, and Sero-plugin output as a generation target.

**Consequence.** Smart groups return, but without machine learning. They group by the Librarian's own `primaryStyle` and frequent vocabulary terms — which is literally what the prototype's group names are. Zero extra model calls, no embeddings, and the deferral of *semantic* grouping is unaffected.

### D2 · Both output targets ship, previewed from a self-contained frame

HTML/CSS/JS and React/TypeScript/Tailwind are both in the first release.

**Considered and rejected: a real project plus a managed Vite dev server.** This was raised because it mirrors how Sero builds and previews apps today, and it is technically available — `devServers.start` is `true` on the host runtime, not just containers, and the renderer CSP already permits `frame-src http://localhost:*`. It was rejected on four grounds:

1. `startManagedDevServer` refuses any cwd outside a workspace root. Design Library is a **global** app; its state lives in `$SERO_HOME/apps/design-library/`. Every design would have to be materialised into one of the user's workspaces, which is not where designs belong.
2. It requires an open workspace to preview anything.
3. `pnpm install` per design costs minutes and hundreds of megabytes each.
4. A dev server has full network and Node access, so every isolation guarantee in §7 of the spec would be void.

**Rejected the plan's own framing too.** Revision 1 described the alternative as a "local esbuild + offline Tailwind compile pipeline", implying a subsystem. It is not one: esbuild transforms TSX in-process in tens of milliseconds, React is bundled from the plugin's own dependencies, and Tailwind compiles inside the frame from a locally bundled browser build. Two small files.

**Consequence.** Previews are instant, work offline, need no workspace, and keep the isolation boundary. The cost is that generated code can only import what the plugin bundles. For design prototypes that is not a real constraint.

### D3 · Four media capabilities

`text-to-image`, `image-to-image`, `upscale`, `text-to-video`.

**Extends R1-§5**, which covered illustrative artwork only. Generating inspiration directly into the Library and restyling existing items are both natural to the loop and use the same contract.

### D4 · Generated video yes, video import no

Video generation implies the Library can store, thumbnail and play video, and that the Librarian analyses motion. Importing the user's own video files stays deferred, so we avoid arbitrary container/codec handling while keeping the capability.

**Partially reverses R1-§10**, which deferred video wholesale.

### D5 · Media is triggered by the agent *and* by explicit actions

**Reverses R1-§5**, which stated media generation "is never directly invoked by the user".

Agent-only invocation means no way to force a generation, which is wrong for a creative tool where the user often knows exactly what they want. Both routes call one implementation, so there is no divergence risk.

### D6 · Provider abstraction is retained; its ceremony is not

The application talks in capabilities and opaque model ids. `@fal-ai/client` is imported in exactly one file. No vendor type appears in UI, domain, state or persisted records.

**Retains R1-§5's intent.** What is dropped is the requirement that "a second, fal-free adapter passes the same contract tests" as an *architectural* obligation. A deterministic fake adapter exists, but as a test double so the contract can be exercised without network or spend — not as evidence of pluggability.

### D7 · Curated per-capability model defaults, editable

The provider exposes hundreds of endpoints. Settings expose one editable model id per capability with a sensible default. The agent chooses a *capability*; it never chooses an endpoint.

Rejected: a live model browser, which would need a catalogue API and network at settings time for marginal benefit.

### D8 · Two model pickers

Librarian and Design are separate settings, both defaulting to Sero's configured model, both persisted in plugin state, both using `AvailableModelPicker` fed by `useAvailableModels()`.

**Reverses R1-§8**, which fixed models and exposed no picker. Analysis is a cheap vision task and generation wants the strongest available coding model; forcing them to be the same model is either wasteful or weak. Per-surface pickers (revise, tweaks) were rejected as unnecessary settings surface.

### D9 · Credentials: environment first, stored fallback

`FAL_KEY` from the process environment first; a user-supplied key second, written `0600` into the plugin's global state directory.

**Known limitation, accepted.** `AppRuntimeCredentialsApi.getProviderApiKey` resolves *model* providers only, so there is no encrypted store available to a plugin. A stored key therefore sits at the same protection level as `auth.json`. The key never enters reactive state and is never returned to the UI, which sees only `env | stored | missing`. The environment path is preferred and labelled as such.

### D10 · Spend is capped per run, video is confirmed, cost is visible

**Reverses R1-§5**, which added no limits and relied on account controls.

That stance predated D3 and D5. With an agent able to call video generation autonomously inside a multi-variant run, "rely on the account limit" is a way to discover a problem after paying for it. A per-run call cap, mandatory confirmation for video, and per-asset and per-Design cost display are cheap and sufficient. Exceeding the cap stops further calls and reports it; it does not fail the run.

### D11 · The main Sero agent gets read and create access

Exposed through `sero.plugin.bridgeTools`. Being able to say "build a settings page from my three dashboard references" from any chat is most of the value of living inside Sero.

**Reverses R1's Phase 1 instruction** to set `bridgeTools: false`.

### D13 · Tweaks is a fourth inspector tab, in a resizable panel

Decided by comparing both placements rendered at full size in the prototype rather than in prose.

A dedicated 300px left panel was drawn and rejected: it fits every control without scrolling, but it permanently costs canvas width and duplicates chrome that the inspector already provides. The inspector tab keeps the workbench as it is.

Its known weakness — a fixed 274px is cramped for a control-heavy page — is solved by making the inspector **drag-resizable with a persisted width**, using `ResizablePanel` from `@sero-ai/ui` (`react-resizable-panels`), the same control the desktop shell already uses. The sessions rail collapses to icons, which pays for the extra inspector width.

Rendering the comparison also surfaced a real UI problem: a permanent multi-line "controls omitted" warning box pushed a whole control group off-screen. It collapses to one line that expands on demand.

### D14 · Baseline typography Tweaks belong to the generation contract

The first manual pass reversed the earlier decision to make every control page-specific. Each generated page must now provide Font, H1 size, H1 weight, H1 tracking, H2 size, Body font and Body size before its own controls. Font controls use a fixed catalog that the preview harness can load from Google Fonts. Body size drives a small page-wide type scale, not only one inherited paragraph.

This is enforced in the generation prompt and the finished manifest validator. Each property must be declared and connected to its intended `h1`, `h2` or `body` rule through `var()`. Font choices are limited to the two available system stacks. A missing or inert baseline control sends the model back through the existing repair loop; a page that still lacks the baseline is not accepted. This also applies when revising a revision created before the baseline existed. The runtime does not rewrite generated CSS, and the UI does not show controls that only happen to work on some pages.

Page-specific controls remain AI-authored and validated as before. The fixed baseline is the only catalogue.

### D12 · Three PRs, not one — and in practice five

**Reverses R1-§11**, which required the complete first release in a single PR.

Revision 1's scope has since gained video, four media capabilities, a second output target, model settings and agent bridging. One PR at that size is not reviewable. Split:

1. **Library** — import, Librarian, grid, search, filters, favourites, collections, style groups, settings and model pickers.
2. **Design** — create dialog, generation, variants, preview, Tweaks, revisions, autosave and recovery.
3. **Media and Gallery** — capability contract, adapter, video, asset tray, snapshots, families and export.

Each is independently reviewable and usable. PR 1 is a working tool on its own.

**Both 2 and 3 were split again while being built**, and it is worth recording
that this happened twice rather than treating each as a one-off. The estimate
that produced three PRs was made against the *spec*, before the seams were known;
what the build then found in each case was that the work divided cleanly at a
place the plan had not marked.

- **2 → 2a and 2b** at the generation-pipeline / working-surface boundary.
- **3 → 3a and 3b** at the media / Gallery boundary, agreed part-way through 3a.
  3a alone had already reached the size of a full PR, and 3b depends on it —
  a Gallery version bundles the assets 3a produces — so the order is forced and
  the cut costs nothing.

The lesson for the next plan of this shape is not "estimate better". It is that a
build order should say where it *may* be cut, so splitting is a decision taken
once rather than renegotiated under pressure at the point the diff gets large.

---

## Carried forward from revision 1 (unchanged)

These decisions were reviewed and stand.

**Import and duplicates.** Analysis starts automatically. Exact duplicates are detected by content checksum, and importing one opens the existing item. Images appear immediately while analysis runs.

**Analysis editing.** Generated values and manual overrides are stored separately. Every user-facing field is editable and individually resettable; a manual edit overrides the whole field; reanalysis replaces generated values and preserves overrides. Field-level override *presence* must be explicit in the persistence model — a nested `Partial<T>` is not sufficient. System provenance is immutable.

**Deletion.** Normal deletion is recoverable until manual purge. Permanent deletion removes the item and its owned asset, leaves dependants intact with tombstoned provenance, and never cascades.

**References.** Up to six per Design; the first is primary and leads; secondaries contribute compatible traits; differences may be blended; only incompatible guardrails block, and blocking conflicts must be resolved explicitly. Reference pixels never reach generated output.

**Output rules.** One target per Design, no automatic parity between targets. Only approved bundled dependencies and icons. Generated code has no network. The trusted preview harness has one narrow exception: it can load an exact selection from the fixed Google-backed Design font catalog.

**Variants.** Default three, range one to five. The model decides how different they should be. Each is an independently cancellable job; successes survive partial failure; failures and cancellations retry independently.

**Revisions.** Replace or retain, defaultable and changeable. Replacement always retains recoverable history. History persists until manually deleted.

**Persistence.** Continuous autosave; generation continues when the user navigates away; durable job state survives quit and resumes on restart; reopening restores the previous working position.

**Tweaks.** Each revision starts with the required typography baseline from D14, then adds AI-authored controls specific to the page. The two standard font choices use the Design font picker; other controls use the generic range/toggle/colour/choice primitives. Every control must change a declared custom property; invalid, duplicate or inert page-specific controls are omitted and reported, while a missing baseline refuses the run after repair. The preview channel accepts only a declared id and a schema-valid value — never selectors, CSS text or JavaScript. Defaults and overrides stored separately, each resettable. One editing session checkpoints as one revision. Copy CSS returns the effective scoped block. Gallery and export use resolved effective values and do not depend on the Tweaks runtime.

**Media lifecycle.** Illustrative artwork, not routine icons. Results downloaded and stored locally. Reusable across variants in one Design; wider reuse requires explicit Copy to Library, which creates an independent item with retained generation provenance and automatic analysis. Provider unavailability yields a local placeholder with asset-only retry. Gallery snapshots bundle their own copies, so deleting a Design asset cannot alter a saved version.

**Preview isolation.** Blocked: general network access, Sero APIs/state/secrets, filesystem, Node, Electron, cookies and persistent storage, host navigation, uncontrolled pop-ups, and unapproved dependencies. The harness can load only the stylesheet and font files for a fixed Design font value. Safe output still renders when a violation is detected, and warnings never weaken the boundary.

**Gallery.** Immutable versions; saving a revised variant adds to the existing family; new families only via explicit Duplicate or Remix; one card per family with a revision selector; newest save featured by default; changing the featured pointer preserves history. Reopening restores the source Design at that revision and never edits the snapshot. Deletion is recoverable and never cascades. Export reproduces exact code, effective tweak values and assets plus a metadata manifest, to Downloads or the active workspace, and never regenerates.

---

## Technical mechanisms (resolved)

Selected from evidence already in this repository. None introduces a Design Library-specific host API.

**Authoritative state.** `AppRuntimeStateApi.update` serialises writes only within the host process, and Pi tool calls run in a separate process — so atomic replacement alone can lose an update. Therefore: extension tools are read-and-intent only, and the background runtime is the single authoritative writer for every record and the index. Writes go through an in-process queue per path, a cross-process exclusive lock directory, and a revision compare-and-swap. Requests are append-only and consumed by a monotonic watermark, so an append racing a consume cannot be dropped. The index is a pure projection of the records, which makes an interrupted index write recoverable. Pattern precedent: `plugins/sero-graphify-plugin`.

**Bounded ingestion.** `AppToolResult` carries text, `details` JSON and image content blocks, and the desktop passes image blocks through to the renderer unchanged. All three import methods stream base64 chunks of at most 512 KiB per call into `uploads/<id>/`, then queue one ingest request. Previews are read back as image content blocks into a bounded renderer cache. No binary enters reactive state; no preload API is added.

**Multimodal Librarian and owned artwork.** Pi's read tool sends images as model attachments with bounded resizing, and `platformTools: 'readOnly'` gives a run exactly that tool. The Librarian runs with `platformTools: 'readOnly'` and a `cwd` of the item's directory, and is asked to read the stored original; structured output uses the existing `repair` contract. Design generation runs with `platformTools: 'none'`, so imported reference pixels can never reach it. Images generated or derived by Design Library are original plugin-owned work: creating a Design copies them into its asset tray and gives the run only their stable local `assets/...` references, so the page can use the real artwork without weakening the imported-reference boundary.

**Preview isolation.** `HtmlPreview.tsx` already renders untrusted HTML from a `blob:` URL in an `allow-scripts`-only iframe, yielding an opaque origin with no access to the host renderer, cookies or storage. Previews use the same boundary plus a strict document CSP (`default-src 'none'`) and a guard harness that reports blocked attempts. React is transpiled by esbuild in the runtime with React bundled from the plugin's dependencies and Tailwind compiled in-frame from a bundled browser build; imports outside the approved set are refused and reported.

**Gallery previews.** A version never changes, so a headless-browser raster capture buys nothing and costs a machine dependency. Each version stores a script-free, animation-free rendering of its own snapshot, rendered in a scaled `sandbox=""` iframe mounted only when scrolled into view.

**Media tools to the model.** `AppRuntimeSubagentRunParams.customTools` accepts Pi `ToolDefinition[]` executed in-process by the plugin runtime — the same seam `sero-kanban-plugin` uses to hand its planner a submission tool. Media tools ride there for design generation, and through `bridgeTools` for the main agent.

---

## Superseded (revision 1, 2026-07-25)

Kept for the reasoning trail. **Do not implement from this section.**

- *Library layout:* uniform grid only, with collections, smart groups, favourites, recipes, variation mode and inspiration strength omitted from the first release. → Reversed by **D1**.
- *Video, URL capture and clipboard HTML:* deferred wholesale. → Video partially restored by **D4**; the rest still deferred.
- *Media invocation:* "never directly invoked by the user"; the model alone decides. → Reversed by **D5**.
- *Media scope:* illustrative artwork only. → Extended by **D3**.
- *Spend:* no plugin-level limit; rely on the provider account. → Reversed by **D10**.
- *Provider proof:* "a second, fal-free adapter passes the same contract tests" as an architectural requirement. → Downgraded to a test double by **D6**.
- *Models:* fixed to Sero's configured model, no picker; profile settings limited to variant count and revision behaviour. → Reversed by **D8**.
- *Agent bridging:* `bridgeTools: false`. → Reversed by **D11**.
- *Delivery:* a single PR containing the complete first release, gated on spikes. → Reversed by **D12**; the spikes are resolved above.
