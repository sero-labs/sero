# Sero Design Library Plugin Specification

**Status:** Draft  
**Proposed package:** `@sero-ai/plugin-design-library`  
**Directory:** `plugins/sero-design-library-plugin`  
**App ID:** `design-library`  
**Display name:** Design Library  
**Scope:** Global  
**Category:** Design / Creative Tools

## 1. Product vision

The Sero Design Library is a private, AI-assisted design inspiration and creation workspace.

It acts like a personal Dribbble-style visual scrapbook, but goes beyond storing references. Each saved screenshot, video or webpage is analysed by an AI design specialist called the **Librarian**.

The Librarian translates visual references into useful design language:

- What kind of design it is
- What aesthetic style it represents
- What visual characteristics create that style
- What the design communicates or feels like
- The correct vocabulary for describing it
- Which design rules should always be followed
- Which design choices should never be introduced
- A reusable prompt for producing new work with a similar feel

The user can then combine one or more references and ask Sero to generate new, original implementations influenced by those references.

The objective is to capture the **design DNA** of an inspiration, not reproduce its content or exact composition.

## 2. Product principles

### 2.1 Feel, not content

Generated designs should inherit qualities such as visual rhythm, density, contrast, typography, geometry, material treatment and mood.

They should not reproduce:

- Logos
- Brand names
- Written copy
- Distinctive illustrations
- Proprietary imagery
- Exact page composition
- Recognisable component arrangements
- A near-identical colour and typography combination

### 2.2 Visual first

The product should feel like a gallery and creative studio rather than a database management application.

Metadata and AI analysis should support the imagery without overwhelming it.

### 2.3 Concise intelligence

The Librarian should produce short, high-value descriptions rather than essays.

Most analysis should be presented as:

- Tags
- Vocabulary chips
- Short sentences
- Compact design token groups
- Editable rules
- A focused generation prompt

### 2.4 User control

AI analysis is a starting point, not an immutable classification.

The user can edit:

- Titles
- Tags
- Collections
- Style descriptions
- Vocabulary
- Generated prompts
- Always rules
- Never rules

User edits must not be silently overwritten by later analysis.

### 2.5 External-plugin portability

The plugin should be designed as though it were already externally distributed.

It must not require design-library-specific changes in the Sero host.

## 3. Core concepts

### Library item

A saved piece of inspiration.

A library item may originate from:

- A pasted screenshot
- An uploaded image
- A pasted or uploaded video
- A pasted URL
- Clipboard HTML
- A webpage capture
- A previously generated design deliberately saved as inspiration

### Librarian profile

The structured visual analysis produced for a library item.

It describes the item’s aesthetic without reproducing its content.

### Collection

A manually managed group of library items, such as:

- Trading dashboards
- Editorial layouts
- Glass interfaces
- Luxury product pages
- Data visualisation
- Navigation patterns

### Smart group

An automatically generated grouping based on Librarian analysis.

Examples:

- Brutalist
- Editorial
- High-density dashboards
- Dark luxury
- Soft minimalism
- Technical monochrome
- Retro-futurist
- Data-heavy
- Motion-led

### Prompt recipe

A saved generation template containing:

- Base instructions
- Output technology
- Output format
- Default guardrails
- Responsiveness requirements
- Accessibility requirements
- Placeholder fields for the user’s request

### Design session

A generation workspace created from:

- One or more selected library items
- Optionally one or more Gallery designs
- A user request
- A prompt recipe
- A variation strategy
- A requested number of outputs

### Design variant

One generated implementation within a design session.

Each variant has its own preview, source files, prompt history and provenance.

### Gallery design

A stable, intentionally saved snapshot of a generated design.

Gallery designs are permanent creative outputs, not transient working variants.

### Design family

A group of related Gallery designs that share the same creative origin.

A family may contain original variants, revisions, remixes, light and dark adaptations, mobile adaptations and alternate implementations.

## 4. Information architecture

The plugin has three primary pages.

### 4.1 Library

The Library contains imported inspiration:

- Screenshots
- Videos
- Webpage captures
- Clipboard content
- Reference images
- Generated designs deliberately saved back as inspiration

The Library answers:

> What visual references do I want to draw from?

### 4.2 Design

The Design page is the active creative workbench.

It contains:

- Current design sessions
- Generation progress
- Variant tabs
- Live previews
- Revision history
- Prompt controls
- Source inspiration details
- Code and file editing
- Export actions

The Design page answers:

> What am I currently creating or refining?

### 4.3 Gallery

The Gallery is the permanent archive of completed and intentionally saved generated designs.

It contains:

- Completed design variants
- Saved iterations
- Design families
- Favourites
- Exported designs
- Design history
- Links back to source inspirations and prompts

The Gallery answers:

> What have I created before, and what can I reuse or build upon?

### 4.4 Primary navigation

Recommended navigation:

```text
Library    Design    Gallery
```

Optional badges may show:

- Library items awaiting analysis
- Active Design generation jobs
- Newly completed or unsaved Gallery candidates

The plugin should remember the last active page and page-specific view settings.

## 5. Primary user journey

1. The user pastes or imports design inspiration into the Library.
2. The item immediately appears with a local preview.
3. A background analysis job is created.
4. The Librarian analyses the item.
5. The item is tagged and placed into relevant smart groups.
6. The user reviews or edits its analysis and guardrails.
7. The user selects one or more Library items.
8. The user chooses **Create Design**.
9. The user describes what should be created.
10. The user chooses a saved prompt recipe or the default recipe.
11. The user chooses how variations should be generated.
12. Sero generates the requested implementations.
13. Each implementation appears in its own tab on the Design page.
14. The user reviews, revises and compares the variants.
15. The user saves chosen variants to the Gallery.
16. Gallery designs can later be reopened, remixed, versioned, exported or saved back into the Library as inspiration.

## 6. Library page experience

### 6.1 Gallery-style browser

The primary Library view is a responsive masonry or justified visual browser.

Cards should favour the visual content and show only lightweight metadata:

- Thumbnail or video poster
- Title
- Primary style label
- Media type
- A small number of tags
- Analysis state
- Selection state

Additional information appears on hover, focus or selection.

Video cards may play a short muted preview on hover, subject to performance settings.

### 6.2 Import interaction

The plugin should listen for paste events while its surface has focus.

The paste handler detects, in priority order:

1. Image data
2. Video or file data
3. URL text
4. HTML clipboard content
5. Plain text that contains a URL

The Library also provides an **Add Inspiration** button supporting:

- Choose image
- Choose video
- Capture URL
- Paste from clipboard

Drag and drop should use the same import pipeline.

### 6.3 Item inspector

Selecting an item opens a spacious inspector or detail view.

The item preview remains dominant. Librarian information appears in compact sections.

#### Identity

- Editable title
- Source URL
- Source type
- Capture date
- User tags
- Collections

#### Style

- Primary style name
- Design type
- Short aesthetic summary
- Intended feeling or association

#### Vocabulary

A small set of aesthetic terms, each optionally carrying a short tooltip.

Example:

```text
editorial  monolithic  high-contrast  kinetic typography  chromatic restraint
```

#### Visual construction

Compact groups describing:

- Colour
- Typography
- Layout
- Spacing and density
- Shape language
- Surfaces and materials
- Imagery
- Motion

#### Prompt

An editable prompt that captures the style.

#### Guardrails

Two editable groups:

**Always**

Rules that should normally be preserved when using this reference.

**Never**

Choices that would undermine the style.

#### Actions

- Reanalyse
- Duplicate
- Add to collection
- Create design
- Delete
- Open original source

## 7. Librarian analysis contract

The Librarian must return structured data rather than unbounded prose.

```ts
interface LibrarianAnalysis {
  version: number;

  designTypes: string[];
  primaryStyle: string;
  tags: string[];

  summary: string;
  designIntent: string;
  aestheticVocabulary: Array<{
    term: string;
    meaning?: string;
  }>;

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

  palette?: Array<{
    hex: string;
    role: string;
  }>;

  always: string[];
  never: string[];

  generationPrompt: string;

  confidence: number;
  analysedAt: number;
  model?: {
    providerId?: string;
    modelId?: string;
  };
}
```

### 7.1 Content limits

The analysis should normally follow these limits:

- Summary: one sentence
- Design intent: one or two sentences
- Design types: maximum three
- Tags: six to twelve
- Aesthetic vocabulary: maximum eight terms
- Each visual profile group: maximum four observations
- Always rules: maximum five
- Never rules: maximum five
- Generation prompt: approximately 80 to 150 words

The interface may hide empty or low-confidence sections.

### 7.2 User-edit preservation

Generated analysis and user modifications should be stored separately.

```ts
interface EditableAnalysis<T> {
  generated: T;
  userOverrides: Partial<T>;
}
```

Reanalysis replaces `generated` but preserves `userOverrides`.

The user should be able to restore an individual field to the latest generated value.

## 8. Analysing different media types

### 8.1 Images

The original image and a bounded analysis-sized version are provided to the Librarian.

The analysis should consider:

- Overall composition
- Component styling
- Colour relationships
- Typography
- Hierarchy
- Density
- Texture
- Spatial rhythm

### 8.2 Videos

The video itself is retained as the original asset.

The import pipeline extracts representative frames in the renderer using browser video and canvas APIs. This avoids requiring a native media dependency for basic analysis.

The Librarian receives:

- Poster frame
- Representative frames
- Duration and dimensions
- Optional user-provided context
- A short description of visible transitions where available

Video analysis should additionally describe:

- Motion language
- Transition style
- Pacing
- Layer movement
- Interaction feedback
- Continuity between states

### 8.3 Webpages

A URL capture should attempt to save:

- Canonical URL
- Page title
- Initial viewport screenshot
- Full-page screenshot
- Extracted readable content
- Basic document metadata
- Viewport dimensions
- Capture timestamp

The visual screenshots are the primary Librarian input. Extracted text is supplementary and should not dominate the aesthetic analysis.

For dynamic pages, the capture process should wait for a bounded settling period rather than attempting to guarantee that all network activity has completed.

### 8.4 Clipboard HTML

Clipboard HTML may be saved as a sanitised document snapshot.

Where practical, it should be rendered in an isolated preview and converted into an image for Librarian analysis.

## 9. Grouping and discovery

### 9.1 Manual organisation

Users can:

- Create collections
- Add an item to multiple collections
- Add custom tags
- Pin items
- Archive items

### 9.2 Smart organisation

The plugin derives smart groups from:

- Design type
- Primary style
- Aesthetic vocabulary
- Colour characteristics
- Density
- Shape language
- Media type

Smart groups are computed views, not destructive folders.

### 9.3 Search

MVP search should cover:

- Title
- Source URL
- Tags
- Collections
- Primary style
- Design type
- Aesthetic vocabulary

Semantic visual search can be added later.

### 9.4 Filters

Recommended filters:

- Media type
- Design type
- Style
- Colour family
- Density
- Collection
- Analysis state
- Date added
- Generated versus imported

## 10. Creating a new design

The user selects one or more Library items and chooses **Create Design**.

A generation dialog asks for the following.

### 10.1 Request

A natural-language description of what should be built.

Example:

> Create a responsive analytics dashboard for monitoring AI agent tasks, failures and token usage.

### 10.2 Prompt recipe

The user may choose:

- Default web prototype
- A saved recipe
- A previously used prompt
- A blank custom prompt

### 10.3 Output target

For MVP:

- Single-page HTML, CSS and minimal JavaScript

Later targets may include:

- React and TypeScript
- React with Tailwind
- Sero plugin UI
- Component library
- Static image concept
- Design-token package

### 10.4 Variation mode

#### Blend

Combine the design characteristics of all selected references and create a total number of variants.

Example:

- Five selected references
- Three total variants
- Each variant uses a different interpretation of the combined design language

#### Per reference

Generate a chosen number of variants for each selected item.

Example:

- Three selected references
- Two variants per reference
- Six outputs in total

### 10.5 Variation count

The interface should show the calculated output count before generation begins.

A practical default is three total variants.

### 10.6 Guardrails

The user can:

- Include all generated guardrails
- Disable individual rules
- Add session-specific rules
- Save new rules into the prompt recipe

### 10.7 Inspiration strength

An optional control determines how strongly the selected references influence the output:

- Light
- Balanced
- Strong

Strong influence must still preserve the anti-replication rules.

## 11. Style synthesis

When multiple items are selected, their full analyses should not simply be concatenated into the generation prompt.

The Librarian first creates a compact **Style Synthesis** containing:

- Shared characteristics
- Complementary characteristics
- Important differences
- Conflicting guardrails
- A proposed combined vocabulary
- A unified style prompt

Conflicts should be surfaced to the user.

Example:

- One item requires sharp rectangular geometry
- Another item prohibits hard edges

The interface should allow the user to choose which direction takes priority rather than silently averaging the two.

## 12. Generation prompt construction

The final internal generation prompt should be assembled from:

1. User request
2. Output target
3. Style Synthesis
4. Selected Always rules
5. Selected Never rules
6. Prompt recipe
7. Required output schema
8. Accessibility and responsiveness requirements
9. Anti-replication requirements
10. Variation-specific differentiation instructions

Each variant should receive a distinct creative direction, such as:

- Typography-led
- Spatially minimal
- Data-dense
- More expressive
- More restrained
- Motion-led

The generator should be told not to produce cosmetic colour swaps as separate variants.

## 13. MVP implementation output

For MVP, an implementation means a runnable web prototype rather than a generated image.

Each generated variant contains:

```ts
interface GeneratedDesignVariant {
  id: string;
  sessionId: string;
  title: string;
  conceptSummary: string;

  files: Array<{
    path: string;
    content: string;
  }>;

  entryFile: string;
  sourceItemIds: string[];
  appliedGuardrails: string[];
  promptSnapshot: string;

  status: "queued" | "generating" | "completed" | "failed";
  error?: string;

  createdAt: number;
  updatedAt: number;
}
```

The default generated files are:

```text
index.html
styles.css
script.js
```

JavaScript should be optional and minimal.

External network access should be disabled in previews by default. Generated designs should use:

- CSS gradients where stylistically appropriate
- CSS shapes
- Inline SVG
- Embedded placeholder assets
- Locally generated content

This produces self-contained and reproducible previews.

## 14. Design page experience

Each design session opens on the Design page.

### 14.1 Variant tabs

Every variant appears as an individual tab.

Tabs display:

- Generated name
- Generation state
- Unsaved changes indicator
- Error state where applicable

### 14.2 Main canvas

The primary area renders the implementation in a sandboxed iframe.

Controls include:

- Desktop width
- Tablet width
- Mobile width
- Fit to canvas
- Refresh preview
- Open full screen

### 14.3 Inspector

A secondary inspector contains:

- Concept summary
- Source inspirations
- Applied style vocabulary
- Applied guardrails
- Prompt snapshot
- Files
- Generation metadata

### 14.4 Actions

- Regenerate
- Revise with prompt
- Duplicate variant
- Compare variants
- Save to Gallery
- Save all variants to Gallery
- Export files
- Delete variant

### 14.5 Revision

The user can provide a follow-up instruction such as:

> Keep the typography and layout but make the data visualisation more prominent.

A revision should create a new history entry rather than destroying the previous output.

## 15. Gallery page experience

The Gallery should be visually led and feel closer to a portfolio or private design showcase than a file browser.

### 15.1 Gallery cards

Each card represents a saved generated design.

A card should show:

- Large preview image
- Design title
- Design type
- Date created or last updated
- Prompt recipe
- Source inspiration count
- Design family or session
- Favourite status
- Output format
- Optional user tags

Hovering or focusing a card may reveal:

- Open
- Remix
- Duplicate
- Export
- Add to Library
- Delete

Gallery cards should not expose large prompt or code blocks by default.

### 15.2 Gallery layouts

The user can switch between:

- Masonry
- Uniform grid
- Design families
- Timeline

#### Masonry

Best for general visual browsing.

#### Uniform grid

Best for quickly comparing designs at a consistent size.

#### Design families

Groups variants and revisions that originated from the same design session.

#### Timeline

Shows the evolution of generated work over time.

The timeline view may be deferred beyond MVP if necessary.

### 15.3 Gallery filtering

Recommended filters:

- Design type
- Output target
- Prompt recipe
- Source collection
- Source style
- User tags
- Favourite
- Date created
- Date modified
- Generation model
- Design family

### 15.4 Gallery search

Search should cover:

- Design title
- User tags
- Concept summary
- Original user request
- Prompt recipe
- Applied style vocabulary
- Source inspiration titles
- Source inspiration tags

## 16. Saving designs to the Gallery

A generated variant does not need to enter the Gallery automatically.

This prevents failed experiments, temporary variants and weak outputs from cluttering the permanent collection.

Each completed variant should provide:

- **Save to Gallery**
- **Save all variants to Gallery**
- **Mark as final**
- **Replace existing Gallery version**
- **Save as new version**

The user can also enable an optional setting:

> Automatically save completed variants to Gallery

This should be disabled by default.

### 16.1 Gallery save snapshot

Saving a variant to the Gallery creates a stable snapshot containing:

```ts
interface GalleryDesign {
  id: string;
  title: string;
  description?: string;

  sessionId: string;
  variantId: string;
  familyId: string;

  previewAssetPath: string;
  filesPath: string;
  entryFile: string;

  sourceItemIds: string[];
  sourceGalleryDesignIds?: string[];
  promptRecipeId?: string;
  promptSnapshot: string;
  appliedGuardrails: string[];
  aestheticVocabulary: string[];

  outputTarget: string;
  tags: string[];
  favourite: boolean;

  version: number;
  parentGalleryDesignId?: string;

  createdAt: number;
  updatedAt: number;

  generation?: {
    providerId?: string;
    modelId?: string;
  };
}
```

The Gallery record should preserve the exact prompt, files and source references used to create that version.

Later changes in the Design workspace must not silently mutate an existing Gallery entry.

## 17. Gallery design detail view

Opening a Gallery item shows a focused design detail view.

### 17.1 Primary preview

The design should remain the dominant element.

Preview controls include:

- Desktop
- Tablet
- Mobile
- Full screen
- Refresh
- Fit to viewport

### 17.2 Design information

Compact metadata includes:

- Title
- Concept summary
- Design family
- Version
- Created date
- Output target
- Prompt recipe
- Generation model

### 17.3 Inspiration lineage

The user can inspect:

- Source Library items
- Source Gallery designs
- Combined Style Synthesis
- Applied aesthetic vocabulary
- Always rules
- Never rules

Selecting a source Library item opens it in the Library.

### 17.4 Prompt and files

Prompt and source files should be available through secondary tabs or expandable panels rather than permanently occupying the main layout.

### 17.5 Gallery actions

- Open in Design
- Continue editing
- Remix
- Create variations
- Duplicate
- Export
- Add to Library
- Favourite
- Edit metadata
- Delete

## 18. Open in Design

**Open in Design** creates or restores an editable Design session from a Gallery item.

If the original design session still exists, the plugin opens it.

If it no longer exists, the plugin creates a new session containing:

- The saved files
- The original prompt
- Source inspiration references
- Applied guardrails
- Generation metadata
- A new editable revision history

The Gallery snapshot remains unchanged until the user explicitly saves a new version or replaces it.

## 19. Remixing Gallery designs

A Gallery design can itself become the starting point for new work.

The user chooses **Remix** and provides a new request.

Examples:

- Use this visual language for a mobile application
- Turn this dashboard into a project planning interface
- Keep the typography but simplify the layout
- Create three lighter variations
- Reinterpret this as a Sero plugin UI

The remix flow should support:

- Using the Gallery design alone
- Combining it with Library inspiration
- Combining it with other Gallery designs
- Selecting a different prompt recipe
- Choosing total or per-source variation counts

A remix creates a new Design session and a new design family unless the user explicitly chooses to continue the existing family.

## 20. Design families and versions

### 20.1 Design family

A design family groups designs sharing the same broad creative origin.

A family may contain:

- Original variants
- Revised variants
- Remixes
- Mobile adaptations
- Light and dark adaptations
- Alternative implementations

### 20.2 Version

A version is a saved point in the history of one Gallery design.

Example:

```text
Agent Operations Dashboard
├── Version 1: Original dark dashboard
├── Version 2: Improved chart hierarchy
└── Version 3: Reduced navigation density
```

Versions should not be treated as arbitrary autosaves.

A new Gallery version is created only when the user chooses:

- Save as new version
- Mark revision as final
- Replace or preserve the previous final version

## 21. Relationship between Gallery and Library

Gallery designs may optionally be added to the Library as future inspiration.

This action should create a new Library item that references the Gallery design rather than duplicating all underlying files unnecessarily.

The resulting Library item can be analysed by the Librarian like any other visual reference.

This enables a feedback loop:

```text
Imported inspiration
        ↓
      Library
        ↓
      Design
        ↓
      Gallery
        ↓
Save as new inspiration
        ↓
      Library
```

The product should clearly distinguish the roles:

| Surface | Contains | Primary purpose |
|---|---|---|
| Library | Imported or deliberately saved inspiration | Understand and organise visual styles |
| Design | Active sessions and working variants | Generate and refine implementations |
| Gallery | Saved generated outputs | Browse, reuse, remix and export completed work |

## 22. Prompt recipes

A prompt recipe contains:

```ts
interface PromptRecipe {
  id: string;
  name: string;
  description?: string;

  outputTarget: "html" | "react" | "sero-plugin";
  basePrompt: string;

  always: string[];
  never: string[];

  defaultVariationMode: "blend" | "per-reference";
  defaultVariationCount: number;

  responsive: boolean;
  accessible: boolean;

  createdAt: number;
  updatedAt: number;
}
```

The plugin ships with one default recipe.

### Responsive web prototype

- Self-contained HTML and CSS
- Responsive desktop and mobile layouts
- Semantic HTML
- Keyboard-accessible controls
- No external dependencies
- No copied brand assets or copy
- No placeholder gradients unless supported by the selected style
- No generic dashboard styling unless requested

## 23. Technical architecture

A Sero plugin can contain a Pi extension, React UI and optional background runtime, with plugin-specific state owned by the plugin.

The Design Library should use those standard plugin surfaces and avoid custom host integration.

### 23.1 Host contract

The plugin should require only existing generic capabilities:

```json
{
  "sero": {
    "plugin": {
      "requiredHostCapabilities": [
        "appAgent.invokeTool",
        "appRuntime.background"
      ]
    }
  }
}
```

It should not require `tool.cli` for MVP.

No new host capability should be introduced.

No design-library-specific property should be added to `window.sero`.

No new preload API or IPC channel should be created.

### 23.2 Global scope

The Design Library should use:

```json
{
  "sero": {
    "app": {
      "scope": "global"
    }
  }
}
```

This is a personal library that should remain available across all workspaces in the active profile.

### 23.3 Plugin surfaces

```text
plugins/sero-design-library-plugin/
├── package.json
├── vite.config.ts
├── shared/
│   ├── types.ts
│   ├── schemas.ts
│   └── defaults.ts
├── extension/
│   ├── index.ts
│   ├── tools/
│   ├── state/
│   ├── storage/
│   └── tsconfig.json
├── runtime/
│   ├── index.ts
│   ├── jobs/
│   ├── capture/
│   ├── librarian/
│   ├── generator/
│   └── tsconfig.json
└── ui/
    ├── DesignLibraryApp.tsx
    ├── pages/
    ├── components/
    ├── features/
    ├── hooks/
    └── styles.css
```

### 23.4 UI responsibilities

The React UI owns:

- Gallery presentation
- Clipboard event handling
- File and drag-and-drop input
- Client-side video frame extraction
- Local upload progress
- Selection state
- Forms and editors
- Sandboxed variant previews
- Calling plugin tools through `useAppTools()`

It must not directly read or write plugin files.

### 23.5 Extension responsibilities

The Pi-safe extension owns:

- Plugin tool registration
- Upload sessions
- Chunked asset writes
- Item metadata mutations
- Collection mutations
- Prompt recipe mutations
- Gallery metadata mutations
- Job submission and cancellation requests
- Reading assets for agent or CLI contexts
- Atomic state updates

### 23.6 Runtime responsibilities

The global background runtime owns:

- Persistent job queue
- Recovery after restart
- URL capture
- Thumbnail generation
- Librarian analysis
- Multi-item style synthesis
- Design generation
- Generation repair and schema validation
- Gallery snapshot creation
- Progress reporting
- Usage and model provenance
- Cleanup of abandoned uploads and deleted assets

A background runtime is justified because capture, analysis and multi-variant generation are long-running, cancellable workflows that should survive the UI being closed.

### 23.7 Structured Librarian execution

The runtime should use:

```ts
host.subagents.runStructured(...)
```

Each Librarian job should use a restricted tool surface:

```ts
{
  platformTools: "none",
  customTools: [readDesignAssetTool],
  repair: {
    maxAttempts: 2,
    validate: validateLibrarianAnalysis
  }
}
```

The Librarian should receive only the plugin-defined asset-reading tool, not shell, browser, filesystem or unrelated extension tools.

The resolved provider, model, duration and token usage should be stored as provenance when available.

## 24. Relationship with `sero-web-plugin`

The Design Library must not:

- Import source files from `plugins/sero-web-plugin`
- Depend on its internal state
- Invoke its tools by name
- Assume it is installed
- Access its provider configuration
- Reach into its downloads or cache directories

Sero app-agent sessions load only the current app package’s extensions and skills. Cross-plugin invocation through `useAppTools()` is therefore not a stable integration mechanism.

The preferred reuse strategy is a neutral published ingestion package.

### 24.1 Neutral shared ingestion package

Extract genuinely generic functionality into a published package such as:

```text
@sero-ai/content-ingestion
```

Potential contents:

- URL normalisation
- HTTP document fetching
- Readability extraction
- Metadata extraction
- PDF extraction
- Video frame helpers
- Content-type detection
- Size and timeout guards

Both `sero-web-plugin` and `sero-design-library-plugin` may depend on the published package.

The package must not contain:

- Web plugin state handling
- Web plugin provider selection
- Bookmark or history behaviour
- Sero host imports
- Desktop-internal imports
- Plugin-specific UI code

Visual webpage capture using Playwright or another headless browser mechanism should live in the Design Library unless it becomes useful enough to justify promotion into the neutral package.

## 25. Asset upload protocol

Images may be small enough to send in one call, but pasted videos can be large.

Large assets should use a chunked tool protocol over the existing generic app-agent bridge.

### 25.1 Tools

```text
design_library_upload_begin
design_library_upload_chunk
design_library_upload_commit
design_library_upload_abort
```

### 25.2 Flow

1. UI calls `upload_begin` with filename, MIME type, byte size and checksum.
2. Extension creates a temporary upload record.
3. UI converts the file into bounded base64 chunks.
4. UI sends chunks sequentially or with low concurrency.
5. Extension writes decoded bytes to a temporary file.
6. `upload_commit` verifies size and checksum.
7. Extension atomically moves the file into the final asset directory.
8. A library item and analysis job are created.
9. Incomplete temporary uploads are cleaned up later.

Recommended initial limits:

- Chunk size: 512 KiB
- Concurrent chunks: two
- Image maximum: 25 MiB
- Video maximum: 250 MiB
- URL capture maximum page height: configurable and bounded

These values should be validated during an implementation spike.

## 26. Storage model

Binary assets must not be stored inside `state.json`.

Suggested layout:

```text
<SERO_HOME>/apps/design-library/
├── state.json
├── items/
│   └── <item-id>.json
├── assets/
│   └── <item-id>/
│       ├── original.<ext>
│       ├── preview.webp
│       ├── poster.webp
│       └── frames/
├── captures/
│   └── <item-id>/
│       ├── viewport.webp
│       ├── full-page.webp
│       └── document.html
├── designs/
│   └── <session-id>/
│       └── <variant-id>/
│           ├── variant.json
│           ├── index.html
│           ├── styles.css
│           └── script.js
├── gallery/
│   ├── <gallery-design-id>/
│   │   ├── gallery.json
│   │   ├── preview.webp
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── script.js
│   └── families/
│       └── <family-id>.json
├── uploads/
└── jobs/
```

### 26.1 Main state index

The main state file should remain a lightweight reactive index:

```ts
interface DesignLibraryState {
  schemaVersion: number;
  revision: number;

  items: DesignItemSummary[];
  collections: Collection[];
  smartGroupSettings: SmartGroupSettings;
  promptRecipes: PromptRecipe[];

  designSessions: DesignSessionSummary[];
  galleryDesigns: GalleryDesignSummary[];
  designFamilies: DesignFamilySummary[];

  jobs: JobSummary[];
  settings: DesignLibrarySettings;
}
```

Full item analyses, generated files and full Gallery records are stored separately.

All metadata writes should use temporary files followed by atomic rename.

SQLite should not be required for MVP. It can be considered later if library size or semantic search requirements make JSON indexes impractical.

## 27. Plugin tools

### 27.1 Import and capture

- `design_library_upload_begin`
- `design_library_upload_chunk`
- `design_library_upload_commit`
- `design_library_upload_abort`
- `design_library_capture_url`

### 27.2 Library management

- `design_library_get_item`
- `design_library_update_item`
- `design_library_delete_items`
- `design_library_create_collection`
- `design_library_update_collection`
- `design_library_set_item_collections`

### 27.3 Analysis

- `design_library_analyse`
- `design_library_reanalyse`
- `design_library_cancel_job`

### 27.4 Generation

- `design_library_create_design`
- `design_library_revise_variant`
- `design_library_delete_variant`
- `design_library_export_variant`

### 27.5 Gallery

- `design_library_save_to_gallery`
- `design_library_update_gallery_item`
- `design_library_delete_gallery_items`
- `design_library_favourite_gallery_item`
- `design_library_open_gallery_in_design`
- `design_library_remix_gallery_item`
- `design_library_save_gallery_version`
- `design_library_add_gallery_item_to_library`

### 27.6 Templates

- `design_library_save_recipe`
- `design_library_delete_recipe`
- `design_library_set_default_recipe`

These tools do not need to be bridged into `sero` CLI commands for MVP.

## 28. Job model

Capture, analysis and generation use a common job structure:

```ts
type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

interface JobSummary {
  id: string;
  type: "capture" | "analyse" | "synthesise" | "generate" | "revise" | "gallery-save";
  status: JobStatus;
  progress?: number;
  phase?: string;
  itemIds?: string[];
  sessionId?: string;
  variantId?: string;
  galleryDesignId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
```

The runtime should:

- Limit concurrent analysis jobs
- Limit concurrent generation jobs
- Continue processing after an individual failure
- Recover queued and interrupted jobs after restart
- Expose cancellation through state
- Record concise actionable errors
- Avoid reporting a partially written design as complete

## 29. URL capture implementation

The URL capture adapter should be plugin-owned.

Recommended approach:

- Use `playwright-core`
- Discover an installed Chrome or Chromium executable
- Launch an isolated browser context
- Do not reuse the user’s browser profile or cookies
- Block popups, notifications and downloads
- Apply navigation and total-capture timeouts
- Capture desktop viewport and bounded full page
- Extract title, canonical URL and document metadata
- Close the browser context after each capture

Fallback order:

1. Full browser capture
2. HTTP fetch plus Open Graph image
3. Metadata-only item with a prompt asking the user to paste a screenshot

Authenticated pages should normally be imported through screenshot paste rather than browser cookie extraction.

Bundling or reading browser credentials would substantially increase security and portability concerns and is outside MVP.

## 30. Preview security

Generated implementations must render in a sandboxed iframe.

Recommended restrictions:

- No same-origin privileges
- No top-level navigation
- No popups
- No downloads without explicit user action
- No camera, microphone or geolocation
- No arbitrary filesystem access
- No remote network access by default

The plugin should inject a restrictive Content Security Policy into generated previews.

Generated code is untrusted until the user exports it.

## 31. Visual design direction

The plugin should feel like a hybrid of:

- A private design archive
- A contemporary digital gallery
- A focused creative workbench

### 31.1 Library page

- Large visual surfaces
- Restrained surrounding chrome
- Generous spacing
- Smooth but subtle motion
- High-quality thumbnail treatment
- Minimal metadata until interaction
- Clear selection states
- Fast keyboard navigation

### 31.2 Design page

- Canvas-dominant layout
- Slim variant tab strip
- Quiet inspector
- Responsive preview controls
- Clear separation between inspiration, generated output and prompt details

### 31.3 Gallery page

- Portfolio-style browsing
- Large previews
- Minimal permanent metadata
- Strong family and version browsing
- Clear visual distinction between favourites, final versions and experiments

### 31.4 Styling rules

- Use Sero semantic theme tokens
- Support dark and light themes
- Use scoped plugin CSS
- Avoid a generic administration-dashboard appearance
- Avoid excessive nested cards
- Avoid large permanent text panels
- Avoid gradients unless they serve the selected visual direction
- Allow thumbnails and generated work to provide most of the colour

## 32. Accessibility and usability

The plugin should support:

- Keyboard gallery navigation
- Keyboard multi-selection
- Visible focus states
- Reduced-motion preference
- Text alternatives for imported references
- Accessible tab semantics
- Accessible dialogs
- Sufficient contrast in plugin controls
- Screen-reader announcements for job progress and completion

Generated designs should be instructed to meet the same baseline.

## 33. Performance requirements

- Generate thumbnails during import
- Avoid rendering original full-resolution images in visual browsers
- Lazy-load off-screen media
- Do not autoplay multiple videos
- Virtualise or incrementally render large libraries and galleries
- Debounce search and filter changes
- Keep `state.json` lightweight
- Load full item documents only when needed
- Bound image dimensions before LLM analysis
- Bound the number of video frames
- Bound parallel model calls
- Do not load all generated previews simultaneously

Target initial scale:

- 5,000 Library items without unusable browsing performance
- 1,000 Gallery designs without unusable browsing performance
- 100 active generated variants without loading all previews simultaneously

## 34. MVP scope

### 34.1 Included

- Global profile-wide plugin
- Library, Design and Gallery pages
- Image paste and upload
- Video paste and upload
- URL capture
- Local asset storage
- Thumbnail and representative-frame generation
- Librarian analysis
- Editable tags, vocabulary, prompts and guardrails
- Collections and smart groups
- Text and tag search
- Multi-selection
- Blend and per-reference generation modes
- Configurable variation count
- Saved prompt recipes
- Runnable HTML and CSS design generation
- Variant tabs
- Sandboxed preview
- Revision and regeneration
- Manual saving of generated variants to Gallery
- Gallery masonry and uniform-grid layouts
- Gallery search and filtering
- Design families
- Stable saved snapshots
- Open Gallery design in Design
- Remix Gallery design
- Save as new version
- Favourite designs
- Edit Gallery metadata
- Export generated files
- Add Gallery design to Library
- Persistent jobs and error handling

### 34.2 Not included

- Social or public sharing
- Cloud synchronisation
- Team libraries
- Figma import or export
- Browser extension
- Automatic use of authenticated browser sessions
- Exact website cloning
- Full website mirroring
- Arbitrary React project generation
- Design-to-production-code guarantees
- Semantic vector search
- Image generation
- Mobile application design mode
- Direct dependency on `sero-web-plugin`
- New Sero host APIs
- Gallery timeline view if schedule requires deferral
- Advanced visual diff and side-by-side comparison

## 35. Implementation spikes

The following should be validated before full implementation.

### Spike 1: Chunked clipboard video upload

Confirm:

- Stable base64 chunk transfer through `useAppTools`
- Cancellation behaviour
- Practical throughput
- Maximum safe chunk size
- App-session memory behaviour
- Checksum verification

### Spike 2: Multimodal structured Librarian run

Confirm:

- A runtime custom tool can return local image content
- The selected vision model receives the image correctly
- `platformTools: "none"` behaves as expected
- JSON repair produces reliable schema output
- Multiple video frames remain within provider limits

### Spike 3: URL screenshot capture

Confirm:

- `playwright-core` can discover available browsers on supported platforms
- Full-page screenshots work in a packaged external plugin
- Capture does not require Electron imports
- Browser processes are always cleaned up
- Useful fallbacks exist when no browser is found

### Spike 4: Generated preview isolation

Confirm:

- Multi-file variants can be assembled into a preview document
- CSP restrictions prevent network and host access
- Desktop, tablet and mobile viewport simulation works
- Malformed generated code fails safely

### Spike 5: Gallery snapshot durability

Confirm:

- Saved Gallery records remain valid after their source Design session is deleted
- Opening a Gallery record can reconstruct an editable Design session
- Saving a new version never mutates prior versions
- Shared assets can be referenced safely without accidental deletion

## 36. Acceptance criteria

The MVP is complete when:

1. A user can paste an image and see it appear immediately in the Library.
2. A user can paste or upload a video and see upload progress and a poster.
3. A user can paste a URL and receive a captured Library item or a useful fallback.
4. The Librarian produces concise structured analysis for each supported item.
5. The user can edit analysis, prompts and guardrails.
6. Reanalysis preserves user overrides.
7. Items can be filtered by generated tags and design type.
8. The user can select multiple items and request a blended implementation.
9. The user can choose total variations or variations per reference.
10. Generated variants appear as separate tabs on the Design page.
11. Each completed tab contains a working sandboxed preview.
12. A failed variant does not cause the entire Design session to fail.
13. Generated files can be exported.
14. A completed Design variant can be explicitly saved to the Gallery.
15. Unsaved experimental variants do not automatically clutter the Gallery.
16. Gallery designs remain available after their original Design session is deleted.
17. A Gallery design can be reopened as an editable Design session.
18. Saving a new revision does not silently modify an existing Gallery snapshot.
19. Gallery designs can be grouped by design family.
20. A Gallery design can be remixed with Library items or other Gallery designs.
21. A Gallery design can be added back to the Library as inspiration.
22. Gallery search can find designs using titles, tags, prompts and aesthetic vocabulary.
23. The plugin works without `sero-web-plugin` being installed.
24. The plugin introduces no design-library-specific host IPC or preload APIs.
25. The plugin can be packaged using the normal Sero external plugin process.
26. Restarting Sero preserves the Library, analyses, recipes, Design sessions and Gallery designs.

## 37. Key architectural decisions

| Decision | Choice |
|---|---|
| Primary surfaces | Library, Design and Gallery |
| Library scope | Profile-global |
| Host changes | None |
| Custom preload or IPC | Prohibited |
| Required host capabilities | `appAgent.invokeTool`, `appRuntime.background` |
| Dependency on `sero-web-plugin` | None |
| Shared web functionality | Neutral published ingestion package |
| Binary storage | Plugin-owned asset files |
| Reactive state | Lightweight `state.json` index |
| Large clipboard files | Chunked tool upload |
| AI analysis | Structured background subagent |
| AI tool access | Plugin custom tools only |
| Default generated output | Self-contained HTML and CSS |
| Preview | Sandboxed iframe |
| Variations | Blend or per reference |
| User AI edits | Preserved across reanalysis |
| Gallery save policy | Explicit by default |
| Gallery durability | Stable immutable snapshots |
| MVP database | JSON metadata and files |
| External-plugin readiness | Required from first implementation |
